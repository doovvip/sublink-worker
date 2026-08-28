/* Taobao analytics item-id probe for Surge.
 * v1.5: target confirmed h-adashx upload payloads; inspect body/url/headers safely.
 */
const req=$request||{}, body=req.body, raw=typeof body==='string'?body:'', url=String(req.url||''), headers=req.headers||{};
const KEY='taobao_analytics_probe_last', PANEL_KEY='taobao_analytics_probe_panel';
function header(n){n=n.toLowerCase();for(const k of Object.keys(headers))if(k.toLowerCase()===n)return String(headers[k]||'');return''}
function dec(s){let o=String(s||'');for(let i=0;i<8;i++){try{const d=decodeURIComponent(o.replace(/\+/g,'%20'));if(d===o)break;o=d}catch(_){break}}return o}
function add(out,v,label){v=String(v||'').trim();if(/^\d{8,20}$/.test(v)&&!out.some(x=>x.id===v))out.push({id:v,label:label||'candidate'})}
const keys='(?:itemId|item_id|itemid|item_id_str|numId|num_id|numid|auctionId|auction_id|auctionid|itemPk|item_pk|targetId|target_id|contentId|content_id|goodsId|goods_id|skuId|sku_id|itemIds|item_ids|itemidstr)';
function scanText(text,out,label){for(const s0 of [String(text||''),dec(text||'')]){const s=dec(s0);let m;const rs=[new RegExp(keys+'[\\s\\"\\\'=:,%&\\\\/]+(?:%22|%27|[\\"\\\'])?(\\d{8,20})','ig'),new RegExp('(?:[?&]|%26)'+keys+'(?:=|%3D)(\\d{8,20})','ig'),/(?:item\.taobao\.com|detail\.tmall\.com)[^\s"']{0,500}?(?:\?|&|%26)(?:id|itemId|item_id)(?:=|%3D)(\d{8,20})/ig,/(?:itemId|item_id|auctionId|numId)\\?"?\s*[:=]\s*\\?"?(\d{8,20})/ig];for(const r of rs)while((m=r.exec(s)))add(out,m[1],label)}}
function walk(v,out,depth,path){if(depth>8||v==null)return;if(typeof v==='string'){scanText(v,out,path);const d=dec(v);if(d!==v)scanText(d,out,path);try{walk(JSON.parse(d),out,depth+1,path+'.json')}catch(_){}return}if(Array.isArray(v)){for(let i=0;i<Math.min(v.length,150);i++)walk(v[i],out,depth+1,path+'['+i+']');return}if(typeof v==='object'){for(const [k,val] of Object.entries(v)){if(new RegExp('^'+keys+'$','i').test(k))add(out,val,path+'.'+k);walk(val,out,depth+1,path+'.'+k)}}}
function parseForms(text,out){for(const src0 of [String(text||''),dec(text||'')]){const src=dec(src0);for(const p of src.split('&').slice(0,400)){const i=p.indexOf('=');if(i>0){const k=dec(p.slice(0,i)),v=dec(p.slice(i+1));if(/item|auction|goods|sku|target|content|arg|param|data|payload|event|spm|url|log/i.test(k))scanText(v,out,'form.'+k);try{walk(JSON.parse(v),out,0,'form.'+k)}catch(_){}}}try{walk(JSON.parse(src),out,0,'body.json')}catch(_){}}}
const found=[];scanText(raw,found,'body');scanText(url,found,'url');parseForms(raw,found);walk(headers,found,0,'header');
const ids=found.map(x=>x.id), ct=(header('content-type').split(';')[0]||'unknown'), timestamp=new Date().toLocaleString();
const message=ids.length?`时间: ${timestamp}\n命中候选商品ID: ${ids.slice(0,5).join(' / ')}\n来源: ${found.slice(0,5).map(x=>x.label).join(' / ')}\nbody=${typeof body} len=${raw.length}\ncontent-type=${ct}`:`时间: ${timestamp}\n脚本已命中，但请求中未发现商品ID字段\nbody=${typeof body} len=${raw.length}\ncontent-type=${ct}\nhost=h-adashx.ut.taobao.com`;
try{$persistentStore.write(JSON.stringify({message,ids:ids.length>0,time:Date.now()}),PANEL_KEY)}catch(_){}
const sig=(ids.length?'id|':'diag|')+message.replace(/^时间:.*\n/,'');let last={};try{last=JSON.parse($persistentStore.read(KEY)||'{}')}catch(_){}const now=Date.now();if(last.sig!==sig||now-Number(last.time||0)>15000){try{$persistentStore.write(JSON.stringify({sig,time:now}),KEY)}catch(_){}try{$notification.post('淘宝商品ID探测',ids.length?'命中商品ID':'已命中埋点请求',ids.length?ids.slice(0,5).join(' / '):`未发现ID｜len=${raw.length}｜${ct}`)}catch(_){}}
$done({});
