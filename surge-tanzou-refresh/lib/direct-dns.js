/** TanZou direct-IP projection. Restricted to provider-owned hosts and DoH endpoints.
 * Never rewrites UUID, port, transport, TLS or the original subscription source.
 */
import { REGION_HOSTS, BOARD_HOST } from './subscription.js';

const DOH_ENDPOINTS = Object.freeze([
  'https://20.247.42.211:36290/dns-query/clash?site=feitan',
  'https://20.239.241.138:55228/dns-query/clash?site=feitan',
  'https://104.208.122.199:62201/dns-query/clash?site=feitan'
]);
const ACCEPTED_HOSTS = new Set([...Object.keys(REGION_HOSTS), BOARD_HOST]);
const REQUEST_TIMEOUT_MS = 3000;

function encodeQuestion(domain) {
  const parts = domain.split('.');
  const labels = parts.map(x => {
    if (!x || x.length > 63 || !/^[a-z0-9-]+$/.test(x)) throw new Error('Invalid DNS hostname');
    return Buffer.concat([Buffer.from([x.length]), Buffer.from(x, 'ascii')]);
  });
  const id = Math.floor(Math.random() * 65536);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  const wire = Buffer.concat([...labels, Buffer.from([0, 0, 1, 0, 1])]);
  return { id, bytes: Buffer.concat([header, wire]) };
}

function skipName(packet, start) {
  let position = start;
  for (let count = 0; count < 100; count++) {
    if (position >= packet.length) throw new Error('Malformed DNS label');
    const length = packet[position++];
    if (length === 0) return position;
    if ((length & 0xc0) === 0xc0) {
      if (position >= packet.length) throw new Error('Malformed DNS pointer');
      return position + 1;
    }
    if ((length & 0xc0) || length > 63 || position + length > packet.length) {
      throw new Error('Malformed DNS label');
    }
    position += length;
  }
  throw new Error('Malformed DNS name');
}

function isPublicIPv4(parts) {
  const [a, b] = parts;
  return a !== 0 && a !== 10 && a !== 127 && a < 224 &&
    !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19));
}

export function decodeAnswer(packet, expectedId) {
  if (!Buffer.isBuffer(packet) || packet.length < 17 || packet.length > 8192) throw new Error('Invalid DNS response');
  const flags = packet.readUInt16BE(2);
  if (packet.readUInt16BE(0) !== expectedId || !(flags & 0x8000) ||
      (flags & 0x000f) !== 0 || packet.readUInt16BE(4) !== 1) throw new Error('DNS response mismatch');
  const answerCount = packet.readUInt16BE(6);
  if (answerCount < 1 || answerCount > 50) throw new Error('No DNS answers');
  let pos = skipName(packet, 12);
  if (pos + 4 > packet.length || packet.readUInt16BE(pos) !== 1 || packet.readUInt16BE(pos + 2) !== 1) {
    throw new Error('DNS question mismatch');
  }
  pos += 4;
  for (let i = 0; i < answerCount; i++) {
    pos = skipName(packet, pos);
    if (pos + 10 > packet.length) throw new Error('Malformed DNS resource record');
    const type = packet.readUInt16BE(pos), cls = packet.readUInt16BE(pos + 2);
    const size = packet.readUInt16BE(pos + 8);
    pos += 10;
    if (pos + size > packet.length) throw new Error('DNS resource out of bounds');
    if (type === 1 && cls === 1 && size === 4) {
      const octets = [...packet.subarray(pos, pos + 4)];
      if (isPublicIPv4(octets)) return octets.join('.');
    }
    pos += size;
  }
  throw new Error('No permitted public A record');
}

