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
    'icons/maskable-192.png', 'icons/maskable-512.png',
    'icons/icon-rounded-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
    'icons/app-icon-96.png', 'icons/share-card.png',
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
  assert.equal(manifest.name, 'Sectores', 'así se llama la app instalada');
  assert.equal(manifest.short_name, 'Sectores');
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

test('nothing reintroduces a redirect on the page itself', () => {
  // Vercel's cleanUrls turns /index.html into a 308. The precached entry then
  // carries redirected=true, and the browser refuses to answer a navigation
  // with it — the installed app fails to open offline. Verified in Chromium.
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.notEqual(vercel.cleanUrls, true, 'cleanUrls rompe el arranque sin conexión');
  assert.equal(vercel.outputDirectory, OUT);
  assert.equal(vercel.buildCommand, 'npm run build');

  // And the worker copes even on a host that redirects anyway.
  const worker = readFileSync('public/sw.js', 'utf8');
  assert.match(worker, /cached\.redirected/, 'el worker debe rehacer una respuesta redirigida');
});

test('the worker revalidates on every deploy, and the host is told not to cache it', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const rule = vercel.headers.find((entry) => entry.source === '/sw.js');
  assert.ok(rule, 'sw.js necesita su propia regla de caché');
  const cacheControl = rule.headers.find((header) => header.key === 'Cache-Control').value;
  assert.match(cacheControl, /max-age=0/, 'un sw.js cacheado deja el teléfono en una versión muerta');
  assert.match(cacheControl, /must-revalidate/);
});

test('the installed name is the same everywhere it can be shown', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  const html = readFileSync('public/index.html', 'utf8');
  const appleTitle = /<meta name="apple-mobile-web-app-title" content="([^"]+)">/.exec(html);
  assert.ok(appleTitle, 'iOS toma el nombre de su propia etiqueta, no del manifest');
  assert.equal(appleTitle[1], manifest.short_name);
});

test('every icon is the same mark, and it clears the maskable safe zone', async () => {
  // Android crops a maskable icon to a circle of 80% of the side, so anything
  // beyond a radius of 0.40 from the centre can be cut off.
  const { execFileSync } = require('node:child_process');
  const report = execFileSync('python3', ['scripts/check-icons.py'], { encoding: 'utf8' });
  assert.match(report, /^ok/m, report);
});

test('the install control shows the app it installs', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.match(html, /class="install-icon" src="icons\/app-icon-96\.png"/,
    'la tarjeta lleva el mismo icono que se instala');
  const name = /<span class="install-name">\s*<strong>([^<]+)<\/strong>/.exec(html);
  assert.ok(name, 'la tarjeta debe nombrar la app');
  assert.equal(name[1], manifest.short_name, 'el nombre mostrado y el instalado deben coincidir');
});

test('no ARIA attribute points at an element that does not exist', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, attribute, value] of html.matchAll(/\s(aria-controls|aria-describedby|aria-labelledby|for)="([^"]+)"/g)) {
    for (const reference of value.split(/\s+/)) {
      assert.ok(ids.has(reference), `${attribute}="${reference}" no apunta a ningún elemento`);
    }
  }
});

test('the link preview names the app and points at real files', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  build();
  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  const meta = Object.fromEntries([...html.matchAll(/<meta property="(og:[^"]+)" content="([^"]*)">/g)]
    .map(([, key, value]) => [key, value]));

  assert.equal(meta['og:site_name'], 'Sectores');
  assert.match(meta['og:title'], /Sectores/);
  assert.ok(meta['og:description'].length > 40, 'la descripción es lo que se lee bajo el título');

  // Scrapers do not run scripts and often refuse relative image URLs.
  for (const key of ['og:url', 'og:image']) {
    assert.match(meta[key], /^https:\/\//, `${key} debe ser absoluto`);
  }
  assert.ok(meta['og:image'].startsWith(meta['og:url']), 'la imagen debe vivir en el mismo sitio');
  const image = meta['og:image'].slice(meta['og:url'].length);
  assert.ok(existsSync(join(OUT, image)), `${image} no se publica`);
  assert.equal(meta['og:image:width'], '1200');
  assert.equal(meta['og:image:height'], '630');
});

test('the build stamps the address this deploy is published at', (t) => {
  t.after(() => rmSync(OUT, { recursive: true, force: true }));
  const { execFileSync } = require('node:child_process');
  execFileSync('node', ['scripts/build-site.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SITE_URL: 'https://ejemplo.test' },
  });
  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  assert.match(html, /<meta property="og:url" content="https:\/\/ejemplo\.test\/">/,
    'una barra final faltante rompería la URL de la imagen');
  assert.match(html, /<meta property="og:image" content="https:\/\/ejemplo\.test\/icons\/share-card\.png">/);
  assert.doesNotMatch(html, /valdivix-coder\.github\.io/, 'quedó la dirección por defecto');
});

test('the share link works before any script runs', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const tag = /<a\s[^>]*id="share-button"[^>]*>/.exec(html);
  assert.ok(tag, 'la página debe traer el enlace de compartir');
  const href = /\shref="([^"]+)"/.exec(tag[0]);
  const message = /\sdata-message="([^"]+)"/.exec(tag[0]);
  assert.ok(href && message, 'el enlace debe traer un href utilizable y su mensaje');
  const text = decodeURIComponent(new URL(href[1]).searchParams.get('text'));
  assert.ok(text.startsWith(message[1]), 'el href y el mensaje deben decir lo mismo');
  const meta = /<meta property="og:url" content="([^"]+)">/.exec(html);
  assert.ok(text.endsWith(meta[1]), 'el respaldo debe apuntar a la dirección publicada');
});

test('every inline icon carries its own size', () => {
  // A stylesheet that has not applied yet — the first load after a deploy, a
  // slow connection — leaves an SVG with only a viewBox to fill whatever space
  // it is given. On a phone that renders the icon across the whole screen.
  const html = readFileSync('public/index.html', 'utf8');
  const body = html.slice(html.indexOf('<body>'));
  for (const [tag] of body.matchAll(/<svg[^>]*>/g)) {
    assert.match(tag, /\swidth="\d+"/, `este <svg> no declara ancho: ${tag.slice(0, 70)}`);
    assert.match(tag, /\sheight="\d+"/, `este <svg> no declara alto: ${tag.slice(0, 70)}`);
  }
});

test('images declare the size they are drawn at', () => {
  // Same reason as the icons: an image that declares its full pixel size fills
  // the screen on a page whose stylesheet has not applied yet.
  const html = readFileSync('public/index.html', 'utf8');
  const sizes = { crest: 46, 'install-icon': 48 };
  for (const [name, expected] of Object.entries(sizes)) {
    const tag = new RegExp(`<img class="${name}"[^>]*>`).exec(html);
    assert.ok(tag, `falta la imagen ${name}`);
    assert.match(tag[0], new RegExp(`width="${expected}"`), `${name} declara otro ancho`);
  }
});

test('a navigation is answered from the same build as its assets', () => {
  // Answering navigations from the network while assets come from the cache
  // pairs a freshly deployed page with the previous build's stylesheet.
  const worker = readFileSync('public/sw.js', 'utf8');
  const navigation = worker.slice(worker.indexOf("request.mode === 'navigate'"));
  const body = navigation.slice(0, navigation.indexOf('    return;'));
  assert.ok(body.indexOf('shellResponse()') < body.indexOf('fetch(request)'),
    'la caché debe consultarse antes que la red en una navegación');
});
