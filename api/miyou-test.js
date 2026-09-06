export const config = {
  runtime: 'nodejs'
};

const MAX_HEADER_VALUE = 500;
const MAX_BODY_LOG = 20000;

function sanitizeHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower === 'set-cookie') {
      out[key] = '[REDACTED]';
      continue;
    }
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    out[key] = text.slice(0, MAX_HEADER_VALUE);
  }
  return out;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch { return { _raw: req.body }; }
  }

  let raw = '';
  try {
    for await (const chunk of req) {
      raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (raw.length > 100000) break;
    }
  } catch {
    return {};
  }

  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

function openAIStyle(content) {
  return {
    id: 'miyou-test',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'miyou-test',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }
    ]
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      service: 'MiYou WeChat Assistant probe',
      mode: 'capture-only',
      ai: false,
      usage: 'POST OpenAI-compatible JSON here'
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const body = await readJsonBody(req);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const wxid = req.headers?.wxid || req.headers?.['x-wxid'] || '';

  const capture = {
    marker: 'MIYOU_PROBE',
    time: new Date().toISOString(),
    method: req.method,
    wxid,
    model: body?.model ?? null,
    messageCount: messages.length,
    roles: messages.map((m) => m?.role ?? null),
    headers: sanitizeHeaders(req.headers),
    body
  };

  let logText;
  try {
    logText = JSON.stringify(capture);
  } catch {
    logText = JSON.stringify({ marker: 'MIYOU_PROBE', error: 'capture serialization failed' });
  }

  if (logText.length > MAX_BODY_LOG) {
    logText = `${logText.slice(0, MAX_BODY_LOG)}...[TRUNCATED]`;
  }
  console.log(logText);

  const label = wxid ? `｜wxid 已收到` : '｜未收到 wxid';
  const reply = `MiYou Bridge 测试成功｜收到 ${messages.length} 条上下文${label}`;

  res.statusCode = 200;
  return res.end(JSON.stringify(openAIStyle(reply)));
}
