import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createService } from '../lib/service.js';
import { sourceForToken } from '../lib/auth.js';
import { MAX_BYTES } from '../lib/subscription.js';

const TOKEN = 'synthetic_test_token_'.repeat(3);
const SOURCE = 'https://config.tanzcloud.com/link/SYNTHETIC_NOT_A_SUBSCRIPTION?sub=3';
const uuid = '00000000-0000-4000-8000-000000000001';
const node = { ps: 'Fixture 日本04', add: 'tanz-jp.kunlun01dns.com', port: 22041, id: uuid, aid: 0, net: 'tcp', type: 'none', tls: '' };
const body = 'vmess://' + Buffer.from(JSON.stringify(node)).toString('base64');

// Match the archived service's WebCrypto wire format, not the native decipher implementation.
async function seal(source = SOURCE, token = TOKEN) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const key = await webcrypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const cipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(source));
  return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(cipher).toString('base64url')}`;
}
const encrypted = await seal();
const ENV = { TANZOU_ENCRYPTED_SOURCE: encrypted, TANZOU_COMPAT_MODE: 'verified-regions' };
const request = (suffix = `?token=${TOKEN}`, method = 'GET', path = '/private/live-tanzou.list') =>
  new Request('https://service.example' + path + suffix, { method });
const handler = fetchImpl => createService({ env: () => ENV, fetchImpl });

const success = () => new Response(body, { status: 200 });
test('preserves existing AES-GCM source/token contract with WebCrypto sealed fixture', () => {
  assert.equal(sourceForToken(TOKEN, encrypted).href, SOURCE);
});
test('authenticated request converts a dynamically supplied subscription', async () => {
  let calls = 0;
  const run = handler(async (url, options) => {
    calls++;
    assert.equal(String(url), SOURCE);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['User-Agent'], 'Shadowrocket');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return success();
  });
  const response = await run(request());
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.match(await response.text(), /xd-sh\.mimonode-client\.com/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('missing/short/wrong/duplicated token never triggers an upstream request', async () => {
  let calls = 0;
  const run = handler(async () => { calls++; return success(); });
  for (const suffix of ['', '?token=short', '?token=' + 'z'.repeat(64), '?token=' + TOKEN + '&token=' + TOKEN]) {
    assert.equal((await run(request(suffix))).status, 404);
  }
  assert.equal(calls, 0);
});
test('missing env, malformed sealed source and changed ciphertext fail closed', async () => {
  for (const env of [{}, { TANZOU_ENCRYPTED_SOURCE: 'invalid' }, { TANZOU_ENCRYPTED_SOURCE: encrypted.slice(0, -8) + 'AAAAAAAA' }]) {
    let calls = 0;
    const run = createService({ env: () => env, fetchImpl: async () => { calls++; return success(); } });
    assert.equal((await run(request())).status, 404);
    assert.equal(calls, 0);
  }
});
test('no arbitrary origin, HTTP, credentials, fragment, redirect or unknown source parameter', async () => {
  for (const source of [
    'https://example.net/link/test?sub=3', 'http://config.tanzcloud.com/link/test?sub=3',
    'https://config.tanzcloud.com.evil.example/link/test?sub=3', 'https://user:pass@config.tanzcloud.com/link/test?sub=3',
    'https://config.tanzcloud.com/link/test?sub=3#fragment', 'https://config.tanzcloud.com/link/test',
    'https://config.tanzcloud.com/link/test?sub=3&sub=2', 'https://config.tanzcloud.com/link/test?sub=3&url=other'
  ]) {
    const sealed = await seal(source);
    const run = createService({ env: () => ({ TANZOU_ENCRYPTED_SOURCE: sealed }), fetchImpl: async () => { throw new Error('must not fetch'); } });
    assert.equal((await run(request())).status, 404);
  }
});
test('auth before method check, authenticated POST is 405', async () => {
  const run = handler(async () => { throw new Error('must not fetch'); });
  assert.equal((await run(request('', 'POST'))).status, 404);
  assert.equal((await run(request(undefined, 'POST'))).status, 405);
});
test('unrecognized paths do not expose the subscription', async () => {
  const run = handler(success);
  for (const path of ['/api/index', '/', '/tanzou', '/private/live-tanzou.list/']) {
    assert.equal((await run(request(undefined, 'GET', path))).status, 404);
  }
});
test('health is not advertised as a node connectivity check and never fetches upstream', async () => {
  let calls = 0;
  const run = handler(async () => { calls++; return success(); });
  const response = await run(request('', 'GET', '/health'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'OK');
  assert.equal(calls, 0);
});
test('upstream non-200, redirect, empty and malformed bodies fail without a 200 empty list', async () => {
  for (const mock of [
    () => new Response('failure', { status: 500 }),
    () => new Response(null, { status: 302, headers: { location: 'https://example.net/' } }),
    () => new Response(''), () => new Response('not a subscription'),
    () => Promise.reject(new Error('network error containing sensitive request data'))
  ]) {
    const response = await handler(mock)(request());
    assert.equal(response.status, 502);
    assert.equal(await response.text(), 'Subscription refresh failed');
  }
});
test('oversized declared and streamed bodies both fail', async () => {
  for (const mock of [
    () => new Response(body, { headers: { 'content-length': String(MAX_BYTES + 1) } }),
    () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BYTES)); c.enqueue(new Uint8Array(1)); c.close(); } }))
  ]) assert.equal((await handler(mock)(request())).status, 502);
});
test('upstream timeout aborts the request', async () => {
  const run = createService({ env: () => ENV, timeoutMs: 15, fetchImpl: (_url, options) =>
    new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) });
  assert.equal((await run(request())).status, 502);
});
test('timeout covers body streaming, not just response headers', async () => {
  const run = createService({ env: () => ENV, timeoutMs: 15, fetchImpl: async (_url, options) => {
    return new Response(new ReadableStream({ start(c) {
      options.signal.addEventListener('abort', () => c.error(new Error('timeout')), { once: true });
    } }));
  } });
  assert.equal((await run(request())).status, 502);
});
test('environment is read at request time and compatibility can be turned off without rebuilding', async () => {
  let mode = 'official';
  const run = createService({ env: () => ({ ...ENV, TANZOU_COMPAT_MODE: mode }), fetchImpl: success });
  assert.match(await (await run(request())).text(), /tanz-jp\.kunlun01dns\.com/);
  mode = 'verified-regions';
  assert.match(await (await run(request())).text(), /xd-sh\.mimonode-client\.com/);
});
test('failure responses do not disclose UUID, source URL, sealed env or token', async () => {
  const response = await handler(() => { throw new Error(SOURCE + TOKEN + uuid + encrypted); })(request());
  const text = await response.text();
  for (const value of [TOKEN, SOURCE, uuid, encrypted]) assert.equal(text.includes(value), false);
});
