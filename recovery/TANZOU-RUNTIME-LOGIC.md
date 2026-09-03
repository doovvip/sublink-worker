# TanZou 运行与恢复逻辑

正式永久母版的 TanZou 逻辑分为“转换逻辑”和“运行时节点文件”两层。

## 转换逻辑
- API 路由：`api/index.js` 的 `/tanzou`。
- 转换器：`src/tanzouSubscription.js`。
- 永久资产副本：
  - `permanent-assets/r2-2026-09-03/logic/api-index.js`
  - `permanent-assets/r2-2026-09-03/logic/tanzouSubscription.js`
- 转换器支持 Base64 总订阅、vmess / trojan / ss，保留已是 Surge 格式的节点，过滤 localhost/0.0.0.0/127.0.0.1/防失联等条目并去重。

## 当前实际运行方式
Surge 本身不实时调用 `/tanzou`。正式主配置使用：

Surge -> `✈️ 我的节点` -> `policy-path` -> Dropbox 已转换的 Surge 节点列表

各地区策略组通过：
- `include-other-group=✈️ 我的节点`
- `policy-regex-filter`

从主节点池中筛选香港/美国/日本/台湾/韩国/新加坡节点。

## 永久恢复原则
完整 TanZou 节点正文包含节点凭据，因此不放入公开 GitHub；永久快照只保存在 Dropbox 正式永久母版目录。恢复时优先使用该冻结节点快照，而不是重新拉取会变化的上游订阅。
