const DEFAULT_PRESET = '根据聊天上下文自动判断关系、情绪、主动程度和暧昧程度，生成自然、符合当前关系阶段的回复；不要突然升温，也不要无故冷淡。';
const MAX_MESSAGES = 30;
const MAX_CHARS = 1500;

function text(value, limit = MAX_CHARS) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function directionOf(message = {}) {
  if (message.direction === 'incoming' || message.direction === 'outgoing') {
    return message.direction;
  }

  const isSend = message.isSend ?? message.fromMe;
  if (isSend === true || isSend === 1 || isSend === '1') return 'outgoing';
  if (isSend === false || isSend === 0 || isSend === '0') return 'incoming';
  return 'unknown';
}

export function buildQuickReplyRequest({
  contact = {},
  messages = [],
  preset = DEFAULT_PRESET,
  presetId = 'default'
} = {}) {
  const recent = Array.isArray(messages)
    ? messages
        .slice(-MAX_MESSAGES)
        .map((message) => ({
          id: message?.id ?? message?.msgId ?? message?.localId ?? null,
          direction: directionOf(message),
          timestamp: message?.timestamp ?? null,
          content: text(message?.content)
        }))
        .filter((message) => message.content && message.direction !== 'unknown')
    : [];

  return {
    contact: {
      wxid: text(contact?.wxid, 256),
      displayName: text(contact?.displayName, 256),
      remarkName: text(contact?.remarkName, 256)
    },
    presetId: text(presetId, 128),
    preset: text(preset, 2500) || DEFAULT_PRESET,
    messages: recent,
    count: 3
  };
}

export async function requestQuickReplies(endpoint, options = {}) {
  if (!endpoint) throw new Error('quick_reply_endpoint_required');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildQuickReplyRequest(options))
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `quick_reply_http_${response.status}`);
  }

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  return suggestions
    .map((item, index) => ({
      id: item?.id || `reply-${index + 1}`,
      label: text(item?.label, 32) || `回复 ${index + 1}`,
      text: text(item?.text, 1000)
    }))
    .filter((item) => item.text)
    .slice(0, 3);
}

// Native MiYou passes its existing text-field setter here.
// This only fills the draft. It never triggers WeChat's send action.
export function applyQuickReply(setInputText, suggestion) {
  if (typeof setInputText !== 'function') throw new Error('set_input_text_required');
  const replyText = text(suggestion?.text, 1000);
  if (!replyText) return false;
  setInputText(replyText);
  return true;
}

export const QUICK_REPLY_BEHAVIOR = {
  reuseNativeToolbar: true,
  reuseNativeList: true,
  insertToInput: true,
  autoSend: false,
  regenerate: true,
  suggestionCount: 3
};
