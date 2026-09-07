# MiYouLiteAI 0.1.0

面向轻松签/非越狱注入的自包含 companion dylib。它与原 `MiYou.dylib` 一起注入，不依赖 Substrate / ElleKit / libhooker。

## 保留目标

- MiYou 原有快捷回复入口
- GPT AI 快捷回复：一次 3 条，点击只填入微信输入框，不自动发送
- 消息设置里的常驻后台、消息防撤回
- 秘友设置
- 文件管理
- 原 MiYou 的公共依赖代码不删

## 精简目标

聊天工具栏只保留「快捷回复」。首次进入 MiYou 的「工具栏列表」时，Lite 层会尝试调用 MiYou 自己的删除逻辑移除：照片、拍摄、文件、添加。运行时也会隐藏这些额外工具栏入口。

消息设置页只保留「常驻后台」「防撤回」可交互，其他行在 Lite 层禁用/隐藏。秘友设置和文件管理不处理。

> 0.1.0 不对原 MiYou 二进制做高风险硬删。真正源码级功能裁剪需要原 MiYou 源码；本版本优先保证依赖完整和可回退。

## AI 数据路径

- API Key 不写入 dylib。
- 设备只把当前页面需要的最近聊天上下文发送到 `/api/miyou-ai`。
- 默认最多 30 条、总计最多约 12k 字符。
- 服务端不记录请求正文。
- 默认模型 `gpt-5.6-luna`，`reasoning_effort=none`，优先低延迟。

插件首次运行会在微信 Documents 下创建 `MiYouLiteAI.json`：

```json
{
  "endpoint": "https://sublink-worker-pink.vercel.app/api/miyou-ai",
  "token": "",
  "preset": "结合聊天上下文判断关系、情绪和氛围，生成自然、合适、不突兀的回复，保持我的说话风格。",
  "maxContext": 30
}
```

如 Vercel 配置了 `MIYOU_BRIDGE_TOKEN`，把同一个值写入 `token`。OpenAI Key 只放在 Vercel 环境变量 `OPENAI_API_KEY`。

## 轻松签使用

1. 保持原文件名 `MiYou.dylib` 不变。
2. 再注入 `MiYouLiteAI.dylib`。
3. 重签微信并安装。
4. MiYou -> 聊天工具栏 -> 工具栏配置，确认只剩「快捷回复」。
5. 打开聊天 -> 快捷回复 -> 快捷回复列表，顶部显示 AI 3 条建议。
6. 点一条后只填入输入框，最后由用户手动发送。

## 安全边界

- 不自动发送消息。
- 不修改微信数据库。
- 不包含隐藏/绕过微信检测的逻辑。
- 不依赖越狱 Hook 框架。
- 原 MiYou 可单独保留；若 Lite 层异常，只需从轻松签注入列表移除 `MiYouLiteAI.dylib` 即可回退。
