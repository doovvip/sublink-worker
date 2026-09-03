export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  res.statusCode = 410;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Surge-Recovery', 'R2-migrated-to-local-core');
  if (req.method === 'HEAD') { res.end(); return; }
  res.end('This legacy managed profile endpoint has been retired for security. Use the local R2 core with /R2-Public.conf.');
}
