'use strict';

const form = document.querySelector('#street-form');
const input = document.querySelector('#street-input');
const result = document.querySelector('#result');
const summary = document.querySelector('#sector-summary');

function normalizeStreetName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function showResult(matches, street) {
  if (!street) {
    result.className = 'result error';
    result.textContent = 'Escribe una calle para realizar la consulta.';
    return;
  }
  if (!matches.length) {
    result.className = 'result not-found';
    result.textContent = `No encontramos “${street}” en los sectores cargados.`;
    return;
  }
  result.className = 'result found';
  result.replaceChildren(...matches.map(({ sectorName, street: storedStreet }) => {
    const item = document.createElement('div');
    item.innerHTML = `<strong>${sectorName}</strong><span>${storedStreet}</span>`;
    return item;
  }));
}

fetch('data/sectores.json')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudo cargar la base')))
  .then((database) => {
    database.sectors.forEach((sector) => {
      const card = document.createElement('article');
      card.className = `sector-card ${sector.id}`;
      card.innerHTML = `<strong>${sector.name}</strong><span>${sector.streets.length} calles</span>`;
      summary.append(card);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const normalizedName = normalizeStreetName(input.value);
      const matches = database.sectors.flatMap((sector) => sector.streets
        .filter((street) => street.normalizedName === normalizedName)
        .map((street) => ({ sectorName: sector.name, street: street.name })));
      showResult(matches, input.value.trim());
    });
  })
  .catch(() => {
    result.className = 'result error';
    result.textContent = 'No fue posible cargar la base de sectores. Intenta recargar la página.';
  });
