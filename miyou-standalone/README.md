# MiYouStandaloneAI 0.2.0

独立轻松签 dylib：不依赖原 `MiYou.dylib`，仅依赖 iOS 系统框架。

## 当前可见功能
- 聊天窗口只增加一个 `快捷回复` 按钮。
- 聊天上下文变化后，后台事件驱动预生成 3 条回复。
- 点击快捷回复优先直接显示已缓存结果。
- 选择一条后只填入输入框，不自动发送。
- `重新生成` 可强制刷新。

## 速度策略
不是固定频率死循环请求。扫描聊天 UI 约 450ms 一次；上下文发生变化后 debounce 约 550ms，再请求 AI。相同上下文不会重复生成；429/503 等状态会短暂退避，避免无意义请求。

## 安全边界
- 不自动发送消息。
- 不修改微信数据库。
- 默认只上传当前可见聊天上下文，而不是完整聊天数据库。
- API Key 不写进 dylib，由 Vercel 环境变量持有。
- 不包含越狱框架、隐藏检测或规避检测逻辑。

## 预留底层扩展入口
`MiYouStandaloneAI.h` 导出：
- `MYSASetExternalContext`：后续 DB Reader 可直接喂入可靠上下文。
- `MYSARequestRefresh` / `MYSAInvalidateReplies`：刷新与缓存控制。
- `MYSARegisterExtension` / `MYSAInvokeExtension`：后续常驻后台、防撤回、秘友设置、文件管理等模块可以注册，而无需重写 AI 核心。

当前 UI 上不展示这些扩展入口，后续按需逐个启用。
