/* Taobao parallel product-detail probe for Surge v1.10.0.
 * Multi-path aggregator: request/response/url probes run in parallel, noisy IM/log routes are deprioritized.
 * Safe diagnostics only: never expose body/header values.
 */
const req=$request||{}, resp=typeof $response!=='undefined'?$response:null;
const src=resp||req, body=src&&src.body, url=String(req.url||''), headers=(src&&src.headers)||req.headers||{};
const PANEL='taobao_analytics_probe_panel', LAST='taobao_analytics_probe_last', ROUTES='taobao_probe_routes_v110';
function h(n){n=n.toLowerCase();for(const k of Object.keys(headers))if(k.toLowerCase()===n)return String(headers[k]||'');return''}
function text(v){if(typeof v==='string')return v;if(v&&typeof v==='object'&&typeof v.length==='number'){try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}}return''}
function dec(s){let x=String(s||'');for(let i=0;i<6;i++){try{const y=decodeURIComponent(x.replace(/\+/g,'%20'));if(y===x)break;x=y}catch(_){break}}return x}
const raw=text(body), all=dec(url+'\n'+raw), found=[];
const rs=[/(?:itemId|item_id|itemid|numId|num_id|auctionId|auction_id|goodsId|goods_id|skuId|sku_id|targetId|target_id|contentId|content_id)[\s\"'=:,%&\\/]+(?:%22|%27|[\"'])?(\d{8,20})/ig,/(?:[?&]|%26)(?:id|itemId|item_id|numId|auctionId)(?:=|%3D)(\d{8,20})/ig,/(?:item\.taobao\.com|detail\.tmall\.com)[^\s\"']{0,1000}?(?:\?|&|%26)(?:id|itemId|item_id)(?:=|%3D)(\d{8,20})/ig,/\"(?:itemId|item_id|numId|auctionId|goodsId|skuId)\"\s*:\s*\"?(\d{8,20})/ig];
for(const r of rs){let m;while((m=r.exec(all)))if(!found.includes(m[1]))found.push(m[1])}
let host='',path='/';try{const u=new URL(url);host=u.hostname;path=u.pathname||'/'}catch(_){host=url.replace(/^https?:\/\//,'').split('/')[0]};path=path.slice(0,240);
let pairs=0,json=0,nums=0;for(const p of dec(raw).split('&').slice(0,600)){const i=p.indexOf('=');if(i>0){pairs++;const v=dec(p.slice(i+1));if(/(?:^|\D)\d{8,20}(?:\D|$)/.test(v))nums++;try{JSON.parse(v);json++}catch(_){}}}
const phase=resp?'response':'request',ct=(h('content-type').split(';')[0]||'unknown'),now=Date.now();
function scoreRoute(s){s=s.toLowerCase();let n=0;if(/detail|getdetail|item|auction|product|trade|sku|buy|price/.test(s))n+=8;if(/mtop\.taobao\.detail|mtop\.tmall\.detail/.test(s))n+=12;if(/mercurry|mercury|content/.test(s))n+=2;if(/wireless|amp2|\.im\.|group|chat|message|msg|push|log|track|ut\.|adash|stat|recommend/.test(s))n-=10;if(nums>0)n+=2;if(json>0)n+=1;if(raw.length>1000)n+=1;if(found.length)n+=50;return n}
const score=scoreRoute(host+path);let routes=[];try{routes=JSON.parse($persistentStore.read(ROUTES)||'[]')}catch(_){};routes=Array.isArray(routes)?routes:[];
const key=phase+'|'+host+path;routes=routes.filter(x=>x&&x.key!==key);routes.push({key,phase,host,path,score,nums,json,bodyLen:raw.length,ids:found.slice(0,5),time:now});routes=routes.filter(x=>now-Number(x.time||0)<120000).sort((a,b)=>(b.ids.length-a.ids.length)||(b.score-a.score)||(b.time-a.time)).slice(0,10);try{$persistentStore.write(JSON.stringify(routes),ROUTES)}catch(_){}
const best=routes[0]||{phase,host,path,score,nums,json,bodyLen:raw.length,ids:found};const lines=routes.slice(0,5).map((x,i)=>`${i+1}. S${x.score} ${x.phase==='response'?'RESP':'REQ'} ${x.host}${x.path.slice(0,95)}${x.ids.length?' ID='+x.ids.join('/'):' nums='+x.nums}`).join('\n');
const stamp=new Date().toLocaleString();const msg=`时间: ${stamp}\n${best.ids&&best.ids.length?'✅ 命中候选商品ID: '+best.ids.join(' / '):'并行抓取中｜已自动过滤 IM/日志噪音'}\n最佳链路: S${best.score} ${best.phase}\n${best.host}${best.path}\n\nTop 5 候选:\n${lines||'等待请求…'}`;
try{$persistentStore.write(JSON.stringify({message:msg,ids:!!(best.ids&&best.ids.length),time:now}),PANEL)}catch(_){}
if(found.length){let last={};try{last=JSON.parse($persistentStore.read(LAST)||'{}')}catch(_){};const sig='id|'+found.join(',')+'|'+host+path;if(last.sig!==sig){try{$persistentStore.write(JSON.stringify({sig,time:now}),LAST)}catch(_){}try{$notification.post('淘宝并行详情探测','命中商品ID',found.slice(0,5).join(' / '))}catch(_){}}}
$done({});
