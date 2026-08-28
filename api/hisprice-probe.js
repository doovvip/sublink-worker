export default async function handler(req, res) {
  try {
    const id = String(req.query?.id || '957929114177').replace(/\D/g, '');
    if (!id) return send(res, 400, { ok:false, message:'missing id' });

    const assets = {
      chart18:'https://www.hisprice.com/codejs/chart18.js?t=19',
      v:'https://www.hisprice.com/codejs/v.js',
      gs:'https://www.hisprice.com/codejs/gs_n1.js?t=1'
    };
    const assetResult={};
    for (const [name,target] of Object.entries(assets)) {
      const r=await fetch(target,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.hisprice.com/'}});
      const js=await r.text();
      assetResult[name]={status:r.status,length:js.length,endpoints:extractEndpoints(js),preinit:extractAround(js,'preinit',5000),checkCode:extractAround(js,'checkCode',3500),reqid:extractAround(js,'reqid',3500)};
    }

    const itemUrl = `https://detail.tmall.com/item.htm?id=${id}`;
    const target = `https://www.hisprice.com/his.php?hisurl=${encodeURIComponent(itemUrl)}`;
    const r = await fetch(target, { headers: {
      'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'Accept-Language':'zh-CN,zh;q=0.9'
    }});
    const html = await r.text();
    const hidden={};
    for(const m of html.matchAll(/<input\b[^>]*(?:id|name)=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi)) hidden[m[1]]=m[2];
    for(const m of html.matchAll(/<input\b[^>]*value=["']([^"']*)["'][^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi)) hidden[m[2]]=m[1];
    return send(res,200,{ok:true,pageStatus:r.status,pageLength:html.length,hidden,assets:assetResult,pagePreinit:extractAround(html,'preinit',3500),pageCheck:extractAround(html,'checkgen',3500)});
  } catch (e) { return send(res, 500, {ok:false,message:String(e?.message||e)}); }
}

function extractEndpoints(js){
  const out=[]; const s=String(js||'');
  const regexes=[
    /["']([^"']+\.(?:php|json)(?:\?[^"']*)?)["']/gi,
    /["'](\/[^"']*(?:check|price|his|chart|data|init|query)[^"']*)["']/gi,
    /(?:url\s*[:=]\s*)["']([^"']+)["']/gi
  ];
  for(const re of regexes) for(const m of s.matchAll(re)){const v=m[1];if(v&&v.length<500)out.push(v)}
  return [...new Set(out)].slice(0,250);
}
function extractAround(text,key,radius){
  const s=String(text||''), low=s.toLowerCase(), k=key.toLowerCase(); const out=[]; let start=0;
  while(out.length<12){const i=low.indexOf(k,start);if(i<0)break;out.push(s.slice(Math.max(0,i-radius),Math.min(s.length,i+radius)).replace(/\s+/g,' '));start=i+k.length;}
  return out;
}
function send(res,status,obj){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(obj));}
