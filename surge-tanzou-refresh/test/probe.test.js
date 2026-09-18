import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../scripts/vmess_probe.py',import.meta.url),'utf8');
test('probe does not embed subscription secrets or UUIDs',()=>{ assert.doesNotMatch(src,/TANZOU_ENCRYPTED_SOURCE|token=|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i); });
test('probe requires real VMess via sing-box and HTTP 204',()=>{ assert.match(src,/sing-box/); assert.match(src,/generate_204/); assert.match(src,/stdout\.strip\(\)=="204"/); });
test('probe tests only decoded feed endpoints and fixed compatibility host',()=>{ assert.match(src,/for n in nodes/); assert.match(src,/xd-sh\.mimonode-client\.com/); });
test('probe persists LKG fields without UUID',()=>{ for(const k of ['original_host','best_host','port','cipher','last_success','latency_ms','consecutive_failures']) assert.match(src,new RegExp(k)); assert.doesNotMatch(src,/result\["nodes"\].*uuid/); });
test('LKG restores from persisted best_host and cipher',()=>{ assert.match(src,/prior\.get\("best_host"\)/); assert.match(src,/prior\.get\("cipher"\)/); assert.doesNotMatch(src,/prior\.get\("best"\)/); });
test('LKG is probed first and probing stops on first success',()=>{ assert.match(src,/ordered=\[lkg\]\+/); assert.match(src,/if trial\["ok"\]: best=trial; break/); assert.doesNotMatch(src,/trials=\[test_combo/); });
test('auto can never be probed or saved as best cipher',()=>{ assert.match(src,/CIPHERS=\("aes-128-gcm","chacha20-ietf-poly1305"\)/); assert.match(src,/c in CIPHERS/); assert.doesNotMatch(src,/original_cipher|sing_cipher\(c\).*auto|return "auto"/); });

test('daily automation uses existing real VMess probe and only commits safe cache', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/rc2-2-probe-cache.yml', import.meta.url), 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /vmess_probe\.py --cache probe-cache\.preview\.json/);
  assert.match(workflow, /secrets\.TANZOU_SOURCE_URL/);
  assert.match(workflow, /git add probe-cache\.preview\.json/);
  assert.doesNotMatch(workflow, /git add -A|git add \./);
});
test('single probe failure preserves only a validated LKG', () => {
  assert.match(script, /def valid_lkg\(prior,n\)/);
  assert.match(script, /prior\.get\("port"\)!=n\["port"\]/);
  assert.match(script, /prior\.get\("original_host"\)!=n\["original_host"\]/);
  assert.match(script, /h not in \(n\["original_host"\],COMPAT_HOST\)/);
});
