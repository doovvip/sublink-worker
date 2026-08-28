/* Taobao share payload structure probe for Surge v1.16.0
 * Focus: h-adashx.ut.taobao.com/upload request body structure.
 * Privacy: displays field names/types/lengths only; never displays raw values, cookies or tokens.
 */
const req=$request||{}, resp=typeof $response!=='undefined'?$response:null;
const src=resp||req, body=src&&src.body, url=String(req.url||''), headers=(src&&src.headers)||req.headers||{};
const PANEL='taobao_analytics_probe_panel', LAST='taobao_share_probe_last';
function text(v){if(typeof v==='string')return v;if(v&&typeof v==='object'&&typeof v.length==='number'){try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}}return''}
function dec(s){let x=String(s||'');for(let i=0;i<7;i++){try{const y=decodeURIComponent(x.replace(/\+/g,'%20'));if(y===x)break;x=y}catch(_){break}}return x}
function hp(s){try{const u=new URL(s);return[u.hostname,u.pathname||'/']}catch(_){const a=s.replace(/^https?:\/\//,'').split('/');return[a.shift()||'', '/'+a.join('/')]}}
function typeOfValue(v){const s=String(v||'');if(!s)return'empty';if(/^\{.*\}$|^\[.*\]$/s.test(s))return'json?';if(/^https?:\/\//i.test(s))return'url';if(/^[A-Za-z0-9+\/_=-]{80,}$/.test(s))return'encoded/base64?';if(/^\d+$/.test(s))return'number';if(/%[0-9A-Fa-f]{2}/.test(s))return'urlencoded';return'text'}
function safeKey(k){return String(k||'').replace(/[^A-Za-z0-9_.:-]/g,'?').slice(0,80)}
function summarizeForm(raw){const arr=[];for(const p of String(raw||'').split('&').slice(0,100)){const i=p.indexOf('=');if(i<=0)continue;let k=p.slice(0,i),v=p.slice(i+1);try{k=decodeURIComponent(k)}catch(_){};let d=dec(v);arr.push({k:safeKey(k),t:typeOfValue(d),len:d.length})}return arr}
function collectJsonKeys(v,out,prefix,depth){if(depth>4||v==null)return;if(Array.isArray(v)){out.push(`${prefix||'$'}[](${v.length})`);for(const x of v.slice(0,3))collectJsonKeys(x,out,prefix+'[]',depth+1);return}if(typeof v==='object'){for(const k of Object.keys(v).slice(0,80)){const x=v[k], p=(prefix?prefix+'.':'')+safeKey(k);if(x==null)out.push(p+':null');else if(typeof x==='object')out.push(p+':'+(Array.isArray(x)?'array':'object'));else out.push(p+':'+typeof x+'('+String(x).length+')');collectJsonKeys(x,out,p,depth+1)}}}
const [host,path]=hp(url), raw=text(body), decoded=dec(raw), phase=resp?'RESP':'REQ';
const ids=[];const pats=[/(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|goodsId|goods_id|skuId|sku_id|targetId|target_id|itemNumId|item_num_id)[\s\"'=:,%&\\/]+(?:%22|%27|[\"'])?(\d{8,20})/ig,/(?:[?&]|%26)(?:id|itemId|item_id|numId|auctionId|itemNumId)(?:=|%3D)(\d{8,20})/ig];for(const r of pats){let m;while((m=r.exec(dec(url+'\n'+raw))))if(!ids.includes(m[1]))ids.push(m[1])}
const form=summarizeForm(decoded), jsonKeys=[];let jsonOk=false;try{const j=JSON.parse(decoded);jsonOk=true;collectJsonKeys(j,jsonKeys,'',0)}catch(_){}
for(const f of form){if(f.t==='json?'){const idx=decoded.split('&').find(x=>{const i=x.indexOf('=');if(i<=0)return false;let k=x.slice(0,i);try{k=decodeURIComponent(k)}catch(_){};return safeKey(k)===f.k});if(idx){const i=idx.indexOf('=');try{const j=JSON.parse(dec(idx.slice(i+1)));collectJsonKeys(j,jsonKeys,f.k,0)}catch(_){}}}}
const keyLines=form.slice(0,16).map(x=>`${x.k}: ${x.t}(${x.len})`);const jsonLines=[...new Set(jsonKeys)].slice(0,18);const suspicious=form.filter(x=>/share|link|url|item|goods|auction|detail|target|page|scene|spm|args?|param|data|payload|event/i.test(x.k)).slice(0,10).map(x=>x.k);
const msg=`时间: ${new Date().toLocaleString()}\n${ids.length?'✅ 候选商品ID: '+ids.join(' / '):'已拆解分享埋点结构｜未直接发现商品ID'}\n${phase} ${host}${path}\nbody=${raw.length} decoded=${decoded.length} formPairs=${form.length} jsonRoot=${jsonOk?'yes':'no'}\n\n可疑字段名:\n${suspicious.length?suspicious.join(', '):'未发现明显 share/url/item 字段'}\n\nForm字段结构:\n${keyLines.join('\n')||'无'}${jsonLines.length?'\n\n嵌套JSON结构:\n'+jsonLines.join('\n'):''}`;
try{$persistentStore.write(JSON.stringify({message:msg,ids:ids.length>0,time:Date.now()}),PANEL)}catch(_){}
if(ids.length){let last={};try{last=JSON.parse($persistentStore.read(LAST)||'{}')}catch(_){};const sig=ids.join(',');if(last.sig!==sig){try{$persistentStore.write(JSON.stringify({sig,time:Date.now()}),LAST)}catch(_){}try{$notification.post('淘宝历史比价','已抓到商品ID',ids.slice(0,5).join(' / '))}catch(_){}}}
$done({});
