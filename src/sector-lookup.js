'use strict';

const sectorDatabase = require('../data/sectores.json');

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
 * Returns every CESFAM sector containing an exact street name.
 * The source spreadsheet deliberately stores address-range distinctions as part
 * of the street name (for example, "MENOR DE 800"); callers should retain them.
 */
function findSectorsByStreet(streetName, database = sectorDatabase) {
  const normalizedName = normalizeStreetName(streetName);
  if (!normalizedName) return [];

  return database.sectors.flatMap((sector) =>
    sector.streets
      .filter((street) => street.normalizedName === normalizedName)
      .map((street) => ({
        sectorId: sector.id,
        sectorName: sector.name,
        street: street.name,
      })),
  );
}

module.exports = { findSectorsByStreet, normalizeStreetName };
