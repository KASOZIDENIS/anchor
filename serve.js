// serve.js — zero-dependency static server for local use.
//   node serve.js            → http://localhost:8080
//   node serve.js 3000       → custom port
//
// Service workers require a secure context, which localhost satisfies — so the
// PWA installs and works fully offline when opened at http://localhost.
// To install on your PHONE you need HTTPS (see README): deploy the folder to any
// static host, or use a tunnel. Over plain http on your LAN the app still runs;
// only the install/offline service-worker layer is unavailable.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/' || path.endsWith('/')) path += 'index.html';
    const filePath = normalize(join(root, path));
    if (!filePath.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }

    const data = await readFile(filePath);
    const type = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try a different port:  node serve.js ${port + 1}`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Anchor running:  http://localhost:${port}`);
  console.log('Stop with Ctrl+C.');
});
