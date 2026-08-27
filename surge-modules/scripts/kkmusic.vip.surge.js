/*
 * kkmusic.vip Surge Compatibility Wrapper
 * Keeps the original script logic remote and provides the Quantumult X globals
 * that the original script expects, implemented with Surge APIs.
 */

(() => {
  const PRIMARY = "https://ddgksf2013.top/scripts/kkmusic.vip.js";
  const FALLBACK = "https://raw.githubusercontent.com/ifflagged/Romeo/main/Modules/JavaScript/ddgksf2013/kkmusic.vip/ddgksf2013.top_kkmusic.vip.js";

  globalThis.$prefs = {
    valueForKey(key) {
      return $persistentStore.read(String(key));
    },
    setValueForKey(value, key) {
      return $persistentStore.write(String(value), String(key));
    }
  };

  globalThis.$notify = function (title, subtitle, message, options) {
    try {
      $notification.post(title || "", subtitle || "", message || "", options || {});
    } catch (_) {}
  };

  function normalizeRequest(input) {
    const o = typeof input === "string" ? { url: input } : Object.assign({}, input || {});
    const req = { url: o.url };
    if (o.headers) req.headers = o.headers;
    if (o.body !== undefined) req.body = o.body;
    return req;
  }

  globalThis.$task = {
    fetch(input) {
      return new Promise((resolve, reject) => {
        const o = typeof input === "string" ? { url: input } : Object.assign({}, input || {});
        const method = String(o.method || "GET").toUpperCase();
        const req = normalizeRequest(o);

        const done = (err, resp, body) => {
          if (err) {
            reject({ error: String(err) });
            return;
          }
          resolve({
            statusCode: Number((resp && (resp.statusCode || resp.status)) || 200),
            headers: (resp && resp.headers) || {},
            body: body == null ? "" : body
          });
        };

        if (method === "POST") {
          $httpClient.post(req, done);
        } else if (method === "PUT" && $httpClient.put) {
          $httpClient.put(req, done);
        } else if (method === "DELETE" && $httpClient.delete) {
          $httpClient.delete(req, done);
        } else {
          $httpClient.get(req, done);
        }
      });
    }
  };

  function fail(message) {
    console.log("[kkmusic.vip Surge] " + message);
    try { $done({}); } catch (_) {}
  }

  function runSource(source, from) {
    try {
      (0, eval)(source + "\n//# sourceURL=" + from);
    } catch (e) {
      fail("脚本执行失败: " + e);
    }
  }

  function load(url, fallback) {
    $httpClient.get({ url, headers: { "User-Agent": "Surge" } }, (err, resp, body) => {
      const code = resp && Number(resp.statusCode || resp.status);
      if (!err && code >= 200 && code < 300 && body) {
        runSource(body, url);
      } else if (fallback) {
        load(fallback, null);
      } else {
        fail("无法下载原始 kkmusic.vip.js");
      }
    });
  }

  load(PRIMARY, FALLBACK);
})();
