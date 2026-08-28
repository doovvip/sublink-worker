// Taobao price-history fallback for Surge.
// Triggered by Taobao/Tmall share links opened in Safari.
// Does not depend on decrypting the Taobao app's native product-detail traffic.

(async () => {
  const sourceUrl = $request.url;
  const cacheKey = "taobao_price_share_last_v2";

  try {
    const last = JSON.parse($persistentStore.read(cacheKey) || "{}");
    const now = Date.now();
    if (last.url === sourceUrl && now - Number(last.ts || 0) < 15000) return $done({});
    $persistentStore.write(JSON.stringify({ url: sourceUrl, ts: now }), cacheKey);

    const product = await resolveProduct(sourceUrl);
    if (!product || !product.url) {
      notify("淘宝历史比价", "已命中分享链接", "没识别到商品ID");
      return $done({});
    }

    const providers = [
      () => queryBijiago(product.url),
      () => queryManmanbuy(product.url),
      () => queryIcharle(product.url)
    ];

    let result = null;
    for (const fn of providers) {
      try {
        const r = await fn();
        if (r && r.ok) {
          result = r;
          break;
        }
      } catch (_) {}
    }

    if (result) {
      notify("淘宝历史比价", result.subtitle || ("商品 " + (product.id || "")), result.text);
    } else {
      notify("淘宝历史比价", "商品已识别", "历史价格源暂时没有返回有效数据");
    }
  } catch (e) {
    notify("淘宝历史比价", "脚本异常", String(e && e.message ? e.message : e).slice(0, 180));
  }

  $done({});
})();

function notify(title, subtitle, body) {
  $notification.post(title, subtitle || "", body || "");
}

async function resolveProduct(input) {
  let id = extractId(input);
  if (id) return { id, url: "https://detail.tmall.com/item.htm?id=" + id };

  const host = safeHost(input);
  if (/^(?:m|e|s)\.tb\.cn$/i.test(host) || /\.tb\.cn$/i.test(host)) {
    const resolved = await follow(input, 0);
    id = extractId(resolved.url || "") || extractId(resolved.body || "");
    if (id) return { id, url: "https://detail.tmall.com/item.htm?id=" + id };
    if (resolved.url && /taobao|tmall/i.test(resolved.url)) {
      return { id: "", url: resolved.url };
    }
  }

  return { id: "", url: input };
}

function extractId(s) {
  if (!s) return "";
  const t = String(s)
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/%3D/ig, "=")
    .replace(/%26/ig, "&");

  const regs = [
    /(?:[?&]|\b)id=(\d{6,})/i,
    /(?:[?&]|\b)itemId=(\d{6,})/i,
    /["']itemId["']\s*[:=]\s*["']?(\d{6,})/i,
    /item[_-]?id["']?\s*[:=]\s*["']?(\d{6,})/i,
    /item\.htm\?[^"']*?id=(\d{6,})/i
  ];
  for (const r of regs) {
    const m = t.match(r);
    if (m) return m[1];
  }
  return "";
}

function safeHost(u) {
  try { return new URL(u).hostname; } catch (_) { return ""; }
}

function getHeader(headers, name) {
  if (!headers) return "";
  const k = Object.keys(headers).find(x => x.toLowerCase() === name.toLowerCase());
  return k ? String(headers[k]) : "";
}

async function follow(url, depth) {
  if (depth > 5) return { url, body: "" };
  const r = await httpGet({
    url,
    timeout: 8,
    "auto-redirect": false,
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      "X-Surge-Skip-Scripting": "true"
    }
  });

  const status = Number((r.response && (r.response.status || r.response.statusCode)) || 0);
  const loc = getHeader(r.response && r.response.headers, "location");
  if (loc && status >= 300 && status < 400) {
    let next = loc;
    try { next = new URL(loc, url).toString(); } catch (_) {}
    return follow(next, depth + 1);
  }
  return { url, body: r.body || "" };
}

