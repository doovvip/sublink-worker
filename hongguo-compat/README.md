# 红果兼容版补丁｜实验项目

> 项目状态：**实验项目**
>
> 规则：不纳入正式母版、不参与正式恢复、不与正式 Surge 模块混合；所有红果相关 Hook、兼容层、Surge 规则与测试文件，均需先实机验证后再决定是否转正。

基于 KEJIYUNB/hongguo 当前源码设计，不删除原有功能。

## 目标

保留原项目：
- VIP 状态与权益 Hook
- 去广告 / 暂停广告 / 片尾广告 / 金宝箱 / 悬浮挂件
- 默认最高画质
- 下载数量限制
- 其它原项目 UI/播放功能

只增强“版本选择/兼容”这一层。

## 原项目当前已知映射

国内：
- 7.3.1.32
- 7.3.2.32
- 7.3.3.18

海外：
- 7.3.1.32

## 本补丁做了什么

原版主要根据 versionName + 少量类存在性选择 TargetNames profile。

兼容版新增 CompatTargetResolver：
1. 已知版本仍使用原版精确映射。
2. 遇到未知版本时，不因版本号变化直接判废。
3. 运行时检测 shortHolder、播放状态/遮罩方法、画质 Controller、VIP KMP Model、Account Service、暂停广告入口等特征。
4. 对 CN-7.3.3.18 / CN-7.3.2.32 / CN-7.3.1.32 profile 进行评分。
5. 达到可信阈值后自动使用最匹配 profile。
6. 检测不到时回退到原作者 TargetNames.namesFor() 逻辑。

## 接入

把 CompatTargetResolver.kt 放入：

app/src/main/kotlin/xyz/kejiyu/hongguo/hooks/CompatTargetResolver.kt

然后在 Hooks.kt 中把：

gNames = TargetNames.namesFor(pkg, detected.first, classLoader)

改成：

gNames = CompatTargetResolver.resolve(pkg, detected.first, classLoader)

其它 Hook 逻辑不改。

## 兼容边界

这是“同一套混淆结构跨小版本”的兼容层。如果红果新版整体重新混淆，导致类名和方法名全部变化，任何自动选择旧 profile 的方案都无法凭空恢复，需要重新抓新版类名并新增一个 TargetNames profile。

因此本方案不会伪装成“永久全版本”。它的价值是避免仅因 versionName 更新、但内部结构基本没变时整套模块失效。

## 实验项目纪律

- 红果项目默认只在 `hongguo-compat/` 与测试文件中维护。
- 红果相关 Surge 文件一律视为测试件，默认不加入正式安装导航。
- 未经实机确认，不修改正式母版 README / RESTORE 的正式模块数量和恢复清单。
- 任何转正必须先完成：功能验证、稳定性验证、速度/缓存影响验证、回滚验证。
