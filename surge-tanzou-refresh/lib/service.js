import { sourceForToken } from './auth.js';
import { convertSubscription, MAX_BYTES } from './subscription.js';
import previewProbeCache from '../probe-cache.preview.json' with { type: 'json' };

const HEADERS = Object.freeze({
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});
const reply = (text, status) => new Response(text, { status, headers: HEADERS });

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

/** Dependency injection is for offline tests only; no user-controlled fetch URL. */
export function createService({ env = () => process.env, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async function handle(request) {
    let url;
    try { url = new URL(request.url); } catch { return reply('Not Found', 404); }
    if (url.pathname === '/health') {
      return ['GET', 'HEAD'].includes(request.method) ? reply(request.method === 'HEAD' ? null : 'OK', 200) : reply('Method Not Allowed', 405);
    }
    if (url.pathname !== '/private/live-tanzou.list') return reply('Not Found', 404);
    let source;
    let config;
    try {
      config = env();
      if (url.searchParams.getAll('token').length !== 1) throw new Error('Unauthorized');
      source = sourceForToken(url.searchParams.get('token'), config.TANZOU_ENCRYPTED_SOURCE);
    } catch { return reply('Not Found', 404); }
    if (request.method !== 'GET') return reply('Method Not Allowed', 405);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(source, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { 'User-Agent': 'Shadowrocket', 'Accept': 'text/plain,*/*', 'Cache-Control': 'no-cache' }
      });
      const text = await readBounded(response);
      // RC2.2 branch-local Preview snapshot: no external HTTP dependency.
      // Production/main do not contain this branch-only reader.
      const probeCache = previewProbeCache?.version === 1 &&
        previewProbeCache.nodes && typeof previewProbeCache.nodes === 'object' && !Array.isArray(previewProbeCache.nodes)
        ? previewProbeCache : null;
      const converted = convertSubscription(text, {
        mode: config.TANZOU_COMPAT_MODE || 'official',
        compatHost: config.TANZOU_COMPAT_HOST || 'xd-sh.mimonode-client.com',
        probeCache
      });
      return reply(converted.text, 200);
    } catch {
      // Never send exception text, URLs, UUIDs or configuration values to logs/responses.
      return reply('Subscription refresh failed', 502);
    } finally { clearTimeout(timeout); controller.abort(); }
  };
}
