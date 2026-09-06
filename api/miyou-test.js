export const config = {
  runtime: 'nodejs'
};

const MAX_MESSAGE_CHARS = 8000;

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

function compactMessage(message) {
  const content = typeof message?.content === 'string'
    ? message.content.slice(0, MAX_MESSAGE_CHARS)
    : message?.content ?? null;
  return { role: message?.role ?? null, content };
}

function latestUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user' && typeof messages[i]?.content === 'string') {
      return messages[i].content.slice(0, MAX_MESSAGE_CHARS);
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, service: 'MiYou WeChat capture bridge', mode: 'capture-only-204' }));
  }

  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  const body = await readJsonBody(req);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const wxid = req.headers?.wxid || req.headers?.['x-wxid'] || '';

  console.log(JSON.stringify({
    marker: 'MIYOU_CAPTURE',
    time: new Date().toISOString(),
    model: body?.model ?? null,
    messageCount: messages.length,
    wxidPresent: Boolean(wxid),
    latestUserText: latestUserText(messages),
    messages: messages.map(compactMessage)
  }));

  // Capture succeeded. Return HTTP 204 with no message body so MiYou has
  // nothing it can forward into the WeChat conversation.
  res.statusCode = 204;
  return res.end();
}
