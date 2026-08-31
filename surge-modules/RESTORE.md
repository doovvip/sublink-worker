# Surge 正式母版｜GitHub 恢复说明

> 恢复基准：**2026-08-30 正式最终母版（百度网盘融合版）**
>
> 当前完整模块集的恢复锚点提交：  
> `e43488900b52d7a17f50af04147c82df4379e7ef`

## 一、恢复原则

恢复时优先保证“已实机跑通”的正式状态，而不是追求最新上游版本。

**不得误删：**
- StartUpAds 中已经融合的百度网盘去开屏广告逻辑。
- BiliBili HD/iPad 已验证的开屏净化。
- YouTube 已修复播放几秒后报错的正式版本。
- Kuwo 已验证的 VIP / 播放 / 缓存下载 / 广告净化逻辑。

**不得恢复：**
- 淘宝比价实验。
- 已废弃的旧测试模块。
- BiliBili 旧 splash/list 分支。
- YouTube 已确认会引发播放异常的旧 initplayback hook。
- Kuwo 已删除的冗余 MITM hostname。

## 二、完整恢复锚点

如果正式模块被误改，可以从以下 GitHub 提交恢复：

`e43488900b52d7a17f50af04147c82df4379e7ef`

该提交已处于以下状态之后：
- YouTube 8/30 播放修复已合入。
- BiliBili 普通版 + HD/iPad 开屏修复已合入。
- BiliBili 旧 splash/list 分支已清理。
- Kuwo 冗余 MITM 已清理。
- StartUpAds 已正式融合百度网盘去开屏广告。
- 百度网盘重复 `bchannel/list` Rewrite 覆盖已清理，功能范围不减少。
- BiliBili Enhanced 与 JD 稳定脚本更新检查周期已由 1 天降为 7 天（604800 秒），不改变脚本请求处理逻辑。
- 新增 Surge Status 独立辅助面板：纯本地读取状态、仅手动刷新，不参与正常流量处理。

## 三、正式文件清单

恢复时重点检查以下 5 个模块：

1. `surge-modules/YouTube净化增强-V2.0.1.sgmodule`
2. `surge-modules/BiliBili-Surge-Native.sgmodule`
3. `surge-modules/Kuwo-Surge-Native.sgmodule`
4. `surge-modules/StartUpAds-Surge-Native.sgmodule`
5. `surge-modules/JD-Price-History.sgmodule`

以及它们实际引用的 `surge-modules/scripts/` 脚本和 Kuwo 稳定脚本。

## 四、StartUpAds 恢复判定

StartUpAds 的正式母版必须同时满足：

- 通用开屏广告逻辑存在。
- 喜马拉雅已验证逻辑存在。
- **百度网盘去开屏广告逻辑存在。**
- BiliBili / Kuwo 专属逻辑不重复塞入 StartUpAds。
- 不包含淘宝比价。

因此，看到百度网盘相关的 `pan.baidu.com`、百度广告接口、开屏素材拦截及对应 MITM 时，**不要再把它们判断为“实验残留”**。

## 五、主配置与 GitHub 模块是两条线

Surge 主配置：

`https://surge-remote-profile.vercel.app/srg-7e2b4f91a6c843d0b58f3c7a29e14d65/Surge.conf`

GitHub 模块仓库：

`doovvip/sublink-worker`

二者不是自动同步关系。  
恢复 GitHub 模块时，不代表 Vercel 主配置已经重新部署；反过来也一样。

因此完整检查顺序为：

1. 主配置能正常拉取。
2. GitHub 5 个正式模块存在。
3. 模块引用脚本可访问。
4. YouTube / BiliBili / Kuwo 维持正式版本。
5. StartUpAds 保留百度网盘去开屏。
6. 确认没有恢复淘宝比价或旧实验文件。

## 六、禁止“按名字猜版本”

恢复时以：
- 文件路径
- Git 提交
- 当前正式母版说明
- 实机验证结果

为准，不以“V1/V2/测试版/最终版”等文件名自行猜测。

---

最后确认口径：

**百度网盘去开屏广告已经正式融合进 StartUpAds V2.0.0，是最终母版的一部分。**
