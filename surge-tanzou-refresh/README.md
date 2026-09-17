# TanZou → Surge 兼容服务（独立候选版）

版本：`1.1.0-rc.1`。**这是用于审查、测试和之后整目录迁移的候选实现；不是已经上线的修复，也不是原来 153 KB 打包文件的逐字复制。**

## 边界

只在 `surge-tanzou-refresh/` 目录内工作。不修改原 `sublink-worker` 根目录代码、不修改 MiYou/微信项目、不修改 R2、不修改永不动母版、不修改永不动模块。本项目没有自动发布脚本、没有 GitHub Actions 工作流、没有自动探测/切换线路的服务。

原始订阅输出与截图所示入口不一致是已观察到的差异，并不足以证明它是所有时段、所有客户端故障的唯一根因。这个兼容层是针对已验证差异的候选解决方法。

## 数据链路

机场动态 JSON VMess 订阅 → 原格式解码和字段验证 → 显式启用的地区入口兼容规则 → Surge 外部节点列表。

机场仍负责节点名称、端口、UUID 和节点增删。不含固定账户 UUID，不写死节点数量，不截取成香港/日本两个节点。旧资料中的“83 条”包含信息与占位记录，不等于 83 个真实可用代理。

兼容规则仅命中以下**完全相等的域名**：

`tanz-hk.kunlun01dns.com`、`tanz-jp.kunlun01dns.com`、`tanz-us.kunlun01dns.com`、`tanz-tw.kunlun01dns.com`、`tanz-kr.kunlun01dns.com`、`tanz-sg.kunlun01dns.com`。

同时要求 TCP、没有 TLS、alterId 为 0、不是流量信息。启用后把这类节点入口替换为 `TANZOU_COMPAT_HOST`，使用 Surge 的 `chacha20-ietf-poly1305` 名称，保留原名称/端口/UUID，输出 AEAD。

**board、access、信息条目、未知域名、TLS/WS 节点不被入口规则改写。**回环和未指定地址占位记录按原契约过滤；信息记录保留原转换形式，但不计入“真实代理节点存在”的判断。按原端点去重，避免 board 与普通地区共用端口时误合并。所有普通地区的节点都参与转换，不能把两个联网样本误当作全部节点。

## 与现有服务兼容的接口

- `GET /private/live-tanzou.list?token=<现有私有token>`：合法请求返回节点列表。
- 缺少/错误 token、缺少密文环境变量、未知路径：404，不返回秘密。
- 已鉴权但方法不是 GET：405。
- 上游失败、超时、空正文、格式损坏、不支持的协议/传输、没有真实代理节点：502，不返回 200 空列表。
- `/health`：只证明函数处理器可响应，不测 VMess，也不证明手机恢复。
- 所有结果 `private, no-store`。没有最后成功列表缓存，不自动替换来源，不加入第三方公共转换服务。

鉴权保持恢复包中已核实的格式：`TANZOU_ENCRYPTED_SOURCE = base64url(12字节IV).base64url(AES-GCM密文及16字节标签)`；密钥为 `SHA-256(现有token)`。候选实现用 Node 原生 decipher 解封，测试用旧契约的 WebCrypto 方式封装来验证互操作；**没有真实生产密文验收记录，部署前仍须检查**。

为避免误用，本候选实现只允许现行 HTTPS `config.tanzcloud.com` 的 `/link/<标识>?sub=3`，拒绝跳转、HTTP、其他上游和额外查询参数。不是任意机场的通用转换器。

## 环境变量

| 变量 | 内容 |
| --- | --- |
| `TANZOU_ENCRYPTED_SOURCE` | 沿用现有 Vercel 私有环境变量，不填写进仓库或聊天输出。 |
| `TANZOU_COMPAT_MODE` | `official`（默认）或 `verified-regions`（显式启用地区兼容）。 |
| `TANZOU_COMPAT_HOST` | 兼容入口域名，默认 `xd-sh.mimonode-client.com`；不用固定 IP。 |

