/* Taobao analytics item-id probe for Surge.
 * Target: h-adashx.ut.taobao.com/upload
 * Reads only this analytics request body and extracts likely product IDs.
 * Does not block/modify traffic.
 */

const req = $request || {};
const raw = String(req.body || '');
const url = String(req.url || '');
const KEY = 'taobao_analytics_probe_last';

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
    /(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|itemPk|item_pk)[\s\"'=:,%&\\/]+(\d{8,18})/ig,
    /[?&](?:id|itemId|item_id|numId|auctionId)=(\d{8,18})(?:&|$)/ig
  ];
  for (const s of srcs) {
    for (const re of keyed) {
      let m; while ((m = re.exec(s))) found.push(m[1]);
    }
    // Taobao analytics sometimes embeds JSON/form data several layers deep.
    const jsonish = s.match(/\{[\s\S]{20,}\}/g) || [];
    for (const j of jsonish.slice(0, 20)) {
      try {
        const obj = JSON.parse(j);
        walk(obj, found);
      } catch (_) {}
    }
  }
  return [...new Set(found)];
}

function walk(v, out) {
  if (!v || typeof v !== 'object') return;
  for (const [k, val] of Object.entries(v)) {
    const lk = String(k).toLowerCase();
    if (/(item.?id|num.?id|auction.?id|item.?pk)/.test(lk) && /^\d{8,18}$/.test(String(val))) {
      out.push(String(val));
    }
    if (val && typeof val === 'object') walk(val, out);
    else if (typeof val === 'string') {
      const nested = collect(val);
      nested.forEach(x => out.push(x));
    }
  }
}

const ids = collect(raw + '\n' + url).slice(0, 5);
if (!ids.length) {
  $done({});
} else {
  const now = Date.now();
  let last = '';
  try { last = $persistentStore.read(KEY) || ''; } catch (_) {}
  const sig = ids.join(',');
  if (sig !== last) {
    try { $persistentStore.write(sig, KEY); } catch (_) {}
    $notification.post('淘宝商品ID探测', '命中埋点请求', ids.join(' / '));
  }
  $done({});
}
