# MiYou Plugin 0.6.4 Integrated Slim Build

Branch: `miyou-refactor-0.6`

## Final integrated target

Reuse MiYou's existing chat toolbar and native `快捷回复` UI. Do not create a second floating window or duplicate reply interface.

Normal flow:

1. Local WeChat DB Reader identifies the current contact and recent messages.
2. Message direction is taken from DB fields (`direction`, `isSend` / `fromMe`, sender wxid mapping).
3. MiYou native `快捷回复` button requests 3 GPT drafts.
4. The selected draft is inserted into WeChat's input box.
5. The user manually sends it.

No OCR is used in the normal path and AI never triggers the final send action.

## Integrated feature bundle

`miyou-plugin/integration.js` is the single integration layer. It combines:

- GPT / AI request flow
- local DB Reader
- current-contact context
- unreplied-message scan
- GPT preset
- native `快捷回复`
- native `快捷回复列表`
- 3 AI suggestions
- regenerate
- fill input box only
- manual send
- Message Settings shell
  - `常驻后台`
  - `消息防撤回`
- `秘友设置` — preserve whole section
- `文件管理` — preserve whole section

## Chat toolbar

The MiYou chat toolbar keeps only one item:

- `快捷回复`

MiYou toolbar entries for photo, camera, file and add are removed from the slim feature profile. This does not remove WeChat's own native media/file functions.

## Feature-code pruning list

The integrated profile marks these feature families for removal/disable when their native implementation is available:

- voice/video enhancements
- group assistant
- message preview/fold enhancements
- group chat grouping
- other group extras
- transfer tools
- location modification
- step-count modification
- forced official-account follow
- mass-message assistant
- keyword auto reply
- OCR
- MiYou toolbar photo
- MiYou toolbar camera
- MiYou toolbar file
- MiYou toolbar add

## Dependency-safe pruning rule

Dependencies are not slimmed.

Keep all shared dependencies, common hooks, storage/network layers and framework code required by any retained feature. Only remove:

1. the unwanted feature entry,
2. code proven to belong exclusively to that unwanted feature,
3. resources proven to belong exclusively to that unwanted feature.

If a dependency is uncertain or shared, keep it.

## Native quick reply adapter

`miyou-plugin/quick-reply.js` bridges the native MiYou UI to the AI endpoint.

- Keeps at most 30 recent text messages.
- Uses DB-derived incoming/outgoing direction only.
- Sends the configured GPT preset plus bounded recent context.
- Requests 3 reply drafts.
- Selecting a draft only fills the input box.
- `autoSend` is permanently false in this profile.
- The native list can expose a `重新生成` action.

## AI endpoint

`api/miyou-quick-reply.js`

- `GET`: health/status information.
- `POST`: accepts current contact, preset and bounded recent messages.
- Calls OpenAI Responses API using server-side `OPENAI_API_KEY`.
- Model is selected by `MIYOU_OPENAI_MODEL`; default is `gpt-5.6-luna` for low-latency reply generation.
- Returns up to 3 reply drafts: `自然直接`, `轻松推进`, `简短稳重`.
- Does not log the full chat transcript or preset.

## Identity / direction rule

Direction is never inferred from bubble position.

Priority:

1. explicit DB `direction`
2. DB `isSend` / `fromMe`
3. `senderWxid` compared with known self / peer wxid
4. otherwise mark the message direction as unknown

If the latest message direction is unknown, unreplied classification stays uncertain rather than guessing.

## Deliberately excluded

- automatic WeChat sending
- OCR in the normal path
- uploading the full WeChat database
- duplicate chat-history pipelines
- stealth/evasion behavior intended to hide injection from WeChat

The local DB Reader owns chat history; cloud receives only the bounded context needed for a reply request.
