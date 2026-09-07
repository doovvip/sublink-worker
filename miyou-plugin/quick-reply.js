const MAX_MESSAGES = 30;
const MAX_CHARS = 6000;

export function buildQuickReplyContext({ contact, messages = [], preset = '' } = {}) {
  const recent = messages.slice(-MAX_MESSAGES).map((m) => ({
    direction: m?.direction ?? null,
    sender: m?.sender ?? m?.senderWxid ?? null,
    content: typeof m?.content === 'string' ? m.content.slice(0, 1000) : ''
  }));

  let used = 0;
  const compact = [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const size = recent[i].content.length;
    if (used + size > MAX_CHARS) break;
    compact.unshift(recent[i]);
    used += size;
  }

  return {
    contact: {
      wxid: contact?.wxid ?? null,
      name: contact?.remarkName || contact?.displayName || null
    },
    preset: String(preset || '').slice(0, 2000),
    messages: compact,
    instruction: '根据上下文生成3条自然、符合当前关系阶段的回复。只返回回复文本，不自动发送。'
  };
}

export function normalizeQuickReplies(input) {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((item) => typeof item === 'string' ? item.trim() : String(item?.text || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

export const QUICK_REPLY_BEHAVIOR = {
  reuseNativeToolbar: true,
  reuseNativeList: true,
  insertToInput: true,
  autoSend: false,
  suggestionCount: 3
};
