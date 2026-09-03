# Surge R2 候选版｜2026-09-03

版本名：**Surge-永久冻结-2026-09-03-Surge1.0-7模块-R2**（候选，暂未锁定）

## 变更范围
本 R2 基于上一冻结点 `f6623fdd695ab8639285b7dbea322b041679ed76`，只升级两个模块：

1. BiliBili-Surge-Native.sgmodule
2. StartUpAds-Surge-Native.sgmodule

其余 Surge-1.0、TanZou、YouTube、Kuwo、JD、美图、红果全部保持不变。

## BiliBili 后续正式版
来源：`release/surge-v1.0-20260902`
原正式 blob：`e5df751033b4307e2da63bf9148f41132e12798c`

相比 8/30 版，补齐：
- 普通版 + HD/iPad 开屏净化
- 更完整 JSON 入口
- 首页推荐/直播/搜索/动态等净化
- Proto 净化
- 完整 UI / Mine / Region / Channel 入口

仓库内脚本不再指向 main，固定到：`9ff23a1d130ccf8b43d8aecb0e3427d825f0f63d`。

## StartUpAds 后续正式版
来源：`release/surge-v1.0-20260902`
原正式 blob：`df584663f9f72c5b425f0006e250545c5d208f34`

相比 8/30 版，补齐：
- 百度网盘更多广告/点击/素材链路
- 百度网盘 certuser / statistics / fc-video 等补充处理
- 美图秀秀开屏与广告域名
- 喜马拉雅更多页面入口
- 原通用开屏逻辑继续保留

喜马拉雅脚本固定到：`9ff23a1d130ccf8b43d8aecb0e3427d825f0f63d`。

## 恢复口令
以后说：

**恢复 Surge-永久冻结-2026-09-03-Surge1.0-7模块-R2**

恢复时：
1. Surge-1.0 主配置恢复原冻结权威母版。
2. TanZou 冻结节点与转换逻辑保持上一冻结版。
3. 7 个模块中 BiliBili / StartUpAds 使用本 R2。
4. 其余 5 个模块沿用上一冻结版本。
5. 美图/红果脚本仍使用原固定资产锚点。
6. 不混入后续实验。


## 版本日志与编号规则
- 旧 V1–V17 的逐条日志压缩为一条“历史演进摘要”。
- 正式版本从 **Surge-1.0** 开始。
- 后续常规更新使用 **Surge-1.1 → 1.2 → 1.3…**。
- 只有底座、核心架构或核心策略发生重大变化时升级为 **Surge-2.0**。
- R2 只是恢复包修订号，不占用 Surge 主版本号。
- 当前 R2 为候选状态，允许继续修改，尚未建立最终不可变锁定锚点。
