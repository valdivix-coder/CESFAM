'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const OUT = 'site';

function build() {
  execFileSync('node', ['scripts/build-site.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const { walk } = require('../scripts/build-site.js');
  return walk(OUT);
}

test('the built site carries everything the app loads', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  const files = build();

  for (const required of [
    'index.html', 'app.js', 'sector-lookup.js', 'styles.css', 'fonts.css', 'sw.js',
    'manifest.webmanifest', 'escudo-pitrufquen.png', 'data/sectores.json',
    'fonts/archivo-subset.woff2',
    'fonts/instrument-sans-latin.woff2',
    'fonts/instrument-sans-latin-ext.woff2',
    'icons/icon-192.png', 'icons/icon-512.png',
    'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  ]) {
    assert.ok(files.includes(required), `falta ${required} en el sitio publicado`);
  }
});

test('every asset the page references exists in the build', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  build();
  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  const referenced = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((match) => match[1]);
  assert.ok(referenced.length >= 8);
  for (const path of referenced) {
    assert.ok(existsSync(join(OUT, path)), `index.html apunta a ${path}, que no se publica`);
  }
});

test('the service worker gets a real cache version, and it tracks the content', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  build();
  const worker = readFileSync(join(OUT, 'sw.js'), 'utf8');
  assert.doesNotMatch(worker, /__BUILD_VERSION__/, 'la versión quedó sin sellar');
  const version = /const VERSION = '([a-f0-9]{12})'/.exec(worker);
  assert.ok(version, 'la versión no tiene la forma esperada');

  // Building the same tree twice must not invalidate every installed phone.
  build();
  const again = /const VERSION = '([a-f0-9]{12})'/.exec(readFileSync(join(OUT, 'sw.js'), 'utf8'));
  assert.equal(again[1], version[1], 'una build idéntica cambió la versión de caché');
});

test('the service worker precaches every published file it can serve offline', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  const files = build();
  const worker = readFileSync(join(OUT, 'sw.js'), 'utf8');
  const shell = [...worker.matchAll(/^\s*'([^']+)',$/gm)].map((match) => match[1]);
  for (const file of files) {
    if (file === 'sw.js') continue;
    assert.ok(shell.includes(file), `${file} se publica pero el service worker no lo cachea`);
  }
});

test('the manifest is installable: relative scope and every icon present', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  build();
  const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.webmanifest'), 'utf8'));

  assert.equal(manifest.start_url, './', 'un start_url absoluto rompe el despliegue en subdirectorio');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name);
  assert.ok(manifest.short_name.length <= 12, 'el nombre corto se trunca en el lanzador');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/);

  const purposes = manifest.icons.flatMap((icon) => icon.purpose.split(' '));
  assert.ok(purposes.includes('any') && purposes.includes('maskable'));
  for (const size of ['192x192', '512x512']) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.purpose === 'any'),
      `falta el icono ${size}`);
  }
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(OUT, icon.src)), `el manifest apunta a ${icon.src}, que no existe`);
  }
});

test('the page loads no third-party resources', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  build();
  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  const css = readFileSync(join(OUT, 'fonts.css'), 'utf8');
  // Fonts are self-hosted so the app keeps its typography with no network.
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(css, /https?:\/\//);
});
