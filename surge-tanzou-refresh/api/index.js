import { createService } from '../lib/service.js';

const service = createService();

export default async function handler(req, res) {
  let response;
  try {
    // Fixed dummy origin: only the path is used, never trust Host/X-Forwarded-Host.
    const url = new URL(req.url || '/', 'https://subscription.invalid');
    const method = req.method || 'GET';
    response = await service(new Request(url, { method }));
  } catch {
    response = new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(await response.text());
}
