/* Taobao parallel product-detail probe for Surge v1.9.0.
 * Request/response/url probes share this script and keep only safe metadata.
 */
const req=$request||{}, resp=typeof $response!=='undefined'?$response:null;
const src=resp||req, body=src&&src.body, url=String(req.url||''), headers=(src&&src.headers)||req.headers||{};
const PANEL='taobao_analytics_probe_panel', LAST='taobao_analytics_probe_last';
function h(n){n=n.toLowerCase();for(const k of Object.keys(headers))if(k.toLowerCase()===n)return String(headers[k]||'');return''}
function text(v){if(typeof v==='string')return v;if(v&&typeof v==='object'&&typeof v.length==='number'){try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}}return''}
function dec(s){let x=String(s||'');for(let i=0;i<6;i++){try{const y=decodeURIComponent(x.replace(/\+/g,'%20'));if(y===x)break;x=y}catch(_){break}}return x}
const raw=text(body), all=dec(url+'\n'+raw), found=[];
const rs=[/(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|goodsId|goods_id|skuId|sku_id|targetId|target_id|contentId|content_id)[\s\"'=:,%&\\/]+(?:%22|%27|[\"'])?(\d{8,20})/ig,/(?:[?&]|%26)(?:id|itemId|item_id|numId|auctionId)(?:=|%3D)(\d{8,20})/ig,/(?:item\.taobao\.com|detail\.tmall\.com)[^\s\"']{0,1000}?(?:\?|&|%26)(?:id|itemId|item_id)(?:=|%3D)(\d{8,20})/ig,/\"(?:itemId|item_id|numId|auctionId|goodsId|skuId)\"\s*:\s*\"?(\d{8,20})/ig];
for(const r of rs){let m;while((m=r.exec(all)))if(!found.includes(m[1]))found.push(m[1])}
let host='',path='/';try{const u=new URL(url);host=u.hostname;path=u.pathname||'/'}catch(_){host=url.replace(/^https?:\/\//,'').split('/')[0]}
path=path.slice(0,220);let pairs=0,json=0,nums=0;for(const p of dec(raw).split('&').slice(0,600)){const i=p.indexOf('=');if(i>0){pairs++;const v=dec(p.slice(i+1));if(/(?:^|\D)\d{8,20}(?:\D|$)/.test(v))nums++;try{JSON.parse(v);json++}catch(_){}}}
const phase=resp?'response':'request',ct=(h('content-type').split(';')[0]||'unknown'),now=new Date().toLocaleString();
const msg=`时间: ${now}\n${found.length?'命中候选商品ID: '+found.slice(0,5).join(' / '):'并行详情探测已命中，暂未发现ID'}\nphase=${phase}\nhost=${host}\npath=${path}\nbodyLen=${raw.length} pairs=${pairs} json=${json} nums=${nums}\ncontent-type=${ct}`;
let old={};try{old=JSON.parse($persistentStore.read(PANEL)||'{}')}catch(_){};if(found.length||!old.ids){try{$persistentStore.write(JSON.stringify({message:msg,ids:found.length>0,time:Date.now()}),PANEL)}catch(_){}}
let last={};try{last=JSON.parse($persistentStore.read(LAST)||'{}')}catch(_){};const sig=(found[0]||'')+'|'+phase+'|'+host+path;if(last.sig!==sig||Date.now()-Number(last.time||0)>8000){try{$persistentStore.write(JSON.stringify({sig,time:Date.now()}),LAST)}catch(_){}try{$notification.post('淘宝并行详情探测',found.length?'命中商品ID':phase+' 已命中',found.length?found.slice(0,5).join(' / '):host+path)}catch(_){}}
$done({});
