import { handleTaobaoPricePage } from './taobaoPriceWeb.js';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/taobao-price') {
      const pageUrl = new URL(request.url);
      pageUrl.pathname = '/taobao-price';
      return handleTaobaoPricePage(new Request(pageUrl, request));
    }
    if (url.pathname === '/api/taobao-price') {
      return handleTaobaoPricePage(request);
    }
    if (url.pathname === '/health') {
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
    return new Response('Not Found', { status: 404 });
  }
};