async function queryBijiago(itemUrl) {
  try {
    const seed = await httpGet({
      url: "https://browser.bijiago.com/extension?ac=bdextPermanent&format=json&version=" + Date.now(),
      timeout: 6,
      "auto-redirect": true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "X-Surge-Skip-Scripting": "true"
      }
    });

    const setCookie = getHeader(seed.response && seed.response.headers, "set-cookie");
    const cookies = [];
    for (const name of ["gwdang_permanent_id", "gwdang_permanent_cpt"]) {
      const m = setCookie.match(new RegExp(name + "=([^;,\\s]+)", "i"));
      if (m) cookies.push(name + "=" + m[1]);
    }

    const r = await httpGet({
      url: "https://browser.bijiago.com/extension/price_towards?url=" + encodeURIComponent(itemUrl) +
        "&format=jsonp&union=union_bijiago&from_device=bijiago&version=" + Date.now(),
      timeout: 8,
      "auto-redirect": true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Referer": itemUrl,
        "Accept": "*/*",
        "Cookie": cookies.join("; "),
        "X-Surge-Skip-Scripting": "true"
      }
    });

    const data = parseJsonLike(r.body);
    if (!data || !Array.isArray(data.store) || !data.store.length) return { ok: false };

    const store = data.store.length > 1 ? data.store[1] : data.store[0];
    const analysis = data.analysis || {};
    const nowPrice = normalizeNowPrice(store.last_price);
    const low = num(store.lowest);
    const high = num(store.highest);
    let text = [];
    if (nowPrice != null) text.push("当前价：¥" + fmt(nowPrice));
    if (low != null) text.push("历史最低：¥" + fmt(low) + dateSuffix(store.min_stamp));
    if (high != null) text.push("历史最高：¥" + fmt(high) + dateSuffix(store.max_stamp));
    if (store.price_range) text.push("价格区间：" + store.price_range);
    if (analysis.tip) text.push(String(analysis.tip));

    if (Array.isArray(analysis.promo_days)) {
      const promo = analysis.promo_days
        .filter(x => x && /618|双11|双十一/.test(String(x.show || "")))
        .slice(-4)
        .map(x => String(x.show || "大促") + "：¥" + fmt(num(x.price)) + (x.date ? "（" + x.date + "）" : ""));
      text = text.concat(promo);
    }

    if (!text.length) return { ok: false };
    return { ok: true, subtitle: "比价狗数据", text: text.join("\n") };
  } catch (_) {
    return { ok: false };
  }
}

async function queryManmanbuy(itemUrl) {
  try {
    const r = await httpPost({
      url: "https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx",
      timeout: 8,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 - mmbWebBrowse - ios",
        "X-Surge-Skip-Scripting": "true"
      },
      body: "methodName=getHistoryTrend&p_url=" + encodeURIComponent(itemUrl)
    });

    const d = parseJsonLike(r.body);
    if (!d) return { ok: false };
    const lines = [];

    if (d.ok === 1 && d.single) {
      if (d.single.lowerPriceyh != null) {
        lines.push("历史最低到手价：¥" + fmt(num(d.single.lowerPriceyh)) + formatDotNetDate(d.single.lowerDateyh));
      }
      const list = d.PriceRemark && Array.isArray(d.PriceRemark.ListPriceDetail) ? d.PriceRemark.ListPriceDetail : [];
      list.slice(0, 6).forEach(x => {
        if (!x) return;
        const pieces = [x.Name, x.Price, x.Date, x.Difference].filter(Boolean);
        if (pieces.length) lines.push(pieces.join("  "));
      });
      if (d.PriceRemark && d.PriceRemark.Tip) lines.push(String(d.PriceRemark.Tip));
    }

    if (!lines.length) return { ok: false };
    return { ok: true, subtitle: "慢慢买数据", text: lines.join("\n") };
  } catch (_) {
    return { ok: false };
  }
}

async function queryIcharle(itemUrl) {
  try {
    const r = await httpGet({
      url: "https://price.icharle.com/?product_id=" + encodeURIComponent(itemUrl),
      timeout: 8,
      headers: {
        "Accept": "application/json",
        "X-Surge-Skip-Scripting": "true"
      }
    });
    const d = parseJsonLike(r.body);
    if (!d) return { ok: false };
    const obj = d.data || d;
    const lines = [];
    if (obj.CurrentPrice != null) lines.push("当前价：¥" + fmt(num(obj.CurrentPrice)));
    if (obj.LowestPrice != null) lines.push("历史最低：¥" + fmt(num(obj.LowestPrice)) + (obj.LowestDate ? "（" + obj.LowestDate + "）" : ""));
    if (obj.HighestPrice != null) lines.push("历史最高：¥" + fmt(num(obj.HighestPrice)));
    if (!lines.length) return { ok: false };
    return { ok: true, subtitle: "历史价格数据", text: lines.join("\n") };
  } catch (_) {
    return { ok: false };
  }
}

function parseJsonLike(body) {
  if (!body) return null;
  const s = String(body).trim();
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {}
  }
  const c = s.indexOf("[");
  const d = s.lastIndexOf("]");
  if (c >= 0 && d > c) {
    try { return JSON.parse(s.slice(c, d + 1)); } catch (_) {}
  }
  return null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeNowPrice(v) {
  const n = num(v);
  if (n == null) return null;
  if (n >= 1000) return n / 100;
  return n;
}

function fmt(v) {
  if (v == null || !Number.isFinite(Number(v))) return "-";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function dateSuffix(stamp) {
  const n = Number(stamp);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n * 1000);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return "（" + y + "-" + m + "-" + day + "）";
}

function formatDotNetDate(v) {
  if (!v) return "";
  const m = String(v).match(/Date\((\d+)/);
  if (!m) return "";
  const d = new Date(Number(m[1]));
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return "（" + y + "-" + mo + "-" + da + "）";
}

function httpGet(options) {
  return new Promise((resolve, reject) => {
    $httpClient.get(options, (error, response, body) => {
      if (error) reject(error);
      else resolve({ response, body });
    });
  });
}

function httpPost(options) {
  return new Promise((resolve, reject) => {
    $httpClient.post(options, (error, response, body) => {
      if (error) reject(error);
      else resolve({ response, body });
    });
  });
}
