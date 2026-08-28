// Temporary Taobao traffic diagnostic for Surge.
// Privacy: only reports host + pathname. It never reads or reports query/body/headers.

(function () {
  try {
    const u = new URL($request.url);
    const host = u.hostname || "unknown";
    const path = u.pathname || "/";

    const interesting = /detail|item|mtop|gw|sku|product|trade/i.test(path + " " + host);
    if (!interesting) return $done({});

    const key = "tb_price_debug_seen_v1";
    let seen = {};
    try { seen = JSON.parse($persistentStore.read(key) || "{}"); } catch (_) {}

    const sig = host + path;
    const now = Date.now();
    const last = Number(seen[sig] || 0);
    if (now - last < 10 * 60 * 1000) return $done({});

    seen[sig] = now;
    const entries = Object.entries(seen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    $persistentStore.write(JSON.stringify(Object.fromEntries(entries)), key);

    $notification.post("淘宝接口探测", host, path);
  } catch (e) {
    $notification.post("淘宝接口探测", "脚本已命中", "URL解析失败");
  }
  $done({});
})();
