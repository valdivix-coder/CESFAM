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
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const outDir = join(root, 'site');

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
  console.log(`site/: ${files.length + 1} archivos, ${(bytes / 1024).toFixed(0)} KB · versión ${version}`);
  return { version, files };
}

if (require.main === module) build();

module.exports = { build, walk };
