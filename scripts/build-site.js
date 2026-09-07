#!/usr/bin/env node
'use strict';

/*
 * Builds the static site into `site/`, ready for any static host.
 *
 * The one thing this does beyond copying is stamp the service worker's cache
 * version with a hash of everything published. A deploy that changes nothing
 * keeps every installed phone's cache; a deploy that changes anything replaces
 * it on the next visit.
 */

const { createHash } = require('node:crypto');
const { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, relative, sep } = require('node:path');

const root = join(__dirname, '..');
// Whatever the sources ship as the public address; the build rewrites it to
// wherever this deploy actually lands, so link previews resolve.
const DEFAULT_SITE_URL = 'https://valdivix-coder.github.io/CESFAM/';
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const outDir = join(root, 'site');

/**
 * The address this build is being published at. Vercel names it in the
 * environment; a workflow can pass SITE_URL; otherwise the default stands.
 */
function siteUrl() {
  const host = process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`);
  if (!host) return DEFAULT_SITE_URL;
  return host.endsWith('/') ? host : `${host}/`;
}

/** Every file under `directory`, as paths relative to it, sorted for stability. */
function walk(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(directory, entry.name);
      return entry.isDirectory() ? walk(full, base) : [relative(base, full).split(sep).join('/')];
    })
    .sort();
}

function build() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(publicDir, outDir, { recursive: true });
  cpSync(dataDir, join(outDir, 'data'), { recursive: true });

  const address = siteUrl();
  if (address !== DEFAULT_SITE_URL) {
    const pagePath = join(outDir, 'index.html');
    // The address appears plainly in the link-preview tags and percent-encoded
    // inside the WhatsApp fallback link, so both forms have to be rewritten.
    const page = readFileSync(pagePath, 'utf8')
      .split(DEFAULT_SITE_URL).join(address)
      .split(encodeURIComponent(DEFAULT_SITE_URL)).join(encodeURIComponent(address));
    writeFileSync(pagePath, page);
  }

  const files = walk(outDir).filter((file) => file !== 'sw.js');
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(outDir, file)));
  }
  const version = hash.digest('hex').slice(0, 12);

  const workerPath = join(outDir, 'sw.js');
  const worker = readFileSync(workerPath, 'utf8');
  if (!worker.includes('__BUILD_VERSION__')) {
    throw new Error('sw.js no longer carries the __BUILD_VERSION__ placeholder');
  }
  writeFileSync(workerPath, worker.replace('__BUILD_VERSION__', version));

  const bytes = files.reduce((total, file) => total + statSync(join(outDir, file)).size, 0);
  console.log(`site/: ${files.length + 1} archivos, ${(bytes / 1024).toFixed(0)} KB · `
    + `versión ${version} · ${address}`);
  return { version, files, address };
}

if (require.main === module) build();

module.exports = { build, walk, siteUrl, DEFAULT_SITE_URL };