async function queryProviderDoH(domain, endpoint, { fetchImpl, signal }) {
  const { id, bytes } = encodeQuestion(domain);
  const url = new URL(endpoint);
  url.searchParams.set('dns', bytes.toString('base64url'));
  const requestAbort = new AbortController();
  const forwardAbort = () => requestAbort.abort();
  if (signal?.aborted) throw new Error('Subscription refresh canceled');
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => requestAbort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: requestAbort.signal,
      headers: { Accept: 'application/dns-message' }
    });
    if (response.status !== 200) throw new Error('DoH upstream failed');
    const contentType = response.headers.get('content-type') || '';
    if (!/^application\/dns-message(?:\s*;|$)/i.test(contentType)) throw new Error('Unexpected DoH response type');
    const bytes = Buffer.from(await response.arrayBuffer());
    return decodeAnswer(bytes, id);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

async function resolveProviderHost(host, options) {
  for (const endpoint of DOH_ENDPOINTS) {
    try { return await queryProviderDoH(host, endpoint, options); }
    catch (error) {
      if (options.signal?.aborted) throw error;
    }
  }
  throw new Error('Provider DNS lookup failed');
}

/** Resolve each ORIGINAL hostname once per refresh. Unknown real hosts fail
 * closed instead of silently publishing a possibly blocked endpoint. */
export async function makeDirectNodes(nodes, { fetchImpl = globalThis.fetch, signal } = {}) {
  const realNodes = nodes.filter(node => !node.informational);
  if (!realNodes.length || realNodes.length > 10000) throw new Error('No proxy nodes');
  const hosts = [...new Set(realNodes.map(node => node.host))];
  if (hosts.length > ACCEPTED_HOSTS.size || hosts.some(host => !ACCEPTED_HOSTS.has(host))) {
    throw new Error('Unexpected original proxy hostname');
  }
  for (const node of realNodes) {
    if (node.aid !== 0 || node.tls || node.network !== 'tcp' || !['none', 'tcp'].includes(node.type)) {
      throw new Error('Unsupported dynamic direct node');
    }
  }
  const records = await Promise.all(hosts.map(async host => [host, await resolveProviderHost(host, { fetchImpl, signal })]));
  const mapping = new Map(records);
  return realNodes.map(node => ({ ...node, host: mapping.get(node.host), alpn: [...node.alpn] }));
}


/** Optional multi-entry representation for local, client-side Surge health checks.
 * This does NOT validate a VMess handshake on Vercel. It publishes each unique
 * provider-DoH answer as a separately selectable endpoint, so Surge can
 * independently measure real VMess reachability from the client's network.
 * Existing makeDirectNodes and all legacy routes remain unchanged.
 */
export async function makeMultiDirectNodes(nodes, { fetchImpl = globalThis.fetch, signal } = {}) {
  const real = nodes.filter(node => !node.informational);
  if (!real.length || real.length > 10000) throw new Error('No real proxy nodes');
  const hosts = [...new Set(real.map(node => node.host))];
  if (hosts.length > ACCEPTED_HOSTS.size || hosts.some(host => !ACCEPTED_HOSTS.has(host))) {
    throw new Error('Unexpected original proxy hostname');
  }
  for (const node of real) {
    if (node.aid !== 0 || node.tls || node.network !== 'tcp' ||
        !['none', 'tcp'].includes(node.type)) throw new Error('Unsupported multi-DNS node');
  }
  const pairs = await Promise.all(hosts.map(async host => {
    const settled = await Promise.allSettled(DOH_ENDPOINTS.map(endpoint =>
      queryProviderDoH(host, endpoint, { fetchImpl, signal })));
    if (signal?.aborted) throw new Error('Subscription refresh canceled');
    const unique = new Set();
    const answers = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status !== 'fulfilled' || unique.has(result.value)) continue;
      unique.add(result.value);
      answers.push({ host: result.value, label: 'D' + (i + 1) });
    }
    if (!answers.length) throw new Error('All provider DNS endpoints unavailable');
    return [host, answers];
  }));
  const optionsByHost = new Map(pairs);
  return real.flatMap(node => optionsByHost.get(node.host).map(option => ({
    ...node, alpn: [...node.alpn], host: option.host,
    name: node.name + ' [' + option.label + ']'
  })));
}
