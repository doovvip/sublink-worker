/* Taobao analytics item-id probe for Surge.
 * v1.2: always notify once per request-structure family so we can verify execution.
 * Only exposes body type/length, content-type and safe key names. Never exposes values.
 */

const req = $request || {};
const body = req.body;
const raw = typeof body === 'string' ? body : '';
const url = String(req.url || '');
const headers = req.headers || {};
const KEY = 'taobao_analytics_probe_last';

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

let title = '淘宝商品ID探测';
let subtitle = ids.length ? '命中商品ID' : '脚本已执行';
let message = ids.length
  ? ids.join(' / ')
  : `type=${bodyType} len=${bodyLen} ct=${ct}${keys.length ? ' | keys=' + keys.join(',') : ' | keys=none/encoded-binary'}`;

// throttle identical notifications to once per 20 seconds, but never suppress forever because of old persisted state
const sig = subtitle + '|' + message;
let last = {};
try { last = JSON.parse($persistentStore.read(KEY) || '{}'); } catch (_) {}
const now = Date.now();
if (last.sig !== sig || now - Number(last.time || 0) > 20000) {
  try { $persistentStore.write(JSON.stringify({sig, time: now}), KEY); } catch (_) {}
  $notification.post(title, subtitle, message);
}

$done({});
