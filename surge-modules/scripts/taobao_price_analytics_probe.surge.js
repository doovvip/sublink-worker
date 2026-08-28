/* Taobao analytics item-id probe for Surge.
 * v1.3: persist safe diagnostics for an Information Panel.
 * Only exposes body type/length, content-type, safe key names, and candidate item IDs.
 */

const req = $request || {};
const body = req.body;
const raw = typeof body === 'string' ? body : '';
const url = String(req.url || '');
const headers = req.headers || {};
const KEY = 'taobao_analytics_probe_last';
const PANEL_KEY = 'taobao_analytics_probe_panel';

function getHeader(name) {
  const n = String(name).toLowerCase();
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === n) return String(headers[k] || '');
  }
  return '';
}

function decodeLoop(s) {
  let out = String(s || '');
  for (let i = 0; i < 4; i++) {
    try {
      const d = decodeURIComponent(out.replace(/\+/g, '%20'));
      if (d === out) break;
      out = d;
    } catch (_) { break; }
  }
  return out;
}

function collect(text) {
  const srcs = [String(text || ''), decodeLoop(text || '')];
  const found = [];
  const keyed = [
    /(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|itemPk|item_pk|contentId|content_id|targetId|target_id)[\s\"'=:,%&\\/]+(\d{8,20})/ig,
    /[?&](?:id|itemId|item_id|numId|auctionId|contentId|targetId)=(\d{8,20})(?:&|$)/ig
  ];
  for (const s of srcs) {
    for (const re of keyed) {
      let m; while ((m = re.exec(s))) found.push(m[1]);
    }
  }
  return [...new Set(found)];
}

function safeKeyNames(text) {
  const names = new Set();
  const src = decodeLoop(text || '');
  for (const part of src.split('&').slice(0, 80)) {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = decodeLoop(part.slice(0, i)).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32);
      if (k) names.add(k);
    }
  }
  try {
    const obj = JSON.parse(src);
    const scan = (v, depth) => {
      if (!v || typeof v !== 'object' || depth > 2) return;
      for (const [k, val] of Object.entries(v)) {
        const key = String(k).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32);
        if (key) names.add(key);
        if (val && typeof val === 'object') scan(val, depth + 1);
      }
    };
    scan(obj, 0);
  } catch (_) {}
  return [...names].slice(0, 12);
}

const ids = collect(raw + '\n' + url).slice(0, 5);
const ct = getHeader('content-type').split(';')[0] || 'unknown';
const bodyType = typeof body;
const bodyLen = raw.length;
const keys = safeKeyNames(raw);
const timestamp = new Date().toLocaleString();
const safeMessage = ids.length
  ? `时间: ${timestamp}\n命中候选ID: ${ids.join(' / ')}\nbody=${bodyType} len=${bodyLen}\ncontent-type=${ct}${keys.length ? `\nkeys=${keys.join(', ')}` : '\nkeys=none/encoded-binary'}`
  : `时间: ${timestamp}\nbody=${bodyType} len=${bodyLen}\ncontent-type=${ct}${keys.length ? `\nkeys=${keys.join(', ')}` : '\nkeys=none/encoded-binary'}`;

try {
  $persistentStore.write(JSON.stringify({message: safeMessage, ids: ids.length > 0, time: Date.now()}), PANEL_KEY);
} catch (_) {}

const sig = (ids.length ? 'id|' : 'diag|') + safeMessage.replace(/^时间:.*\n/, '');
let last = {};
try { last = JSON.parse($persistentStore.read(KEY) || '{}'); } catch (_) {}
const now = Date.now();
if (last.sig !== sig || now - Number(last.time || 0) > 20000) {
  try { $persistentStore.write(JSON.stringify({sig, time: now}), KEY); } catch (_) {}
  try {
    $notification.post('淘宝商品ID探测', ids.length ? '命中商品ID' : '脚本已执行', ids.length ? ids.join(' / ') : `len=${bodyLen} ct=${ct}`);
  } catch (_) {}
}

$done({});
