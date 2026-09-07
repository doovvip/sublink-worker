# MiYou Plugin 0.6.3 Slim Refactor

Branch: `miyou-refactor-0.6`

## Target

Reuse MiYou's existing chat toolbar and native `快捷回复` UI instead of creating a new floating window or a second reply interface.

Normal flow:

1. Local WeChat DB Reader identifies the current contact and recent messages.
2. Message direction is taken from DB fields (`direction`, `isSend` / `fromMe`, sender wxid mapping).
3. MiYou native `快捷回复` button requests 3 AI drafts.
4. The selected draft is inserted into WeChat's input box.
5. The user manually sends it.

No OCR is used in the normal path and AI never triggers the final send action.

## Keep-only feature profile

The slim build keeps:

- AI bridge
- local DB Reader
- unreplied-message scan
- GPT preset
- manual send
- chat toolbar
- native `快捷回复`
- native `快捷回复列表`
- Message Settings shell
  - `常驻后台`
  - `消息防撤回`
- `秘友设置` — preserve the whole section for now
- `文件管理` — preserve the whole section for now

Everything outside this whitelist is disabled by default in `minimal-config.js`.

## Native quick reply behavior

`miyou-plugin/quick-reply.js` is the small adapter between the native MiYou UI and the AI endpoint.

- Keeps at most 30 recent text messages.
- Uses DB-derived incoming/outgoing direction only.
- Sends the configured GPT preset plus bounded recent context.
- Requests 3 reply drafts.
- Selecting a draft only fills the input box.
- `autoSend` is permanently false in this profile.
- The native list can expose a `重新生成` action without changing the chat toolbar layout.

## AI endpoint

`api/miyou-quick-reply.js`

- `GET`: health/status information.
- `POST`: accepts current contact, preset and bounded recent messages.
- Calls OpenAI Responses API using server-side `OPENAI_API_KEY`.
- Model is selected by `MIYOU_OPENAI_MODEL`; default is `gpt-5.6-luna` for low-latency reply generation.
- Returns up to 3 reply drafts: `自然直接`, `轻松推进`, `简短稳重`.
- Does not log the full chat transcript or preset.

The ChatGPT subscription and OpenAI API billing are separate; this server route needs its own OpenAI API credential in the deployment environment.

## Identity / direction rule

Direction is never inferred from bubble position.

Priority:

1. explicit DB `direction`
2. DB `isSend` / `fromMe`
3. `senderWxid` compared with known self / peer wxid
4. otherwise mark the message direction as unknown

If the latest message direction is unknown, unreplied classification should stay uncertain rather than guessing.

## Deliberately excluded

- automatic WeChat sending
- OCR in the normal path
- uploading the full WeChat database
- duplicate chat-history pipelines
- stealth/evasion behavior intended to hide injection from WeChat

The local DB Reader owns chat history; cloud receives only the bounded context needed for a reply request.
