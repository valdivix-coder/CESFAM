'use strict';

const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { extname, join, resolve, sep } = require('node:path');

const port = Number(process.env.PORT || 3000);
const publicDir = resolve(__dirname, 'public');
const dataDir = resolve(__dirname, 'data');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Maps a request path to a file under one of the two served roots, or null.
 * The resolved path must stay inside its root, so no crafted path — encoded or
 * not — can reach a file the site does not publish.
 */
function locate(pathName) {
  const [root, relative] = pathName.startsWith('/data/')
    ? [dataDir, pathName.slice('/data/'.length)]
    : [publicDir, pathName.slice(1)];
  if (!relative || relative.split('/').some((part) => part.startsWith('.'))) return null;

  const filePath = resolve(root, relative);
  return filePath.startsWith(root + sep) ? filePath : null;
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  let pathName;
  try {
    pathName = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const filePath = locate(pathName === '/' ? '/index.html' : pathName);
  if (!filePath) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
      // Everything is regenerated from the spreadsheet, and the service worker
      // does the real caching, so never let a stale copy outlive a rebuild.
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
