export const config = { runtime: 'nodejs' };

const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_CONTEXT_ITEMS = 30;
const MAX_CONTEXT_CHARS = 12000;
const MAX_ITEM_CHARS = 700;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let raw = '';
  for await (const chunk of req) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (raw.length > 50000) break;
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function cleanText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

function compactContext(input) {
  const items = Array.isArray(input) ? input.slice(-MAX_CONTEXT_ITEMS) : [];
  const out = [];
  let used = 0;
  for (const item of items) {
    const text = cleanText(item, MAX_ITEM_CHARS);
    if (!text) continue;
    if (used + text.length > MAX_CONTEXT_CHARS) break;
    out.push(text);
    used += text.length;
  }
  return out;
}

function parseReplies(text) {
  const raw = cleanText(text, 4000);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed?.replies;
    if (Array.isArray(arr)) {
      return arr.map((v) => cleanText(v, 280)).filter(Boolean).slice(0, 3);
    }
  } catch {}

  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => line.slice(0, 280));
}

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return send(res, 200, {
      ok: true,
      service: 'miyou-ai',
      model: process.env.MIYOU_OPENAI_MODEL || DEFAULT_MODEL,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY)
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' });

  const expectedToken = process.env.MIYOU_BRIDGE_TOKEN || '';
  if (expectedToken) {
    const actualToken = String(req.headers['x-miyou-token'] || '');
    if (!actualToken || actualToken !== expectedToken) return send(res, 401, { error: 'Unauthorized' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return send(res, 503, { error: 'OPENAI_API_KEY not configured' });

  const body = await readJson(req);
  const context = compactContext(body?.context);
  if (!context.length) return send(res, 400, { error: 'No chat context' });

  const contact = cleanText(body?.contact, 160);
  const preset = cleanText(body?.preset, 1200) || '结合聊天上下文判断关系、情绪和氛围，生成自然、合适、不突兀的回复，保持我的说话风格。';

  const system = [
    '你是微信快捷回复助手。',
    preset,
    '只根据提供的聊天上下文生成回复，不编造未出现的事实。',
    '一次返回3条可直接发送的中文回复，语气略有差异，但都自然简短。',
    '不要解释，不要分析，不要加序号。',
    '严格输出JSON数组，例如：["回复1","回复2","回复3"]。'
  ].join('');

  const user = `${contact ? `当前联系人：${contact}\n` : ''}最近聊天：\n${context.join('\n')}`;
  const model = process.env.MIYOU_OPENAI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const started = Date.now();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        reasoning_effort: 'none',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return send(res, response.status, { error: json?.error?.message || 'OpenAI request failed' });
    }

    const text = json?.choices?.[0]?.message?.content || '';
    const replies = parseReplies(text);
    if (!replies.length) return send(res, 502, { error: 'Model returned no usable replies' });

    return send(res, 200, {
      replies,
      model,
      ms: Date.now() - started
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'AI request timeout' : 'AI request failed';
    return send(res, 502, { error: message });
  } finally {
    clearTimeout(timer);
  }
}
