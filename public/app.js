'use strict';

/*
 * Consulta tu sector · CESFAM Pitrufquén
 *
 * The page answers one question, so the interaction is one field: suggestions
 * appear while the neighbour types, and the sector's colour arrives with them.
 * The house number is only ever asked for when the street actually splits
 * between two sectors — the listing divides seventeen of them at a number.
 */

const { findSectorsByStreet, foldAccents, normalizeStreetName, parseQuery, suggestStreets } = window.SectorLookup;

// Resolve the database next to this script so the page works from any path,
// including a GitHub Pages project subdirectory. An inlined build has no
// currentScript, and none either, since it ships the listing with the page.
const scriptSource = document.currentScript && document.currentScript.src;
const databaseUrl = scriptSource ? new URL('data/sectores.json', scriptSource) : 'data/sectores.json';

const form = document.querySelector('#street-form');
const input = document.querySelector('#street-input');
const clearButton = document.querySelector('#clear-button');
const list = document.querySelector('#suggestions');
const answer = document.querySelector('#answer');

const RESTING_HINT = 'La búsqueda no distingue mayúsculas ni tildes.';

let database = window.SECTOR_DATABASE || null;
let loadError = false;
let suggestions = [];
let activeIndex = -1;
let houseNumber = null;
let numberAsk = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const isDigits = (value) => value.length > 0 && [...value].every((char) => char >= '0' && char <= '9');

/* ── Suggestions ───────────────────────────────────────────────────────── */

/** Wraps the typed fragment in <b> at the offsets where it matches. */
function highlighted(name, query) {
  const fragment = document.createDocumentFragment();
  const needle = foldAccents(query).toUpperCase().trim();
  const start = needle ? foldAccents(name).toUpperCase().indexOf(needle) : -1;
  if (start === -1) {
    fragment.append(name);
    return fragment;
  }
  fragment.append(name.slice(0, start));
  fragment.append(el('b', null, name.slice(start, start + needle.length)));
  fragment.append(name.slice(start + needle.length));
  return fragment;
}

