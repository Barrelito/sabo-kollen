import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createApi } from './app.js';
import { hashPassword } from './password.js';

const port = Number(process.env.PORT || 3000);
const db = new PGlite();
await db.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
await db.query("INSERT INTO boenden (namn) VALUES ('Demo Solgläntan'), ('Demo Ängsgården')");
const api = createApi({ db, sessionSecret: 'local-development-session-secret-32-bytes', adminPasswordHash: hashPassword('demo-admin-password', Buffer.alloc(16, 1)) });
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);
    if (url.pathname.startsWith('/api/')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let body = {}; if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }
      const result = await api.handle({ method: req.method, url: url.href, headers: req.headers, body });
      res.writeHead(result.status, result.headers); res.end(JSON.stringify(result.body)); return;
    }
    const asset = assets.get(url.pathname);
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': asset[1] }); res.end(await readFile(new URL(`../public/${asset[0]}`, import.meta.url)));
  } catch { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Serverfel'); }
});

server.listen(port, '127.0.0.1', () => console.log(`Lokal syntetisk miljö: http://127.0.0.1:${port} (admin: demo-admin-password)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await db.close(); process.exit(0); }));
