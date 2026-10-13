import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createService } from '../lib/service.js';
import { makeMultiDirectNodes } from '../lib/direct-dns.js';

const TOKEN = 'synthetic_multi_test_token_'.repeat(3);
const SOURCE = 'https://config.tanzcloud.com/link/SYNTHETIC_MULTI?sub=3';
const UUID = '00000000-0000-4000-8000-000000000001';
const node = (name, port, host = 'tanz-jp.kunlun01dns.com') =>
  ({ ps: name, add: host, port, id: UUID, aid: 0, net: 'tcp', type: 'none', tls: '' });
const body = [node('Fixture 日本01', 22005), node('Fixture 日本02', 22006)]
  .map(x => 'vmess://' + Buffer.from(JSON.stringify(x)).toString('base64')).join('\n');
const uri = (query = '?token=' + TOKEN, path = '/private/live-tanzou.multi.list') =>
  new Request('https://synthetic.test' + path + query);

async function seal() {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const sum = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN));
  const key = await webcrypto.subtle.importKey('raw', sum, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(SOURCE));
  return Buffer.from(iv).toString('base64url') + '.' + Buffer.from(ciphertext).toString('base64url');
}
const ENV = { TANZOU_ENCRYPTED_SOURCE: await seal() };
function response(url, ip) {
  const wire = Buffer.from(new URL(url).searchParams.get('dns'), 'base64url');
  wire.writeUInt16BE(0x8180, 2);
  wire.writeUInt16BE(1, 6);
  const rr = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4, ...ip.split('.').map(Number)]);
  return new Response(Buffer.concat([wire, rr]), {
    headers: { 'content-type': 'application/dns-message' }, status: 200
  });
}
function mock(answer = { '36290': '13.115.40.158', '55228': '35.74.65.255', '62201': '18.162.213.136' }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const string = String(url);
    if (string === SOURCE) {
      calls.push({ kind: 'original', options });
      return new Response(body);
    }
    calls.push({ kind: 'doh', url: new URL(string), options });
    assert.match(string, /^https:\/\/(20\.247\.42\.211|20\.239\.241\.138|104\.208\.122\.199):\d+\/dns-query\/clash\?site=feitan&dns=/);
    assert.equal(options.headers.Accept, 'application/dns-message');
    const key = String(new URL(string).port);
    return answer[key] ? response(url, answer[key]) : new Response('unavailable', { status: 502 });
  };
  return { calls, fetchImpl };
}

test('new opt-in endpoint preserves original two nodes and publishes three labelled candidate endpoints', async () => {
  const { calls, fetchImpl } = mock();
  const reply = await createService({ env: () => ENV, fetchImpl })(uri());
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('x-rc2-subscription-mode'), 'multi-doh');
  assert.equal(reply.headers.get('x-rc2-logical-node-count'), '2');
  assert.equal(reply.headers.get('x-rc2-candidate-count'), '6');
  const lines = (await reply.text()).trim().split('\n');
  assert.equal(lines.length, 6);
  for (const original of ['Fixture 日本01', 'Fixture 日本02']) {
    for (const [suffix, host] of [['D1', '13.115.40.158'], ['D2', '35.74.65.255'], ['D3', '18.162.213.136']]) {
      const line = lines.find(x => x.startsWith(original + ' [' + suffix + '] = vmess, '));
      assert.ok(line, original + ': missing variant ' + suffix);
      assert.ok(line.includes(', ' + original.slice(-2) + '')); // names are stable
      assert.ok(line.includes('= vmess, ' + host + ', '));
      assert.ok(line.includes('username=' + UUID));
      assert.ok(line.includes('vmess-aead=true'));
    }
  }
  assert.equal(calls.filter(x => x.kind === 'original').length, 1);
  assert.equal(calls.filter(x => x.kind === 'doh').length, 3);
});

test('duplicate provider IPs collapse to one option per distinct address', async () => {
  const { fetchImpl } = mock({ '36290': '13.115.40.158', '55228': '13.115.40.158', '62201': '18.162.213.136' });
  const reply = await createService({ env: () => ENV, fetchImpl })(uri());
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('x-rc2-candidate-count'), '4');
  assert.doesNotMatch(await reply.text(), /\[D2\]/);
});

test('one failed provider DoH yields fewer options, not a stale guessed IP', async () => {
  const { fetchImpl } = mock({ '55228': '35.74.65.255', '62201': '18.162.213.136' });
  const reply = await createService({ env: () => ENV, fetchImpl })(uri());
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('x-rc2-candidate-count'), '4');
  assert.match(await reply.text(), /\[D2\]/);
});

test('all provider DoH failures fail closed, without exposing secrets', async () => {
  const { fetchImpl } = mock({});
  const reply = await createService({ env: () => ENV, fetchImpl })(uri());
  assert.equal(reply.status, 502);
  const message = await reply.text();
  assert.equal(message, 'Subscription refresh failed');
  for (const secret of [TOKEN, SOURCE, UUID, ENV.TANZOU_ENCRYPTED_SOURCE]) {
    assert.equal(message.includes(secret), false);
  }
});

test('multi feed still rejects wrong and duplicate tokens before upstream requests', async () => {
  const { fetchImpl, calls } = mock();
  for (const query of ['', '?token=wrong', '?token=' + TOKEN + '&token=' + TOKEN]) {
    assert.equal((await createService({ env: () => ENV, fetchImpl })(uri(query))).status, 404);
  }
  assert.equal(calls.length, 0);
});

test('existing official and direct endpoints remain unchanged and do not use multi-route', async () => {
  const { fetchImpl } = mock();
  const official = await createService({ env: () => ENV, fetchImpl })(uri('?token=' + TOKEN, '/private/live-tanzou.official.list'));
  assert.equal(official.status, 200);
  const result = await official.text();
  assert.match(result, /tanz-jp\.kunlun01dns\.com/);
  assert.doesNotMatch(result, /\[D[123]\]/);
});

test('changing upstream protocol or introducing an unknown hostname fails before any DNS fetch', async () => {
  let lookups = 0;
  const fetchImpl = async () => { lookups++; throw new Error('must not query'); };
  const exemplar = { name: 'Fixture', host: 'tanz-jp.kunlun01dns.com', aid: 0,
    tls: false, network: 'tcp', type: 'none', informational: false, alpn: [] };
  await assert.rejects(makeMultiDirectNodes([{ ...exemplar, network: 'ws' }], { fetchImpl }));
  await assert.rejects(makeMultiDirectNodes([{ ...exemplar, host: 'lookalike.example.net' }], { fetchImpl }));
  assert.equal(lookups, 0);
});
