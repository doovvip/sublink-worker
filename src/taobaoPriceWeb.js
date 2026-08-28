const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>淘宝历史比价</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;background:#f5f5f7;margin:0;color:#111}.wrap{max-width:720px;margin:0 auto;padding:28px 18px 60px}.card{background:#fff;border-radius:22px;padding:22px;box-shadow:0 8px 30px rgba(0,0,0,.06)}h1{font-size:28px;margin:0 0 8px}.sub{color:#666;margin:0 0 22px;line-height:1.5}textarea{box-sizing:border-box;width:100%;min-height:120px;border:1px solid #ddd;border-radius:16px;padding:14px;font-size:16px;resize:vertical;background:#fafafa}button,.fallback{box-sizing:border-box;width:100%;border:0;border-radius:16px;padding:15px;font-size:17px;font-weight:700;margin-top:14px;background:#111;color:#fff;text-align:center;text-decoration:none;display:block}.fallback{background:#f0f0f2;color:#111;display:none}.result{margin-top:18px;display:none}.row{padding:12px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;gap:16px}.row:last-child{border-bottom:0}.k{color:#666}.v{text-align:right;font-weight:600}.status{margin-top:14px;color:#666;font-size:14px}.tip{margin-top:16px;color:#888;font-size:13px;line-height:1.5}</style></head><body><div class="wrap"><div class="card"><h1>淘宝历史比价</h1><p class="sub">复制淘宝/天猫商品链接，粘贴后直接查询。</p><textarea id="q" placeholder="粘贴淘宝分享文本或商品链接"></textarea><button id="go">查询历史价格</button><a id="fallback" class="fallback" target="_blank" rel="noopener">打开原始历史价格页</a><div id="status" class="status"></div><div id="result" class="result"></div><div class="tip">自动尝试比价狗、慢慢买、HisPrice；HisPrice 只读取历史价格图数据，避免把页面按钮/版本号误识别为价格。</div></div></div><script>const q=document.getElementById('q'),go=document.getElementById('go'),st=document.getElementById('status'),box=document.getElementById('result'),fb=document.getElementById('fallback');go.onclick=async()=>{const text=q.value.trim();if(!text){st.textContent='先粘贴商品链接';return}go.disabled=true;st.textContent='正在查询…';box.style.display='none';box.innerHTML='';fb.style.display='none';try{const r=await fetch('/api/taobao-price?q='+encodeURIComponent(text));const d=await r.json();if(d.fallbackUrl){fb.href=d.fallbackUrl;fb.style.display='block'}if(!r.ok||!d.ok)throw new Error(d.message||'查询失败');const rows=[['商品ID',d.itemId||'-'],['当前/参考价',d.currentPrice!=null?'¥'+d.currentPrice:'-'],['历史最低',d.lowestPrice!=null?'¥'+d.lowestPrice:'-'],['最低价日期',d.lowestDate||'-'],['历史最高',d.highestPrice!=null?'¥'+d.highestPrice:'-'],['数据源',d.source||'-']];box.innerHTML=rows.map(x=>'<div class="row"><span class="k">'+x[0]+'</span><span class="v">'+String(x[1]).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))+'</span></div>').join('');box.style.display='block';st.textContent=d.note||'查询完成'}catch(e){st.textContent='自动查询失败：'+e.message+(fb.style.display==='block'?'，可打开原始历史价格页':'')}finally{go.disabled=false}};</script></body></html>`;

