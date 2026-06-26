#!/usr/bin/env node
'use strict';

/*
 * Vectro — The Airport Operating System
 * Zero-dependency Node.js server: REST API + SSE stream + static SPA.
 *
 *   node server.js          → http://localhost:8080
 *   PORT=3000 node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const store = require('./src/store');
const api = require('./src/api');
const { tick } = require('./src/simulator');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname;
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) {
      // SPA fallback: unknown paths get the app shell
      if (!path.extname(file)) {
        return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(html);
        });
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const query = Object.fromEntries(url.searchParams);
  if (url.pathname.startsWith('/api/')) return api.handle(req, res, url.pathname, query);
  return serveStatic(req, res, url.pathname);
});

// Boot
const db = store.load();
tick(db, api.emit); // first tick backfills the past portion of the operating day

const TICK_MS = 4000;
setInterval(() => {
  try {
    tick(store.get(), api.emit);
    api.emit('tick', { now: Date.now() });
  } catch (e) {
    console.error('[sim]', e);
  }
}, TICK_MS);

setInterval(() => store.save(), 30000);
process.on('SIGINT', () => { store.save(); process.exit(0); });
process.on('SIGTERM', () => { store.save(); process.exit(0); });

server.listen(PORT, () => {
  const a = db.config.airport;
  console.log('');
  console.log('  ██╗   ██╗███████╗ ██████╗████████╗██████╗  ██████╗ ');
  console.log('  ██║   ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗');
  console.log('  ██║   ██║█████╗  ██║        ██║   ██████╔╝██║   ██║');
  console.log('  ╚██╗ ██╔╝██╔══╝  ██║        ██║   ██╔══██╗██║   ██║');
  console.log('   ╚████╔╝ ███████╗╚██████╗   ██║   ██║  ██║╚██████╔╝');
  console.log('    ╚═══╝  ╚══════╝ ╚═════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ');
  console.log('');
  console.log(`  Vectro — The Airport Operating System`);
  console.log(`  ${a.name} (${a.iata}/${a.icao})`);
  console.log(`  ${db.flights.length} flights · ${db.turnarounds.length} turnarounds · live simulator @ ${TICK_MS / 1000}s tick`);
  console.log('');
  console.log(`  ➜  Console:       http://localhost:${PORT}`);
  console.log(`  ➜  Landing Fees:  http://localhost:${PORT}/portal.html`);
  console.log(`  ➜  FIDS display:  http://localhost:${PORT}/#/fids-display`);
  console.log('');
});
