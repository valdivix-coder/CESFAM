'use strict';

const sectorDatabase = require('../data/sectores.json');

/** Normalizes a street name so users can search without matching accents or case. */
function normalizeStreetName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Returns every CESFAM sector containing a street name. Exact matches take
 * precedence; otherwise, a meaningful part of a street name can be searched
 * (for example, "Bilbao" or "5 de abril").
 */
function findSectorsByStreet(streetName, database = sectorDatabase) {
  const normalizedName = normalizeStreetName(streetName);
  if (!normalizedName) return [];

  const exactMatches = database.sectors.flatMap((sector) =>
    sector.streets
      .filter((street) => street.normalizedName === normalizedName)
      .map((street) => ({
        sectorId: sector.id,
        sectorName: sector.name,
        street: street.name,
      })),
  );

  if (exactMatches.length) return exactMatches;
  return database.sectors.flatMap((sector) =>
    sector.streets
      .filter((street) => street.normalizedName.includes(normalizedName))
      .map((street) => ({
        sectorId: sector.id,
        sectorName: sector.name,
        street: street.name,
      })),
  );
}

module.exports = { findSectorsByStreet, normalizeStreetName };