export async function handleTaobaoPricePage(request) {
  const url = new URL(request.url);
  if (url.pathname === '/taobao-price') return new Response(PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  if (url.pathname !== '/api/taobao-price') return null;
  const input=url.searchParams.get('q')||'';
  if(!input.trim()) return json({ok:false,message:'缺少商品链接'},400);
  try{
    const resolved=await resolveItem(input);
    if(!resolved.itemId) return json({ok:false,message:'没有识别到淘宝/天猫商品ID'},400);
    const canonical=`https://detail.tmall.com/item.htm?id=${resolved.itemId}`;
    const fallbackUrl=`https://www.hisprice.com/his.php?hisurl=${encodeURIComponent(canonical)}`;
    const providers=[queryBijiago,queryManmanbuy,queryHisPrice];
    const errors=[];
    for(const provider of providers){
      try{const result=await provider(canonical);if(result?.ok)return json({ok:true,itemId:resolved.itemId,canonical,fallbackUrl,...result});}
      catch(error){errors.push(String(error?.message||error));}
    }
    return json({ok:false,itemId:resolved.itemId,canonical,fallbackUrl,message:'历史价格源暂时没有返回有效数据',detail:errors.slice(0,3)},502);
  }catch(error){return json({ok:false,message:String(error?.message||error)},500);}
}

async function resolveItem(input){
  const firstUrl=extractUrl(input)||input.trim();let itemId=extractId(input)||extractId(firstUrl);if(itemId)return{itemId};
  let current=firstUrl;
  for(let i=0;i<6;i++){
    const response=await fetch(current,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}});
    const location=response.headers.get('location');
    if(location){current=new URL(location,current).toString();itemId=extractId(current);if(itemId)return{itemId};continue;}
    const text=await response.text();itemId=extractId(text);if(itemId)return{itemId};break;
  }
  return{itemId:''};
}

