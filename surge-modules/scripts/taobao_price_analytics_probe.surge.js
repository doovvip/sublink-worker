/* Taobao analytics item-id probe for Surge.
 * v1.4: extract item IDs from nested/encoded analytics payloads and URL-like values.
 * Stores only safe diagnostics and candidate numeric IDs.
 */
const req=$request||{}, body=req.body, raw=typeof body==='string'?body:'', url=String(req.url||''), headers=req.headers||{};
const KEY='taobao_analytics_probe_last', PANEL_KEY='taobao_analytics_probe_panel';
function header(n){n=n.toLowerCase();for(const k of Object.keys(headers))if(k.toLowerCase()===n)return String(headers[k]||'');return''}
function dec(s){let o=String(s||'');for(let i=0;i<6;i++){try{const d=decodeURIComponent(o.replace(/\+/g,'%20'));if(d===o)break;o=d}catch(_){break}}return o}
function add(out,v){v=String(v||'');if(/^\d{8,20}$/.test(v)&&!out.includes(v))out.push(v)}
function scanText(text,out){const variants=[String(text||''),dec(text||'')];const key='(?:itemId|item_id|itemid|numId|num_id|numid|auctionId|auction_id|auctionid|itemPk|item_pk|itemidstr|item_id_str|targetId|target_id|contentId|content_id|goodsId|goods_id|skuId|sku_id)';for(const s of variants){let m;const rs=[new RegExp(key+'[\\s\\"\\\'=:,%&\\\\/]+(\\d{8,20})','ig'),new RegExp('[?&]'+key+'=(\\d{8,20})(?:&|$)','ig'),/(?:item\.taobao\.com\/item\.htm\?[^\s"']*\bid=|detail\.tmall\.com\/item\.htm\?[^\s"']*\bid=)(\d{8,20})/ig,/\"id\"\s*:\s*\"?(\d{8,20})\"?/ig];for(const r of rs)while((m=r.exec(s)))add(out,m[1]);}}
function walk(v,out,depth){if(depth>6||v==null)return;if(typeof v==='string'){scanText(v,out);const d=dec(v);if(d!==v)scanText(d,out);try{const j=JSON.parse(d);walk(j,out,depth+1)}catch(_){}return}if(Array.isArray(v)){for(const x of v.slice(0,100))walk(x,out,depth+1);return}if(typeof v==='object'){for(const [k,val] of Object.entries(v)){if(/^(itemId|item_id|itemid|numId|num_id|numid|auctionId|auction_id|auctionid|goodsId|goods_id|skuId|sku_id|targetId|target_id|contentId|content_id|id)$/i.test(k))add(out,val);walk(val,out,depth+1)}}}
function parseForms(text,out){for(const src of [String(text||''),dec(text||'')]){for(const p of src.split('&').slice(0,200)){const i=p.indexOf('=');if(i>0){const k=dec(p.slice(0,i)),v=dec(p.slice(i+1));if(/item|auction|goods|sku|target|content|arg|param|data|payload|url/i.test(k))scanText(v,out);try{walk(JSON.parse(v),out,0)}catch(_){}}}try{walk(JSON.parse(src),out,0)}catch(_){}}}
const ids=[];scanText(raw+'\n'+url,ids);parseForms(raw,ids);walk(headers,ids,0);
const ct=(header('content-type').split(';')[0]||'unknown'), timestamp=new Date().toLocaleString();
const message=ids.length?`时间: ${timestamp}\n命中候选商品ID: ${ids.slice(0,5).join(' / ')}\nbody=${typeof body} len=${raw.length}\ncontent-type=${ct}`:`时间: ${timestamp}\n脚本已命中，但尚未提取商品ID\nbody=${typeof body} len=${raw.length}\ncontent-type=${ct}`;
try{$persistentStore.write(JSON.stringify({message,ids:ids.length>0,time:Date.now()}),PANEL_KEY)}catch(_){}
const sig=(ids.length?'id|':'diag|')+message.replace(/^时间:.*\n/,'');let last={};try{last=JSON.parse($persistentStore.read(KEY)||'{}')}catch(_){}const now=Date.now();if(last.sig!==sig||now-Number(last.time||0)>20000){try{$persistentStore.write(JSON.stringify({sig,time:now}),KEY)}catch(_){}try{$notification.post('淘宝商品ID探测',ids.length?'命中商品ID':'脚本已执行',ids.length?ids.slice(0,5).join(' / '):`len=${raw.length} ct=${ct}`)}catch(_){}}
$done({});
