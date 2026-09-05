'use strict';

// The implementation lives next to the page so the browser and the tests run
// exactly the same code; this module only binds it to the bundled database.
const lookup = require('../public/sector-lookup.js');
const sectorDatabase = require('../data/sectores.json');

/**
 * Returns every sector that can contain the given address.
 * Accepts `{ number, database }`; both are optional and default to the number
 * parsed out of the query and to the database bundled with the repository.
 */
function findSectorsByStreet(streetName, options = {}) {
  return lookup.findSectorsByStreet(streetName, { database: sectorDatabase, ...options });
}

/** Street names starting with or containing the query, for search suggestions. */
function suggestStreets(query, database = sectorDatabase, limit) {
  return lookup.suggestStreets(query, database, limit);
}

module.exports = {
  findSectorsByStreet,
  suggestStreets,
  normalizeStreetName: lookup.normalizeStreetName,
  parseQuery: lookup.parseQuery,
  sectorDatabase,
};
