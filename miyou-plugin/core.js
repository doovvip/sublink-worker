export const MIYOU_VERSION = '0.6.0';

export function normalizeDirection(message, identity = {}) {
  const raw = message?.direction ?? message?.isSend ?? message?.fromMe ?? null;

  if (raw === 'incoming' || raw === 'outgoing') return raw;
  if (raw === true || raw === 1 || raw === '1') return 'outgoing';
  if (raw === false || raw === 0 || raw === '0') return 'incoming';

  const sender = message?.senderWxid || message?.sender || null;
  if (sender && identity.selfWxid && sender === identity.selfWxid) return 'outgoing';
  if (sender && identity.peerWxid && sender === identity.peerWxid) return 'incoming';

  return 'unknown';
}

export function verifyIdentity({ selfWxid, peerWxid, messages = [], ocr = null } = {}) {
  let score = 0;
  const verifiedBy = [];

  if (selfWxid) {
    score += 0.35;
    verifiedBy.push('self_wxid');
  }
  if (peerWxid) {
    score += 0.25;
    verifiedBy.push('peer_wxid');
  }

  const normalized = messages.map((m) => normalizeDirection(m, { selfWxid, peerWxid }));
  const knownCount = normalized.filter((d) => d !== 'unknown').length;
  if (messages.length && knownCount / messages.length >= 0.8) {
    score += 0.25;
    verifiedBy.push('db_direction');
  }

  if (ocr?.enabled && ['incoming', 'outgoing'].includes(ocr?.bubbleDirection)) {
    const latestKnown = [...normalized].reverse().find((d) => d !== 'unknown');
    if (!latestKnown || latestKnown === ocr.bubbleDirection) {
      score += 0.15;
      verifiedBy.push('ocr_0.3');
    } else {
      score -= 0.25;
      verifiedBy.push('ocr_conflict');
    }
  }

  return {
    selfWxid: selfWxid || null,
    peerWxid: peerWxid || null,
    confidence: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
    verifiedBy
  };
}

export function scanUnrepliedForContact({ contact, messages = [], identity, minConfidence = 0.55 } = {}) {
  const verified = identity?.confidence != null
    ? identity
    : verifyIdentity({
        selfWxid: identity?.selfWxid,
        peerWxid: contact?.wxid || identity?.peerWxid,
        messages,
        ocr: identity?.ocr
      });

  const valid = messages
    .map((message) => ({
      ...message,
      normalizedDirection: normalizeDirection(message, verified)
    }))
    .filter((message) => message.normalizedDirection !== 'unknown')
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

  if (!valid.length || verified.confidence < minConfidence) {
    return {
      contact,
      waitingReply: false,
      uncertain: true,
      reason: valid.length ? 'identity_confidence_low' : 'no_valid_messages',
      identityConfidence: verified.confidence,
      verifiedBy: verified.verifiedBy
    };
  }

  const last = valid[valid.length - 1];
  let consecutiveIncoming = 0;
  for (let i = valid.length - 1; i >= 0; i -= 1) {
    if (valid[i].normalizedDirection !== 'incoming') break;
    consecutiveIncoming += 1;
  }

  return {
    contact,
    waitingReply: last.normalizedDirection === 'incoming',
    uncertain: false,
    consecutiveIncoming,
    lastDirection: last.normalizedDirection,
    lastMessageAt: last.timestamp || null,
    lastMessagePreview: typeof last.content === 'string' ? last.content.slice(0, 160) : null,
    identityConfidence: verified.confidence,
    verifiedBy: verified.verifiedBy
  };
}

export function scanAllUnreplied(conversations = [], options = {}) {
  return conversations
    .map((conversation) => scanUnrepliedForContact({
      contact: conversation.contact,
      messages: conversation.messages,
      identity: conversation.identity,
      minConfidence: options.minConfidence ?? 0.55
    }))
    .filter((item) => item.waitingReply)
    .sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0));
}
