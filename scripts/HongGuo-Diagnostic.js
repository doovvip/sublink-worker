// HongGuo network diagnostic for Surge
// Passive only: inspects JSON key names and does not alter response bodies.
// 2026-08-31

(function () {
  const body = $response && $response.body;
  if (!body || body.length > 1500000) return $done({});

  let data;
  try {
    data = JSON.parse(body);
  } catch (_) {
    return $done({});
  }

  const wanted = /(vip|member|privilege|quality|resolution|clarity|definition|download|cache|limit|quota|ad|advert|commercial|splash|pause)/i;
  const hits = new Set();
  const seen = new WeakSet();

  function walk(node, path, depth) {
    if (depth > 7 || hits.size >= 120 || node == null) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, 8); i++) {
        walk(node[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    for (const key of Object.keys(node)) {
      const next = path ? `${path}.${key}` : key;
      if (wanted.test(key)) hits.add(next);
      walk(node[key], next, depth + 1);
      if (hits.size >= 120) break;
    }
  }

  try {
    walk(data, '', 0);
    if (hits.size) {
      const url = ($request && $request.url) || '';
      console.log(`[HongGuo-Diag] ${url}\n${Array.from(hits).join('\n')}`);
    }
  } catch (_) {}

  $done({});
})();
