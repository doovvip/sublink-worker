import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSubscription, parseSubscription, REGION_HOSTS, BOARD_HOST, MAX_BYTES, probeNodeId } from '../lib/subscription.js';

// Deliberately fictional UUID; never a working account credential.
const UUID = '00000000-0000-4000-8000-000000000001';
const base = { ps: 'VIP2 日本04 倍率x1', add: 'tanz-jp.kunlun01dns.com', port: '22041', id: UUID, aid: '0', net: 'tcp', type: 'none', tls: '' };
const uri = n => 'vmess://' + Buffer.from(JSON.stringify(n)).toString('base64');
const feed = list => list.map(uri).join('\n');
const cfg = { mode: 'verified-regions' };

for (const [host, region] of Object.entries(REGION_HOSTS)) {
  test(`${region}: compatible endpoint only; preserve name, UUID, dynamic port`, () => {
    const n = { ...base, add: host, port: '33333', ps: `test ${region}` };
    const result = convertSubscription(feed([n]), cfg);
    assert.equal(result.rewritten, 1);
    assert.equal(result.nodes[0].host, 'xd-sh.mimonode-client.com');
    assert.equal(result.nodes[0].port, 33333);
    assert.equal(result.nodes[0].name, n.ps);
    assert.equal(result.nodes[0].uuid, UUID);
    assert.match(result.text, /encrypt-method=chacha20-ietf-poly1305/);
    assert.match(result.text, /vmess-aead=true/);
  });
}

