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

  /**
   * Drops accents while keeping the string's length, so a match found on the
   * folded text can be highlighted at the same offsets in the original.
   */
  function foldAccents(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Normalizes a street name so users can search without matching accents or case. */
  function normalizeStreetName(value) {
    return foldAccents(value).toUpperCase().replace(/\s+/g, ' ').trim();
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

  /**
   * Streets whose name starts with or contains the query, ready to be listed
   * while the user types. Each suggestion carries the sectors it belongs to, so
   * the list can show the answer's colour before the answer itself.
   */
  function suggestStreets(query, database, limit) {
    const normalized = normalizeStreetName(parseQuery(query).street);
    const maximum = limit || 7;
    if (normalized.length < 2 || !database || !Array.isArray(database.sectors)) return [];

    const found = new Map();
    for (const sector of database.sectors) {
      for (const street of sector.streets) {
        const position = street.normalizedBase.indexOf(normalized);
        if (position === -1) continue;
        const existing = found.get(street.normalizedBase);
        if (existing) {
          if (!existing.sectors.includes(sector.id)) existing.sectors.push(sector.id);
          continue;
        }
        found.set(street.normalizedBase, {
          name: street.baseName,
          normalizedBase: street.normalizedBase,
          sectors: [sector.id],
          // Whole-word matches read as better answers than mid-word ones.
          rank: position === 0 ? 0 : 1,
        });
      }
    }

    return [...found.values()]
      .sort((a, b) => a.rank - b.rank || a.normalizedBase.localeCompare(b.normalizedBase))
      .slice(0, maximum)
      .map(({ name, normalizedBase, sectors }) => ({ name, normalizedBase, sectors }));
  }

  return { findSectorsByStreet, foldAccents, normalizeStreetName, parseQuery, suggestStreets };
});
