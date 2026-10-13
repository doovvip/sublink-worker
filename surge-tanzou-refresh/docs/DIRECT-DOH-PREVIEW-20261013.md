# TanZou → Surge direct DoH, preview-only handoff (2026-10-13)

## Goal and ownership

Use the provider's **original dynamic VMess subscription** with Mac Surge and iPhone Surge,
refresh every 86,400 seconds, and connect directly to the airport rather than through
the user's Oracle-Tokyo Shadowsocks relay.

Project: `doovvip/sublink-worker`, folder `surge-tanzou-refresh/`.
Branch: `feature/tanzou-doh-direct-daily-20261013` (forked from the production source branch `rc2-2-auto-probe`).
Production Vercel project: `surge-tanzou-refresh`. **Production deployment and existing URLs are unchanged.**
Only the opt-in preview route `/private/live-tanzou.direct.list?token=<existing-private-token>` is new.

## Live evidence before cloud integration

- Original airport Clash configuration advertised three provider-specific DoH endpoints:
  `https://20.247.42.211:36290/dns-query/clash?site=feitan`,
  `https://20.239.241.138:55228/dns-query/clash?site=feitan`,
  `https://104.208.122.199:62201/dns-query/clash?site=feitan`.
  Mac direct physical Wi-Fi confirmed TLS certificate verification and DoH response 200.
- Ordinary DNS IPs for the original hostnames timed out even with the physical en0 interface,
  while 12 out of 12 tested provider DoH IP + VMess port pairs accepted TCP on en0.
- Isolated Surge policy tests using original VMess UUID, port, AEAD and provider-DoH-derived IP:
  HK-A HTTPS 204 / 499 ms; HK-B 204 / 471 ms; JP-B 204 / 465 ms;
  one JP IP timed out; VIP3/board 204 / 1,201 ms.
  **These are 4/5 individual direct HTTPS passes, not all 80 nodes certified.**
- Mac still ran original daily profile `R2-TanZou-每日自动更新` at the last *confirmed* pre-test observation.
  During later standalone `[Host]` trial the SentinelX agent disconnected, so **current
  active Mac profile is not proven**. Do not claim rollback after that disconnect without reading
  `surge-cli profile current`.
- Official Surge documentation explicitly says proxy server hostnames do *not* match `[Host]`
  mappings. Therefore the rejected alternative of putting the airport DoH into `[Host]`
  is **not** the production fix.

## New preview route and hard boundaries

1. Auth is identical to the existing production `/private/live-tanzou.official.list`:
   original AES-GCM-protected source, same URL token, no user-controlled upstream URL.
2. New route alone: obtain fresh provider VMess feed; convert in official mode; drop
   information records; preserve original names/UUIDs/ports and VMess flags.
3. For original proxy hosts on the exact whitelist of six `tanz-<region>.kunlun01dns.com`
   plus `tanz-board.kunlun01dns.com`, query the airport's three TLS-verified DoH endpoints.
   Query each unique hostname once; try primary and bounded fallbacks. Accept only public
   IPv4 A results; refuse altered TLS/transport/AID and unexpected real hosts.
4. Publish only if **all original proxy hosts** resolve. Otherwise return HTTP 502
   (Surge can retain a previously refreshed remote resource). No stale cache
   masquerading as current results; no plain UUID/token/source in logs/errors.
5. Legacy `/private/live-tanzou.list`, `/private/live-tanzou.official.list`,
   `/private/diag-tanzou-node.json` and `/health` remain unchanged.
6. No Oracle relay on the new route. Surge's actual profile must omit
   `underlying-proxy="🇯🇵 Oracle-Tokyo"` from the airport policy group.

## Before any production switch

- Run `cd surge-tanzou-refresh && npm run verify` on the feature branch. Inspect tests
  `test/direct-dns.test.js` alongside the preserved original tests.
