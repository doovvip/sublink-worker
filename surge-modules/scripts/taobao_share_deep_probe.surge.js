/* Taobao share-chain deep probe for Surge v1.15.0
 * Focus: known share/copy-link chain and Taobao/Tmall share-related MTop traffic.
 * Extracts candidate item IDs from URL/body/response; never displays raw body/header values.
 */
const req=$request||{}, resp=typeof $response!=='undefined'?$response:null;
const src=resp||req, body=src&&src.body, url=String(req.url||''), headers=(src&&src.headers)||req.headers||{};
const PANEL='taobao_analytics_probe_panel', LAST='taobao_share_probe_last', ROUTES='taobao_share_routes_v115';
function text(v){if(typeof v==='string')return v;if(v&&typeof v==='object'&&typeof v.length==='number'){try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}}return''}
function dec(s){let x=String(s||'');for(let i=0;i<7;i++){try{const y=decodeURIComponent(x.replace(/\+/g,'%20'));if(y===x)break;x=y}catch(_){break}}return x}
function hostPath(s){try{const u=new URL(s);return [u.hostname,u.pathname||'/']}catch(_){const a=s.replace(/^https?:\/\//,'').split('/');return[a.shift()||'', '/'+a.join('/')]}}
const [host,path0]=hostPath(url), path=path0.slice(0,260), raw=text(body), decoded=dec(raw), all=dec(url+'\n'+raw+'\n'+decoded);
const ids=[];function add(x){x=String(x||'');if(/^\d{8,20}$/.test(x)&&!ids.includes(x))ids.push(x)}
const pats=[/(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|goodsId|goods_id|skuId|sku_id|targetId|target_id|itemNumId|item_num_id)[\s\"'=:,%&\\/]+(?:%22|%27|[\"'])?(\d{8,20})/ig,/(?:[?&]|%26)(?:id|itemId|item_id|numId|auctionId|itemNumId)(?:=|%3D)(\d{8,20})/ig,/(?:item\.taobao\.com|detail\.tmall\.com|e\.tb\.cn|m\.tb\.cn|tb\.cn)[^\s\"']{0,1400}?(?:id|itemId|item_id|numId)(?:=|%3D)(\d{8,20})/ig,/\"(?:itemId|item_id|numId|auctionId|goodsId|skuId|itemNumId)\"\s*:\s*\"?(\d{8,20})/ig];
for(const r of pats){let m;while((m=r.exec(all)))add(m[1])}
// Deep walk decoded form/JSON values, including nested JSON strings.
const vals=[];for(const p of decoded.split('&').slice(0,800)){const i=p.indexOf('=');if(i>0)vals.push(dec(p.slice(i+1)))}
function walk(v,d){if(d>5||v==null)return;if(typeof v==='string'){const s=dec(v);for(const r of pats){r.lastIndex=0;let m;while((m=r.exec(s)))add(m[1])}if((s[0]==='{'||s[0]==='[')&&s.length<500000){try{walk(JSON.parse(s),d+1)}catch(_){}}return}if(Array.isArray(v)){for(const x of v.slice(0,300))walk(x,d+1);return}if(typeof v==='object'){for(const k of Object.keys(v).slice(0,500)){const x=v[k];if(/^(?:itemId|item_id|numId|auctionId|goodsId|skuId|itemNumId)$/i.test(k))add(x);walk(x,d+1)}}}
for(const v of vals)walk(v,0);try{walk(JSON.parse(decoded),0)}catch(_){}
const phase=resp?'RESP':'REQ', lower=(host+path).toLowerCase();let score=0;if(/share|copy|link|detail|getdetail|item|auction|product|trade|sku|buy/.test(lower))score+=12;if(/h-adashx\.ut\.taobao\.com\/upload/.test(lower))score+=8;if(/mtop\.taobao\.(?:detail|share)|mtop\.tmall\.(?:detail|share)/.test(lower))score+=16;if(/wireless|\.im\.|chat|message|push|log|timestamp/.test(lower))score-=12;if(ids.length)score+=100;
let routes=[];try{routes=JSON.parse($persistentStore.read(ROUTES)||'[]')}catch(_){};routes=Array.isArray(routes)?routes:[];const now=Date.now(), key=phase+'|'+host+path;routes=routes.filter(x=>x&&x.key!==key&&now-Number(x.time||0)<180000);routes.push({key,phase,host,path,score,ids:ids.slice(0,5),len:raw.length,time:now});routes.sort((a,b)=>(b.ids.length-a.ids.length)||(b.score-a.score)||(b.time-a.time));routes=routes.slice(0,12);try{$persistentStore.write(JSON.stringify(routes),ROUTES)}catch(_){}
const best=routes[0]||{phase,host,path,score,ids};const top=routes.slice(0,5).map((x,i)=>`${i+1}. S${x.score} ${x.phase} ${x.host}${x.path.slice(0,90)}${x.ids.length?' ID='+x.ids.join('/'):' len='+x.len}`).join('\n');const msg=`时间: ${new Date().toLocaleString()}\n${best.ids.length?'✅ 商品ID: '+best.ids.join(' / '):'分享链路深挖中｜请点“分享→复制链接”一次'}\n最佳链路: S${best.score} ${best.phase}\n${best.host}${best.path}\n\nTop 5:\n${top||'等待请求…'}`;try{$persistentStore.write(JSON.stringify({message:msg,ids:best.ids.length>0,time:now}),PANEL)}catch(_){}
if(ids.length){let last={};try{last=JSON.parse($persistentStore.read(LAST)||'{}')}catch(_){};const sig=ids.join(',');if(last.sig!==sig){try{$persistentStore.write(JSON.stringify({sig,time:now}),LAST)}catch(_){}try{$notification.post('淘宝历史比价','已抓到商品ID',ids.slice(0,5).join(' / '))}catch(_){}}}
$done({});
