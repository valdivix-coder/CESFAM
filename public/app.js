'use strict';

const { findSectorsByStreet, suggestStreets } = window.SectorLookup;

// Resolve the database next to this script so the page works from any path,
// including a GitHub Pages project subdirectory.
const databaseUrl = new URL('data/sectores.json', document.currentScript.src);

const form = document.querySelector('#street-form');
const input = document.querySelector('#street-input');
const numberInput = document.querySelector('#number-input');
const button = form.querySelector('button[type="submit"]');
const result = document.querySelector('#result');
const summary = document.querySelector('#sector-summary');

let database = null;
let loadError = false;

function render(className, nodes) {
  result.className = `result ${className}`;
  result.replaceChildren(...nodes);
}

function line(text, className) {
  const node = document.createElement('p');
  node.className = className || 'result-note';
  node.textContent = text;
  return node;
}

function matchRow({ sectorName, label }) {
  const row = document.createElement('div');
  const sector = document.createElement('strong');
  const street = document.createElement('span');
  sector.textContent = sectorName;
  street.textContent = label;
  row.append(sector, street);
  return row;
}

function suggestionList(street) {
  const suggestions = suggestStreets(street, database);
  if (!suggestions.length) return [];
  const list = document.createElement('ul');
  list.className = 'suggestions';
  for (const name of suggestions) {
    const item = document.createElement('li');
    const option = document.createElement('button');
    option.type = 'button';
    option.textContent = name;
    option.addEventListener('click', () => {
      input.value = name;
      search();
    });
    item.append(option);
    list.append(item);
  }
  return [line('¿Quisiste decir…?'), list];
}

function search() {
  const street = input.value.trim();
  const rawNumber = numberInput.value.trim();

  if (loadError) {
    render('error', [line('No fue posible cargar la base de sectores. Recarga la página.')]);
    return;
  }
  if (!database) {
    render('empty', [line('Cargando la base de sectores…')]);
    return;
  }
  if (!street) {
    render('error', [line('Escribe una calle para realizar la consulta.')]);
    return;
  }
  if (rawNumber && !/^\d{1,6}$/.test(rawNumber)) {
    render('error', [line('El número de la casa debe ser un valor entre 0 y 999999.')]);
    return;
  }

  const number = rawNumber ? Number(rawNumber) : undefined;
  const matches = findSectorsByStreet(street, { database, number });
  if (!matches.length) {
    render('not-found', [
      line(`No encontramos “${street}” en los sectores cargados.`, 'result-title'),
      ...suggestionList(street),
    ]);
    return;
  }

  const nodes = matches.map(matchRow);
  const boundary = matches.find((match) => match.boundary);
  if (boundary) {
    nodes.push(line(
      `La planilla divide esta calle en ${boundary.range.pivot} sin indicar a qué tramo pertenece ese número: confirma con el CESFAM.`,
      'result-warning',
    ));
  } else if (matches.length > 1 && matches.every((match) => !match.range)) {
    nodes.push(line('Esta calle figura en más de un sector; indica el número de la casa o confirma con el CESFAM.', 'result-warning'));
  } else if (matches.length > 1) {
    nodes.push(line('Indica el número de la casa para saber qué tramo corresponde.', 'result-note'));
  }
  render('found', nodes);
}

function renderSummary() {
  summary.replaceChildren(...database.sectors.map((sector) => {
    const card = document.createElement('article');
    const name = document.createElement('strong');
    const count = document.createElement('span');
    card.className = `sector-card ${sector.id}`;
    name.textContent = sector.name;
    count.textContent = `${sector.streets.length} calles`;
    card.append(name, count);
    return card;
  }));
}

// Registered before the database loads so an early submit never falls through
// to the browser's native form navigation.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});

button.disabled = true;
fetch(databaseUrl)
  .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
  .then((loaded) => {
    if (!loaded || !Array.isArray(loaded.sectors)) throw new Error('formato de base inesperado');
    database = loaded;
    button.disabled = false;
    renderSummary();
    if (input.value.trim()) search();
  })
  .catch(() => {
    loadError = true;
    button.disabled = false;
    render('error', [line('No fue posible cargar la base de sectores. Intenta recargar la página.')]);
  });
