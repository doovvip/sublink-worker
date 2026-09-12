import { ProxyParser } from '../src/parsers/ProxyParser.js';
export const config = { runtime: 'nodejs' };
const ALLOWED = new Set(['45.78.78.177','sub.jsysubtoken.com','47.242.128.61','8.148.151.188']);
export default async function handler(req,res){
  try{
    const u=new URL(req.url,`https://${req.headers.host||'localhost'}`);
    const src=u.searchParams.get('src');
    if(!src) return res.status(400).send('Missing src');
    const t=new URL(src); if(!ALLOWED.has(t.hostname)) return res.status(403).send('Not allowed');
    const parsed=await ProxyParser.parse(src,u.searchParams.get('ua')||'Clash.Meta');
    const arr=[]; flatten(parsed,arr);
    const seen=new Set(), lines=[];
    for(const p of arr){
      if(p?.type!=='anytls'||!p.server||!p.server_port||p.password==null) continue;
      let s=`anytls, ${p.server}, ${p.server_port}, password=${esc(p.password)}`;
      if(p.tls?.server_name) s+=`, sni=${p.tls.server_name}`;
      if(p.tls?.insecure) s+=', skip-cert-verify=true';
      if(Array.isArray(p.tls?.alpn)&&p.tls.alpn.length) s+=`, alpn=${p.tls.alpn.join(';')}`;
      if(seen.has(s)) continue; seen.add(s);
      lines.push(`${clean(p.tag||'AnyTLS')} = ${s}`);
    }
    res.setHeader('content-type','text/plain; charset=utf-8'); res.setHeader('cache-control','no-store'); res.setHeader('x-anytls-count',String(lines.length));
    return res.status(200).send(lines.join('\n'));
  }catch(e){return res.status(400).send(`Error: ${e?.message||String(e)}`)}
}
function flatten(v,out){if(!v)return;if(Array.isArray(v)){for(const x of v)flatten(x,out);return;}if(v&&typeof v==='object'){if(Array.isArray(v.proxies)){for(const x of v.proxies)flatten(x,out);return;}if(v.type)out.push(v)}}
function clean(v){return String(v).replace(/[\r\n]/g,' ').replace(/,/g,'，').replace(/=/g,'＝').trim()||'AnyTLS'}
function esc(v){const s=String(v);return /[ ,]/.test(s)?`\"${s.replace(/\"/g,'\\\"')}\"`:s}
