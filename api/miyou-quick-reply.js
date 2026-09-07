export const config = {
  runtime: 'nodejs'
};

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 1500;
const MAX_PRESET_CHARS = 2500;
const DEFAULT_MODEL = process.env.MIYOU_OPENAI_MODEL || 'gpt-5.6-luna';
const DEFAULT_PRESET = '根据聊天上下文自动判断关系、情绪、主动程度和暧昧程度，生成自然、符合当前关系阶段的回复；不要突然升温，也不要无故冷淡。';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }

  let raw = '';
  try {
    for await (const chunk of req) {
      raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (raw.length > 120000) break;
    }
  } catch {
    return {};
  }

  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function safeText(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function normalizeDirection(message = {}) {
  if (message.direction === 'incoming' || message.direction === 'outgoing') {
    return message.direction;
  }
  const isSend = message.isSend ?? message.fromMe;
  if (isSend === true || isSend === 1 || isSend === '1') return 'outgoing';
  if (isSend === false || isSend === 0 || isSend === '0') return 'incoming';
  return 'unknown';
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      direction: normalizeDirection(message),
      timestamp: message?.timestamp ?? null,
      content: safeText(message?.content, MAX_MESSAGE_CHARS)
    }))
    .filter((message) => message.content && message.direction !== 'unknown');
}

function buildInput(body) {
  const contact = body?.contact && typeof body.contact === 'object' ? body.contact : {};
  const displayName = safeText(contact.remarkName || contact.displayName || '', 256);
  const preset = safeText(body?.preset, MAX_PRESET_CHARS) || DEFAULT_PRESET;
  const messages = normalizeMessages(body?.messages);

  const transcript = messages
    .map((message) => `${message.direction === 'outgoing' ? '我' : '对方'}：${message.content}`)
    .join('\n');

  return {
    preset,
    prompt: [
      displayName ? `当前联系人：${displayName}` : '当前联系人：未命名',
      '',
      '最近聊天：',
      transcript || '（暂无可用聊天文本）',
      '',
      '请生成 3 条可以直接发送的中文回复，分别偏：自然直接、轻松推进、简短稳重。',
      '先回答对方真正的问题；不要突然升温、不要刻意冷淡、不要编造事实。',
      '只输出 JSON，格式：{"suggestions":[{"id":"natural","label":"自然直接","text":"..."},{"id":"light","label":"轻松推进","text":"..."},{"id":"brief","label":"简短稳重","text":"..."}]}'
    ].join('\n')
  };
}

function responseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

function parseSuggestions(raw) {
  const clean = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try { parsed = JSON.parse(match[0]); } catch { return []; }
  }

  const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  return list
    .map((item, index) => ({
      id: safeText(item?.id, 32) || `reply-${index + 1}`,
      label: safeText(item?.label, 32) || `回复 ${index + 1}`,
      text: safeText(item?.text, 1000).trim()
    }))
    .filter((item) => item.text)
    .slice(0, 3);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      service: 'MiYou quick reply',
      model: DEFAULT_MODEL,
      autoSend: false,
      suggestionCount: 3
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'OPENAI_API_KEY_NOT_CONFIGURED' }));
  }

  const body = await readJsonBody(req);
  const { preset, prompt } = buildInput(body);

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        instructions: preset,
        input: prompt,
        max_output_tokens: 700
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('miyou_quick_reply_upstream_error', upstream.status, data?.error?.type || 'unknown');
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: 'AI_UPSTREAM_ERROR' }));
    }

    const suggestions = parseSuggestions(responseText(data));
    if (!suggestions.length) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: 'AI_RESPONSE_PARSE_FAILED' }));
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      model: data?.model || DEFAULT_MODEL,
      suggestions
    }));
  } catch (error) {
    console.error('miyou_quick_reply_error', error?.message || String(error));
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: 'AI_REQUEST_FAILED' }));
  }
}
