'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findSectorsByStreet,
  suggestStreets,
  normalizeStreetName,
  parseQuery,
  sectorDatabase,
} = require('../src/sector-lookup');

const sectorsOf = (query, options) =>
  findSectorsByStreet(query, options).map((match) => match.sectorName).sort();

test('finds a street written with accents, without them, and in any case', () => {
  for (const query of ['Los Coigües', 'los coigues', 'LOS COIGUES', '  los   coigües ']) {
    assert.deepEqual(sectorsOf(query), ['Sector Amarillo'], query);
  }
});

test('finds streets in every sector', () => {
  assert.deepEqual(sectorsOf('Millahuin'), ['Sector Azul']);
  assert.deepEqual(sectorsOf('ámbar'), ['Sector Verde']);
});

test('returns the stored street name and sector id', () => {
  assert.deepEqual(findSectorsByStreet('los coigües'), [{
    sectorId: 'amarillo',
    sectorName: 'Sector Amarillo',
    street: 'LOS COIGÜES',
    baseName: 'LOS COIGÜES',
    range: null,
    label: 'LOS COIGÜES',
    boundary: false,
  }]);
});

test('an unknown street matches nothing', () => {
  assert.deepEqual(findSectorsByStreet('calle que no existe'), []);
  assert.deepEqual(findSectorsByStreet(''), []);
  assert.deepEqual(findSectorsByStreet('   '), []);
  assert.deepEqual(findSectorsByStreet(null), []);
});

test('a street split by house number is found without typing the range', () => {
  // The old lookup required the spreadsheet's exact wording, so a plain
  // "Andrés Bello" returned nothing at all.
  assert.deepEqual(sectorsOf('Andrés Bello'), ['Sector Amarillo', 'Sector Azul']);
  assert.deepEqual(sectorsOf('andres bello'), ['Sector Amarillo', 'Sector Azul']);
});

test('a house number selects the matching tramo', () => {
  assert.deepEqual(sectorsOf('Andrés Bello 450'), ['Sector Amarillo']);
  assert.deepEqual(sectorsOf('Andrés Bello 950'), ['Sector Azul']);
  assert.deepEqual(sectorsOf('andres bello', { number: 1 }), ['Sector Amarillo']);
  assert.deepEqual(sectorsOf('andres bello', { number: 12345 }), ['Sector Azul']);
});

test('an explicit number wins over one written in the query', () => {
  assert.deepEqual(sectorsOf('Andrés Bello 450', { number: 950 }), ['Sector Azul']);
});

test('the pivot itself is reported as ambiguous instead of guessed', () => {
  const matches = findSectorsByStreet('Andrés Bello 800');
  assert.deepEqual(matches.map((match) => match.sectorName).sort(), ['Sector Amarillo', 'Sector Azul']);
  assert.ok(matches.every((match) => match.boundary), 'both tramos must be flagged as a boundary hit');
  assert.equal(matches[0].range.pivot, 800);
});

test('the spreadsheet wording still works verbatim', () => {
  assert.deepEqual(sectorsOf('Andrés Bello, menor de 800'), ['Sector Amarillo']);
  assert.deepEqual(sectorsOf('andres bello, mayor de 800'), ['Sector Azul']);
});

test('tolerates the spreadsheet typos in the range suffix', () => {
  // "18 DE SEPTIEMBRE, MENOR 800" drops the "DE" and
  // "JUAN AGUSTIN PALAZUELOS, MAYORDE 800" drops the space.
  assert.deepEqual(sectorsOf('18 de septiembre 700'), ['Sector Amarillo']);
  assert.deepEqual(sectorsOf('18 de septiembre 900'), ['Sector Azul']);
  assert.deepEqual(sectorsOf('juan agustin palazuelos 900'), ['Sector Azul']);
  assert.deepEqual(sectorsOf('juan agustin palazuelos 100'), ['Sector Amarillo']);
});

