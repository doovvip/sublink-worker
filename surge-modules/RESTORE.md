# Surge 正式母版｜GitHub 恢复说明

> 恢复基准：**2026-08-31 正式母版（Surge-1.0 + 7 个正式模块）**
>
> 正式备份分支：`backup/surge-modules-2026-08-31`
>
> 基线说明：2026-08-30 百度网盘融合逻辑继续保留，2026-08-31 美图秀秀与红果短剧 V1.1.0 已纳入正式母版。
>
> 当前恢复口径以本文件与 `surge-modules/README.md` 为准。

## 一、恢复原则

恢复时优先保证“已实机跑通”的正式状态，而不是追求最新上游版本。

**不得误删：**
- StartUpAds 中已经融合的百度网盘去开屏广告逻辑。
- BiliBili HD/iPad 已验证的开屏净化。
- YouTube 已修复播放几秒后报错的正式版本。
- Kuwo 已验证的 VIP / 播放 / 缓存下载 / 广告净化逻辑。
- 美图秀秀已实机确认可用的正式模块。
- 红果短剧 V1.1.0 正式模块中的去广告规则，以及当前保留的下载/画质响应层实现。

**不得恢复：**
- 淘宝比价实验。
- 已废弃的旧测试模块。
- BiliBili 旧 splash/list 分支。
- YouTube 已确认会引发播放异常的旧 initplayback hook。
- Kuwo 已删除的冗余 MITM hostname。
- 红果已确认基本无效的 VIP 响应脚本。

## 二、当前正式恢复状态

当前正式母版应满足：
- YouTube 8/30 播放修复已合入。
- BiliBili 普通版 + HD/iPad 开屏修复已合入。
- BiliBili 旧 splash/list 分支已清理。
- Kuwo 冗余 MITM 已清理。
- StartUpAds 已正式融合百度网盘去开屏广告。
- 百度网盘重复 `bchannel/list` Rewrite 覆盖已清理，功能范围不减少。
- 正式更新检查周期统一为 3 天（259200 秒）：托管母版、远程节点订阅、远程规则集与所有远程脚本均按此口径；Smart 组质量评估机制不改。
- 美图秀秀已实机确认可用并正式纳入母版。
- 红果短剧 V1.1.0 已正式纳入母版；去广告保留，VIP 无效响应脚本已移除。

## 三、正式文件清单

恢复时重点检查以下 7 个模块：

1. `surge-modules/YouTube净化增强-V2.0.1.sgmodule`
2. `surge-modules/BiliBili-Surge-Native.sgmodule`
3. `surge-modules/Kuwo-Surge-Native.sgmodule`
4. `surge-modules/StartUpAds-Surge-Native.sgmodule`
5. `surge-modules/JD-Price-History.sgmodule`
6. `surge-modules/MeituXiuxiu-Unlock.sgmodule`
7. `surge-modules/HongGuo-Surge-Native.sgmodule`

以及它们实际引用的本仓库脚本。

## 四、StartUpAds 恢复判定

StartUpAds 的正式母版必须同时满足：

- 通用开屏广告逻辑存在。
- 喜马拉雅已验证逻辑存在。
- **百度网盘去开屏广告逻辑存在。**
- BiliBili / Kuwo 专属逻辑不重复塞入 StartUpAds。
- 不包含淘宝比价。

因此，看到百度网盘相关的 `pan.baidu.com`、百度广告接口、开屏素材拦截及对应 MITM 时，**不要再把它们判断为“实验残留”**。

## 五、红果短剧恢复判定

红果当前正式文件为：

`surge-modules/HongGuo-Surge-Native.sgmodule`

恢复时遵循：
- 去广告为当前正式主功能，保留。
- 已确认基本无效的 VIP 响应脚本不得重新加入。
- 下载/画质保留当前 V1.1.0 响应层实现；后续若实机确认无效，必须先单独更新正式口径再删除。
- `HongGuo-Ads-Test.sgmodule`、`HongGuo-Full-Experimental.sgmodule` 与 `hongguo-compat/` 均不替代正式文件。

## 六、主配置与 GitHub 模块是两条线

Surge 主配置：

`https://surge-remote-profile.vercel.app/srg-7e2b4f91a6c843d0b58f3c7a29e14d65/Surge.conf`

GitHub 模块仓库：

`doovvip/sublink-worker`

二者不是自动同步关系。  
恢复 GitHub 模块时，不代表 Vercel 主配置已经重新部署；反过来也一样。

因此完整检查顺序为：

1. 主配置能正常拉取。
2. GitHub 7 个正式模块存在。
3. 模块引用脚本可访问。
4. YouTube / BiliBili / Kuwo 维持正式版本。
5. StartUpAds 保留百度网盘去开屏。
6. 美图秀秀模块保持已实机确认可用版本。
7. 红果短剧保持 V1.1.0 正式精简版，VIP 无效响应脚本不恢复。
8. 确认没有恢复淘宝比价或旧实验文件。

## 七、禁止“按名字猜版本”

恢复时以：
- 文件路径
- Git 提交
- 当前正式母版说明
- 实机验证结果

为准，不以“V1/V2/测试版/最终版”等文件名自行猜测。

---

最后确认口径：

**当前统一口径：2026-08-31 正式母版 = Surge-1.0 + 7 个正式模块；百度网盘去开屏广告继续属于 StartUpAds V2.0.0 正式功能，美图秀秀与红果短剧 V1.1.0 已正式纳入。**
