'use strict';

const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { extname, join } = require('node:path');

const port = Number(process.env.PORT || 3000);
const publicDir = join(__dirname, 'public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

http.createServer(async (request, response) => {
  const pathName = request.url === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname;
  const files = {
    '/index.html': join(publicDir, 'index.html'),
    '/app.js': join(publicDir, 'app.js'),
    '/styles.css': join(publicDir, 'styles.css'),
    '/data/sectores.json': join(__dirname, 'data', 'sectores.json'),
  };
  const filePath = files[pathName];
  if (!filePath) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`CESFAM disponible en http://localhost:${port}`));
