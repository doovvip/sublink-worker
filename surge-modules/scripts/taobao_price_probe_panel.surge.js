/* Surge panel for Taobao analytics probe v1.7+. Shows only safe diagnostic metadata. */
const key = 'taobao_analytics_probe_panel';
let data = {};
try { data = JSON.parse($persistentStore.read(key) || '{}'); } catch (_) {}
let content = data.message || '等待淘宝埋点请求…\n打开淘宝商品详情页后刷新此面板';
if (data.structure) {
  const s = data.structure;
  content += `\n\n结构诊断:`;
  if (typeof s.formPairs !== 'undefined') content += `\nformPairs=${s.formPairs}`;
  if (typeof s.jsonValues !== 'undefined') content += `\njsonValues=${s.jsonValues}`;
  if (typeof s.urlLike !== 'undefined') content += `\nurlLike=${s.urlLike}`;
  if (typeof s.longNums !== 'undefined') content += `\nlongNums=${s.longNums}`;
  if (s.keys && s.keys.length) content += `\nkeys=${s.keys.join(',')}`;
}
$done({
  title: '淘宝商品ID探测',
  content,
  style: data.ids ? 'good' : 'info'
});
