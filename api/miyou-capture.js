export const config = {
  runtime: 'nodejs'
};

const MAX_MESSAGE_CHARS = 8000;
const MAX_MESSAGES = 100;
const CAPTURE_SENTINEL = '__CAPTURE_ONLY__';
const VERSION = '0.6.1';

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
    id: message?.id ?? message?.msgId ?? message?.localId ?? null,
    role: message?.role ?? null,
    direction: message?.direction ?? null,
    isSend: message?.isSend ?? message?.fromMe ?? null,
    senderWxid: safeText(message?.senderWxid ?? message?.sender, 256),
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
    marker: 'MIYOU_CAPTURE_V3',
    version: VERSION,
    time: new Date().toISOString(),
    mode: 'db_reader',
    source: bridge.source || 'local_db',
    contact: {
      wxid: safeText(bridge?.contact?.wxid || req.headers?.wxid || req.headers?.['x-wxid'] || '', 256),
      displayName: safeText(bridge?.contact?.displayName, 256),
      remarkName: safeText(bridge?.contact?.remarkName, 256)
    },
    identity: {
      selfWxid: safeText(bridge?.identity?.selfWxid, 256),
      peerWxid: safeText(bridge?.identity?.peerWxid, 256),
      source: 'db'
    },
    unread: bridge?.unread && typeof bridge.unread === 'object'
      ? {
          waitingReply: Boolean(bridge.unread.waitingReply),
          consecutiveIncoming: Number(bridge.unread.consecutiveIncoming || 0),
          lastDirection: bridge.unread.lastDirection || null,
          lastMessageAt: bridge.unread.lastMessageAt || null
        }
      : null,
    presetId: safeText(bridge?.presetId, 128),
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
      mode: 'db_reader',
      features: ['ai_passthrough', 'db_identity', 'unreplied_scan_metadata', 'preset_id'],
      sentinel: CAPTURE_SENTINEL
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const body = await readJsonBody(req);
  const envelope = bridgeEnvelope(body, req);

  // The local Reader owns the full database and preset text. The server only
  // receives bounded chat context plus DB-derived identity metadata.
  console.log(JSON.stringify(envelope));

  res.statusCode = 200;
  return res.end(JSON.stringify(openAIStyle(CAPTURE_SENTINEL, body?.model)));
}
