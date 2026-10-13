import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { makeDirectNodes } from '../lib/direct-dns.js';
import { createService } from '../lib/service.js';

const TOKEN = 'synthetic_direct_token_'.repeat(3);
const SOURCE = 'https://config.tanzcloud.com/link/SYNTHETIC_DIRECT?sub=3';
const UUID = '00000000-0000-4000-8000-000000000001';
const NODE = { ps: 'Fixture 香港01', add: 'tanz-hk.kunlun01dns.com', port: 22009,
  id: UUID, aid: 0, net: 'tcp', type: 'none', tls: '' };
const NODE_BODY = 'vmess://' + Buffer.from(JSON.stringify(NODE)).toString('base64');
const DIRECT_PATH = '/private/live-tanzou.direct.list';
const request = (suffix = '?token=' + TOKEN, path = DIRECT_PATH) =>
  new Request('https://service.test' + path + suffix);

async function encryptSource(url = SOURCE) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN));
  const key = await webcrypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const payload = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(url));
  return Buffer.from(iv).toString('base64url') + '.' + Buffer.from(payload).toString('base64url');
}
const SEALED = await encryptSource();
const ENV = { TANZOU_ENCRYPTED_SOURCE: SEALED, TANZOU_COMPAT_MODE: 'verified-regions' };
function makeDoHAnswer(url, ipv4) {
  const req = Buffer.from(new URL(url).searchParams.get('dns'), 'base64url');
  const packet = Buffer.from(req);
  packet.writeUInt16BE(0x8180, 2);
  packet.writeUInt16BE(1, 6);
  const record = Buffer.concat([
    Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4]),
    Buffer.from(ipv4.split('.').map(Number))
  ]);
  return Buffer.concat([packet, record]);
}
function dnsReply(url, ip) {
  return new Response(makeDoHAnswer(url, ip), {
    status: 200,
    headers: { 'content-type': 'application/dns-message' }
  });
}
function mockFetch(ip = '56.10.95.143') {
  let upstreamCount = 0;
  let dnsCount = 0;
  return {
    fetch: async (url, options) => {
      if (String(url) === SOURCE) {
        upstreamCount++;
        assert.equal(options.headers['User-Agent'], 'Shadowrocket');
        return new Response(NODE_BODY, { status: 200 });
      }
      dnsCount++;
      assert.equal(options.headers.Accept, 'application/dns-message');
      assert.match(String(url), /\/dns-query\/clash\?site=feitan&dns=/);
      return dnsReply(url, ip);
    },
    counts: () => ({ upstreamCount, dnsCount })
  };
}
const originalNode = host => ({
  name: 'Fixture', host, port: 22009, uuid: UUID, aid: 0, cipher: 'auto', network: 'tcp',
  type: 'none', tls: false, sni: '', insecure: false, alpn: [], path: '', wsHost: '', informational: false
});

test('private direct endpoint preserves original fields and rewrites only provider host', async () => {
  const mock = mockFetch();
  const app = createService({ env: () => ENV, fetchImpl: mock.fetch });
  const response = await app(request());
  assert.equal(response.status, 200);
  const output = await response.text();
  assert.match(output, /^Fixture 香港01 = vmess, 56\.10\.95\.143, 22009, username=/);
  assert.match(output, /vmess-aead=true/);
  assert.equal(output.includes('tanz-hk.kunlun01dns.com'), false);
  assert.equal(response.headers.get('x-rc2-subscription-mode'), 'direct-doh');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(mock.counts(), { upstreamCount: 1, dnsCount: 1 });
});

test('direct mode is opt-in: official endpoint unchanged', async () => {
  const mock = mockFetch();
  const app = createService({ env: () => ENV, fetchImpl: mock.fetch });
  const response = await app(request('?token=' + TOKEN, '/private/live-tanzou.official.list'));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /tanz-hk\.kunlun01dns\.com/);
  assert.deepEqual(mock.counts(), { upstreamCount: 1, dnsCount: 0 });
});

test('missing, bad and repeated tokens fail before source or DNS access', async () => {
  const mock = mockFetch();
  const app = createService({ env: () => ENV, fetchImpl: mock.fetch });
  for (const suffix of ['', '?token=bad', '?token=' + TOKEN + '&token=' + TOKEN]) {
    assert.equal((await app(request(suffix))).status, 404);
  }
  assert.deepEqual(mock.counts(), { upstreamCount: 0, dnsCount: 0 });
});

test('DNS failover chooses second provider when the first is unavailable', async () => {
  let calls = 0;
  const out = await makeDirectNodes([originalNode('tanz-jp.kunlun01dns.com')], {
    fetchImpl: async url => {
      if (++calls === 1) throw new Error('first unavailable');
      return dnsReply(url, '95.40.29.126');
    }
  });
  assert.equal(calls, 2);
  assert.equal(out[0].host, '95.40.29.126');
});

test('never replaces unknown or changed server protocol with a guessed IP', async () => {
  let calls = 0;
  for (const n of [
    originalNode('unknown.example'),
    { ...originalNode('tanz-jp.kunlun01dns.com'), network: 'ws' },
    { ...originalNode('tanz-jp.kunlun01dns.com'), aid: 3 }
  ]) {
    await assert.rejects(makeDirectNodes([n], { fetchImpl: () => { calls++; } }));
  }
  assert.equal(calls, 0);
});

test('private, fake, malformed and failed DoH answers fail closed', async () => {
  for (const value of ['127.0.0.1', '192.168.1.2', '198.18.0.2']) {
    await assert.rejects(makeDirectNodes([originalNode('tanz-jp.kunlun01dns.com')], {
      fetchImpl: url => dnsReply(url, value)
    }), /Provider DNS lookup failed/);
  }
  await assert.rejects(makeDirectNodes([originalNode('tanz-jp.kunlun01dns.com')], {
    fetchImpl: () => new Response('<html>error</html>', { status: 200, headers: { 'content-type': 'text/html' } })
  }), /Provider DNS lookup failed/);
});

test('DNS failures return 502 without leaking token, source or UUID', async () => {
  const run = createService({ env: () => ENV, fetchImpl: async url => {
    if (String(url) === SOURCE) return new Response(NODE_BODY);
    throw new Error('sensitive upstream error with ' + TOKEN + SOURCE + UUID);
  } });
  const response = await run(request());
  assert.equal(response.status, 502);
  const msg = await response.text();
  assert.equal(msg, 'Subscription refresh failed');
  for (const secret of [TOKEN, SOURCE, UUID]) assert.equal(msg.includes(secret), false);
});

test('refresh resolves dynamically, never reuses a fixed IP from an old response', async () => {
  const node = originalNode('tanz-hk.kunlun01dns.com');
  const old = await makeDirectNodes([node], { fetchImpl: url => dnsReply(url, '56.10.95.143') });
  const next = await makeDirectNodes([node], { fetchImpl: url => dnsReply(url, '13.214.156.15') });
  assert.equal(old[0].host, '56.10.95.143');
  assert.equal(next[0].host, '13.214.156.15');
  assert.equal(node.host, 'tanz-hk.kunlun01dns.com');
});
