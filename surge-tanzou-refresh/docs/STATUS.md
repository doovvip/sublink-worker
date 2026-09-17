# 候选版状态 — 2026-09-17

## 已完成

- 在独立工作目录创建实际源文件、接口适配器和测试，不依赖消失的 Codex 临时工作树。
- 对原先审阅的接口、加密格式与普通 JSON VMess 映射做清晰的独立候选实现。不是原恢复包打包文件的逐字补丁；需进行预览对照验收。
- 六地区精确白名单及普通 TCP/AEAD 范围内的兼容规则，保护 board、access、信息条目、TLS/WS 和未知域名。
- 按原端点去重，保留动态名称、端口、UUID；不写死机场节点总数。
- 默认不启用兼容，需显式设置 verified-regions；没有服务器探测后自动给所有手机切换入口的行为。
- 本地单元/接口测试、语法检查及交付边界检查结果见 TEST-RESULTS.txt。

## 仍未完成

- 当前项目未推送到 GitHub；未创建远程工作分支或远程提交。
- 未复制到 doovvip/sublink-worker，未修改现有目标仓库。
- 未绑定 Vercel Root Directory、未添加/修改生产环境变量、未部署 Preview 或 Production。
- 未对这个新版本做真实生产密文/上游/VMess/手机 Surge 端到端验收。

## 仓库与工具边界

本轮 GitHub 实时返回 doovsvip-alt/doovsvip 为私有仓库，权限包含 push=true，main 仅有 README。
但当前暴露的 GitHub 接口没有 create_file/create_tree/提交/推送动作；查询这些动作未发现可调用接口。
服务器工具当前也仅提供只读检查，没有运行脚本或写入接口。不能把仓库权限字段当成已执行远程写入。
因此本次把完整目录及可迁移补丁保存在会话工作区并交付，不宣称 GitHub 写入成功。

## 不受影响

Surge R2、永不动母版、永不动模块、原 sublink-worker 项目、微信键盘仓库和线上订阅服务均未修改。
