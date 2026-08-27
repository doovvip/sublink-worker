/*
 * 酷我音乐会员解锁@ddgksf2013 - Surge 兼容加载器
 * 作用：
 * 1) 在 Surge 中模拟 Quantumult X 的 $task / $prefs / $notify；
 * 2) 保留原作者 kkmusic.vip.js 的业务逻辑，不直接改写其 VIP 判断；
 * 3) 对原 QX 的 reject-200 规则直接返回空 200；
 * 4) 其余命中请求加载并执行原脚本。
 */

const ORIGINAL_SCRIPT = "https://ddgksf2013.top/scripts/kkmusic.vip.js";
const CACHE_KEY = "kkmusic.vip.source";
const CACHE_TIME_KEY = "kkmusic.vip.source.time";
const CACHE_TTL = 86400 * 1000;

const reject200Patterns = [
  /^https?:\/\/.*kuwo\.cn\/star\/upload\/95\/25\/1764662243747_\.png/i,
  /^https?:\/\/.*kuwo\.cn\/star\/upload\/25\/9\/1763524573099_\.png/i,
  /^https?:\/\/.*kuwo\.cn\/openapi\/v\d+\/operate\/text/i,
  /^https?:\/\/.*kuwo\.cn\/openapi\/v\d+\/operate\/downTab\/info/i,
  /^https?:\/\/.*kuwo\.cn\/apps\/global-free-popup/i,
  /^https?:\/\/vip1\.kuwo\.cn\/vip\/activity\/kwMemberDay/i,
  /^https?:\/\/mc\.tencentmusic\.com\/sdk\/ad/i,
  /^https?:\/\/.*kuwo\.cn\/AdSystem/i,
  /^https?:\/\/.*kuwo\.cn\/openapi\/v1\/user\/freemium\/global\/text/i,
  /^https?:\/\/hotword\.kuwo\.cn\/hotword\.s/i,
  /^https?:\/\/vip1\.kuwo\.cn\/vip_adv\//i,
  /^https?:\/\/vip1\.kuwo\.cn\/vip\/v\d+\/sysinfo/i,
  /^https?:\/\/wapi\.kuwo\.cn\/openapi\/v1\/app\/pasterAdvert/i,
  /^https?:\/\/mobilead\.kuwo\.cn\//i,
  /^https?:\/\/.*kuwo\.cn\/star\/upload\/64\/73\/1724231349487_\.M/i,
  /^https?:\/\/rich\.kuwo\.cn\/AdService/i,
];

const currentURL = typeof $request !== "undefined" && $request.url ? $request.url : "";

if (reject200Patterns.some((re) => re.test(currentURL))) {
  $done({
    response: {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: ""
    }
  });
} else {
  installQuanXCompat();
  loadAndRunOriginal();
}

function installQuanXCompat() {
  globalThis.$prefs = {
    valueForKey(key) {
      return $persistentStore.read(key);
    },
    setValueForKey(value, key) {
      return $persistentStore.write(value == null ? null : String(value), key);
    }
  };

  globalThis.$notify = function(title, subtitle, body, options) {
    try {
      const surgeOptions = {};
      if (typeof options === "string") {
        surgeOptions.url = options;
        surgeOptions.action = "open-url";
      } else if (options && typeof options === "object") {
        const url = options["open-url"] || options.url || options.openUrl;
        if (url) {
          surgeOptions.url = url;
          surgeOptions.action = "open-url";
        }
        if (options["media-url"] || options.mediaUrl) {
          surgeOptions["media-url"] = options["media-url"] || options.mediaUrl;
        }
      }
      $notification.post(String(title || ""), String(subtitle || ""), String(body || ""), surgeOptions);
    } catch (e) {
      console.log("[kkmusic.vip] notify compatibility error: " + e);
    }
  };

  globalThis.$task = {
    fetch(input) {
      return new Promise((resolve, reject) => {
        const options = typeof input === "string" ? { url: input } : Object.assign({}, input || {});
        const method = String(options.method || "GET").toLowerCase();
        delete options.method;
        delete options.opts;

        const fn = $httpClient[method] || $httpClient.get;
        fn(options, (error, response, data) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({
            statusCode: response && response.status,
            status: response && response.status,
            headers: (response && response.headers) || {},
            body: typeof data === "undefined" ? "" : data
          });
        });
      });
    }
  };
}

function loadAndRunOriginal() {
  const now = Date.now();
  const cached = $persistentStore.read(CACHE_KEY);
  const cachedAt = Number($persistentStore.read(CACHE_TIME_KEY) || 0);

  if (cached && now - cachedAt < CACHE_TTL) {
    runOriginal(cached);
    return;
  }

  $httpClient.get({ url: ORIGINAL_SCRIPT, timeout: 15 }, (error, response, data) => {
    if (!error && data) {
      $persistentStore.write(String(data), CACHE_KEY);
      $persistentStore.write(String(now), CACHE_TIME_KEY);
      runOriginal(String(data));
      return;
    }

    if (cached) {
      console.log("[kkmusic.vip] 原脚本更新失败，使用缓存版本");
      runOriginal(cached);
      return;
    }

    console.log("[kkmusic.vip] 无法加载原脚本: " + (error || "empty body"));
    $done({});
  });
}

function runOriginal(source) {
  try {
    (0, eval)(source);
  } catch (e) {
    console.log("[kkmusic.vip] 原脚本执行异常: " + e);
    $done({});
  }
}
