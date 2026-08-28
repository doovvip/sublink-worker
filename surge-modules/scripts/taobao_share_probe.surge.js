/* Taobao share-route item ID probe for Surge v1.12.0
 * Different route: capture share/short-link/detail URLs and scan URL/body/selected headers.
 * Never displays cookies/tokens/raw body.
 */
const req=$request||{}, resp=typeof $response!=='undefined'?$response:null;
const src=resp||req, url=String(req.url||''), headers=(src&&src.headers)||req.headers||{}, body=src&&src.body;
const PANEL='taobao_analytics_probe_panel', LAST='taobao_share_probe_last';
function text(v){if(typeof v==='string')return v;if(v&&typeof v==='object'&&typeof v.length==='number'){try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}}return''}
function dec(s){let x=String(s||'');for(let i=0;i<8;i++){try{const y=decodeURIComponent(x.replace(/\+/g,'%20'));if(y===x)break;x=y}catch(_){break}}return x}
function pickHeaders(h){const out=[];for(const [k,v] of Object.entries(h||{})){const n=k.toLowerCase();if(/^(referer|location|origin|x-.*url|x-.*item|x-.*share)$/.test(n))out.push(String(v||''))}return out.join('\n')}
const raw=text(body), all=dec(url+'\n'+raw+'\n'+pickHeaders(headers));
const ids=[];function add(x){x=String(x||'');if(/^\d{8,20}$/.test(x)&&!ids.includes(x))ids.push(x)}
const rs=[
/(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|goodsId|goods_id|skuId|sku_id|shareItemId|share_item_id)[\s\"'=:,%&\\/]+(?:%22|%27|[\"'])?(\d{8,20})/ig,
/(?:[?&]|%26)(?:id|itemId|item_id|numId|auctionId|shareItemId)(?:=|%3D)(\d{8,20})/ig,
/(?:item\.taobao\.com|detail\.tmall\.com|a\.m\.taobao\.com|h5\.m\.taobao\.com)[^\s\"']{0,1200}?(?:\?|&|%26)(?:id|itemId|item_id|shareItemId)(?:=|%3D)(\d{8,20})/ig,
/\/i(\d{8,20})\.htm/ig,
/"(?:itemId|item_id|numId|auctionId|goodsId|skuId|shareItemId)"\s*:\s*"?(\d{8,20})/ig
];
for(const r of rs){let m;while((m=r.exec(all)))add(m[1])}
let host='',path='/';try{const u=new URL(url);host=u.hostname;path=(u.pathname||'/')+(u.search||'')}catch(_){host=url.replace(/^https?:\/\//,'').split('/')[0]}
const phase=resp?'RESP':'REQ', stamp=new Date().toLocaleString();
let msg='';
if(ids.length){msg=`时间: ${stamp}\n✅ 已从分享链路抓到商品ID\nID=${ids.slice(0,3).join(' / ')}\n${phase} ${host}${path.slice(0,150)}\n下一步可直接接历史价格查询`}
else{msg=`时间: ${stamp}\n分享链路已命中，但暂未发现商品ID\n${phase} ${host}${path.slice(0,150)}\n请在淘宝商品页点一次“分享”即可`}
try{$persistentStore.write(JSON.stringify({message:msg,ids:ids.length>0,time:Date.now()}),PANEL)}catch(_){}
if(ids.length){let old='';try{old=$persistentStore.read(LAST)||''}catch(_){};const sig=ids.join(',');if(old!==sig){try{$persistentStore.write(sig,LAST)}catch(_){};try{$notification.post('淘宝商品ID','已抓到',ids.slice(0,3).join(' / '))}catch(_){}}}
$done({});
