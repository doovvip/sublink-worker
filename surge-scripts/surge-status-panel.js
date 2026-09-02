// Surge-1.0 Status Panel
// type=generic
// Official panel source for doovvip/sublink-worker

var BASE = "https://surge-remote-profile.vercel.app/srg-7e2b4f91a6c843d0b58f3c7a29e14d65";
var PROFILE_URL = BASE + ".conf";
var NODE_URL = BASE + "-nodes-9f4c2a7e.list";
var META_URL = BASE + "-status-2d86c1.json";

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function formatDate(value) {
  var d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "-";
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
  if (r && r.ok) return "正常 " + r.status + " · " + r.ms + "ms";
  return "异常 " + ((r && r.status) || "TIMEOUT");
}

var results = {};
var pending = 3;

function complete(name, result) {
  results[name] = result;
  pending--;
  if (pending === 0) render();
}

function render() {
  var profile = results.profile || {};
  var nodes = results.nodes || {};
  var meta = results.meta || {};

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

  var updatedAt = "-";
  if (meta.ok && meta.data) {
    try {
      var info = JSON.parse(meta.data);
      if (info.updated_at) updatedAt = formatDate(info.updated_at);
    } catch (e) {}
  }

  var surgeVersion = ($environment && $environment["surge-version"]) ? $environment["surge-version"] : "-";
  var system = ($environment && $environment.system) ? $environment.system : "-";

  var content =
    "正式版本：Surge-1.0 · 7模块\n" +
    "母版更新：" + updatedAt + "\n" +
    "母版状态：" + statusText(profile) + (profileValid ? "" : " ⚠️") + "\n" +
    "节点状态：" + statusText(nodes) + (nodeCount ? " · " + nodeCount + "节点" : "") + (nodeValid ? "" : " ⚠️") + "\n" +
    "最近检查：" + formatDate() + "\n" +
    "运行环境：Surge " + surgeVersion + " · " + system;

  $done({
    title: allGood ? "Surge-1.0 · 正常" : "Surge-1.0 · 需要检查",
    content: content,
    style: allGood ? "good" : "error"
  });
}

check(PROFILE_URL, function(r) { complete("profile", r); });
check(NODE_URL, function(r) { complete("nodes", r); });
check(META_URL, function(r) { complete("meta", r); });
