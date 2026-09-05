/**
 * Street lookup shared by the browser bundle and the Node test suite.
 * Loaded as a plain <script> in the page and with require() on the server, so it
 * stays dependency-free and exports through a UMD-style wrapper.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SectorLookup = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Normalizes a street name so users can search without matching accents or case. */
  function normalizeStreetName(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Splits free-form input such as "Andrés Bello 950" into the street and the
   * house number. A leading number is kept in the street name instead, because
   * many local streets start with one ("5 de Abril", "18 de Septiembre").
   */
  function parseQuery(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    const match = /^(.*[^\s\d])\s*#?\s*(\d{1,6})$/.exec(text);
    if (!match) return { street: text, number: null };
    return { street: match[1].trim(), number: Number(match[2]) };
  }

  /** True when a house number falls inside a street's range. */
  function rangeMatches(range, number) {
    if (!range || number === null || number === undefined) return true;
    return range.comparator === 'lt' ? number < range.pivot : number >= range.pivot;
  }

  /**
   * The spreadsheet splits streets as "menor de 800" / "mayor de 800", which
   * leaves the pivot itself undefined. Both tramos are reported for it so the
   * user sees the ambiguity rather than a silently chosen sector.
   */
  function isBoundary(range, number) {
    return Boolean(range) && number !== null && number !== undefined && number === range.pivot;
  }

  function describe(street) {
    return street.range ? `${street.baseName} (${street.range.label})` : street.name;
  }

  function toMatch(sector, street, number) {
    return {
      sectorId: sector.id,
      sectorName: sector.name,
      street: street.name,
      baseName: street.baseName,
      range: street.range || null,
      label: describe(street),
      boundary: isBoundary(street.range, number),
    };
  }

  /**
   * Returns every sector that can contain the given address.
   *
   * The query may be a bare street ("Andrés Bello"), a street with a house
   * number ("Andrés Bello 950"), or the spreadsheet's own wording
   * ("Andrés Bello, menor de 800"). Passing `number` separately overrides any
   * number found in the text.
   */
  function findSectorsByStreet(query, options) {
    const settings = options && options.database ? options : { database: options };
    const database = settings.database;
    if (!database || !Array.isArray(database.sectors)) return [];

    const parsed = parseQuery(query);
    const number = settings.number === undefined || settings.number === null
      ? parsed.number
      : Number(settings.number);
    const normalizedQuery = normalizeStreetName(query);
    const normalizedStreet = normalizeStreetName(parsed.street);
    if (!normalizedQuery) return [];

    const matches = [];
    for (const sector of database.sectors) {
      for (const street of sector.streets) {
        // An exact hit on the spreadsheet wording always wins, so the phrasing
        // printed on the sheet keeps working.
        const exact = street.normalizedName === normalizedQuery;
        const byBase = street.normalizedBase === normalizedStreet
          && (rangeMatches(street.range, number) || isBoundary(street.range, number));
        if (exact || byBase) matches.push(toMatch(sector, street, exact ? null : number));
      }
    }
    return matches;
  }

  /** Street names that start with or contain the query, for search suggestions. */
  function suggestStreets(query, database, limit) {
    const normalized = normalizeStreetName(parseQuery(query).street);
    const maximum = limit || 8;
    if (normalized.length < 2 || !database || !Array.isArray(database.sectors)) return [];

    const seen = new Set();
    const starts = [];
    const contains = [];
    for (const sector of database.sectors) {
      for (const street of sector.streets) {
        if (seen.has(street.normalizedBase)) continue;
        const position = street.normalizedBase.indexOf(normalized);
        if (position === -1) continue;
        seen.add(street.normalizedBase);
        (position === 0 ? starts : contains).push(street.baseName);
      }
    }
    return starts.concat(contains).slice(0, maximum);
  }

  return { findSectorsByStreet, normalizeStreetName, parseQuery, suggestStreets };
});
