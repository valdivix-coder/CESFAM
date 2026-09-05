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
