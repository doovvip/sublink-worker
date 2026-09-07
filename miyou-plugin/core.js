export const MIYOU_VERSION = '0.6.1';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function messageOrder(message) {
  return [
    asNumber(message?.timestamp),
    asNumber(message?.localId ?? message?.local_id ?? message?.msgId ?? message?.id)
  ];
}

export function normalizeDirection(message, identity = {}) {
  const explicit = message?.direction;
  if (explicit === 'incoming' || explicit === 'outgoing') return explicit;

  const isSend = message?.isSend ?? message?.fromMe;
  if (isSend === true || isSend === 1 || isSend === '1') return 'outgoing';
  if (isSend === false || isSend === 0 || isSend === '0') return 'incoming';

  const senderWxid = message?.senderWxid ?? message?.sender ?? null;
  if (senderWxid && identity?.selfWxid && senderWxid === identity.selfWxid) return 'outgoing';
  if (senderWxid && identity?.peerWxid && senderWxid === identity.peerWxid) return 'incoming';

  return 'unknown';
}

export function verifyIdentity({ selfWxid, peerWxid } = {}) {
  return {
    selfWxid: selfWxid || null,
    peerWxid: peerWxid || null,
    source: 'db',
    trusted: Boolean(selfWxid || peerWxid)
  };
}

export function scanUnrepliedForContact({ contact, messages = [], identity = {} } = {}) {
  const dbIdentity = verifyIdentity({
    selfWxid: identity?.selfWxid,
    peerWxid: contact?.wxid || identity?.peerWxid
  });

  const normalized = messages
    .map((message) => ({
      ...message,
      normalizedDirection: normalizeDirection(message, dbIdentity)
    }))
    .sort((a, b) => {
      const [at, ai] = messageOrder(a);
      const [bt, bi] = messageOrder(b);
      return at - bt || ai - bi;
    });

  if (!normalized.length) {
    return {
      contact,
      waitingReply: false,
      uncertain: true,
      reason: 'no_messages',
      identity: dbIdentity
    };
  }

  const last = normalized[normalized.length - 1];
  if (last.normalizedDirection === 'unknown') {
    return {
      contact,
      waitingReply: false,
      uncertain: true,
      reason: 'latest_direction_unknown',
      identity: dbIdentity,
      lastMessageAt: last.timestamp || null
    };
  }

  let consecutiveIncoming = 0;
  if (last.normalizedDirection === 'incoming') {
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      if (normalized[i].normalizedDirection !== 'incoming') break;
      consecutiveIncoming += 1;
    }
  }

  return {
    contact,
    waitingReply: last.normalizedDirection === 'incoming',
    uncertain: false,
    consecutiveIncoming,
    lastDirection: last.normalizedDirection,
    lastMessageAt: last.timestamp || null,
    lastMessagePreview: typeof last.content === 'string' ? last.content.slice(0, 160) : null,
    identity: dbIdentity
  };
}

export function scanAllUnreplied(conversations = []) {
  return conversations
    .map((conversation) => scanUnrepliedForContact({
      contact: conversation.contact,
      messages: conversation.messages,
      identity: conversation.identity
    }))
    .filter((item) => item.waitingReply)
    .sort((a, b) => asNumber(b.lastMessageAt) - asNumber(a.lastMessageAt));
}
