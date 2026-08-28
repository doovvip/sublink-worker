/* Taobao product-detail probe for Surge v1.8.0.
 * Diagnostic only: inspect URL/body structure, never expose body values.
 */
const req=$request||{}, body=req.body, url=String(req.url||''), headers=req.headers||{};
const PANEL_KEY='taobao_analytics_probe_panel', LAST='taobao_analytics_probe_last';
function h(n){n=n.toLowerCase();for(const k of Object.keys(headers))if(k.toLowerCase()===n)return String(headers[k]||'');return''}
function text(v){if(typeof v==='string')return v;if(v&&typeof v==='object'&&typeof v.length==='number'){try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}}return''}
function dec(s){let x=String(s||'');for(let i=0;i<6;i++){try{const y=decodeURIComponent(x.replace(/\+/g,'%20'));if(y===x)break;x=y}catch(_){break}}return x}
const raw=text(body), all=dec(url+'\n'+raw); const found=[];
const patterns=[/(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|goodsId|goods_id|skuId|sku_id)[\s\"'=:,%&\\/]+(?:%22|%27|[\"'])?(\d{8,20})/ig,/(?:item\.taobao\.com|detail\.tmall\.com)[^\s\"']{0,800}?(?:\?|&|%26)(?:id|itemId|item_id)(?:=|%3D)(\d{8,20})/ig];
for(const r of patterns){let m;while((m=r.exec(all)))if(!found.includes(m[1]))found.push(m[1])}
let u={};try{u=new URL(url)}catch(_){} const host=u.hostname||String(url).replace(/^https?:\/\//,'').split('/')[0], path=(u.pathname||'/').slice(0,180);
let pairCount=0,jsonCount=0,longNums=0;for(const p of dec(raw).split('&').slice(0,500)){const i=p.indexOf('=');if(i>0){pairCount++;const v=dec(p.slice(i+1));if(/(?:^|\D)\d{8,20}(?:\D|$)/.test(v))longNums++;try{JSON.parse(v);jsonCount++}catch(_){}}}
const ct=(h('content-type').split(';')[0]||'unknown'); const now=new Date().toLocaleString();
const msg=found.length?`时间: ${now}\n命中候选商品ID: ${found.slice(0,5).join(' / ')}\nhost=${host}\npath=${path}\nbodyLen=${raw.length} pairs=${pairCount} json=${jsonCount} nums=${longNums}\ncontent-type=${ct}`:`时间: ${now}\n商品详情链路已命中，暂未发现ID\nhost=${host}\npath=${path}\nbodyLen=${raw.length} pairs=${pairCount} json=${jsonCount} nums=${longNums}\ncontent-type=${ct}`;
try{$persistentStore.write(JSON.stringify({message:msg,ids:found.length>0,time:Date.now()}),PANEL_KEY)}catch(_){}
let last={};try{last=JSON.parse($persistentStore.read(LAST)||'{}')}catch(_){} const sig=(found.length?'id|':'route|')+host+path+(found[0]||'');if(last.sig!==sig||Date.now()-Number(last.time||0)>10000){try{$persistentStore.write(JSON.stringify({sig,time:Date.now()}),LAST)}catch(_){}try{$notification.post('淘宝商品详情探测',found.length?'命中商品ID':'链路已命中',found.length?found.slice(0,5).join(' / '):host+path)}catch(_){}}
$done({});
