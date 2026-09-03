# Surge 永不动母版｜Surge-1.0 R2｜2026-09-03

这是当前 R2 的永久恢复基线。后续开发继续走 candidate/main，不修改本冻结分支与永久资产分支。

## GitHub 两个不可移动锚点
- 永久资产分支：`archive/surge-r2-permanent-assets-2026-09-03`
- 永久资产提交：`b3612e647c70e05ebff57d818c2bd30d5c28c51e`
- 永久母版分支：`frozen/surge-1.0-r2-permanent-2026-09-03`

## 7 个正式模块
1. YouTube净化增强-V2.0.1.sgmodule
2. BiliBili-Surge-Native.sgmodule
3. Kuwo-Surge-Native.sgmodule
4. StartUpAds-Surge-Native.sgmodule
5. JD-Price-History.sgmodule
6. MeituXiuxiu-Unlock.sgmodule
7. HongGuo-Surge-Native.sgmodule

所有 doovvip 自托管脚本均固定到永久资产提交 `b3612e647c70e05ebff57d818c2bd30d5c28c51e`，不再引用 main。

BiliBili 两个 BiliUniverse/Biliverse bundle 固定到精确 Release：
- Enhanced v0.5.13
- ADBlock v0.6.19

对应源码入口和 Release 资产锁定信息已归档到永久资产目录。

## 主配置
权威完整 Surge-1.0（含运行时私有材料）只保存在 Dropbox 永久母版目录和恢复端，不公开复制到 GitHub。

## 一键恢复语义
口令：
**恢复 Surge-永不动母版-2026-09-03-Surge1.0-R2**

执行顺序：
1. 读取 Dropbox 永久母版中的权威 Surge.conf。
2. 恢复冻结 TanZou 节点快照及 policy-path。
3. 使用本分支 7 个模块。
4. 所有自托管脚本必须解析到永久资产提交 `b3612e647c70e05ebff57d818c2bd30d5c28c51e`。
5. 校验 BiliUniverse/Biliverse 两个精确 Release 依赖。
6. 重新部署固定 Vercel Surge-1.0 入口。
7. 校验两个远程主配置入口 HTTP 200 且正文等于 Dropbox 权威 Surge.conf。
8. 不混入任何 freeze 之后的实验或 main 变化。
