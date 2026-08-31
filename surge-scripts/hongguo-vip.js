// 红果短剧 Surge 实验脚本：VIP 响应特征修改
// 仅在命中典型 VIP/会员字段时修改，避免无条件重写整个响应。

const body = $response.body || "";
let obj;
try { obj = JSON.parse(body); } catch (e) { $done({}); }

let changed = false;
const vipKeys = new Set([
  "is_vip","isVip","vip","vip_user","vipUser","is_vip_user","isVipUser",
  "has_vip","hasVip","is_any_vip","isAnyVip","can_read_short_story","canReadShortStory",
  "has_vip_short_series_privilege","hasVipShortSeriesPrivilege"
]);
const expireKeys = new Set(["expire_time","expireTime","vip_expire_time","vipExpireTime","end_time","endTime"]);

function walk(v, depth=0) {
  if (!v || typeof v !== "object" || depth > 12) return;
  for (const k of Object.keys(v)) {
    const val = v[k];
    if (vipKeys.has(k)) {
      if (typeof val === "boolean") { v[k] = true; changed = true; }
      else if (typeof val === "number") { v[k] = 1; changed = true; }
      else if (typeof val === "string" && /^(0|false|no|none)?$/i.test(val)) { v[k] = "1"; changed = true; }
    }
    if (expireKeys.has(k)) {
      if (typeof val === "string") { v[k] = "2099-12-31 23:59:59"; changed = true; }
      else if (typeof val === "number") { v[k] = 4102444799; changed = true; }
    }
    if (val && typeof val === "object") walk(val, depth + 1);
  }
}

walk(obj);
$done(changed ? { body: JSON.stringify(obj) } : {});