function renderSuggestions(query) {
  list.replaceChildren(...suggestions.map((suggestion, index) => {
    const option = el('button', 'suggestion');
    option.type = 'button';
    option.id = `suggestion-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === activeIndex));

    const name = el('span', 'suggestion-name');
    name.append(highlighted(suggestion.name, query));

    const dots = el('span', 'suggestion-dots');
    for (const sector of suggestion.sectors) dots.append(el('span', `dot-${sector}`));

    option.append(name, dots);
    // Keep the caret in the field when the option is pressed.
    option.addEventListener('mousedown', (event) => event.preventDefault());
    option.addEventListener('click', () => choose(suggestion));

    const item = document.createElement('li');
    item.append(option);
    return item;
  }));
  openList(suggestions.length > 0);
}

function openList(open) {
  list.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (!open) {
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
  }
}

/** Moves through the options and back out to the field, wrapping at both ends. */
function moveActive(step) {
  if (!suggestions.length) return;
  openList(true);
  const slots = suggestions.length + 1;
  activeIndex = ((activeIndex + 1 + step) % slots + slots) % slots - 1;
  for (const [index, option] of [...list.querySelectorAll('.suggestion')].entries()) {
    option.setAttribute('aria-selected', String(index === activeIndex));
  }
  if (activeIndex >= 0) input.setAttribute('aria-activedescendant', `suggestion-${activeIndex}`);
  else input.removeAttribute('aria-activedescendant');
}

function choose(suggestion) {
  input.value = suggestion.name;
  clearButton.hidden = false;
  houseNumber = null;
  numberAsk = null;
  suggestions = [];
  openList(false);
  showAnswer();
}

/* ── Answer ────────────────────────────────────────────────────────────── */

function resting(message) {
  answer.replaceChildren(el('p', 'resting', message));
}

function panel(match) {
  const node = el('article', 'panel');
  node.dataset.sector = match.sectorId;
  node.append(
    el('span', 'panel-sector', match.sectorName),
    el('span', 'panel-street', match.range ? `${match.baseName} · ${match.range.label}` : match.street),
  );
  return node;
}

/**
 * The number field is built once per street and then kept mounted, so typing
 * into it narrows the answer above without the field losing focus.
 */
function buildNumberAsk() {
  const wrapper = el('div', 'number-ask');
  const label = el('label', null, '¿Qué número es tu casa?');
  label.htmlFor = 'number-input';

  const field = document.createElement('input');
  field.id = 'number-input';
  field.type = 'text';
  field.inputMode = 'numeric';
  field.autocomplete = 'off';
  field.maxLength = 6;
  field.placeholder = '000';
  field.value = houseNumber === null ? '' : String(houseNumber);
  field.setAttribute('aria-label', 'Número de tu casa');
  field.addEventListener('input', () => {
    const value = field.value.trim();
    houseNumber = isDigits(value) ? Number(value) : null;
    showAnswer();
  });

  wrapper.append(label, field);
  return wrapper;
}

function showAnswer() {
  const street = input.value.trim();
  if (loadError) return resting('No pudimos cargar el listado de calles. Recarga la página.');
  if (!database) return resting('Cargando el listado de calles…');
  if (!street) { numberAsk = null; return resting(RESTING_HINT); }

  const matches = findSectorsByStreet(street, { database, number: houseNumber ?? undefined });
  if (!matches.length) {
    numberAsk = null;
    const miss = el('p', 'miss');
    miss.append('No encontramos ', el('em', null, street),
      ' en el listado. Revisa cómo se escribe o elige una de las sugerencias.');
    answer.replaceChildren(miss);
    return;
  }

  const nodes = matches.map(panel);
  const boundary = matches.find((match) => match.boundary);
  const splitsByNumber = matches.every((match) => match.range);

  if (boundary) {
    const note = el('p', 'note');
    note.append('El listado divide esta calle justo en el ', el('strong', null, String(boundary.range.pivot)),
      ' y no dice a cuál de los dos tramos pertenece ese número. Confírmalo en el CESFAM.');
    nodes.push(note);
  } else if (matches.length > 1 && !splitsByNumber) {
    numberAsk = null;
    nodes.push(el('p', 'note',
      'Esta calle figura en dos sectores y el listado no la divide por número. Confírmalo en el CESFAM.'));
  }

  // Asked for only while a number can still change the answer.
  if (splitsByNumber) {
    if (!numberAsk) numberAsk = buildNumberAsk();
    nodes.push(numberAsk);
  } else if (!boundary) {
    numberAsk = null;
  }

  answer.replaceChildren(...nodes);
}

/* ── Input wiring ──────────────────────────────────────────────────────── */

function onInput() {
  const value = input.value;
  clearButton.hidden = value.length === 0;
  houseNumber = null;
  numberAsk = null;
  if (!database) { openList(false); return; }

  suggestions = suggestStreets(value, database);
  activeIndex = -1;

  // A complete street name is answer enough; nothing left to press. A number
  // written straight into the field ("Andrés Bello 950") counts as complete too.
  const parsed = parseQuery(value);
  const normalized = normalizeStreetName(parsed.street);
  if (suggestions.some((suggestion) => suggestion.normalizedBase === normalized)) {
    houseNumber = parsed.number;
    suggestions = [];
    openList(false);
    showAnswer();
    return;
  }

  renderSuggestions(value);
  if (!value.trim()) resting(RESTING_HINT);
  else if (suggestions.length) resting('Elige tu calle de la lista.');
  else showAnswer();
}

input.addEventListener('input', onInput);

input.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
  else if (event.key === 'Escape') openList(false);
});

input.addEventListener('blur', () => window.setTimeout(() => openList(false), 120));

input.addEventListener('focus', () => {
  if (suggestions.length) renderSuggestions(input.value);
});

// Registered before the database loads, so an early Enter never falls through
// to the browser's native form submit.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const picked = suggestions[activeIndex >= 0 ? activeIndex : 0];
  if (picked && !list.hidden) { choose(picked); return; }
  openList(false);
  showAnswer();
});

clearButton.addEventListener('click', () => {
  input.value = '';
  clearButton.hidden = true;
  suggestions = [];
  houseNumber = null;
  numberAsk = null;
  openList(false);
  showAnswer();
  input.focus();
});

function start() {
  clearButton.hidden = input.value.length === 0;
  if (input.value.trim()) onInput();
  else showAnswer();
}

if (database) {
  start();
} else {
  resting('Cargando el listado de calles…');
  fetch(databaseUrl)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
    .then((loaded) => {
      if (!loaded || !Array.isArray(loaded.sectors)) throw new Error('formato inesperado');
      database = loaded;
      start();
    })
    .catch(() => {
      loadError = true;
      showAnswer();
    });
}
