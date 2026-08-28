/*
 * Taobao automatic price lookup trigger for Surge
 * Strategy: use a currently visible Taobao MTop request (acs.m.taobao.com)
 * to extract itemId, then offer one-tap direct opening of Manmanbuy's
 * price-history scene. No Shortcuts, no AMDC blocking, no QUIC blocking.
 */

const req = $request || {};
const url = req.url || '';
const body = req.body || '';
const STORE_KEY = 'taobao_price_auto_last';

function decodeSafe(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(out);
      if (d === out) break;
      out = d;
    } catch (_) { break; }
  }
  return out;
}

function walk(obj, found) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (['itemid','item_id','auctionid','auction_id','numid','num_id'].includes(key)) {
      const m = String(v).match(/^\d{8,18}$/);
      if (m) found.push(m[0]);
    }
    if (v && typeof v === 'object') walk(v, found);
    else if (typeof v === 'string') parseText(v, found);
  }
}

function parseText(text, found) {
  if (!text || typeof text !== 'string') return;
  const variants = [text, decodeSafe(text)];
  for (const s of variants) {
    const patterns = [
      /(?:itemId|item_id|auctionId|auction_id|numId|num_id)["'=:,%\s]+(\d{8,18})/ig,
      /[?&](?:id|itemId|item_id|auctionId|numId)=(\d{8,18})(?:&|$)/ig
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(s))) found.push(m[1]);
    }
    try { walk(JSON.parse(s), found); } catch (_) {}
    const q = s.includes('?') ? s.split('?').slice(1).join('?') : s;
    for (const part of q.split('&')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const k = decodeSafe(part.slice(0, idx));
      const v = decodeSafe(part.slice(idx + 1));
      if (/^(data|params|param|payload)$/i.test(k)) parseText(v, found);
      if (/^(itemId|item_id|auctionId|auction_id|numId|num_id)$/i.test(k) && /^\d{8,18}$/.test(v)) found.push(v);
    }
  }
}

const found = [];
parseText(url, found);
parseText(body, found);
const itemId = [...new Set(found)][0];

if (!itemId) {
  $done({});
} else {
  const now = Date.now();
  let last = {};
  try { last = JSON.parse($persistentStore.read(STORE_KEY) || '{}'); } catch (_) {}

  // avoid repeated notifications for the same item for 90 seconds
  if (last.itemId === itemId && now - Number(last.time || 0) < 90000) {
    $done({});
  } else {
    $persistentStore.write(JSON.stringify({ itemId, time: now }), STORE_KEY);
    const itemUrl = `https://item.taobao.com/item.htm?id=${itemId}`;
    const searchKey = encodeURIComponent(itemUrl);
    const mmb = `manmanbuy://?type=func&value=MainUtils.openWin(%7Bname%3A'TrendDetailScene',navi%3Anavigation%2CpageParam%3A%7BsearchKey%3A'${searchKey}'%2CsceneFrom%3A'mmbwx'%7D%7D)`;
    $notification.post('淘宝历史比价', '已识别当前商品', '点击直接查看历史价格', { url: mmb });
    $done({});
  }
}
