import net from 'node:net';

export function endpointKey(node) {
  return `${node.host}\0${node.port}`;
}

function tcpReachable(host, port, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const socket = net.connect({ host, port });
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function quickProbeNodes(nodes, { timeoutMs = 900, concurrency = 16 } = {}) {
  if (!Array.isArray(nodes) || !nodes.length) return new Set();
  const unique = new Map();
  for (const node of nodes) unique.set(endpointKey(node), node);
  const entries = [...unique.entries()];
  const reachable = new Set();
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= entries.length) return;
      const [key, node] = entries[index];
      if (await tcpReachable(node.host, node.port, timeoutMs)) reachable.add(key);
    }
  };
  const count = Math.max(1, Math.min(Number(concurrency) || 1, entries.length, 32));
  await Promise.all(Array.from({ length: count }, worker));
  return reachable;
}
