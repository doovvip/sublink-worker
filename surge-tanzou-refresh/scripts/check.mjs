import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', '.git', '.vercel', 'private-data'].includes(item.name)) continue;
    const name = join(path, item.name);
    if (item.isSymbolicLink()) throw new Error('Symlink not allowed in package');
    if (item.isDirectory()) { await walk(name); continue; }
    if (/\.m?js$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', name], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${name}`);
      count++;
    }
    if (name.endsWith('.json')) JSON.parse(await readFile(name, 'utf8'));
    if (/^\.env/.test(item.name) && item.name !== '.env.example') throw new Error('Private env file in package');
    if (/\.(pem|key|p12|pfx)$/.test(item.name)) throw new Error('Private key/certificate file in package');
  }
}
await walk(root);
console.log(`Syntax/JSON/package-boundary checks passed (${count} JavaScript files).`);