test('compatibility is opt-in, official default is not silently rewritten', () => {
  const result = convertSubscription(feed([base]));
  assert.equal(result.rewritten, 0);
  assert.match(result.text, /tanz-jp\.kunlun01dns\.com/);
  assert.doesNotMatch(result.text, /encrypt-method=/);
});
test('board sharing a regional port remains distinct and is rewritten without forcing a cipher', () => {
  const board = { ...base, ps: 'VIP3 巴林01 倍率x2', add: BOARD_HOST, port: '22007' };
  const kr = { ...base, ps: 'VIP2 韩国01 倍率x1', add: 'tanz-kr.kunlun01dns.com', port: '22007' };
  const result = convertSubscription(feed([kr, board]), cfg);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.rewritten, 2);
  assert.equal(result.nodes[0].cipher, 'chacha20-ietf-poly1305');
  assert.equal(result.nodes[1].host, 'xd-sh.mimonode-client.com');
  assert.equal(result.nodes[1].cipher, 'auto');
  assert.equal(result.nodes[1].port, 22007);
  assert.equal(result.nodes[1].uuid, UUID);
});
test('board preserves an explicit provider cipher during endpoint compatibility rewrite', () => {
  const board = { ...base, ps: 'VIP3 board AES', add: BOARD_HOST, port: '22140', scy: 'aes-128-gcm' };
  const result = convertSubscription(feed([board]), cfg);
  assert.equal(result.rewritten, 1);
  assert.equal(result.nodes[0].host, 'xd-sh.mimonode-client.com');
  assert.equal(result.nodes[0].cipher, 'aes-128-gcm');
  assert.match(result.text, /encrypt-method=aes-128-gcm/);
});
test('access/traffic entry is preserved without compatibility changes', () => {
  const info = { ...base, add: 'access.tanzcloud.com', ps: '剩余流量：test', port: '10086' };
  const result = convertSubscription(feed([base, info]), cfg);
  assert.equal(result.nodes[1].host, info.add);
  assert.equal(result.nodes[1].informational, true);
  assert.match(result.text, /剩余流量：test = vmess, access\.tanzcloud\.com/);
});
test('traffic information cannot gain compatibility rewriting by a regional host', () => {
  const result = convertSubscription(feed([base, { ...base, ps: '剩余流量：test', port: 33334 }]), cfg);
  assert.equal(result.nodes[1].host, base.add);
});
test('loopback and unspecified placeholders are skipped before validating credentials', () => {
  const placeholders = ['127.0.0.1', '127.10.1.1', 'localhost', '0.0.0.0', '::1', '::'].map(add => ({ add }));
  assert.equal(convertSubscription(feed([...placeholders, base]), cfg).nodes.length, 1);
});
test('all-placeholder or only informational responses fail instead of returning an empty list', () => {
  assert.throws(() => convertSubscription(feed([{ add: '127.0.0.1' }])));
  assert.throws(() => convertSubscription(feed([{ ...base, add: 'access.tanzcloud.com' }])));
});
test('unknown domain and hostname lookalikes are not rewritten', () => {
  for (const add of ['new-entry.example.net', 'tanz-jp.kunlun01dns.com.example.net', 'tanz-board.kunlun01dns.com']) {
    assert.equal(convertSubscription(feed([{ ...base, add }]), cfg).nodes[0].host, add);
  }
});
test('TLS endpoints are never redirected, SNI and verification setting are preserved', () => {
  const n = { ...base, tls: 'tls', sni: 'edge.example.net', 'skip-cert-verify': 'false' };
  const result = convertSubscription(feed([n]), cfg);
  assert.equal(result.rewritten, 0);
  assert.match(result.text, /tls=true, sni=edge\.example\.net/);
  assert.doesNotMatch(result.text, /skip-cert-verify=true/);
});
test('explicit insecure TLS setting is preserved, not enabled by a truthy string bug', () => {
  const result = convertSubscription(feed([{ ...base, tls: 'tls', 'skip-cert-verify': true }]));
  assert.match(result.text, /skip-cert-verify=true/);
});
test('WebSocket transport/host/path remain unchanged, not redirected', () => {
  const n = { ...base, net: 'ws', path: '/socket', host: 'ws.example.net' };
  const result = convertSubscription(feed([n]), cfg);
  assert.equal(result.rewritten, 0);
  assert.match(result.text, /ws=true, ws-path=\/socket, ws-headers=Host:ws\.example\.net/);
});
test('legacy nonzero alterId is not forcibly converted to AEAD', () => {
  const result = convertSubscription(feed([{ ...base, aid: '8' }]), cfg);
  assert.equal(result.rewritten, 0);
  assert.doesNotMatch(result.text, /vmess-aead=true/);
});
test('AES/ChaCha/auto are accepted, ChaCha spelling is converted for Surge', () => {
  for (const scy of ['auto', 'aes-128-gcm', 'chacha20-poly1305', 'chacha20-ietf-poly1305']) {
    const result = convertSubscription(feed([{ ...base, scy }]));
    if (scy === 'auto') assert.doesNotMatch(result.text, /encrypt-method=/);
    else assert.match(result.text, new RegExp('encrypt-method=' + (scy.startsWith('chacha') ? 'chacha20-ietf-poly1305' : scy)));
  }
});
test('unsupported transport and cipher fail closed rather than dropping parameters', () => {
  for (const changes of [{ net: 'grpc' }, { net: 'h2' }, { type: 'http' }, { scy: 'none' }, { tls: 'reality' }]) {
    assert.throws(() => convertSubscription(feed([{ ...base, ...changes }]), cfg));
  }
});
test('duplicate original endpoints are deduplicated, distinct same-name nodes get stable suffixes', () => {
  const result = convertSubscription(feed([base, base, { ...base, port: 22222 }]), cfg);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[1].name, base.ps + ' (2)');
});
test('dynamic node counts are not fixed to 83 or a pair of sample ports', () => {
  for (const count of [1, 7, 80, 103]) {
    const records = Array.from({ length: count }, (_, i) => ({ ...base, ps: `Dynamic ${i}`, port: 25000 + i }));
    assert.equal(convertSubscription(feed(records), cfg).nodes.length, count);
  }
});
test('raw and outer-base64 subscriptions have identical results', () => {
  const raw = feed([base]);
  assert.equal(convertSubscription(raw, cfg).text, convertSubscription(Buffer.from(raw).toString('base64'), cfg).text);
});
test('base64url and missing padding are accepted', () => {
  const inner = 'vmess://' + Buffer.from(JSON.stringify(base)).toString('base64url');
  assert.equal(convertSubscription(inner).nodes.length, 1);
});
test('URI fragment name is decoded like the original parser', () => {
  assert.equal(convertSubscription(uri(base) + '#' + encodeURIComponent('日本 自定义')).nodes[0].name, '日本 自定义');
});
test('name control characters cannot inject a Surge rule or section', () => {
  const n = { ...base, ps: '[Rule]\nFINAL,REJECT=evil' };
  const result = convertSubscription(feed([n]), cfg);
  assert.equal(result.text.trim().split('\n').length, 1);
  assert.match(result.text, /^TanZou \[Rule\]/);
});
test('bad ports, UUIDs, booleans, and unsafe host/WS option data are rejected', () => {
  for (const changes of [{ port: '22041oops' }, { port: 0 }, { port: 65536 }, { id: 'not-uuid' },
    { add: 'a.example, tls=true' }, { 'skip-cert-verify': 'sometimes' },
    { net: 'ws', path: '/a, underlying-proxy=evil' }, { net: 'ws', path: 'relative' }]) {
    assert.throws(() => convertSubscription(feed([{ ...base, ...changes }])));
  }
});
test('empty, HTML, corrupt base64, malformed JSON and mixed unsupported records are rejected', () => {
  for (const input of ['', '  ', '<html>bad</html>', 'vmess://%%%%', 'vmess://e30', 'vmess://eA==', feed([base]) + '\nss://unsupported']) {
    assert.throws(() => convertSubscription(input));
  }
});
test('oversized feed is rejected', () => assert.throws(() => parseSubscription('x'.repeat(MAX_BYTES + 1))));
test('compatibility can be disabled and does not mutate the parsed input', () => {
  const input = parseSubscription(feed([base]));
  const copy = JSON.stringify(input);
  convertSubscription(feed([base]), cfg);
  assert.equal(JSON.stringify(input), copy);
  assert.equal(convertSubscription(feed([base]), { mode: 'official' }).nodes[0].host, base.add);
});
test('invalid mode and fixed-IP compatibility target are rejected', () => {
  assert.throws(() => convertSubscription(feed([base]), { mode: 'guess' }));
  assert.throws(() => convertSubscription(feed([base]), { ...cfg, compatHost: '127.0.0.1' }));
});
test('multiple ALPN protocols are quoted in Surge output', () => {
  const result = convertSubscription(feed([{ ...base, tls: 'tls', alpn: ['h2', 'http/1.1'] }]));
  assert.match(result.text, /alpn="h2,http\/1\.1"/);
});
test('full synthetic 83-record feed keeps all 80 real nodes, including all board nodes', () => {
  const regionRecords = Object.entries(REGION_HOSTS).flatMap(([host, region]) =>
    Array.from({ length: region === 'HK' ? 10 : 4 }, (_, i) => ({ ...base, ps: `Fixture ${region} ${i}`, add: host, port: 24000 + i })));
  const boardRecords = Array.from({ length: 50 }, (_, i) => ({ ...base, ps: `Fixture board ${i}`, add: BOARD_HOST, port: 26000 + i }));
  const info = { ...base, add: 'access.tanzcloud.com', ps: '剩余流量：fixture', port: 10086 };
  const records = [...regionRecords, ...boardRecords, info, info, { add: '127.0.0.1' }];
  assert.equal(records.length, 83);
  const result = convertSubscription(feed(records), cfg);
  assert.equal(result.rewritten, 80);
  assert.equal(result.nodes.filter(n => !n.informational).length, 80);
  assert.equal(result.nodes.filter(n => n.host === BOARD_HOST).length, 0);
  assert.equal(result.nodes.length, 81);
});

