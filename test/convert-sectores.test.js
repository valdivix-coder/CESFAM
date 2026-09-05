'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SPREADSHEET = 'Sectores Cesfam nuevo.xlsx';

const stripAccents = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function convert(source = SPREADSHEET, extraArgs = []) {
  const directory = mkdtempSync(join(tmpdir(), 'cesfam-sectores-'));
  const output = join(directory, 'sectores.json');
  try {
    execFileSync('python3', ['scripts/convert-sectores.py', source, output, ...extraArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { database: JSON.parse(readFileSync(output, 'utf8')) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('converts the spreadsheet into a complete lookup database', () => {
  const { database } = convert();
  assert.equal(database.version, 2);
  assert.equal(database.source, SPREADSHEET);
  assert.deepEqual(database.sectors.map((sector) => sector.id), ['amarillo', 'azul', 'verde']);
  assert.deepEqual(database.sectors.map((sector) => sector.streets.length), [99, 112, 83]);
});

test('the generated file matches the committed database', () => {
  const { database } = convert();
  const committed = JSON.parse(readFileSync('data/sectores.json', 'utf8'));
  assert.deepEqual(database, committed, 'run `npm run convert:sectors` after editing the spreadsheet');
});

test('every street carries the fields the lookup relies on', () => {
  const { database } = convert();
  for (const sector of database.sectors) {
    assert.ok(sector.streets.length > 0, `${sector.id} must not be empty`);
    for (const street of sector.streets) {
      assert.equal(typeof street.name, 'string');
      assert.ok(street.name.trim().length > 0);
      assert.equal(typeof street.normalizedName, 'string');
      assert.equal(typeof street.normalizedBase, 'string');
      assert.equal(street.normalizedBase, street.normalizedBase.toUpperCase());
      assert.equal(street.normalizedBase, stripAccents(street.normalizedBase), 'keys must be accent-free');
      assert.equal(street.normalizedName, stripAccents(street.normalizedName), 'keys must be accent-free');
      assert.equal(street.normalizedName.trim(), street.normalizedName, 'keys must be trimmed');
      if (street.range) {
        assert.ok(['lt', 'gte'].includes(street.range.comparator));
        assert.equal(typeof street.range.pivot, 'number');
        assert.ok(Number.isInteger(street.range.pivot) && street.range.pivot > 0);
      }
    }
  }
});

test('names are unique inside each sector', () => {
  const { database } = convert();
  for (const sector of database.sectors) {
    const names = sector.streets.map((street) => street.normalizedName);
    assert.equal(new Set(names).size, names.length, `${sector.id} has duplicate entries`);
  }
});

test('parses the house-number suffix, including the spreadsheet typos', () => {
  const { database } = convert();
  const streets = database.sectors.flatMap((sector) =>
    sector.streets.map((street) => ({ sector: sector.id, ...street })));
  const find = (name) => streets.find((street) => street.name === name);

  assert.deepEqual(find('ANDRÉS BELLO, MENOR DE 800').range, { comparator: 'lt', pivot: 800, label: 'menor de 800' });
  assert.equal(find('ANDRÉS BELLO, MENOR DE 800').baseName, 'ANDRÉS BELLO');
  assert.equal(find('ANDRÉS BELLO, MENOR DE 800').normalizedBase, 'ANDRES BELLO');
  // Missing "DE".
  assert.deepEqual(find('18 DE SEPTIEMBRE, MENOR 800').range, { comparator: 'lt', pivot: 800, label: 'menor de 800' });
  // Missing space.
  assert.deepEqual(find('JUAN AGUSTIN PALAZUELOS, MAYORDE 800').range, { comparator: 'gte', pivot: 800, label: 'mayor de 800' });
  // A street whose name simply starts with a number keeps its whole name.
  assert.equal(find('9 DE JULIO').range, undefined);
  assert.equal(find('9 DE JULIO').normalizedBase, '9 DE JULIO');
});

test('reports the streets listed in two sectors without a range', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cesfam-strict-'));
  try {
    const output = join(directory, 'sectores.json');
    let failure = null;
    try {
      execFileSync('python3', ['scripts/convert-sectores.py', SPREADSHEET, output, '--strict'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, '--strict must fail while the spreadsheet still has ambiguous streets');
    assert.equal(failure.status, 1);
    assert.match(failure.stderr.toString(), /ambiguous: "BARROS ARANA"/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reads rows by their spreadsheet number, not by document order', () => {
  // Excel omits empty rows, so a sheet that skips row 5 must not shift columns.
  const directory = mkdtempSync(join(tmpdir(), 'cesfam-sparse-'));
  try {
    const source = join(directory, 'sparse.xlsx');
    writeFileSync(source, buildWorkbook());
    const output = join(directory, 'sectores.json');
    execFileSync('python3', ['scripts/convert-sectores.py', source, output], { stdio: ['ignore', 'pipe', 'pipe'] });
    const database = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(database.sectors.map((sector) => sector.id), ['rojo', 'gris']);
    assert.deepEqual(database.sectors[0].streets.map((street) => street.name), ['CALLE UNO', 'CALLE TRES']);
    assert.deepEqual(database.sectors[1].streets.map((street) => street.name), ['CALLE DOS']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Minimal .xlsx with a title row, a sector row, a gap at row 5 and an inline string. */
function buildWorkbook() {
  const { deflateRawSync } = require('node:zlib');
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`
    + `<row r="1"><c r="A1" t="inlineStr"><is><t>SECTORES</t></is></c></row>`
    + `<row r="2"><c r="A2" t="inlineStr"><is><t>SECTOR ROJO</t></is></c>`
    + `<c r="B2" t="inlineStr"><is><t>SECTOR GRIS</t></is></c></row>`
    + `<row r="3"><c r="A3" t="inlineStr"><is><t>CALLE UNO</t></is></c>`
    + `<c r="B3" t="inlineStr"><is><t>CALLE DOS</t></is></c></row>`
    + `<row r="6"><c r="A6" t="inlineStr"><is><t>CALLE TRES</t></is></c></row>`
    + `</sheetData></worksheet>`;
  return zip([['xl/worksheets/sheet1.xml', sheet]], deflateRawSync);
}

/** Builds a store-free zip archive with the few entries the converter reads. */
function zip(entries, deflate) {
  const { crc32 } = require('node:zlib');
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8');
    const compressed = deflate(data);
    const nameBuffer = Buffer.from(name, 'utf8');
    const checksum = crc32(data);

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    locals.push(local, compressed);

    const entry = Buffer.alloc(46 + nameBuffer.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt32LE(offset, 42);
    nameBuffer.copy(entry, 46);
    central.push(entry);
    offset += local.length + compressed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
