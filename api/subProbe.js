const ALLOWED_HOSTS = new Set(['45.78.78.177','sub.jsysubtoken.com','47.242.128.61','8.148.151.188']);
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const u = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const src = u.searchParams.get('src');
  const ua = u.searchParams.get('ua') || 'Shadowrocket/2.2.66';
  if (!src) return res.status(400).json({ok:false,error:'missing src'});
  let target;
  try { target = new URL(src); } catch { return res.status(400).json({ok:false,error:'bad url'}); }
  if (!ALLOWED_HOSTS.has(target.hostname)) return res.status(403).json({ok:false,error:'host not allowed'});
  try {
    const r = await fetch(target, {headers:{'User-Agent':ua}, redirect:'follow'});
    const text = await r.text();
    const t = text.trim();
    let shape = 'unknown';
    if (!t) shape='empty';
    else if (/^</.test(t)) shape='html';
    else if (/^[\[{]/.test(t)) shape='json-or-config';
    else if (/proxies\s*:/i.test(t)) shape='yaml';
    else if (/^(ss|vmess|vless|trojan|hy2|hysteria2|tuic):\/\//im.test(t)) shape='uri-list';
    else if (/^[A-Za-z0-9+/_=\-\s]+$/.test(t)) shape='base64-like';
    return res.status(200).json({ok:true,status:r.status,contentType:r.headers.get('content-type'),length:text.length,shape});
  } catch (e) {
    return res.status(200).json({ok:false,error:e?.message || String(e),cause:e?.cause?.message || e?.cause?.code || null});
  }
}