test('RC2.2 successful probe cache overrides only host/cipher by original identity', () => {
  const parsed = parseSubscription(feed([base]))[0];
  const id = probeNodeId(parsed);
  const probeCache = { version: 1, nodes: { [id]: { name: parsed.name, original_host: parsed.host, best_host: parsed.host, port: parsed.port, cipher: 'aes-128-gcm', last_success: '2026-09-18T00:00:00Z', consecutive_failures: 0 } } };
  const result = convertSubscription(feed([base]), { ...cfg, probeCache });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].host, base.add);
  assert.equal(result.nodes[0].cipher, 'aes-128-gcm');
  assert.equal(result.nodes[0].port, Number(base.port));
  assert.equal(result.nodes[0].uuid, UUID);
});
test('RC2.2 invalid, failed or absent cache preserves exact RC2.1 output and never deletes nodes', () => {
  const baseline = convertSubscription(feed([base]), cfg);
  const id = probeNodeId(parseSubscription(feed([base]))[0]);
  const bad = [
    null,
    { version: 1, nodes: { [id]: { best_host: 'evil.example', port: Number(base.port), cipher: 'aes-128-gcm', last_success: 'x', consecutive_failures: 0 } } },
    { version: 1, nodes: { [id]: { best_host: base.add, port: 9999, cipher: 'aes-128-gcm', last_success: 'x', consecutive_failures: 0 } } },
    { version: 1, nodes: { [id]: { best_host: base.add, port: Number(base.port), cipher: 'auto', last_success: 'x', consecutive_failures: 0 } } },
    { version: 1, nodes: { [id]: { best_host: base.add, port: Number(base.port), cipher: 'aes-128-gcm', last_success: 'x', consecutive_failures: 1 } } }
  ];
  for (const probeCache of bad) {
    const result = convertSubscription(feed([base]), { ...cfg, probeCache });
    assert.equal(result.text, baseline.text);
    assert.equal(result.nodes.length, baseline.nodes.length);
  }
});