**默认 official 是为了使复制代码不等于偷偷改生产行为。**预览验收中需要明确设为 `verified-regions` 才会使用兼容入口；不知道环境变量状态时不能宣布修复生效。

App 不在日常链路中。这里也没有“自动发现 App 最新入口”的能力：运营方未来改变兼容入口而未更新普通订阅时，仍需核实后调整这一个兼容设置。不能承诺永久不需要维护。

## 本地验证

Node.js 22 或 24，零第三方运行依赖。

```sh
cd surge-tanzou-refresh
npm run verify
```

测试全部使用合成节点/虚构 UUID/虚构 token；模拟 HTTP 和超时，不请求真实订阅。完整的 83 条**合成样本**测试覆盖 30 个普通地区、50 个 board、2 个信息条目与1个回环占位；这是测试构造，不是实时机场统计。

`npm start` 仅监听 `127.0.0.1`，不打印请求 URL。不在公开环境启动本地开发服务器。

## 实现范围与未验证项

JSON VMess（原始多行、外层 Base64、Base64url、URI fragment 名称）以及 TCP/TLS/WS 的保守转换。HTTP 伪装、gRPC、H2、Reality、不支持的算法和 IPv6 代理地址暂不猜测转换，直接拒绝发布列表。现行已观察样本是 IPv4域名/TCP/无TLS/AEAD，不能据此宣称所有未来格式兼容。

本地测试不证明全部机场出口可用、不证明流媒体解锁、不证明手机网络路径可达。之前用部分节点做过的联网测试也不能算本版本已部署后的验收。

## 迁移及 Vercel（本轮不执行）

1. 将整个目录复制到目标仓库 `doovvip/sublink-worker/surge-tanzou-refresh/`；已有同名目录时先比较，不能覆盖其他任务成果。
2. 在现有 `surge-tanzou-refresh` 项目核对 Git 仓库和分支。Root Directory 指向 `surge-tanzou-refresh`，Framework 选 Other；本目录是无需打包的 Node 函数，不沿用根项目的构建命令/输出目录。没有必要执行根项目构建。
3. 准备受保护的 Preview，沿用已有密文环境变量且不输出它。先用 `official` 与原服务对照；再显式启用 `verified-regions`。`.env.example` 不是有效生产密文，禁止部署空值。
4. 验证没有 token 时404；合法时非空；检查六国筛选、所有普通地区条数与端口/UUID保持不变、board不误改；再做实际 VMess 和手机 Surge 验收。
5. 只有确认候选部署、目标项目和回滚版本后才能迁移生产域名；保留原 policy-path 与 token，R2 无需因此换地址。
6. 同一 Git 仓库可能绑定多个 Vercel 项目。合并前核对这些项目的 Root Directory 和构建忽略设置，避免触发无关项目部署。

## 回滚

未上线前只丢弃候选分支/目录即可，不影响原文件。已部署候选时，可将兼容模式改回 `official` 并按平台要求重新部署，**这不是恢复节点可用性的保证**。需要完整撤回代码时，回滚到原生产部署并恢复原环境设置，不改母版。不要依靠瞬时探测结果自动决定全部手机的路由。

## 参考依据

- 原仓库 `src/parsers/protocols/vmessParser.js`，读取时 blob `05d428dd72bc32f65eb49f47a895bbe8e243a1b9`。
- 原恢复包的私有 `/private/live-tanzou.list` 与 `TANZOU_ENCRYPTED_SOURCE` 契约（仅审阅契约，没有把密文或完整恢复包放入此项目）。
- Surge VMess：https://manual.nssurge.com/policies/vmess.html
- Surge TLS：https://manual.nssurge.com/policies/tls.html
- Node.js Crypto：https://nodejs.org/api/crypto.html

完整状态见 `docs/STATUS.md`。
