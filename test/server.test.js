'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const server = require('../server');

test('serves the application and rejects everything else', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  await t.test('serves the page at the root', async () => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    const body = await response.text();
    assert.match(body, /<script src="sector-lookup.js"><\/script>/);
    assert.match(body, /<script src="app.js"><\/script>/);
    assert.match(body, /<title>Consulta tu sector · CESFAM Pitrufquén<\/title>/);
    assert.match(body, /CESFAM Pitrufquén/, 'the clinic must be named on the page');
    assert.match(body, /src="escudo-pitrufquen\.png"/, 'the municipal crest must be on the page');
    assert.match(body, /alt="Escudo de la Municipalidad de Pitrufquén"/);
    assert.match(body, /<link rel="manifest" href="manifest\.webmanifest">/);
    assert.match(body, /<link rel="apple-touch-icon"/);
    assert.match(body, /Mg\. Simón Valdivia/);
    assert.match(body, /wa\.me\/message\/BTVOFGDVGI5UG1/);
    assert.match(body, /linkedin\.com\/in\/s-valdivia-v/);
    assert.match(body, /&copy; 2026/);
  });

  await t.test('serves every asset the page loads', async () => {
    for (const [path, type] of [
      ['/app.js', 'text/javascript; charset=utf-8'],
      ['/sector-lookup.js', 'text/javascript; charset=utf-8'],
      ['/styles.css', 'text/css; charset=utf-8'],
      ['/escudo-pitrufquen.png', 'image/png'],
      ['/fonts.css', 'text/css; charset=utf-8'],
      ['/fonts/archivo-subset.woff2', 'font/woff2'],
      ['/sw.js', 'text/javascript; charset=utf-8'],
      ['/manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
      ['/icons/icon-192.png', 'image/png'],
      ['/icons/apple-touch-icon.png', 'image/png'],
      ['/data/sectores.json', 'application/json; charset=utf-8'],
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('content-type'), type, path);
    }
  });

  await t.test('serves the database the page can parse', async () => {
    const database = await (await fetch(`${base}/data/sectores.json`)).json();
    assert.equal(database.version, 2);
    assert.ok(database.sectors.length > 0);
  });

  await t.test('ignores a query string', async () => {
    assert.equal((await fetch(`${base}/styles.css?v=2`)).status, 200);
  });

  await t.test('answers HEAD without a body', async () => {
    const response = await fetch(`${base}/styles.css`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });

  await t.test('refuses methods other than GET and HEAD', async () => {
    const response = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });

  await t.test('does not expose files outside the allow list', async () => {
    for (const path of [
      '/server.js',
      '/package.json',
      '/../package.json',
      '/data/../server.js',
      '/%2e%2e/package.json',
      '/scripts/convert-sectores.py',
      '/fonts/../../server.js',
      '/fonts%2f..%2f..%2fserver.js',
      '/.gitignore',
      '/missing',
    ]) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
  });
});