test('street names that begin with a number are not read as house numbers', () => {
  assert.deepEqual(parseQuery('5 de Abril'), { street: '5 de Abril', number: null });
  assert.deepEqual(sectorsOf('5 de Abril 200'), ['Sector Amarillo']);
  assert.deepEqual(sectorsOf('9 de Julio'), ['Sector Amarillo']);
});

test('a street listed in two sectors without a range reports both', () => {
  const matches = findSectorsByStreet('barros arana');
  assert.deepEqual(matches.map((match) => match.sectorName).sort(), ['Sector Amarillo', 'Sector Azul']);
  assert.ok(matches.every((match) => match.range === null));
  // A house number cannot disambiguate it, so both stay.
  assert.equal(findSectorsByStreet('barros arana 500').length, 2);
});

test('every split street has both tramos and they cover all house numbers', () => {
  const tramos = new Map();
  for (const sector of sectorDatabase.sectors) {
    for (const street of sector.streets) {
      if (!street.range) continue;
      const entry = tramos.get(street.normalizedBase) || [];
      entry.push({ sector: sector.id, ...street.range });
      tramos.set(street.normalizedBase, entry);
    }
  }
  // The pinned spreadsheet splits 17 streets; the invariant below is what matters.
  assert.ok(tramos.size >= 17, `expected the split streets to survive conversion, got ${tramos.size}`);
  for (const [base, entry] of tramos) {
    assert.deepEqual(entry.map((item) => item.comparator).sort(), ['gte', 'lt'], `${base} needs both tramos`);
    assert.equal(new Set(entry.map((item) => item.pivot)).size, 1, `${base} splits at a single pivot`);
    assert.equal(new Set(entry.map((item) => item.sector)).size, 2, `${base} spans two sectors`);
  }
});

test('suggests streets by prefix and by substring', () => {
  assert.deepEqual(suggestStreets('coig'), [
    { name: 'LOS COIGÜES', normalizedBase: 'LOS COIGUES', sectors: ['amarillo'] },
  ]);
  assert.ok(suggestStreets('parque nacional').length >= 5);
  assert.deepEqual(suggestStreets('a'), [], 'a single letter is too broad to suggest');
  assert.deepEqual(suggestStreets('zzzzz'), []);
  assert.ok(suggestStreets('parque', sectorDatabase, 3).length <= 3);
});

test('a suggestion carries every sector the street belongs to, once', () => {
  assert.deepEqual(suggestStreets('andres bello'), [
    { name: 'ANDRÉS BELLO', normalizedBase: 'ANDRES BELLO', sectors: ['amarillo', 'azul'] },
  ]);
  assert.deepEqual(suggestStreets('barros'), [
    { name: 'BARROS ARANA', normalizedBase: 'BARROS ARANA', sectors: ['amarillo', 'azul'] },
  ]);
});

test('suggestions that start with the query come before the rest', () => {
  const names = suggestStreets('bello').map((suggestion) => suggestion.name);
  assert.ok(names.includes('ANDRÉS BELLO'), 'a mid-word match is still offered');
  const parks = suggestStreets('parque');
  assert.ok(parks.every((suggestion) => suggestion.name.startsWith('PARQUE')));
});

test('accent folding keeps offsets so a match can be highlighted', () => {
  const { foldAccents } = require('../src/sector-lookup');
  assert.equal(foldAccents('ANDRÉS BELLO'), 'ANDRES BELLO');
  assert.equal(foldAccents('VICUÑA').length, 'VICUÑA'.length);
  assert.equal(foldAccents(undefined), '');
});

test('normalizes accents, case and repeated whitespace', () => {
  assert.equal(normalizeStreetName('  Vicuña   Mackenna '), 'VICUNA MACKENNA');
  assert.equal(normalizeStreetName(undefined), '');
});

test('an empty or malformed database never throws', () => {
  assert.deepEqual(findSectorsByStreet('los coigües', { database: { sectors: [] } }), []);
  assert.deepEqual(findSectorsByStreet('los coigües', { database: {} }), []);
  assert.deepEqual(suggestStreets('coig', { sectors: [] }), []);
});
