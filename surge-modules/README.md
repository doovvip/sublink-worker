# Surge 正式母版｜安装导航

> 当前标准：**2026-08-31 正式母版（Surge-1.0 + 7 个正式模块）**
>
> 备份分支：`backup/surge-modules-2026-08-31`
>
> 基线说明：保留 2026-08-30 百度网盘融合正式逻辑，纳入 2026-08-31 已实机确认的美图秀秀模块，并于 2026-08-31 将红果短剧 V1.1.0 精简版转为正式模块。
>
> 原则：只使用本目录中的正式母版；旧版本、淘宝比价及未转正实验文件不纳入正式恢复范围。

## 一、主配置

Surge 远程主配置：

`https://surge-remote-profile.vercel.app/srg-7e2b4f91a6c843d0b58f3c7a29e14d65/Surge.conf`

主配置负责：代理、策略组、规则分流及基础 MITM。  
应用净化功能由下方独立模块负责，不把应用脚本重复塞回主配置。

## 二、正式模块

| 模块 | 当前正式用途 | Raw 安装地址 |
|---|---|---|
| YouTube V2.0.1 | 去广告、PIP、后台播放；保留已修复“播放几秒后出错”的 8/30 版本 | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/YouTube%E5%87%80%E5%8C%96%E5%A2%9E%E5%BC%BA-V2.0.1.sgmodule |
| BiliBili | 普通版 + HD/iPad 开屏净化、推荐/直播/搜索/动态/Proto 去广告 | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/BiliBili-Surge-Native.sgmodule |
| Kuwo | VIP、播放、缓存/下载、广告及开屏净化 | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/Kuwo-Surge-Native.sgmodule |
| StartUpAds V2.0.0 | 通用开屏 + 喜马拉雅 + **百度网盘去开屏广告** | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/StartUpAds-Surge-Native.sgmodule |
| JD Price History | 京东历史价格功能 | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/JD-Price-History.sgmodule |
| MeituXiuxiu Unlock | 美图秀秀/美图系列响应重写；保留已实机验证的现有匹配范围 | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/MeituXiuxiu-Unlock.sgmodule |
| HongGuo V1.1.0 | 红果短剧去广告正式保留；已移除无效 VIP 响应脚本；下载/画质暂保留现有响应层实现 | https://raw.githubusercontent.com/doovvip/sublink-worker/main/surge-modules/HongGuo-Surge-Native.sgmodule |

### 安装方式

在 Surge 中添加模块时，使用上表对应的 **Raw 地址**。  
不要安装同一功能的旧版、测试版或重复模块，以免 URL Rewrite / Script / MITM 重复命中。

## 三、红果后续实验范围

### 红果短剧

状态：**Surge V1.1.0 已转正；兼容/Hook 研究继续实验**。

- `surge-modules/HongGuo-Surge-Native.sgmodule`：当前正式母版文件，纳入正式安装与恢复。
- `hongguo-compat/`：Xposed/LSPosed 兼容实验工程与补丁，继续保持实验属性。
- `surge-modules/HongGuo-Ads-Test.sgmodule`：旧 Surge 去广告测试件，不作为正式恢复文件。
- `surge-modules/HongGuo-Full-Experimental.sgmodule`：V1.1.0 实验历史文件，仅作实验留档，不与正式文件重复安装。
- VIP 本地 Hook、版本兼容、进一步画质/下载研究继续属于实验范围，未实机确认前不替换正式模块。

## 四、最终母版口径

1. **YouTube**：固定为 2026-08-30 已实机修复版本。
2. **BiliBili**：固定为 2026-08-30 普通版 + HD/iPad 已实机跑通版本。
3. **Kuwo**：固定为 2026-08-30 正式清理版。
4. **StartUpAds**：以 **已经融合百度网盘去开屏广告** 的 V2.0.0 为最终正式母版。
5. **百度网盘**：已结束实验阶段；已验证的去开屏逻辑属于正式母版，恢复时不得删除。
6. **美图秀秀**：2026-08-31 已实机确认可用，正式纳入母版；保留当前 `subs_offer_elg / vip / user` 匹配范围与 MITM 范围，不做功能缩水。
7. **红果短剧**：2026-08-31 将 V1.1.0 精简版正式纳入母版；保留实机有效去广告，VIP 无效响应脚本不恢复，下载/画质先保留当前实现。
8. **淘宝比价**：已放弃，不恢复、不维护、不加入正式母版。

## 五、脚本来源

正式模块优先引用本仓库 `main` 分支下的固定脚本副本。  
不要随意替换成未经验证的上游最新版；升级必须先测试，再合并正式母版。

正式更新检查周期以 Surge 官方默认值为准：托管母版、远程节点订阅（policy-path）、远程规则集（RULE-SET / DOMAIN-SET）与远程脚本均按 **1 天（86400 秒）**；Smart 组的实时质量评估机制不属于资源下载周期。

## 六、恢复入口

发生误改、模块失效或需要回滚时，请按：

**[GitHub 恢复说明](./RESTORE.md)**

进行恢复。
