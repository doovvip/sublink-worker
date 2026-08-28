// 淘宝历史查价 Share/Shortcut 助手
// 设计目标：不再依赖淘宝 App 内部商品详情接口、MITM、AMDC 或 QUIC。
// 运行方式：Surge generic script，建议由 iOS 快捷指令调用并传入分享文本/URL。
// 参数来源：$intent.parameter（Shortcuts）或 $argument（手动/参数化调用）。

const MMB_PAGE = "https://tool.manmanbuy.com/m/history.aspx?app=1";

function notify(title, subtitle, body, url) {
  const options = url ? { action: "open-url", url, auto-dismiss: false } : {};
  $notification.post(title, subtitle || "", body || "", options);
}

function extractFirstUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s\u3000]+/i);
  if (!m) return null;
  return m[0].replace(/[)\]}>，。；;！!]+$/g, "");
}

function extractItemId(text) {
  if (!text) return null;
  const s = String(text);
  const patterns = [
    /[?&]id=(\d{6,})/i,
    /item(?:Id|_id)?[=:\/](\d{6,})/i,
    /item\.htm\?[^#]*\bid=(\d{6,})/i,
    /detail\.tmall\.com\/item\.htm\?[^#]*\bid=(\d{6,})/i,
    /\b(\d{10,15})\b/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

function canonicalById(id) {
  return id ? `https://item.taobao.com/item.htm?id=${id}` : null;
}

function resolveShortUrl(url, hops, done) {
  if (!url || hops > 5) return done(url);
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return done(url); }
  const shortHosts = new Set(["m.tb.cn", "tb.cn", "e.tb.cn", "s.tb.cn", "m.tb.com"]);
  if (!shortHosts.has(host)) return done(url);

  $httpClient.get({ url, timeout: 8, "auto-redirect": false }, (err, resp, data) => {
    if (err || !resp) return done(url);
    const h = resp.headers || {};
    const loc = h.Location || h.location;
    if (!loc) return done(url);
    let next = loc;
    try { next = new URL(loc, url).toString(); } catch (_) {}
    resolveShortUrl(next, hops + 1, done);
  });
}

function finish(inputText, resolvedUrl) {
  const id = extractItemId(resolvedUrl) || extractItemId(inputText);
  const canonical = canonicalById(id) || resolvedUrl || extractFirstUrl(inputText);

  if (!canonical) {
    notify("淘宝历史查价", "没有识别到商品链接", "请从淘宝商品页 → 分享 → 复制链接/运行快捷指令后再试");
    return $done();
  }

  // 保存最近一次标准化链接，方便面板/后续版本复用。
  $persistentStore.write(canonical, "taobao_price_last_url");

  // 不依赖未公开 API：打开慢慢买官方移动查价页。
  // 快捷指令建议先把商品链接复制到剪贴板，打开页面后直接粘贴查询。
  const detail = id ? `已识别商品ID：${id}\n已标准化商品链接。点通知打开查价页。` : `已识别商品链接。点通知打开查价页。`;
  notify("淘宝历史查价", "新版稳定模式", detail, MMB_PAGE);
  $done();
}

const input = (typeof $intent !== "undefined" && $intent && $intent.parameter)
  ? String($intent.parameter)
  : (typeof $argument !== "undefined" && $argument ? String($argument) : "");

const url = extractFirstUrl(input);
if (!url) {
  finish(input, null);
} else {
  resolveShortUrl(url, 0, resolved => finish(input, resolved));
}
