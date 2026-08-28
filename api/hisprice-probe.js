export default async function handler(req, res) {
  try {
    const id = String(req.query?.id || '957929114177').replace(/\D/g, '');
    if (!id) return send(res, 400, { ok:false, message:'missing id' });

    const itemUrl = `https://detail.tmall.com/item.htm?id=${id}`;
    const pageUrl = `https://www.hisprice.com/his.php?hisurl=${encodeURIComponent(itemUrl)}`;
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
    const page = await fetch(pageUrl,{headers:{'User-Agent':ua,'Accept-Language':'zh-CN,zh;q=0.9'}});
    const html = await page.text();
    const hidden = extractInputs(html);
    const cookie = page.headers.get('set-cookie') || '';

    const reqid = pick(hidden,['reqid','reqId']);
    const baseCode = pick(hidden,['checkCodeId','checkCode','checkcode']);
    const checkCode = baseCode ? (baseCode.endsWith('P') ? baseCode : baseCode + 'P') : '';
    const ud = pick(hidden,['uid','ud','userid']);
    const qt = Date.now();
    const apiUrl = `https://www.hisprice.com/dm/ptinfo.php?ud=${encodeURIComponent(ud)}&reqid=${encodeURIComponent(reqid)}&flg=1&cd=${encodeURIComponent(checkCode)}&qt=${qt}&`;

    let apiResult = null;
    if (reqid && checkCode) {
      const body = new URLSearchParams({checkCode,con:itemUrl});
      const r = await fetch(apiUrl,{method:'POST',headers:{
        'User-Agent':ua,
        'Referer':pageUrl,
        'Origin':'https://www.hisprice.com',
        'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
        ...(cookie ? {'Cookie':cookie} : {})
      },body});
      const text = await r.text();
      apiResult = {status:r.status,contentType:r.headers.get('content-type')||'',length:text.length,text:text.slice(0,12000)};
    }

    return send(res,200,{ok:true,pageStatus:page.status,pageLength:html.length,hidden,derived:{reqid,baseCode,checkCode,ud,apiUrl},apiResult});
  } catch (e) { return send(res,500,{ok:false,message:String(e?.message||e)}); }
}

function extractInputs(html){
  const out={};
  for(const tag of String(html||'').match(/<input\b[^>]*>/gi)||[]){
    const id=(tag.match(/\bid=["']([^"']*)["']/i)||[])[1]||'';
    const name=(tag.match(/\bname=["']([^"']*)["']/i)||[])[1]||'';
    const value=(tag.match(/\bvalue=["']([^"']*)["']/i)||[])[1]||'';
    if(id) out[id]=value;
    if(name && !(name in out)) out[name]=value;
  }
  return out;
}
function pick(obj,keys){for(const k of keys){if(obj[k]) return String(obj[k]);} return '';}
function send(res,status,obj){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(obj));}
