/** Narrow candidate implementation based on the reviewed JSON VMess mapping.
 * No UUID, account token, subscription token or node list is embedded here.
 */
export const MAX_BYTES = 2_000_000;
export const REGION_HOSTS = Object.freeze({
  'tanz-hk.kunlun01dns.com': 'HK', 'tanz-jp.kunlun01dns.com': 'JP',
  'tanz-us.kunlun01dns.com': 'US', 'tanz-tw.kunlun01dns.com': 'TW',
  'tanz-kr.kunlun01dns.com': 'KR', 'tanz-sg.kunlun01dns.com': 'SG'
});
export const BOARD_HOST = 'tanz-board.kunlun01dns.com';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const BLOCKED = new Set(['localhost', '::', '::1', '0.0.0.0']);
const INFO = /(?:剩余|流量|到期|过期|有效期|官网|公告|套餐|traffic|expire)/i;
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function decodeBase64(text) {
  const compact = text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error('Invalid base64');
  const unpadded = compact.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) throw new Error('Invalid base64');
  const bytes = Buffer.from(unpadded, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== unpadded) throw new Error('Invalid base64');
  return utf8.decode(bytes);
}

function scalar(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid field');
  return String(value);
}
function integer(value, fallback) {
  const text = scalar(value, fallback === undefined ? '' : String(fallback));
  if (!/^\d+$/.test(text)) throw new Error('Invalid integer');
  const n = Number(text);
  if (!Number.isSafeInteger(n)) throw new Error('Invalid integer');
  return n;
}
function flag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === 'true' || value === '1') return true;
  if (value === false || value === 0 || value === 'false' || value === '0') return false;
  throw new Error('Invalid boolean');
}
export function validateHost(value) {
  const host = scalar(value).toLowerCase().replace(/\.$/, '');
  // IPv6 is not part of the verified provider feed; refuse it instead of guessing serialization.
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host) ||
      host.split('.').some(x => !x || x.length > 63 || x.startsWith('-') || x.endsWith('-'))) {
    throw new Error('Invalid host');
  }
  return host;
}
function safeName(value) {
  const name = scalar(value, 'TanZou').replace(/[\u0000-\u001f\u007f,=]/g, ' ').trim();
  return (!name || /^[#;\[]/.test(name)) ? `TanZou ${name}`.trim() : name;
}
function safeOption(value, fallback = '') {
  const text = scalar(value, fallback);
  if (text.length > 2048 || /[\u0000-\u001f\u007f,|"\\]/.test(text)) {
    throw new Error('Unsafe option');
  }
  return text;
}

export function parseSubscription(input) {
  if (typeof input !== 'string' || !input.trim() || Buffer.byteLength(input) > MAX_BYTES) {
    throw new Error('Invalid subscription');
  }
  let text = input.trim();
  if (!text.startsWith('vmess://')) text = decodeBase64(text);
  const records = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!records.length || records.length > 10000) throw new Error('Invalid record count');
  const nodes = [];
  for (const record of records) {
    if (!record.startsWith('vmess://')) throw new Error('Unsupported subscription record');
    const body = record.slice(8);
    const hash = body.indexOf('#');
    const encoded = hash < 0 ? body : body.slice(0, hash);
    const tag = hash < 0 ? undefined : decodeURIComponent(body.slice(hash + 1));
    const raw = JSON.parse(decodeBase64(encoded));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid node');
    const originalHost = scalar(raw.add).toLowerCase().replace(/\.$/, '');
    if (BLOCKED.has(originalHost) || /^127\./.test(originalHost)) continue;
    const host = validateHost(originalHost);
    const port = integer(raw.port);
    if (port < 1 || port > 65535) throw new Error('Invalid port');
    const uuid = scalar(raw.id);
    if (!UUID.test(uuid)) throw new Error('Invalid UUID');
    const aid = integer(raw.aid, 0);
    const cipher = scalar(raw.scy, 'auto');
    if (!['auto', 'aes-128-gcm', 'chacha20-poly1305', 'chacha20-ietf-poly1305'].includes(cipher)) {
      throw new Error('Unsupported VMess cipher');
    }
    const network = scalar(raw.net, 'tcp');
    const type = scalar(raw.type, 'none');
    // Do not silently drop HTTP/H2/gRPC/Reality parameters, as a generic converter might.
    if (!['tcp', 'ws'].includes(network) || !['none', 'tcp', 'ws'].includes(type)) {
      throw new Error('Unsupported VMess transport');
    }
    const tlsValue = raw.tls;
    const tls = tlsValue === true || tlsValue === 'tls' || tlsValue === 'true' || tlsValue === '1';
    if (![undefined, null, '', 'none', false, 'false', '0', true, 'tls', 'true', '1'].includes(tlsValue)) {
      throw new Error('Unsupported TLS option');
    }
    const name = safeName(tag || raw.ps);
    const node = {
      name, host, port, uuid, aid, cipher, network, type, tls,
      sni: safeOption(raw.sni), insecure: flag(raw['skip-cert-verify']),
      alpn: raw.alpn ? (Array.isArray(raw.alpn) ? raw.alpn : scalar(raw.alpn).split(',')).map(x => safeOption(x)) : [],
      path: network === 'ws' ? safeOption(raw.path, '/') : '',
      wsHost: network === 'ws' ? safeOption(raw.host || raw.sni) : '',
      informational: host === 'access.tanzcloud.com' || INFO.test(name)
    };
    if (network === 'ws' && !node.path.startsWith('/')) throw new Error('Invalid WebSocket path');
    nodes.push(node);
  }
  return nodes;
}

import { createHash } from 'node:crypto';

export function probeNodeId(node) {
  return createHash('sha256').update(`${node.name}\0${node.host}\0${node.port}`).digest('hex').slice(0, 20);
}
function validProbeOverride(node, entry, compatHost, probeCache) {
  if (!entry || !entry.last_success) return false;
  if (entry.port !== node.port || ![node.host, compatHost].includes(entry.best_host)) return false;
  if (!['aes-128-gcm', 'chacha20-ietf-poly1305'].includes(entry.cipher)) return false;
  const ttlSeconds = Number(probeCache?.ttl_seconds);
  const generatedAt = Date.parse(probeCache?.generated_at || '');
  const lastSuccess = Date.parse(entry.last_success);
  const now = Date.now();
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 ||
      !Number.isFinite(generatedAt) || !Number.isFinite(lastSuccess)) return false;
  const ttlMs = ttlSeconds * 1000;
  // Refuse a stale cache entirely. One transient daily probe miss may keep its LKG
  // for one extra TTL; two consecutive misses fall back to the RC2.1 behavior.
  if (generatedAt > now + 5 * 60_000 || now - generatedAt > ttlMs) return false;
  if (!Number.isInteger(entry.consecutive_failures) || entry.consecutive_failures < 0 ||
      entry.consecutive_failures > 1) return false;
  const maxHistoryMs = ttlMs * (entry.consecutive_failures === 0 ? 1 : 2);
  if (lastSuccess > generatedAt + 5 * 60_000 || generatedAt - lastSuccess > maxHistoryMs) return false;
  return true;
}

export function normalizeNodes(nodes, { mode = 'official', compatHost = 'xd-sh.mimonode-client.com', probeCache = null, dualEntry = false } = {}) {
  if (!['official', 'verified-regions'].includes(mode)) throw new Error('Invalid compatibility mode');
  compatHost = validateHost(compatHost);
  if (BLOCKED.has(compatHost) || /^\d+(?:\.\d+){3}$/.test(compatHost) || !compatHost.includes('.')) {
    throw new Error('Compatibility host must be a public domain, not a fixed IP');
  }
  const endpointKeys = new Set();
  const nameSet = new Set();
  const output = [];
  let rewritten = 0;
  for (const node of nodes) {
    // Dedupe ORIGINAL endpoints, before compatibility mapping. Board may reuse a region port.
    const key = JSON.stringify([node.host, node.port, node.uuid, node.aid, node.cipher,
      node.network, node.type, node.tls, node.sni, node.insecure, node.alpn, node.path, node.wsHost]);
    if (endpointKeys.has(key)) continue;
    endpointKeys.add(key);
    const copy = { ...node, alpn: [...node.alpn] };
    const regionalCompatHost = Object.hasOwn(REGION_HOSTS, node.host);
    const boardCompatHost = node.host === BOARD_HOST;
    const eligible = (regionalCompatHost || boardCompatHost) && !node.informational &&
      node.network === 'tcp' && ['none', 'tcp'].includes(node.type) && !node.tls && node.aid === 0;
    if (mode === 'verified-regions' && eligible) {
      copy.host = compatHost;
      // RC2.1 fallback remains authoritative unless a strictly validated successful probe exists.
      if (regionalCompatHost) copy.cipher = 'chacha20-ietf-poly1305';
      rewritten++;
      const entry = probeCache?.nodes?.[probeNodeId(node)];
      if (validProbeOverride(node, entry, compatHost, probeCache)) {
        copy.host = entry.best_host;
        copy.cipher = entry.cipher;
      }
    }
    let count = 2;
    while (nameSet.has(copy.name)) copy.name = `${node.name} (${count++})`;
    nameSet.add(copy.name);
    output.push(copy);

    // Production dual-entry safety: preserve the existing RC2.2 node name/behavior,
    // and add the provider-original endpoint as an explicit fallback for mobile networks.
    // This never replaces or mutates the upstream node; it only adds a second choice
    // when compatibility rewriting changed host and/or cipher.
    if (dualEntry && mode === 'verified-regions' && eligible &&
        (copy.host !== node.host || copy.cipher !== node.cipher)) {
      const original = { ...node, alpn: [...node.alpn], name: `${node.name} 原站` };
      let originalCount = 2;
      while (nameSet.has(original.name)) original.name = `${node.name} 原站 (${originalCount++})`;
      nameSet.add(original.name);
      output.push(original);
    }
  }
  if (!output.some(n => !n.informational)) throw new Error('No actual proxy nodes');
  return { nodes: output, rewritten };
}

export function renderNode(n) {
  let line = `${n.name} = vmess, ${n.host}, ${n.port}, username=${n.uuid}`;
  if (n.cipher !== 'auto') line += `, encrypt-method=${n.cipher === 'chacha20-poly1305' ? 'chacha20-ietf-poly1305' : n.cipher}`;
  if (n.aid === 0) line += ', vmess-aead=true';
  if (n.tls) {
    line += ', tls=true';
    if (n.sni) line += `, sni=${n.sni}`;
    if (n.insecure) line += ', skip-cert-verify=true';
    if (n.alpn.length) line += `, alpn=${n.alpn.length > 1 ? '"' + n.alpn.join(',') + '"' : n.alpn[0]}`;
  }
  if (n.network === 'ws') {
    line += `, ws=true, ws-path=${n.path}`;
    if (n.wsHost) line += `, ws-headers=Host:${n.wsHost}`;
  }
  return line;
}
export function convertSubscription(text, options = {}) {
  const result = normalizeNodes(parseSubscription(text), options);
  return { ...result, text: result.nodes.map(renderNode).join('\n') + '\n' };
}
