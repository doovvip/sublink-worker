// Surge Status Panel
// Local-only: no HTTP request, no speed test, no cron.

(function () {
  const network = typeof $network === "object" && $network ? $network : {};
  const env = typeof $environment === "object" && $environment ? $environment : {};
  const wifi = network.wifi || {};
  const v4 = network.v4 || {};
  const cellular = network["cellular-data"] || {};
  const dns = Array.isArray(network.dns) ? network.dns : [];

  let networkName = "未知网络";
  if (wifi.ssid) {
    networkName = "Wi-Fi｜" + wifi.ssid;
  } else if (cellular.radio || cellular.carrier) {
    const parts = [cellular.radio, cellular.carrier].filter(Boolean);
    networkName = "蜂窝｜" + parts.join(" ");
  } else if (v4.primaryInterface) {
    networkName = v4.primaryInterface;
  }

  const lines = [
    "网络：" + networkName,
    "本机 IP：" + (v4.primaryAddress || "—"),
    "DNS：" + (dns.length ? dns.join(", ") : "—"),
    "Surge：" + (env["surge-version"] || "—")
  ];

  try {
    const details = $surge.selectGroupDetails();
    const decisions = details && details.decisions ? details.decisions : {};
    const preferred = ["Proxy", "AI", "YouTube", "BiliBili", "GlobalMedia"];

    const visible = preferred.filter(function (name) {
      return Object.prototype.hasOwnProperty.call(decisions, name);
    });

    if (visible.length) {
      lines.push("");
      visible.forEach(function (name) {
        lines.push(name + "：" + decisions[name]);
      });
    }
  } catch (e) {
    lines.push("");
    lines.push("策略：读取失败");
  }

  $done({
    title: "Surge 状态",
    content: lines.join("\n"),
    icon: "bolt.horizontal.circle.fill"
  });
})();
