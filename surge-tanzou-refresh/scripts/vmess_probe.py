#!/usr/bin/env python3
"""RC2.2 TanZou VMess probe. Secrets are read only from environment."""
import argparse, base64, hashlib, json, os, pathlib, socket, subprocess, tempfile, time, urllib.request
from datetime import datetime, timezone

COMPAT_HOST="xd-sh.mimonode-client.com"
CIPHERS=("aes-128-gcm","chacha20-ietf-poly1305")
INFO_WORDS=("剩余","流量","到期","过期","有效期","官网","公告","套餐")
def b64(s):
    s=s.strip().replace("-","+").replace("_","/")
    return base64.b64decode(s+"="*((4-len(s)%4)%4))
def parse_feed(text):
    raw=text.strip()
    if not raw.startswith("vmess://"): raw=b64(raw).decode()
    out=[]
    for line in raw.splitlines():
        line=line.strip()
        if not line.startswith("vmess://"): continue
        obj=json.loads(b64(line[8:].split("#",1)[0]))
        host=str(obj.get("add","")).lower().rstrip("."); name=str(obj.get("ps","TanZou"))
        if host=="access.tanzcloud.com" or any(x in name for x in INFO_WORDS): continue
        if str(obj.get("net","tcp"))!="tcp" or str(obj.get("tls","")) not in ("","none","false","0") or int(obj.get("aid",0))!=0: continue
        out.append({"name":name,"original_host":host,"port":int(obj["port"]),"uuid":str(obj["id"]),"original_cipher":str(obj.get("scy","auto"))})
    return out
def node_id(n): return hashlib.sha256(f'{n["name"]}\0{n["original_host"]}\0{n["port"]}'.encode()).hexdigest()[:20]
def combos(n):
    first=[(n["original_host"],n["original_cipher"])]
    rest=[(n["original_host"],c) for c in CIPHERS]+[(COMPAT_HOST,c) for c in CIPHERS]
    seen=set(); out=[]
    for x in first+rest:
        if x not in seen: seen.add(x); out.append(x)
    return out
def free_port():
    s=socket.socket(); s.bind(("127.0.0.1",0)); p=s.getsockname()[1]; s.close(); return p
def sing_cipher(c): return "auto" if c=="auto" else ("chacha20-poly1305" if c=="chacha20-ietf-poly1305" else c)
def test_combo(n,host,cipher,url,timeout):
    lp=free_port()
    cfg={"log":{"level":"error"},"inbounds":[{"type":"socks","tag":"probe-in","listen":"127.0.0.1","listen_port":lp}],
         "outbounds":[{"type":"vmess","tag":"probe-out","server":host,"server_port":n["port"],"uuid":n["uuid"],"security":sing_cipher(cipher),"alter_id":0}],
         "route":{"final":"probe-out"}}
    with tempfile.TemporaryDirectory(prefix="tanzou-probe-") as d:
        p=pathlib.Path(d)/"config.json"; p.write_text(json.dumps(cfg))
        proc=subprocess.Popen(["sing-box","run","-c",str(p)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            time.sleep(.15); start=time.monotonic()
            r=subprocess.run(["curl","-fsS","--socks5-hostname",f"127.0.0.1:{lp}","--max-time",str(timeout),"-o","/dev/null","-w","%{http_code}",url],capture_output=True,text=True,timeout=timeout+2)
            ms=round((time.monotonic()-start)*1000)
            return {"host":host,"cipher":cipher,"ok":r.returncode==0 and r.stdout.strip()=="204","latency_ms":ms}
        except subprocess.TimeoutExpired: return {"host":host,"cipher":cipher,"ok":False,"latency_ms":None}
        finally:
            proc.terminate()
            try: proc.wait(1)
            except subprocess.TimeoutExpired: proc.kill()
def load_cache(path):
    try: return json.loads(path.read_text())
    except (FileNotFoundError,json.JSONDecodeError): return {"version":1,"nodes":{}}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--source-file"); ap.add_argument("--cache",required=True); ap.add_argument("--url",default="https://cp.cloudflare.com/generate_204"); ap.add_argument("--timeout",type=int,default=8); a=ap.parse_args()
    if a.source_file: text=pathlib.Path(a.source_file).read_text()
    else:
        source=os.environ.get("TANZOU_SOURCE_URL")
        if not source: raise SystemExit("TANZOU_SOURCE_URL is required")
        with urllib.request.urlopen(source,timeout=20) as r: text=r.read(2_000_001).decode()
    nodes=parse_feed(text); path=pathlib.Path(a.cache); old=load_cache(path); result={"version":1,"generated_at":datetime.now(timezone.utc).isoformat(),"ttl_seconds":86400,"nodes":{}}
    successes=0
    for n in nodes:
        nid=node_id(n); prior=old.get("nodes",{}).get(nid,{})
        trials=[test_combo(n,h,c,a.url,a.timeout) for h,c in combos(n)]
        good=[x for x in trials if x["ok"]]
        if good:
            best=min(good,key=lambda x:(x["latency_ms"],0 if x["cipher"]=="aes-128-gcm" else 1)); failures=0; successes+=1
            last_success=result["generated_at"]
        else:
            best=prior.get("best"); failures=int(prior.get("consecutive_failures",0))+1; last_success=prior.get("last_success")
        result["nodes"][nid]={"name":n["name"],"original_host":n["original_host"],"best_host":best.get("host") if best else None,"port":n["port"],"cipher":best.get("cipher") if best else None,"last_success":last_success,"latency_ms":best.get("latency_ms") if best else prior.get("latency_ms"),"consecutive_failures":failures}
    path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_suffix(path.suffix+".tmp"); tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n"); os.replace(tmp,path)
    print(json.dumps({"real_nodes":len(nodes),"successful_nodes":successes,"failed_nodes":[v["name"] for v in result["nodes"].values() if v["consecutive_failures"]],"cache":str(path)},ensure_ascii=False))
if __name__=="__main__": main()
