export default async function handler(req, res) {
  try {
    const id = String(req.query?.id || '957929114177').replace(/\D/g, '');
    if (!id) return send(res, 400, { ok:false, message:'missing id' });
    const itemUrl = `https://detail.tmall.com/item.htm?id=${id}`;
    const target = `https://www.hisprice.com/his.php?hisurl=${encodeURIComponent(itemUrl)}`;
    const r = await fetch(target, { headers: {
      'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'Accept-Language':'zh-CN,zh;q=0.9'
    }});
    const html = await r.text();
    const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>absolutize(m[1], target));
    const ajaxLike = [...html.matchAll(/["']([^"']*(?:ajax|api|price|history|trend|chart)[^"']*)["']/gi)]
      .map(m=>m[1]).filter(s=>s && s.length<300).slice(0,120);
    const urls = [...html.matchAll(/https?:\/\/[^"'<>\s]+/gi)].map(m=>m[0]).filter(u=>/hisprice|price|api|ajax|chart|trend/i.test(u)).slice(0,120);
    const forms = [...html.matchAll(/<form\b[^>]*action=["']?([^"' >]+)/gi)].map(m=>absolutize(m[1], target));
    const snippets = [];
    for (const key of ['ajax','price','history','trend','chart','series','data']) {
      const i = html.toLowerCase().indexOf(key);
      if (i >= 0) snippets.push(html.slice(Math.max(0,i-220), Math.min(html.length,i+620)).replace(/\s+/g,' '));
    }
    return send(res, 200, {ok:true,status:r.status,length:html.length,scriptSrcs:[...new Set(scriptSrcs)],ajaxLike:[...new Set(ajaxLike)],urls:[...new Set(urls)],forms:[...new Set(forms)],snippets});
  } catch (e) { return send(res, 500, {ok:false,message:String(e?.message||e)}); }
}
function absolutize(v, base){ try{return new URL(v,base).toString()}catch{return v} }
function send(res,status,obj){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(obj));}
