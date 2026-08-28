// Surge helper for 京东历史比价：抓取慢慢买 CK
// 仅在慢慢买 API 请求体中检测到 c_mmbDevId 时写入，避免误存无关请求。
const body = typeof $request !== "undefined" && $request.body ? $request.body : "";
if (body && /(?:^|&)c_mmbDevId=/.test(body)) {
  const key = "manmanbuy_val";
  const old = $persistentStore.read(key);
  const ok = $persistentStore.write(body, key);
  if (ok && body !== old) {
    $notification.post("京东历史比价", "获取 CK 成功🎉", "慢慢买参数已保存");
  }
}
$done({});
