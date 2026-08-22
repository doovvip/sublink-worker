function b64decode(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function safeName(value, fallback = 'TanZou') {
  try { value = decodeURIComponent(value || ''); } catch {}
  return String(value || fallback).replace(/[\r\n,]/g, ' ').trim() || fallback;
}

function quote(value) {
  const s = String(value ?? '');
  return /[",]/.test(s) ? `\"${s.replace(/\"/g, '\\\"')}\"` : s;
}

function parseSS(uri) {
  try {
    const raw = uri.slice(5);
    const [beforeHash, hash = ''] = raw.split('#');
    let body = beforeHash;
    let plugin = '';
    const q = body.indexOf('?');
    if (q >= 0) { plugin = body.slice(q + 1); body = body.slice(0, q); }

    let method, password, host, port;
    if (body.includes('@')) {
      const at = body.lastIndexOf('@');
      const user = body.slice(0, at);
      const server = body.slice(at + 1);
      const cred = user.includes(':') ? user : b64decode(user);
      const colon = cred.indexOf(':');
      if (colon < 1) return null;
      method = cred.slice(0, colon);
      password = cred.slice(colon + 1);
      const m = server.match(/^\[([^\]]+)\]:(\d+)$|^([^:]+):(\d+)$/);
      if (!m) return null;
      host = m[1] || m[3]; port = m[2] || m[4];
    } else {
      const decoded = b64decode(body);
      const m = decoded.match(/^([^:]+):([^@]+)@\[([^\]]+)\]:(\d+)$|^([^:]+):([^@]+)@([^:]+):(\d+)$/);
      if (!m) return null;
      method = m[1] || m[5]; password = m[2] || m[6]; host = m[3] || m[7]; port = m[4] || m[8];
    }

    const parts = [`${safeName(hash)} = ss`, host, port, `encrypt-method=${method}`, `password=${quote(password)}`, 'udp-relay=true'];
    if (plugin) {
      const params = new URLSearchParams(plugin);
      const p = params.get('plugin');
      if (p) parts.push(`obfs=${quote(p)}`);
    }
    return parts.join(', ');
  } catch { return null; }
}

function parseTrojan(uri) {
  try {
    const u = new URL(uri);
    const parts = [`${safeName(u.hash.slice(1))} = trojan`, u.hostname, u.port || '443', `password=${quote(decodeURIComponent(u.username))}`];
    const sni = u.searchParams.get('sni') || u.searchParams.get('peer');
    if (sni) parts.push(`sni=${sni}`);
    const allow = u.searchParams.get('allowInsecure') || u.searchParams.get('allow_insecure');
    if (allow === '1' || allow === 'true') parts.push('skip-cert-verify=true');
    parts.push('udp-relay=true');
    return parts.join(', ');
  } catch { return null; }
}

function parseVmess(uri) {
  try {
    const obj = JSON.parse(b64decode(uri.slice(8)));
    if (!obj.add || !obj.port || !obj.id) return null;
    const parts = [`${safeName(obj.ps)} = vmess`, obj.add, obj.port, `username=${obj.id}`, 'vmess-aead=true'];
    if (String(obj.tls || '').toLowerCase() === 'tls') parts.push('tls=true');
    const sni = obj.sni || obj.host;
    if (sni && obj.tls) parts.push(`sni=${sni}`);
    if (String(obj.net || '').toLowerCase() === 'ws') {
      parts.push('ws=true');
      if (obj.path) parts.push(`ws-path=${quote(obj.path)}`);
      if (obj.host) parts.push(`ws-headers=Host:${obj.host}`);
    }
    parts.push('udp-relay=true');
    return parts.join(', ');
  } catch { return null; }
}

function normalizeSubscription(text) {
  let source = String(text || '').trim();
  if (!source.includes('://') && !source.includes(' = ')) {
    try {
      const decoded = b64decode(source).trim();
      if (decoded) source = decoded;
    } catch {}
  }
  return source;
}

export async function handleTanzouSubscription(request, env = process.env) {
  const url = new URL(request.url);
  const configuredKey = String(env.TANZOU_ACCESS_KEY || '');
  const suppliedKey = String(url.searchParams.get('key') || '');
  if (!configuredKey || suppliedKey !== configuredKey) {
    return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  const upstreamUrl = String(env.TANZOU_SUB_URL || '').trim();
  if (!upstreamUrl) {
    return new Response('TANZOU_SUB_URL is not configured', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Shadowrocket/2.2.63',
        'Accept': 'text/plain,*/*'
      },
      redirect: 'follow'
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const source = normalizeSubscription(await upstream.text());
    const lines = [];
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      let converted = null;
      if (line.startsWith('ss://')) converted = parseSS(line);
      else if (line.startsWith('trojan://')) converted = parseTrojan(line);
      else if (line.startsWith('vmess://')) converted = parseVmess(line);
      else if (/^[^=]+\s*=\s*(ss|vmess|trojan),/i.test(line)) converted = line;
      if (converted) lines.push(converted);
    }

    if (!lines.length) {
      return new Response('No supported TanZou nodes found', { status: 422, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    };
    const userInfo = upstream.headers.get('subscription-userinfo');
    if (userInfo) headers['subscription-userinfo'] = userInfo;
    return new Response(`${lines.join('\n')}\n`, { status: 200, headers });
  } catch (error) {
    return new Response(`TanZou conversion failed: ${error?.message || String(error)}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}
