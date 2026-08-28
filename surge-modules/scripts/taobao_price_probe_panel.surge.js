/* Surge panel for Taobao analytics probe. Shows only safe diagnostic metadata. */
const key = 'taobao_analytics_probe_panel';
let data = {};
try { data = JSON.parse($persistentStore.read(key) || '{}'); } catch (_) {}
const content = data.message || '等待淘宝埋点请求…\n打开淘宝商品详情页后刷新此面板';
$done({
  title: '淘宝商品ID探测',
  content,
  style: data.ids ? 'good' : 'info'
});
