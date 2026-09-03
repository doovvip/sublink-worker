import { readFile } from 'node:fs/promises';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method Not Allowed');
    return;
  }
  try {
    const body = await readFile(new URL('../surge-config/R2-Public.conf', import.meta.url), 'utf8');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Surge-Layer', 'R2-public-safe');
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(body);
  } catch (error) {
    console.error('Failed to serve R2 public layer', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}
