'use strict';

const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { extname, join } = require('node:path');

const port = Number(process.env.PORT || 3000);
const publicDir = join(__dirname, 'public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// An explicit allow list: nothing outside these files is reachable, so a
// crafted path can never escape the project directory.
const files = {
  '/index.html': join(publicDir, 'index.html'),
  '/app.js': join(publicDir, 'app.js'),
  '/sector-lookup.js': join(publicDir, 'sector-lookup.js'),
  '/styles.css': join(publicDir, 'styles.css'),
  '/escudo-pitrufquen.png': join(publicDir, 'escudo-pitrufquen.png'),
  '/data/sectores.json': join(__dirname, 'data', 'sectores.json'),
};

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  let pathName;
  try {
    pathName = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const filePath = files[pathName === '/' ? '/index.html' : pathName];
  if (!filePath) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
      // The database is regenerated from the spreadsheet, so never let a stale
      // copy outlive a rebuild during local use.
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

// Only listen when started directly, so tests can drive the server themselves.
if (require.main === module) {
  server.listen(port, () => console.log(`CESFAM disponible en http://localhost:${port}`));
}

module.exports = server;
