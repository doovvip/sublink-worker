// Taobao historical price for Surge
// Independent rewrite based on public Taobao-detail/Manmanbuy price-history approaches.
// 2026-08-28

const URL = $request.url || "";
const isResponse = typeof $response !== "undefined";
const TAOBAO_GATEWAYS = new Set([
  "trade-acs.m.taobao.com",
  "guide-acs.m.taobao.com",
  "acs.m.taobao.com",
  "h5api.m.taobao.com"
]);

if (URL.includes("/amdc/mobileDispatch")) {
  handleAmdc();
} else if (URL.toLowerCase().includes("mtop.taobao.detail.getdetail")) {
  if (!isResponse) $done({});
  else handleDetail();
} else {
  $done({});
}

function handleAmdc() {
  if (!isResponse) {
    let body = $request.body || "";
    try {
      const form = parseForm(body);
      if (form.domain) {
        form.domain = String(form.domain)
          .split(/\s+/)
          .filter(Boolean)
          .filter(h => !TAOBAO_GATEWAYS.has(h))
          .join(" ");
        body = toForm(form);
      }
    } catch (_) {}
    $done({ body });
    return;
  }

  // Some Taobao builds return base64 JSON here. If it is not readable, leave it untouched.
  try {
    const decoded = base64Decode($response.body || "");
    const obj = JSON.parse(decoded);
    if (Array.isArray(obj.dns)) {
      for (const row of obj.dns) {
        if (row && TAOBAO_GATEWAYS.has(row.host)) row.ips = [];
      }
      $done({ body: base64Encode(JSON.stringify(obj)) });
      return;
    }
  } catch (_) {}
  $done({});
}

function handleDetail() {
  const originalBody = $response.body || "";
  let obj;
  try {
    obj = JSON.parse(originalBody);
  } catch (_) {
    notify("已命中淘宝商品详情", "返回数据不是 JSON，暂未改写");
    $done({});
    return;
  }

  const itemId = findItemId(obj) || findItemIdFromUrl(URL);
  if (!itemId) {
    notify("已命中淘宝商品详情", "没有读取到商品 ID");
    $done({});
    return;
  }

  const itemUrl = `https://item.taobao.com/item.htm?id=${itemId}`;
  fetchHistory(itemUrl, (err, history) => {
    if (err || !history) {
      notify("淘宝历史比价", "历史价格服务暂时无响应");
      $done({});
      return;
    }

    const result = summarize(history);
    if (!result.ok) {
      notify("淘宝历史比价", result.message || "暂无历史价格");
      $done({});
      return;
    }

    const injected = injectPriceInfo(obj, result);
    if (!injected) {
      notify(`历史最低 ${result.lowestText}`, result.lines.join("\n"));
      $done({});
      return;
    }

    $done({ body: JSON.stringify(obj) });
  });
}

function fetchHistory(itemUrl, callback) {
  const options = {
    url: "https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 mmbWebBrowse ios"
    },
    body: "methodName=getHistoryTrend&p_url=" + encodeURIComponent(itemUrl)
  };

  $httpClient.post(options, (error, response, body) => {
    if (error || !body) {
      callback(error || new Error("empty response"));
      return;
    }
    try {
      callback(null, JSON.parse(body));
    } catch (e) {
      callback(e);
    }
  });
}

function summarize(data) {
  if (!data || Number(data.ok) !== 1 || !data.single) {
    return { ok: false, message: data && data.msg ? String(data.msg) : "暂无历史价格" };
  }

  const single = data.single || {};
  const lowest = numberOrNull(single.lowerPriceyh);
  const lowestDate = parseMmbDate(single.lowerDateyh);
  const points = parseTrend(single.jiagequshiyh);
  const current = points.length ? points[points.length - 1].price : null;
  const min60 = minPoint(points.slice(-60));
  const min180 = minPoint(points.slice(-180));
  const min360 = minPoint(points.slice(-360));

  const lines = [];
  if (current !== null) lines.push(`当前参考 ¥${fmt(current)}`);
  if (min60) lines.push(`60天最低 ¥${fmt(min60.price)}  ${min60.date}`);
  if (min180) lines.push(`180天最低 ¥${fmt(min180.price)}  ${min180.date}`);
  if (min360) lines.push(`360天最低 ¥${fmt(min360.price)}  ${min360.date}`);

  const lowestText = lowest !== null
    ? `¥${fmt(lowest)}${lowestDate ? `（${lowestDate}）` : ""}`
    : (min360 ? `¥${fmt(min360.price)}（${min360.date}）` : "暂无");

  return {
    ok: true,
    lowestText,
    lines: lines.length ? lines : [`历史最低 ${lowestText}`]
  };
}

