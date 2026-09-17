import { createServer } from 'node:http';
import handler from '../api/index.js';
const port = Number(process.env.PORT || 8787);
createServer((req, res) => { handler(req, res).catch(() => { res.statusCode = 500; res.end('Error'); }); })
  .listen(port, '127.0.0.1', () => console.log(`Local test server: 127.0.0.1:${port}; request URLs are not logged.`));