- Check project preview deployment `READY` and response to no token (404), malformed
  credentials (404), correct authenticated preview `GET ...direct.list` (200, 80 real nodes
  in current subscription). Never print or put the token/UUID into reports.
- On the Mac, **first** check SentinelX online and actual Surge profile; if a test profile
  is active, switch back to the previously verified working daily profile and confirm
  connectivity before beginning another short isolated test.
- Build the Mac test profile from the protected R2 daily direct candidate, changing only
  the remote `policy-path` from `...official.list` to the new preview `...direct.list`;
  keep `update-interval=86400` and keep all `underlying-proxy` removed from that group.
  Verify 80 real nodes, check locale groups, force-refresh remote resource, and test actual
  HTTPS 204 for HK, JP, US, SG, and at least one VIP3.
- If any regression, restore the old active profile immediately; keep the old R2
  master and original Vercel production endpoint untouched.
- Only after successful direct end-to-end and independent repeat refresh may this route
  be reviewed/merged into the production branch and deployed to the existing Vercel
  project. Then convert Mac to the production authenticated `...direct.list` endpoint.
  iPhone must use the same authenticated conversion feed and be tested separately;
  macOS success never certifies iOS network reachability.

## Current verdict

New source and tests exist on the isolated feature branch, and Vercel preview
deployment has reached READY, **but authenticated live preview and Mac/iPhone
end-to-end acceptance are still pending**. Do not switch production or advertise the
client solution as complete yet.


## 2026-10-13 continuation: authenticated preview and Surge integration

- Vercel preview `surge-tanzou-refresh-jtremnmdi-lee-36d9.vercel.app`
  responded 200 to `/health`, 404 without a token for `/private/live-tanzou.direct.list`,
  and 200 using the existing private token read only into Mac process memory.
  The authenticated response had **80 VMess lines with 80 numeric IP servers, zero original
  airport hostnames, zero Oracle references and zero informational nodes**.
  The token/UUID/source was not printed by the diagnostic script.
- Isolated Mac test profile `R2-TanZou-预览动态DoH直连-每日更新.conf`
  was created by changing the single remote `policy-path` in the frozen daily
  direct candidate, preserving `update-interval=86400` and no Oracle
  `underlying-proxy`. Surge syntax check returned OK; profile switch succeeded;
  `surge-cli external-resource update` returned `success`. However,
  `policy-group get "✈️ 我的节点"` **immediately showed 0 imported policies**.
  That is **not a working dynamic Surge feed**. Next examine delayed resource loading,
  actual resource status, parse errors and preview-host accessibility.
- The first failed test script executed a guarded restore and confirmed
  `Current Profile: R2-TanZou-每日自动更新` plus unchanged protected hashes.
  A later diagnostic attempted to switch temporarily again but the SentinelX
  agent disconnected. **Current Mac profile after the later interruption is not
  independently rechecked.** First check `surge-cli profile current` and `status`
  on reconnect, restore the working profile if needed.
- Repeated remote-control disconnects around profile switching warrant a bounded
  independent on-device rollback watchdog for any further trial.
- Preview deployment READY = build success, **not** unit-test PASS or Mac/phone
  usability. `npm run verify`, Mac import of all 80, actual direct HTTPS 204,
  repeated force refresh and iPhone separate validation remain mandatory.
- Protected hashes at last confirmed checkpoint:
  `R2.conf`: `f9ec137b93d1bfe92833dd60c44074ddfc7e4d83d997c84e4ed9dcd7c84fd04a`;
  `R2-TanZou-每日自动更新.conf`:
  `9320988d356add5d732255a6efe609809b13ab00f7298535feb169ed2e387494`;
  `R2-TanZou-每日更新-无中转直连测试.conf`:
  `afad2375a63ad54720271f7a887c38282d6a0ac6cdcd0243c37d86fb513ff811`.
- **Do not merge, promote or switch production until Surge imports 80 direct remote
  policies and passes actual representative HTTPS probes after a refresh.**
