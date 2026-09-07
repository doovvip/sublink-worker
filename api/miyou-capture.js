export const config = {
  runtime: 'nodejs'
};

const MAX_MESSAGE_CHARS = 8000;
const MAX_MESSAGES = 100;
const CAPTURE_SENTINEL = '__CAPTURE_ONLY__';
const VERSION = '0.6.0';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch { return { _raw: req.body }; }
  }

  let raw = '';
  try {
    for await (const chunk of req) {
      raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (raw.length > 200000) break;
    }
  } catch {
    return {};
  }

  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

function safeText(value, limit = MAX_MESSAGE_CHARS) {
  return typeof value === 'string' ? value.slice(0, limit) : value ?? null;
}

function compactMessage(message) {
  return {
    id: message?.id ?? message?.msgId ?? null,
    role: message?.role ?? null,
    direction: message?.direction ?? null,
    sender: message?.sender ?? null,
    timestamp: message?.timestamp ?? null,
    content: safeText(message?.content)
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_MESSAGES).map(compactMessage);
}

function latestUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user' && typeof messages[i]?.content === 'string') {
      return messages[i].content.slice(0, MAX_MESSAGE_CHARS);
    }
  }
  return null;
}

function openAIStyle(content, model) {
  return {
    id: 'miyou-capture',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'miyou-capture',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }]
  };
}

function bridgeEnvelope(body, req) {
  const messages = normalizeMessages(body?.messages);
  const bridge = body?.miyou_bridge && typeof body.miyou_bridge === 'object'
    ? body.miyou_bridge
    : {};

  return {
    marker: 'MIYOU_CAPTURE_V2',
    version: VERSION,
    time: new Date().toISOString(),
    mode: bridge.mode || body?.mode || 'ai_capture',
    source: bridge.source || 'unknown',
    contact: {
      wxid: safeText(bridge?.contact?.wxid || req.headers?.wxid || req.headers?.['x-wxid'] || '', 256),
      displayName: safeText(bridge?.contact?.displayName, 256),
      remarkName: safeText(bridge?.contact?.remarkName, 256)
    },
    identity: {
      selfWxid: safeText(bridge?.identity?.selfWxid, 256),
      peerWxid: safeText(bridge?.identity?.peerWxid, 256),
      confidence: Number.isFinite(bridge?.identity?.confidence) ? bridge.identity.confidence : null,
      verifiedBy: Array.isArray(bridge?.identity?.verifiedBy) ? bridge.identity.verifiedBy.slice(0, 5) : []
    },
    unread: bridge?.unread && typeof bridge.unread === 'object'
      ? {
          waitingReply: Boolean(bridge.unread.waitingReply),
          consecutiveIncoming: Number(bridge.unread.consecutiveIncoming || 0),
          lastDirection: bridge.unread.lastDirection || null,
          lastMessageAt: bridge.unread.lastMessageAt || null
        }
      : null,
    ocr: bridge?.ocr && typeof bridge.ocr === 'object'
      ? {
          enabled: Boolean(bridge.ocr.enabled),
          contactName: safeText(bridge.ocr.contactName, 256),
          bubbleDirection: bridge.ocr.bubbleDirection || null,
          confidence: Number.isFinite(bridge.ocr.confidence) ? bridge.ocr.confidence : null
        }
      : null,
    model: body?.model ?? null,
    messageCount: messages.length,
    latestUserText: latestUserText(messages),
    messages
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      service: 'MiYou WeChat bridge',
      version: VERSION,
      modes: ['ai_capture', 'db_reader', 'ocr_0.3', 'hybrid'],
      features: ['ai_passthrough', 'identity_verification', 'unreplied_scan_metadata', 'ocr_0.3_metadata'],
      sentinel: CAPTURE_SENTINEL
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const body = await readJsonBody(req);
  const envelope = bridgeEnvelope(body, req);

  // Keep cloud logging intentionally compact. The local bridge owns the full
  // database/index; the server receives only the context required for AI.
  console.log(JSON.stringify(envelope));

  // Existing MiYou AI behavior is preserved. Capture-only builds suppress this
  // sentinel at the final message boundary; normal AI builds can continue to
  // use the OpenAI-compatible response shape unchanged.
  res.statusCode = 200;
  return res.end(JSON.stringify(openAIStyle(CAPTURE_SENTINEL, body?.model)));
}
