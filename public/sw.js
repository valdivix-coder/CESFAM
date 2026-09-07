'use strict';

/*
 * Consulta tu sector · CESFAM Pitrufquén
 *
 * The whole app is under 200 KB, so it is precached in full and then served
 * from the cache: after one online visit it works with no signal at all, which
 * is the point of installing it. VERSION is stamped at build time with a hash
 * of the published files, so a deploy that changes nothing keeps the cache and
 * a deploy that changes something replaces it.
 */

const VERSION = '__BUILD_VERSION__';
const CACHE = `cesfam-sector-${VERSION}`;

// Relative to the service worker's own URL, so the same file works whether the
// app is served from a domain root (Vercel) or a subdirectory (GitHub Pages).
const SHELL = [
  './',
  'index.html',
  'app.js',
  'sector-lookup.js',
  'styles.css',
  'fonts.css',
  'manifest.webmanifest',
  'escudo-pitrufquen.png',
  'fonts/archivo-subset.woff2',
  'fonts/instrument-sans-latin.woff2',
  'fonts/instrument-sans-latin-ext.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'data/sectores.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if any entry 404s; add one at a time so a
    // single missing asset cannot leave the app with no offline copy at all.
    await Promise.all(SHELL.map(async (path) => {
      try {
        const url = new URL(path, self.registration.scope);
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch {
        // Left out of the cache; the network still serves it while online.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (name === CACHE ? null : caches.delete(name))));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/**
 * The cached page, ready to answer a navigation.
 *
 * A host that redirects (Vercel's cleanUrls turns /index.html into a 308 to /)
 * leaves a redirected response in the cache, and the browser refuses to build a
 * navigation response from one — offline would fail outright. Copying it into a
 * fresh response drops that flag.
 */
async function shellResponse() {
  const cache = await caches.open(CACHE);
  for (const key of [new URL('./', self.registration.scope), 'index.html']) {
    const cached = await cache.match(key);
    if (!cached) continue;
    if (!cached.redirected) return cached;
    return new Response(await cached.blob(), {
      status: 200,
      statusText: 'OK',
      headers: cached.headers,
    });
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell, which is what makes the
  // installed app open with no connection.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return shellResponse();
      }
    })());
    return;
  }

  // Everything else: serve the cache immediately, then refresh it in the
  // background so the next visit already has the newer file.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
