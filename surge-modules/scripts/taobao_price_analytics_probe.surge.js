/* Taobao analytics item-id probe for Surge.
 * Target: h-adashx.ut.taobao.com/upload
 * v1.1: if no itemId is found, notify only safe body structure metadata
 * (body type/length, content-type, parameter key names). Never exposes values,
 * cookies, tokens, headers, or raw body.
 */

const req = $request || {};
const body = req.body;
const raw = typeof body === 'string' ? body : '';
const url = String(req.url || '');
const headers = req.headers || {};
const KEY = 'taobao_analytics_probe_last';
const DIAG_KEY = 'taobao_analytics_probe_diag';

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
    const jsonish = s.match(/\{[\s\S]{10,}\}/g) || [];
    for (const j of jsonish.slice(0, 20)) {
      try { walk(JSON.parse(j), found); } catch (_) {}
    }
  }
  return [...new Set(found)];
}

function walk(v, out) {
  if (!v || typeof v !== 'object') return;
  for (const [k, val] of Object.entries(v)) {
    const lk = String(k).toLowerCase();
    if (/(item.?id|num.?id|auction.?id|item.?pk|content.?id|target.?id)/.test(lk) && /^\d{8,20}$/.test(String(val))) {
      out.push(String(val));
    }
    if (val && typeof val === 'object') walk(val, out);
    else if (typeof val === 'string' && val.length < 20000) collect(val).forEach(x => out.push(x));
  }
}

function safeKeyNames(text) {
  const names = new Set();
  const src = decodeLoop(text || '');

  // form/query style keys — values are never retained
  for (const part of src.split('&').slice(0, 80)) {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = decodeLoop(part.slice(0, i)).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32);
      if (k) names.add(k);
    }
  }

  // JSON top-level / nested key names — values are never retained
  try {
    const obj = JSON.parse(src);
    const scan = (v, depth) => {
      if (!v || typeof v !== 'object' || depth > 3) return;
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
if (ids.length) {
  const sig = 'id:' + ids.join(',');
  let last = '';
  try { last = $persistentStore.read(KEY) || ''; } catch (_) {}
  if (sig !== last) {
    try { $persistentStore.write(sig, KEY); } catch (_) {}
    $notification.post('淘宝商品ID探测', '命中商品ID', ids.join(' / '));
  }
  $done({});
} else {
  // One safe diagnostic per distinct structure. No raw values are exposed.
  const ct = getHeader('content-type').split(';')[0] || 'unknown';
  const bodyType = typeof body;
  const bodyLen = raw.length;
  const keys = safeKeyNames(raw);
  const summary = `type=${bodyType} len=${bodyLen} ct=${ct}`;
  const detail = keys.length ? `keys: ${keys.join(', ')}` : 'keys: none/encoded-binary';
  const sig = summary + '|' + detail;
  let prev = '';
  try { prev = $persistentStore.read(DIAG_KEY) || ''; } catch (_) {}
  if (sig !== prev) {
    try { $persistentStore.write(sig, DIAG_KEY); } catch (_) {}
    $notification.post('淘宝商品ID探测', summary, detail);
  }
  $done({});
}
