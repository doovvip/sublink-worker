import { ProxyParser } from '../src/parsers/ProxyParser.js';

export const config = { runtime: 'nodejs' };

const ALLOWED_HOSTS = new Set([
  '45.78.78.177',
  'sub.jsysubtoken.com',
  '47.242.128.61',
  '8.148.151.188'
]);

const URI_RE = /^(ss|vmess|vless|trojan|hysteria|hysteria2|hy2|tuic):\/\//i;

export default async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const sources = requestUrl.searchParams.getAll('src').filter(Boolean);
    const ua = requestUrl.searchParams.get('ua') || 'Shadowrocket/2.2.66';
    const jsonMode = requestUrl.searchParams.get('format') === 'json';

    if (!sources.length) return send(res, 400, 'Missing src');
    if (sources.length > 8) return send(res, 400, 'Too many sources');

    for (const source of sources) validateSource(source);

    const objects = [];
    const errors = [];
    for (const source of sources) {
      try {
        const parsed = await ProxyParser.parse(source, ua);
        await flattenParsed(parsed, ua, objects, errors);
      } catch (error) {
        errors.push(error?.message || String(error));
      }
    }

    const { lines, skipped, duplicates } = convertAll(objects);
    if (jsonMode) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      return res.status(200).send(JSON.stringify({
        sources: sources.length,
        parsed: objects.length,
        usable: lines.length,
        skipped,
        duplicates,
        errors
      }, null, 2));
    }

    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-tanzou-parsed', String(objects.length));
    res.setHeader('x-tanzou-usable', String(lines.length));
    res.setHeader('x-tanzou-skipped', String(skipped));
    res.setHeader('x-tanzou-duplicates', String(duplicates));
    return res.status(200).send(lines.join('\n'));
  } catch (error) {
    return send(res, 400, `Error: ${error?.message || String(error)}`);
  }
}

function validateSource(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid source URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported source scheme');
  if (url.username || url.password) throw new Error('URL credentials are not allowed');
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error('Source host is not allow-listed');
}

async function flattenParsed(parsed, ua, out, errors, depth = 0) {
  if (!parsed || depth > 4) return;
  if (Array.isArray(parsed)) {
    for (const item of parsed) await flattenParsed(item, ua, out, errors, depth + 1);
    return;
  }
  if (typeof parsed === 'string') {
    const line = parsed.trim();
    if (!URI_RE.test(line)) return;
    try {
      const one = await ProxyParser.parse(line, ua);
      await flattenParsed(one, ua, out, errors, depth + 1);
    } catch (error) {
      errors.push(error?.message || String(error));
    }
    return;
  }
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.proxies)) {
      for (const proxy of parsed.proxies) await flattenParsed(proxy, ua, out, errors, depth + 1);
      return;
    }
    if (parsed.type && (parsed.server || parsed.tag)) out.push(parsed);
  }
}

function convertAll(objects) {
  const seenConnections = new Set();
  const usedNames = new Map();
  const lines = [];
  let skipped = 0;
  let duplicates = 0;

  for (const proxy of objects) {
    const converted = convertProxy(proxy);
    if (!converted) { skipped++; continue; }

    const eq = converted.indexOf('=');
    const suffix = eq >= 0 ? converted.slice(eq + 1).trim() : converted;
    if (seenConnections.has(suffix)) { duplicates++; continue; }
    seenConnections.add(suffix);

    let name = cleanName(proxy.tag || 'Node');
    const count = (usedNames.get(name) || 0) + 1;
    usedNames.set(name, count);
    if (count > 1) name = `${name} #${count}`;
    lines.push(`${name} = ${suffix}`);
  }
  return { lines, skipped, duplicates };
}

function cleanName(value) {
  return String(value || 'Node')
    .replace(/[\r\n]/g, ' ')
    .replace(/,/g, '，')
    .replace(/=/g, '＝')
    .trim() || 'Node';
}

