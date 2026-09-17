import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';
function response() {
  return { statusCode: 0, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = value; } };
}
test('Node/Vercel adapter exposes health without leaking origin headers', async () => {
  const res = response();
  await handler({ url: '/health', method: 'GET', headers: { host: 'bad.example' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'OK');
  assert.equal(res.headers['cache-control'], 'private, no-store');
});
test('Node/Vercel adapter denies anonymous subscription requests', async () => {
  const res = response();
  await handler({ url: '/private/live-tanzou.list', method: 'GET' }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, 'Not Found');
});
