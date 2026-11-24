'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const seed = require('./data/seed.json');
const { createClock } = require('./src/time');
const { createStore, HttpError } = require('./src/store');
const { createApi } = require('./src/api');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const clock = createClock(seed.demoStart);
const store = createStore(seed, clock);
const post = createApi(store, clock);
const sseClients = new Set();

function broadcast() {
  const payload = `data: ${JSON.stringify(store.snapshot())}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10000) reject(new HttpError(413, 'Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && pathname === '/api/state') {
      store.tick();
      return sendJson(res, 200, store.snapshot());
    }
    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      sseClients.add(res);
      res.write(`data: ${JSON.stringify(store.snapshot())}\n\n`);
      req.on('close', () => sseClients.delete(res));
      return;
    }
    if (req.method === 'POST') {
      const result = post(pathname, await readBody(req));
      broadcast();
      return sendJson(res, 200, result);
    }
    if (req.method === 'GET') return serveStatic(req, res);
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    sendJson(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
  }
});

// Advance escalations and push the clock to every open screen once a second.
setInterval(() => {
  store.tick();
  if (sseClients.size) broadcast();
}, 1000);

server.listen(PORT, () => {
  console.log(`CritCall demo running at http://localhost:${PORT}`);
});
