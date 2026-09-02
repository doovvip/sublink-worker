// Surge-1.0 Status Panel
// type=generic
// Official panel source for doovvip/sublink-worker

var PROFILE_URL = "https://surge-remote-profile.vercel.app/srg-7e2b4f91a6c843d0b58f3c7a29e14d65.conf";
var NODE_URL = "https://surge-remote-profile.vercel.app/srg-7e2b4f91a6c843d0b58f3c7a29e14d65-nodes-9f4c2a7e.list";

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function nowText() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function check(url, callback) {
  var start = Date.now();
  $httpClient.get({
    url: url,
    timeout: 5,
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  }, function(error, response, data) {
    var status = response && response.status ? response.status : 0;
    callback({
      ok: !error && status >= 200 && status < 400,
      status: status,
      ms: Date.now() - start,
      data: typeof data === "string" ? data : ""
    });
  });
}

function statusText(r) {
  if (r.ok) return "正常 " + r.status + " · " + r.ms + "ms";
  return "异常 " + (r.status || "TIMEOUT");
}

check(PROFILE_URL, function(profile) {
  check(NODE_URL, function(nodes) {
    var nodeCount = 0;
    if (nodes.data) {
      var lines = nodes.data.split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line && line.charAt(0) !== "#" && line.indexOf("//") !== 0) nodeCount++;
      }
    }

    var profileValid = profile.ok && profile.data.indexOf("当前正式架构：Surge-1.0") !== -1;
    var nodeValid = nodes.ok && nodeCount > 0;
    var allGood = profileValid && nodeValid;

    var surgeVersion = ($environment && $environment["surge-version"]) ? $environment["surge-version"] : "-";
    var system = ($environment && $environment.system) ? $environment.system : "-";

    var content =
      "正式版本：Surge-1.0 · 7模块\n" +
      "母版状态：" + statusText(profile) + (profileValid ? "" : " ⚠️") + "\n" +
      "节点状态：" + statusText(nodes) + (nodeCount ? " · " + nodeCount + "节点" : "") + (nodeValid ? "" : " ⚠️") + "\n" +
      "最近检查：" + nowText() + "\n" +
      "运行环境：Surge " + surgeVersion + " · " + system;

    $done({
      title: allGood ? "Surge-1.0 · 正常" : "Surge-1.0 · 需要检查",
      content: content,
      style: allGood ? "good" : "error"
    });
  });
});
