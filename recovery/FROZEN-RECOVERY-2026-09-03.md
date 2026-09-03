# Surge 永久冻结恢复点｜2026-09-03｜Surge-1.0 + 7 模块

## 1. 这套版本是什么

以 **2026-08-30 正式最终母版（百度网盘融合版）** 为底座，新增美图秀秀和红果短剧，最终共 **7 个正式模块**。

核心锚点：
- 8/30 五模块基线：`cd19f5dc19fde58d78a3401f726f5c626fcedc6e`
- 7 模块文件锚点：`6d3f2a2dfa5ba9a059f35304104e9007584a3c61`
- 美图/红果冻结脚本锚点：`c720f256b42c955ba00dad357657ccf08ed67a0c`
- Surge-1.0 权威母版 Git blob：`6525f351d3f45ca291b88bdfff6aa13fb7db45d4`

> 重要：公开仓库基线里的 `surge-config/Surge.conf` 曾是 V18 过渡文件，不是本冻结恢复点的权威母版。本恢复点的主配置以 Surge-1.0 Git blob / Vercel 正式远程母版 / Dropbox 与 ChatGPT 冻结副本为准。

## 2. Surge-1.0 主配置逻辑

主配置负责 General、Proxy/Proxy Group、AI/流媒体/社交/微软游戏等策略组、Apple Intelligence 精确规则、规则集、TanZou 节点组和基础 MITM。App 去广告/净化继续由独立模块负责。

## 3. TanZou 节点逻辑

本冻结版实际运行链路：`Surge -> ✈️ 我的节点 -> policy-path -> Dropbox 已转换 Surge 节点列表`。
- Dropbox file id：`id:nxeADULGW1YAAAAAAAAADA`
- 原文件：`/TanZouA-Surge订阅.list`

Surge 读取的已经是 `节点名 = vmess/trojan/ss, host, port, ...` 这种 Surge 可直接识别的行。

转换器链路：`api/index.js` 的 `/tanzou` 调用 `src/tanzouSubscription.js`。转换器从 `TANZOU_SUB_URL` 取上游订阅，用 `TANZOU_ACCESS_KEY` 保护入口，以 Shadowrocket UA 请求；必要时 Base64 解码；解析 vmess/trojan/ss；规范化 vmess AEAD；过滤 localhost/127.0.0.1/防失联；去重后输出 Surge 节点列表。

**本冻结版主配置并不实时调用 `/tanzou`。** 它直接读取 Dropbox 的已转换列表，所以恢复时必须同时恢复 TanZou 列表。

## 4. 国家节点组

`✈️ 我的节点` 是 TanZou 总节点池。香港/美国/日本/台湾/韩国/新加坡等组通过 `include-other-group=✈️ 我的节点` 加 `policy-regex-filter` 按国旗、中文名和 HK/US/JP/KR/SG 等关键词筛选。

## 5. 7 个正式模块

1. YouTube V2.0.1
2. BiliBili
3. Kuwo
4. StartUpAds V2.0.0（含百度网盘去开屏）
5. JD Price History
6. 美图秀秀
7. 红果短剧

模块安装必须以模块锚点 `6d3f2a2dfa5ba9a059f35304104e9007584a3c61` 的 Raw 文件为准，不能用 `main` 代替冻结地址。

## 6. 模块怎么挂载

Surge 主配置与模块是两条独立加载链：主配置用远程 Managed Profile；模块在 Surge 的 Module 页面单独安装 `.sgmodule`。模块可注入 `[Rule]`、`[URL Rewrite]`、`[Script]`、`[MITM]`。所以“加入模块”不是把脚本硬塞进 Surge.conf，而是纳入正式安装/恢复清单并固定 Raw 地址。

## 7. 美图秀秀

保留 2026-08-31 正式模块匹配逻辑。原脚本来自 zirawell 的 main；冻结版已把当时脚本完整 vendor 到本仓库，并固定到脚本锚点 `c720f256b42c955ba00dad357657ccf08ed67a0c`，上游以后变更不影响本恢复点。

## 8. 红果短剧

保留 V1.1.0 正式精简逻辑：广告域名拦截；Pangolin/pstatp/byteimg/snssdk 广告 URL Rewrite；下载/画质响应脚本保留；无效 VIP 响应脚本继续移除。下载/画质脚本固定到脚本锚点 `c720f256b42c955ba00dad357657ccf08ed67a0c`。

## 9. 一键恢复顺序

以后用户说 **“恢复 Surge-永久冻结-2026-09-03-Surge1.0-7模块”** 时：
1. GitHub 正式模块恢复到 7 模块锚点。
2. Surge-1.0 主配置恢复到权威 blob。
3. TanZou 列表恢复到冻结副本。
4. Vercel `surge-remote-profile` 重新发布 Surge-1.0。
5. 校验两个远程母版入口 HTTP 200 且正文一致。
6. 校验 7 个模块存在且美图/红果脚本指向固定脚本锚点。
7. 不恢复淘宝比价，不恢复红果无效 VIP，不混入后续实验。

## 10. 永不动规则

- `frozen/surge-1.0-7modules-2026-09-03`：冻结分支，后续不移动。
- `archive/surge-assets-2026-09-03`：冻结脚本资产分支，后续不移动。
- Dropbox 冻结目录：只新增，不覆盖。
- ChatGPT 文件库冻结包：同名保存，不覆盖。
- 未来实验全部在新分支/新目录进行。

## 11. 安全说明

Surge-1.0 与 TanZou 节点快照含敏感连接材料。公开 GitHub 冻结分支只保存非敏感模块、脚本、逻辑和恢复锚点；精确私有副本保存在 Dropbox 与 ChatGPT 冻结包。GitHub 中已有历史 blob 仅作为校验锚点，不在新文档中展开敏感正文。
