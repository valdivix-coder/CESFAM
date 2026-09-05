'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { findSectorsByStreet } = require('../src/sector-lookup');

test('finds a street in the yellow sector', () => {
  assert.deepEqual(findSectorsByStreet('los coigües'), [{
    sectorId: 'amarillo', sectorName: 'Sector Amarillo', street: 'LOS COIGÜES',
  }]);
});

test('finds a street in the blue sector', () => {
  assert.deepEqual(findSectorsByStreet('Millahuin'), [{
    sectorId: 'azul', sectorName: 'Sector Azul', street: 'MILLAHUIN',
  }]);
});

test('finds a street in the green sector', () => {
  assert.deepEqual(findSectorsByStreet('ámbar'), [{
    sectorId: 'verde', sectorName: 'Sector Verde', street: 'AMBAR',
  }]);
});

const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('converts the spreadsheet into a complete lookup database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cesfam-sectores-'));
  const output = join(directory, 'sectores.json');
  try {
    execFileSync('python3', ['scripts/convert-sectores.py', 'Sectores Cesfam nuevo.xlsx', output]);
    const database = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(database.sectors.map((sector) => sector.streets.length), [99, 112, 83]);
    assert.equal(database.sectors[0].streets[0].normalizedName, 'LOS COIGUES');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