function convertProxy(proxy) {
  const server = proxy.server;
  const port = proxy.server_port;
  if (!server || !port) return null;

  switch (proxy.type) {
    case 'shadowsocks': {
      if (!proxy.method || proxy.password == null) return null;
      return `x = ss, ${server}, ${port}, encrypt-method=${proxy.method}, password=${escapeValue(proxy.password)}, udp-relay=true`;
    }
    case 'vmess': {
      if (!proxy.uuid) return null;
      let s = `x = vmess, ${server}, ${port}, username=${proxy.uuid}`;
      if ((proxy.alter_id ?? 0) === 0) s += ', vmess-aead=true';
      if (proxy.tls?.enabled) {
        s += ', tls=true';
        if (proxy.tls.server_name) s += `, sni=${proxy.tls.server_name}`;
        if (proxy.tls.insecure) s += ', skip-cert-verify=true';
        if (Array.isArray(proxy.tls.alpn) && proxy.tls.alpn.length) s += `, alpn=${proxy.tls.alpn.join(';')}`;
      }
      if (proxy.transport?.type === 'ws') {
        s += `, ws=true, ws-path=${proxy.transport.path || '/'}`;
        const host = headerHost(proxy.transport.headers);
        if (host) s += `, ws-headers=Host:${host}`;
      } else if (proxy.transport?.type === 'grpc') {
        if (proxy.transport.service_name) s += `, grpc-service-name=${proxy.transport.service_name}`;
      } else if (proxy.transport?.type && !['tcp'].includes(proxy.transport.type)) {
        return null;
      }
      return s;
    }
    case 'trojan': {
      if (proxy.password == null) return null;
      let s = `x = trojan, ${server}, ${port}, password=${escapeValue(proxy.password)}`;
      s += tlsOptions(proxy.tls);
      if (proxy.transport?.type === 'ws') {
        s += `, ws=true, ws-path=${proxy.transport.path || '/'}`;
        const host = headerHost(proxy.transport.headers);
        if (host) s += `, ws-headers=Host:${host}`;
      } else if (proxy.transport?.type === 'grpc') {
        if (proxy.transport.service_name) s += `, grpc-service-name=${proxy.transport.service_name}`;
      } else if (proxy.transport?.type && proxy.transport.type !== 'tcp') {
        return null;
      }
      return s;
    }
    case 'hysteria2': {
      if (proxy.password == null) return null;
      let s = `x = hysteria2, ${server}, ${port}, password=${escapeValue(proxy.password)}`;
      s += tlsOptions(proxy.tls);
      return s;
    }
    case 'tuic': {
      // The repo parser models modern TUIC links as uuid + password, i.e. TUIC v5.
      if (proxy.uuid && proxy.password != null) {
        let s = `x = tuic-v5, ${server}, ${port}, uuid=${proxy.uuid}, password=${escapeValue(proxy.password)}`;
        s += tlsOptions(proxy.tls);
        return s;
      }
      if (proxy.token) {
        let s = `x = tuic, ${server}, ${port}, token=${escapeValue(proxy.token)}`;
        s += tlsOptions(proxy.tls);
        return s;
      }
      return null;
    }
    default:
      // VLESS/Reality and any protocol not native to Surge are intentionally skipped.
      return null;
  }
}

function tlsOptions(tls) {
  if (!tls) return '';
  let s = '';
  if (tls.server_name) s += `, sni=${tls.server_name}`;
  if (tls.insecure) s += ', skip-cert-verify=true';
  if (Array.isArray(tls.alpn) && tls.alpn.length) s += `, alpn=${tls.alpn.join(';')}`;
  return s;
}

function headerHost(headers) {
  if (!headers || typeof headers !== 'object') return '';
  const value = headers.host ?? headers.Host;
  return Array.isArray(value) ? value[0] : value || '';
}

function escapeValue(value) {
  const s = String(value);
  return /[ ,]/.test(s) ? `\"${s.replace(/\"/g, '\\\"')}\"` : s;
}

function send(res, status, text) {
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  return res.status(status).send(text);
}
