# Surge 正式母版｜上游依赖清单

> 正式运行脚本分支：`surge-stable`
>
> 更新原则：Surge 仍按 86400 秒检查资源；正式脚本内容只有在验证后才晋升到 `surge-stable`。
>
> 本清单用于发现上游更新，不代表自动升级。

## 固定 Release

| 组件 | 正式版本 | 正式来源 | 升级策略 |
|---|---|---|---|
| BiliUniverse Enhanced | v0.5.13 | GitHub Release | 有新 Release 后先比较、实机验证，再升级 |
| BiliUniverse ADBlock | v0.6.19 | GitHub Release | 有新 Release 后先比较、实机验证，再升级 |

## 外部上游镜像

| 组件 | 上游 | 当前上游 SHA | 正式镜像 |
|---|---|---|---|
| Meitu | zirawell/R-Store `Res/Scripts/Unlock/meitu.js` | `767f43ecdd16715945c3cf911fe88b8877947982` | `surge-modules/vendor/meitu.js` |

规则：上游 SHA 变化只触发“发现更新”；不得直接覆盖正式镜像。

## 自托管正式脚本快照

| 功能 | 正式脚本 | 当前快照 SHA |
|---|---|---|
| YouTube response | `surge-modules/scripts/youtube.response.maasea.js` | `becad8eaa6094c189ea8db6d644de68ac2d66f61` |
| YouTube request | `surge-modules/scripts/youtube.request.maasea.js` | `f0e2a9b9b823f2f289a00446c2876a5097bc6a63` |
| BiliBili JSON | `surge-modules/scripts/bilibili.ads.js` | `1dba3c226bf4191d2323b100b642fcca90489581` |
| BiliBili HD splash | `surge-modules/scripts/bilibili.hd-splash.js` | `20066170aea32ab849274d6cc75eb95d2d03fb26` |
| Kuwo | `surge-modules/kkmusic.vip.surge-stable.js` | `727de70888eff32d244dd4c799f727fc8804b5b8` |
| Ximalaya | `surge-modules/scripts/ximalaya_json.js` | `6337de836026b9acc3db227a164dadd1ad90315c` |
| JD price | `surge-modules/scripts/jd_price.surge.js` | `b76e80051e3ca03be622a41bf4b64ade2293b1b1` |
| HongGuo download | `surge-scripts/hongguo-download.js` | `5fee22a66401a7ea434f4a13b12b75ab219cc263` |
| HongGuo quality | `surge-scripts/hongguo-quality.js` | `19cbd4d9cf84a772a4faa6b3af2dc9b645ed146f` |
| Surge status panel | `surge-scripts/surge-status-panel.js` | `3d7fca82c5d4a0f6a8d6d90466c3acc787d7078e` |

## 晋升流程

1. 发现上游新 Release 或目标文件 SHA 变化。
2. 只在实验分支/测试副本中同步新内容。
3. 检查脚本差异、URL、MITM、接口范围与权限修改。
4. 实机验证对应 App 核心功能。
5. 通过后才更新 `surge-stable`。
6. 创建新的正式恢复点并更新本清单。