function injectPriceInfo(obj, result) {
  const stack = obj && obj.data && Array.isArray(obj.data.apiStack) ? obj.data.apiStack : null;
  if (!stack || !stack.length || !stack[0] || !stack[0].value) return false;

  let value;
  try { value = JSON.parse(stack[0].value); } catch (_) { return false; }

  const root = value && value.global && value.global.data ? value.global.data : value;
  if (!root || typeof root !== "object") return false;

  const title = `📉 历史最低 ${result.lowestText}`;
  const desc = result.lines.join("  ·  ");
  const card = { title, name: title, desc };

  try {
    const tcp = root.tradeConsumerProtection;
    if (tcp && tcp.tradeConsumerService && tcp.tradeConsumerService.service && Array.isArray(tcp.tradeConsumerService.service.items)) {
      tcp.tradeConsumerService.service.items.unshift(card);
      stack[0].value = JSON.stringify(value);
      return true;
    }

    const cp = root.consumerProtection;
    if (cp) {
      if (Array.isArray(cp.items)) cp.items.unshift(card);
      if (cp.serviceProtection && cp.serviceProtection.basicService && Array.isArray(cp.serviceProtection.basicService.services)) {
        cp.serviceProtection.basicService.services.unshift(card);
      }
      stack[0].value = JSON.stringify(value);
      return true;
    }
  } catch (_) {}

  return false;
}

function findItemId(obj) {
  const candidates = [
    obj?.data?.item?.itemId,
    obj?.data?.item?.itemNumId,
    obj?.data?.itemId,
    obj?.data?.itemNumId,
    obj?.item?.itemId,
    obj?.itemId
  ];
  for (const v of candidates) {
    if (v !== undefined && v !== null && /^\d{5,}$/.test(String(v))) return String(v);
  }
  return null;
}

function findItemIdFromUrl(url) {
  try {
    const q = url.split("?")[1] || "";
    const params = parseForm(q);
    for (const key of ["id", "itemId", "itemNumId"]) {
      if (params[key] && /^\d{5,}$/.test(String(params[key]))) return String(params[key]);
    }
    if (params.data) {
      const d = JSON.parse(params.data);
      const v = d.itemNumId || d.itemId || d.id;
      if (v && /^\d{5,}$/.test(String(v))) return String(v);
    }
  } catch (_) {}
  return null;
}

function parseTrend(raw) {
  if (!raw || typeof raw !== "string") return [];
  const out = [];
  const re = /\[\s*(\d{10,13})\s*,\s*([0-9.]+)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    let ts = Number(m[1]);
    if (ts < 1e12) ts *= 1000;
    const price = Number(m[2]);
    if (Number.isFinite(ts) && Number.isFinite(price)) {
      const d = new Date(ts);
      out.push({ date: dateYmd(d), price });
    }
  }
  return out;
}

function minPoint(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.reduce((a, b) => (!a || b.price <= a.price ? b : a), null);
}

function parseMmbDate(v) {
  if (!v) return "";
  const m = String(v).match(/\d{10,13}/);
  if (!m) return "";
  let ts = Number(m[0]);
  if (ts < 1e12) ts *= 1000;
  return dateYmd(new Date(ts));
}

function dateYmd(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(n) {
  return Number(n).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function parseForm(s) {
  const out = {};
  String(s || "").split("&").forEach(pair => {
    if (!pair) return;
    const i = pair.indexOf("=");
    const k = i >= 0 ? pair.slice(0, i) : pair;
    const v = i >= 0 ? pair.slice(i + 1) : "";
    try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, "%20")); }
    catch (_) { out[k] = v; }
  });
  return out;
}

function toForm(obj) {
  return Object.keys(obj).map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k])).join("&");
}

function notify(subtitle, message) {
  $notification.post("淘宝历史比价", subtitle || "", message || "");
}

function base64Decode(s) {
  if (typeof $utils !== "undefined" && $utils.base64Decode) return $utils.base64Decode(s);
  return s;
}

function base64Encode(s) {
  if (typeof $utils !== "undefined" && $utils.base64Encode) return $utils.base64Encode(s);
  return s;
}