async function queryBijiago(itemUrl){
  const cookieResp=await fetch(`https://browser.bijiago.com/extension?ac=bdextPermanent&format=json&version=${Date.now()}`,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'}});
  const setCookie=cookieResp.headers.get('set-cookie')||'';const cookieParts=[];
  for(const name of['gwdang_permanent_id','gwdang_permanent_cpt']){const m=setCookie.match(new RegExp(`${name}=([^;,\\s]+)`,'i'));if(m)cookieParts.push(`${name}=${m[1]}`);}
  const api=`https://browser.bijiago.com/extension/price_towards?url=${encodeURIComponent(itemUrl)}&format=jsonp&union=union_bijiago&from_device=bijiago&version=${Date.now()}`;
  const response=await fetch(api,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',Referer:itemUrl,Cookie:cookieParts.join('; ')}});
  if(!response.ok)return null;const data=parseJsonLike(await response.text());if(!data||!Array.isArray(data.store)||!data.store.length)return null;
  const store=data.store.length>1?data.store[1]:data.store[0];
  return{ok:true,source:'比价狗',currentPrice:normalizeCurrent(store.last_price),lowestPrice:toNumber(store.lowest),lowestDate:formatStamp(store.min_stamp),highestPrice:toNumber(store.highest),note:data?.analysis?.tip||''};
}

async function queryManmanbuy(itemUrl){
  const body=new URLSearchParams({methodName:'getHistoryTrend',p_url:itemUrl});
  const response=await fetch('https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8','User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 - mmbWebBrowse - ios'},body});
  if(!response.ok)return null;const data=parseJsonLike(await response.text());if(!data||data.ok!==1||!data.single)return null;
  const list=data?.PriceRemark?.ListPriceDetail||[];const high=list.map(x=>parsePrice(x?.Price)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
  return{ok:true,source:'慢慢买',currentPrice:null,lowestPrice:toNumber(data.single.lowerPriceyh),lowestDate:formatDotNetDate(data.single.lowerDateyh),highestPrice:Number.isFinite(high)?high:null,note:data?.PriceRemark?.Tip||''};
}

async function queryHisPrice(itemUrl){
  const url=`https://www.hisprice.com/his.php?hisurl=${encodeURIComponent(itemUrl)}`;
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Accept-Language':'zh-CN,zh;q=0.9'}});
  if(!response.ok)return null;
  const html=await response.text();
  const chart=parseHisPriceChart(html);
  if(!chart)return null;
  return{ok:true,source:'HisPrice',currentPrice:chart.currentPrice,lowestPrice:chart.lowestPrice,lowestDate:chart.lowestDate,highestPrice:chart.highestPrice,note:chart.count<=1?'HisPrice 当前只返回单点/有限历史数据':'HisPrice 历史价格图已直接读取'};
}

function parseHisPriceChart(html){
  const scripts=[...String(html||'').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  const candidates=[];
  for(const script of scripts){
    const looksLikeChart=/echarts|highcharts|series\s*:|data\s*:|历史价格|价格图/i.test(script);
    if(!looksLikeChart)continue;
    const arrayPatterns=[/data\s*:\s*(\[[\s\S]{1,20000}?\])/gi,/series\s*:\s*\[[\s\S]{0,2000}?data\s*:\s*(\[[\s\S]{1,20000}?\])/gi];
    for(const pattern of arrayPatterns){
      let m;
      while((m=pattern.exec(script))){
        const values=extractChartPrices(m[1]);
        if(values.length)candidates.push(values);
      }
    }
  }
  if(!candidates.length){
    const chartArea=String(html||'').match(/历史价格图[\s\S]{0,12000}/i)?.[0]||'';
    const axis=[...chartArea.matchAll(/(?:^|[>,'"\s])(\d{2,6}(?:\.\d{1,2})?)(?=[<,'"\s]|$)/g)].map(m=>Number(m[1])).filter(validPrice);
    if(axis.length){
      const freq=new Map();for(const n of axis)freq.set(n,(freq.get(n)||0)+1);
      const plausible=[...freq.keys()].filter(n=>n>=10);
      if(plausible.length)candidates.push(plausible);
    }
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>scorePriceSeries(b)-scorePriceSeries(a));
  const prices=candidates[0].filter(validPrice);
  if(!prices.length)return null;
  const lowestPrice=round2(Math.min(...prices));
  const highestPrice=round2(Math.max(...prices));
  const currentPrice=round2(prices[prices.length-1]);
  return{currentPrice,lowestPrice,highestPrice,lowestDate:'',count:prices.length};
}

function extractChartPrices(raw){
  const out=[];const s=String(raw||'');
  for(const m of s.matchAll(/(?:^|[,\[]\s*)(?:\[[^\]]{0,100}?,\s*)?["']?(\d{2,6}(?:\.\d{1,2})?)["']?\s*(?:\]|,|$)/g)){const n=Number(m[1]);if(validPrice(n))out.push(n);}
  for(const m of s.matchAll(/(?:value|price|y)\s*[:=]\s*["']?(\d{2,6}(?:\.\d{1,2})?)/gi)){const n=Number(m[1]);if(validPrice(n))out.push(n);}
  return out;
}
function validPrice(n){return Number.isFinite(Number(n))&&Number(n)>=10&&Number(n)<1000000;}
function scorePriceSeries(a){if(!a?.length)return 0;const spread=Math.max(...a)-Math.min(...a);return a.length*10+(spread>=0?1:0);}
function extractUrl(text){const match=String(text||'').match(/https?:\/\/[^\s\u3000]+/i);return match?match[0].replace(/[)\]}>，。；;！!]+$/g,''):'';}
function extractId(text){const s=decodeURIComponentSafe(String(text||'')).replace(/&amp;/g,'&');const patterns=[/[?&]id=(\d{6,})/i,/[?&]itemId=(\d{6,})/i,/["']itemId["']\s*[:=]\s*["']?(\d{6,})/i,/\b(\d{10,15})\b/];for(const pattern of patterns){const match=s.match(pattern);if(match)return match[1];}return'';}
function decodeURIComponentSafe(value){try{return decodeURIComponent(value);}catch{return value;}}
function parseJsonLike(text){const s=String(text||'').trim();try{return JSON.parse(s);}catch{}const start=s.indexOf('{'),end=s.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(s.slice(start,end+1));}catch{}}return null;}
function normalizeCurrent(value){const n=toNumber(value);if(n==null)return null;return n>=1000?round2(n/100):n;}
function parsePrice(value){const m=String(value||'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function toNumber(value){const n=Number(value);return Number.isFinite(n)?round2(n):null;}
function round2(n){return Math.round(n*100)/100;}
function formatStamp(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return'';return formatDate(new Date(n*1000));}
function formatDotNetDate(value){const match=String(value||'').match(/Date\((\d+)/);return match?formatDate(new Date(Number(match[1]))):'';}
function formatDate(d){if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
