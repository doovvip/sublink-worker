/* Taobao short-link historical price resolver for Surge v1.14.0
 * Flow: intercept e.tb.cn / m.tb.cn / tb.cn -> resolve redirects -> extract numeric item id -> query Manmanbuy history endpoint -> write Surge panel.
 * No clipboard/Shortcut dependency.
 */
const PANEL='taobao_analytics_probe_panel';
const LAST='taobao_shortlink_history_last';
const req=$request||{};
const resp=typeof $response!=='undefined'?$response:null;
const startUrl=String(req.url||'');

function text(v){
  if(typeof v==='string') return v;
  if(v&&typeof v==='object'&&typeof v.length==='number'){
    try{return new TextDecoder('utf-8').decode(v)}catch(_){try{return Array.from(v).map(x=>String.fromCharCode(x)).join('')}catch(__){}}
  }
  return '';
}
function dec(s){
  let x=String(s||'');
  for(let i=0;i<6;i++){
    try{const y=decodeURIComponent(x.replace(/\+/g,'%20')); if(y===x) break; x=y}catch(_){break}
  }
  return x;
}
function header(obj,name){
  if(!obj) return '';
  const hs=obj.headers||obj;
  name=name.toLowerCase();
  if(Array.isArray(hs)){
    for(const h of hs) if(h&&String(h.field||'').toLowerCase()===name) return String(h.value||'');
    return '';
  }
  for(const k of Object.keys(hs||{})) if(k.toLowerCase()===name) return String(hs[k]||'');
  return '';
}
function extractId(input){
  const s=dec(String(input||''));
  const rs=[
    /(?:[?&#]|%26)(?:id|itemId|item_id|itemid|num_iid|numId|auctionId)(?:=|%3D)(\d{8,20})/i,
    /(?:item\.taobao\.com\/item\.htm|detail\.tmall\.com\/item\.htm)[^\s"']{0,1200}?(?:[?&#]|%26)(?:id|itemId|item_id)(?:=|%3D)(\d{8,20})/i,
    /["'](?:itemId|item_id|itemid|num_iid|numId|auctionId|goodsId)["']\s*[:=]\s*["']?(\d{8,20})/i,
    /(?:itemId|item_id|itemid|num_iid|numId|auctionId|goodsId)[^0-9]{1,16}(\d{8,20})/i
  ];
  for(const r of rs){const m=r.exec(s); if(m) return m[1];}
  return '';
}
function writePanel(message,good){
  try{$persistentStore.write(JSON.stringify({message,ids:!!good,time:Date.now()}),PANEL)}catch(_){}
}
function fmtHistory(data,id){
  try{
    if(!data) return `商品ID: ${id}\n历史价格接口无返回`;
    if(Number(data.ok)===0) return `商品ID: ${id}\n历史价格暂不可用${data.msg?`\n${data.msg}`:''}`;
    const out=[`✅ 商品ID: ${id}`];
    if(data.single){
      if(data.single.lowerPriceyh!=null) out.push(`历史最低到手价: ¥${data.single.lowerPriceyh}`);
      if(data.single.currentPrice!=null) out.push(`当前参考价: ¥${data.single.currentPrice}`);
    }
    if(data.PriceRemark&&data.PriceRemark.Tip) out.push(String(data.PriceRemark.Tip));
    if(data.PriceRemark&&Array.isArray(data.PriceRemark.ListPriceDetail)){
      for(const x of data.PriceRemark.ListPriceDetail.slice(0,4)){
        if(x&&x.Name) out.push(`${x.Name}: ${x.Price||''} ${x.Date||''}`.trim());
      }
    }
    return out.join('\n');
  }catch(_){return `商品ID: ${id}\n历史价格已返回，但格式需要继续适配`;}
}
function queryHistory(id){
  const itemUrl=`https://item.taobao.com/item.htm?id=${id}`;
  const options={
    url:'https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded;charset=utf-8',
      'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios'
    },
    body:'methodName=getHistoryTrend&p_url='+encodeURIComponent(itemUrl),
    timeout:12
  };
  writePanel(`✅ 已解析商品ID: ${id}\n正在查询历史价格…`,true);
  $httpClient.post(options,(err,res,data)=>{
    if(err){writePanel(`✅ 商品ID: ${id}\n历史价格查询失败: ${String(err).slice(0,120)}`,true); return $done({});}
    let obj=null; try{obj=JSON.parse(String(data||''))}catch(_){}
    writePanel(fmtHistory(obj,id),true);
    return $done({});
  });
}
function resolve(url,depth,seen){
  if(depth>6 || !url || seen[url]){
    writePanel(`短链已命中，但暂未解析到商品ID\n最后地址: ${String(url||'').slice(0,180)}`,false);
    return $done({});
  }
  seen[url]=1;
  const direct=extractId(url); if(direct) return queryHistory(direct);
  $httpClient.get({url,headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'},timeout:10,'auto-redirect':false,'auto-cookie':false},(err,res,data)=>{
    if(err){writePanel(`短链解析失败\n${String(err).slice(0,140)}`,false); return $done({});}
    const loc=header(res,'location');
    const blob=[url,loc,text(data)].join('\n');
    const id=extractId(blob); if(id) return queryHistory(id);
    if(loc){
      let next=loc;
      try{next=new URL(loc,url).toString()}catch(_){}
      return resolve(next,depth+1,seen);
    }
    const body=text(data);
    const m=/(?:location\.href|location\.replace|url|targetUrl|redirectUrl)[\s"'=:]+(https?:[^\s"'<>]+)/i.exec(body)||/<meta[^>]+url=([^"'>\s]+)/i.exec(body);
    if(m){let next=dec(m[1].replace(/&amp;/g,'&')); try{next=new URL(next,url).toString()}catch(_){} return resolve(next,depth+1,seen);}
    writePanel(`短链已请求成功，但页面里未发现商品ID\n状态: ${res&&res.status||''}\n地址: ${url.slice(0,180)}`,false);
    return $done({});
  });
}

// If we are on a normal Taobao/Tmall landing URL, extract immediately.
const directId=extractId(startUrl+'\n'+(resp?header(resp,'location'):'')+'\n'+(resp?text(resp.body):''));
if(directId){
  queryHistory(directId);
}else if(/https?:\/\/(?:e\.|m\.)?tb\.cn\//i.test(startUrl)||/https?:\/\/tb\.cn\//i.test(startUrl)){
  writePanel(`已命中淘宝短链\n正在展开真实商品地址…`,false);
  resolve(startUrl,0,{});
}else{
  $done({});
}
