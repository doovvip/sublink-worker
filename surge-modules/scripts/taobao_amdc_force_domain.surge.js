/* Taobao AMDC targeted fallback helper for Surge v1.11.0
 * Goal: remove direct-IP dispatch only for core Taobao MTop gateways so the app can fall back to normal hostnames.
 * Diagnostic/candidate use only.
 */
const req=$request||{}, resp=typeof $response!=='undefined'?$response:null;
const targets=new Set(['trade-acs.m.taobao.com','acs.m.taobao.com']);
function dec(s){try{return decodeURIComponent(String(s||'').replace(/\+/g,'%20'))}catch(_){return String(s||'')}}
function enc(s){return encodeURIComponent(String(s)).replace(/%20/g,'+')}
function parseForm(s){const out=[];for(const p of String(s||'').split('&')){if(!p)continue;const i=p.indexOf('=');out.push(i<0?[dec(p),'']:[dec(p.slice(0,i)),dec(p.slice(i+1))])}return out}
function formString(pairs){return pairs.map(([k,v])=>enc(k)+'='+enc(v)).join('&')}
function b64decode(input){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';let str=String(input||'').replace(/[^A-Za-z0-9+/=]/g,''),out='',i=0;while(i<str.length){const e1=chars.indexOf(str.charAt(i++)),e2=chars.indexOf(str.charAt(i++)),e3=chars.indexOf(str.charAt(i++)),e4=chars.indexOf(str.charAt(i++));const c1=(e1<<2)|(e2>>4),c2=((e2&15)<<4)|(e3>>2),c3=((e3&3)<<6)|e4;out+=String.fromCharCode(c1);if(e3!==64&&e3!==-1)out+=String.fromCharCode(c2);if(e4!==64&&e4!==-1)out+=String.fromCharCode(c3)}try{return decodeURIComponent(escape(out))}catch(_){return out}}
function b64encode(input){let s;try{s=unescape(encodeURIComponent(String(input)))}catch(_){s=String(input)}const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';let out='',i=0;while(i<s.length){const c1=s.charCodeAt(i++),c2=s.charCodeAt(i++),c3=s.charCodeAt(i++);let e1=c1>>2,e2=((c1&3)<<4)|(c2>>4),e3=((c2&15)<<2)|(c3>>6),e4=c3&63;if(isNaN(c2))e3=e4=64;else if(isNaN(c3))e4=64;out+=chars[e1]+chars[e2]+chars[e3]+chars[e4]}return out}
if(!resp){let body=String(req.body||'');if(body){const pairs=parseForm(body);let changed=false;for(const pair of pairs){if(pair[0]==='domain'){const arr=String(pair[1]||'').split(/\s+/).filter(Boolean),next=arr.filter(x=>!targets.has(x));if(next.length!==arr.length){pair[1]=next.join(' ');changed=true}}}if(changed){$done({body:formString(pairs)});return}}
$done({});
}else{
let body=String(resp.body||''),obj=null,encoded=false;try{obj=JSON.parse(body)}catch(_){try{obj=JSON.parse(b64decode(body));encoded=true}catch(__){}}
if(obj&&Array.isArray(obj.dns)){let changed=false;for(const d of obj.dns){if(d&&targets.has(String(d.host||''))&&Array.isArray(d.ips)&&d.ips.length){d.ips=[];changed=true}}if(changed){const out=JSON.stringify(obj);$done({body:encoded?b64encode(out):out});return}}
$done({});
}
