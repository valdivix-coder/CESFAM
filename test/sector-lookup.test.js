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

test('finds streets stored with an address range from their common name', () => {
  assert.deepEqual(findSectorsByStreet('5 de abril').map(({ sectorId }) => sectorId), ['amarillo', 'azul']);
});

test('finds streets from a distinctive part of their name', () => {
  assert.deepEqual(findSectorsByStreet('bilbao'), [{
    sectorId: 'amarillo', sectorName: 'Sector Amarillo', street: 'FRANCISCO BILBAO',
  }]);
});

test('normalizes punctuation in range-qualified street searches', () => {
  assert.deepEqual(findSectorsByStreet('Andrés Bello menor de 800').map(({ sectorId }) => sectorId), ['amarillo']);
});

test('finds every street represented in the converted spreadsheet', () => {
  const database = require('../data/sectores.json');
  for (const sector of database.sectors) {
    for (const street of sector.streets) {
      assert.ok(
        findSectorsByStreet(street.name).some((match) => match.sectorId === sector.id && match.street === street.name),
        `${street.name} must resolve to ${sector.name}`,
      );
    }
  }
});
