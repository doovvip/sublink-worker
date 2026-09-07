# MiYou Plugin 0.6 Refactor

Branch: `miyou-refactor-0.6`

## Goal

Keep all existing AI behavior, add the 0.3 OCR path back as a fallback, keep the local DB Reader as the primary source, and add a local unreplied-message scan with stronger identity verification.

## Data flow

1. Local DB Reader (primary)
2. OCR 0.3 (fallback / cross-check)
3. Identity verifier
4. Local message index
5. Unreplied scanner
6. Minimal context bridge to MiYou AI
7. User-confirmed send

## Required plugin features

- `db_reader`: read/consume locally parsed WeChat messages and contact mapping.
- `ocr_0.3`: recognize current contact and bubble direction when DB identity is uncertain.
- `identity_verifier`: never decide self/peer from a single ambiguous flag; combine wxid mapping, message direction and OCR evidence.
- `unreplied_scan`: per contact, inspect the latest valid message. If the latest direction is incoming, mark it as waiting for reply.
- `context_builder`: send only the selected contact's necessary recent context to the AI endpoint.
- `ai_keep`: preserve all existing AI reply generation features.
- `manual_send`: AI may generate text, but final WeChat sending remains user-confirmed.

## Unreplied result model

```json
{
  "contact": {
    "wxid": "wxid_xxx",
    "displayName": "name",
    "remarkName": "remark"
  },
  "waitingReply": true,
  "consecutiveIncoming": 2,
  "lastDirection": "incoming",
  "lastMessageAt": 0,
  "lastMessagePreview": "...",
  "identityConfidence": 0.98
}
```

## Identity rules

1. Prefer a verified self wxid / peer wxid mapping.
2. Normalize every message to `incoming` or `outgoing` before business logic.
3. OCR bubble position is supporting evidence only, not the sole source when DB data is available.
4. If DB and OCR disagree, lower confidence and exclude the contact from automatic unreplied classification until another signal resolves it.
5. Keep raw direction/source fields locally for debugging, but do not upload the full database.

## Bridge payload

The server endpoint accepts optional `miyou_bridge` metadata:

```json
{
  "model": "existing-ai-model",
  "messages": [],
  "miyou_bridge": {
    "mode": "hybrid",
    "source": "local_db",
    "contact": {
      "wxid": "wxid_xxx",
      "displayName": "name",
      "remarkName": "remark"
    },
    "identity": {
      "selfWxid": "wxid_self",
      "peerWxid": "wxid_xxx",
      "confidence": 0.99,
      "verifiedBy": ["contact_map", "db_direction", "ocr_0.3"]
    },
    "unread": {
      "waitingReply": true,
      "consecutiveIncoming": 1,
      "lastDirection": "incoming",
      "lastMessageAt": 0
    },
    "ocr": {
      "enabled": true,
      "contactName": "name",
      "bubbleDirection": "incoming",
      "confidence": 0.92
    }
  }
}
```

## What is deliberately not added

- full automatic WeChat sending
- full chat database upload
- stealth/injection logic intended to conceal the plugin from WeChat
- duplicate OCR/DB pipelines that both own message history

The DB Reader owns history. OCR 0.3 is a fallback and identity cross-check.
