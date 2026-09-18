import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../scripts/vmess_probe.py',import.meta.url),'utf8');
test('probe does not embed subscription secrets or UUIDs',()=>{ assert.doesNotMatch(src,/TANZOU_ENCRYPTED_SOURCE|token=|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i); });
test('probe requires real VMess via sing-box and HTTP 204',()=>{ assert.match(src,/sing-box/); assert.match(src,/generate_204/); assert.match(src,/stdout\.strip\(\)=="204"/); });
test('probe tests only decoded feed endpoints and fixed compatibility host',()=>{ assert.match(src,/for n in nodes/); assert.match(src,/xd-sh\.mimonode-client\.com/); });
test('probe persists LKG fields without UUID',()=>{ for(const k of ['original_host','best_host','port','cipher','last_success','latency_ms','consecutive_failures']) assert.match(src,new RegExp(k)); assert.doesNotMatch(src,/result\["nodes"\].*uuid/); });
