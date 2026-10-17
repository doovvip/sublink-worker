import { sourceForToken, decryptSealedText } from './auth.js';
import { convertSubscription, inspectRawVmessNode, renderNode, MAX_BYTES } from './subscription.js';
import { makeDirectNodes, rewriteSurgeFallbackText } from './direct-dns.js';
import previewProbeCache from '../probe-cache.preview.json' with { type: 'json' };
import fallbackSnapshot from '../fallback.snapshot.json' with { type: 'json' };

const HEADERS = Object.freeze({
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});
const reply = (text, status, extraHeaders = {}) => new Response(text, {
  status,
  headers: { ...HEADERS, ...extraHeaders }
});
const LIVE_PATH = '/private/live-tanzou.list';
const OFFICIAL_PATH = '/private/live-tanzou.official.list';
const DIRECT_PATH = '/private/live-tanzou.direct.list';
const DIAG_PATH = '/private/diag-tanzou-node.json';
const compatMode = config => config?.TANZOU_COMPAT_MODE || 'verified-regions';

const probeCacheInfo = () => {
  const nodes = previewProbeCache?.nodes && typeof previewProbeCache.nodes === 'object' && !Array.isArray(previewProbeCache.nodes)
    ? previewProbeCache.nodes : {};
  return {
    generatedAt: previewProbeCache?.generated_at || '',
    nodeCount: Object.keys(nodes).length
  };
};

async function readBounded(response) {
  if (response.status !== 200 || !response.body) throw new Error('Upstream failure');
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BYTES) throw new Error('Oversized response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Oversized response');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('Empty response');
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

async function withTimeout(timeoutMs, fn) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function fallbackTextForToken(token) {
  if (fallbackSnapshot?.version !== 1 ||
      typeof fallbackSnapshot?.payload !== 'string' ||
      typeof fallbackSnapshot?.generated_at !== 'string' ||
      !Number.isInteger(fallbackSnapshot?.node_count) ||
      fallbackSnapshot.node_count < 1 || fallbackSnapshot.node_count > 10000) {
    throw new Error('Invalid fallback metadata');
  }
  const text = decryptSealedText(token, fallbackSnapshot.payload);
  if (!text.trim() || Buffer.byteLength(text) > MAX_BYTES) throw new Error('Invalid fallback snapshot');
  const count = text.split(/\r?\n/).filter(Boolean).length;
  if (count !== fallbackSnapshot.node_count) throw new Error('Fallback count mismatch');
  return text;
}

async function serveFallback({ token, path, fetchImpl, timeoutMs }) {
  if (path === DIAG_PATH) throw new Error('No diagnostic fallback');
  const snapshot = fallbackTextForToken(token);
  if (path === OFFICIAL_PATH) {
    return reply(snapshot, 200, {
      'X-RC2-Subscription-Mode': 'fallback-official',
      'X-RC2-Source': 'sealed-snapshot',
      'X-RC2-Fallback-Generated-At': fallbackSnapshot.generated_at,
      'X-RC2-Fallback-Nodes': String(fallbackSnapshot.node_count)
    });
  }
  const direct = await withTimeout(Math.min(timeoutMs, 10000), signal =>
    rewriteSurgeFallbackText(snapshot, { fetchImpl, signal })
  );
  return reply(direct, 200, {
    'X-RC2-Subscription-Mode': 'fallback-direct-doh',
    'X-RC2-Source': 'sealed-snapshot',
    'X-RC2-Fallback-Generated-At': fallbackSnapshot.generated_at,
    'X-RC2-Fallback-Nodes': String(fallbackSnapshot.node_count)
  });
}

/** Dependency injection is for offline tests only; no user-controlled fetch URL. */
export function createService({
  env = () => process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000
} = {}) {
  return async function handle(request) {
    let url;
    try { url = new URL(request.url); } catch { return reply('Not Found', 404); }

    if (url.pathname === '/health') {
      if (!['GET', 'HEAD'].includes(request.method)) return reply('Method Not Allowed', 405);
      let healthConfig = {};
      try { healthConfig = env() || {}; } catch {}
      const cache = probeCacheInfo();
      const mode = compatMode(healthConfig);
      return reply(request.method === 'HEAD' ? null : 'OK', 200, {
        'X-RC2-Compat-Mode': ['official', 'verified-regions'].includes(mode) ? mode : 'invalid',
        'X-RC2-Cache-Generated-At': cache.generatedAt,
        'X-RC2-Cache-Nodes': String(cache.nodeCount),
        'X-RC2-Fallback-Generated-At': fallbackSnapshot?.generated_at || '',
        'X-RC2-Fallback-Nodes': String(fallbackSnapshot?.node_count || 0)
      });
    }

    if (![LIVE_PATH, OFFICIAL_PATH, DIRECT_PATH, DIAG_PATH].includes(url.pathname)) {
      return reply('Not Found', 404);
    }

    let source;
    let config;
    let token;
    try {
      config = env();
      if (url.searchParams.getAll('token').length !== 1) throw new Error('Unauthorized');
      token = url.searchParams.get('token');
      source = sourceForToken(token, config.TANZOU_ENCRYPTED_SOURCE);
    } catch {
      return reply('Not Found', 404);
    }
    if (request.method !== 'GET') return reply('Method Not Allowed', 405);

    let text;
    try {
      text = await withTimeout(Math.min(timeoutMs, 10000), async signal => {
        const response = await fetchImpl(source, {
          method: 'GET',
          redirect: 'error',
          cache: 'no-store',
          signal,
          headers: {
            'User-Agent': 'Shadowrocket',
            'Accept': 'text/plain,*/*',
            'Cache-Control': 'no-cache'
          }
        });
        return readBounded(response);
      });
    } catch {
      try {
        return await serveFallback({ token, path: url.pathname, fetchImpl, timeoutMs });
      } catch {
        return reply('Subscription refresh failed', 502);
      }
    }

    try {
      const probeCache = previewProbeCache?.version === 1 &&
        previewProbeCache.nodes && typeof previewProbeCache.nodes === 'object' && !Array.isArray(previewProbeCache.nodes)
        ? previewProbeCache : null;

      if (url.pathname === DIAG_PATH) {
        const diag = inspectRawVmessNode(text, url.searchParams.get('name'));
        return new Response(JSON.stringify(diag, null, 2) + '\n', {
          status: 200,
          headers: {
            ...HEADERS,
            'Content-Type': 'application/json; charset=utf-8'
          }
        });
      }

      if (url.pathname === DIRECT_PATH) {
        const official = convertSubscription(text, { mode: 'official' });
        const directNodes = await withTimeout(Math.min(timeoutMs, 10000), signal =>
          makeDirectNodes(official.nodes, { fetchImpl, signal })
        );
        return reply(directNodes.map(renderNode).join('\n') + '\n', 200, {
          'X-RC2-Subscription-Mode': 'direct-doh',
          'X-RC2-Source': 'live'
        });
      }

      const mode = url.pathname === OFFICIAL_PATH ? 'official' : compatMode(config);
      const converted = convertSubscription(text, {
        mode,
        compatHost: config.TANZOU_COMPAT_HOST || 'xd-sh.mimonode-client.com',
        probeCache: mode === 'official' ? null : probeCache
      });
      return reply(converted.text, 200, {
        'X-RC2-Subscription-Mode': mode,
        'X-RC2-Source': 'live'
      });
    } catch {
      try {
        return await serveFallback({ token, path: url.pathname, fetchImpl, timeoutMs });
      } catch {
        return reply('Subscription refresh failed', 502);
      }
    }
  };
}
