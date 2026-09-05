'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

/** The smallest DOM the page controller touches, so app.js runs unmodified. */
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) || []).concat(handler));
  }

  dispatch(name, event = {}) {
    const handlers = this.listeners.get(name) || [];
    assert.ok(handlers.length, `no "${name}" listener is registered on <${this.tagName}>`);
    for (const handler of handlers) handler(event);
  }

  querySelector(selector) {
    return selector === 'button[type="submit"]'
      ? this.children.find((child) => child.tagName === 'button')
      : null;
  }

  /** Flattened text of this subtree, used to assert what the user would read. */
  get text() {
    return [this.textContent, ...this.children.map((child) => child.text)].filter(Boolean).join(' | ');
  }
}

function createPage() {
  const form = new Element('form');
  const button = new Element('button');
  button.tagName = 'button';
  form.append(button);
  const elements = {
    '#street-form': form,
    '#street-input': new Element('input'),
    '#number-input': new Element('input'),
    '#result': new Element('div'),
    '#sector-summary': new Element('div'),
  };
  return {
    elements,
    document: {
      currentScript: { src: pathToFileURL(require.resolve('../public/app.js')).href },
      querySelector: (selector) => elements[selector] ?? null,
      createElement: (tag) => new Element(tag),
    },
  };
}

/** Loads sector-lookup.js and app.js in one sandbox, with a stubbed fetch. */
async function loadApp({ fetchImpl } = {}) {
  const page = createPage();
  const database = JSON.parse(readFileSync('data/sectores.json', 'utf8'));
  const sandbox = {
    document: page.document,
    console,
    URL,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => database })),
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(readFileSync('public/sector-lookup.js', 'utf8'), sandbox, { filename: 'sector-lookup.js' });
  vm.runInContext(readFileSync('public/app.js', 'utf8'), sandbox, { filename: 'app.js' });
  return { ...page, database, settle: () => new Promise((resolve) => setImmediate(resolve)) };
}

test('the submit listener exists before the database finishes loading', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const page = await loadApp({ fetchImpl: () => pending });

  // Regression guard: the listener used to be registered inside the fetch
  // callback, so an early Enter reloaded the page through a native submit.
  let defaultPrevented = false;
  page.elements['#street-input'].value = 'Los Coigües';
  page.elements['#street-form'].dispatch('submit', { preventDefault: () => { defaultPrevented = true; } });
  assert.ok(defaultPrevented, 'an early submit must never reach the browser default');
  assert.match(page.elements['#result'].text, /Cargando/);
  assert.equal(page.elements['#street-form'].querySelector('button[type="submit"]').disabled, true);

  release({ ok: true, status: 200, json: async () => page.database });
  await page.settle();
  await page.settle();
  assert.equal(page.elements['#street-form'].querySelector('button[type="submit"]').disabled, false);
});

test('renders the sector summary once the database loads', async () => {
  const page = await loadApp();
  await page.settle();
  await page.settle();
  const cards = page.elements['#sector-summary'].children;
  assert.equal(cards.length, page.database.sectors.length);
  assert.match(cards[0].className, /sector-card amarillo/);
  assert.match(cards[0].text, /Sector Amarillo \| 99 calles/);
});

async function submit(page, street, number = '') {
  page.elements['#street-input'].value = street;
  page.elements['#number-input'].value = number;
  page.elements['#street-form'].dispatch('submit', { preventDefault() {} });
  return page.elements['#result'];
}

test('answers a plain street lookup', async () => {
  const page = await loadApp();
  await page.settle();
  await page.settle();
  const result = await submit(page, 'los coigues');
  assert.equal(result.className, 'result found');
  assert.match(result.text, /Sector Amarillo \| LOS COIGÜES/);
});

test('uses the house number to pick a tramo', async () => {
  const page = await loadApp();
  await page.settle();
  await page.settle();

  let result = await submit(page, 'Andrés Bello', '450');
  assert.match(result.text, /Sector Amarillo \| ANDRÉS BELLO \(menor de 800\)/);
  assert.doesNotMatch(result.text, /Sector Azul/);

  result = await submit(page, 'Andrés Bello', '950');
  assert.match(result.text, /Sector Azul \| ANDRÉS BELLO \(mayor de 800\)/);

  result = await submit(page, 'Andrés Bello');
  assert.match(result.text, /Sector Amarillo/);
  assert.match(result.text, /Sector Azul/);
  assert.match(result.text, /Indica el número de la casa/);
});

test('warns instead of guessing on the pivot and on a two-sector street', async () => {
  const page = await loadApp();
  await page.settle();
  await page.settle();

  let result = await submit(page, 'Andrés Bello', '800');
  assert.match(result.text, /divide esta calle en 800/);

  result = await submit(page, 'Barros Arana');
  assert.match(result.text, /figura en más de un sector/);
});

test('rejects an empty street and a non-numeric house number', async () => {
  const page = await loadApp();
  await page.settle();
  await page.settle();

  let result = await submit(page, '   ');
  assert.equal(result.className, 'result error');
  assert.match(result.text, /Escribe una calle/);

  result = await submit(page, 'Los Coigües', '12a');
  assert.equal(result.className, 'result error');
  assert.match(result.text, /número de la casa/);
});

test('offers suggestions when nothing matches', async () => {
  const page = await loadApp();
  await page.settle();
  await page.settle();
  const result = await submit(page, 'parque nacional');
  assert.equal(result.className, 'result not-found');
  assert.match(result.text, /No encontramos/);
  assert.match(result.text, /Quisiste decir/);
  assert.match(result.text, /PARQUE NACIONAL PUYEHUE/);
});

test('reports a failed database load and keeps the form usable', async () => {
  const page = await loadApp({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  await page.settle();
  await page.settle();
  assert.equal(page.elements['#result'].className, 'result error');
  assert.match(page.elements['#result'].text, /No fue posible cargar/);

  const result = await submit(page, 'los coigues');
  assert.equal(result.className, 'result error');
  assert.match(result.text, /Recarga la página/);
});

test('resolves the database relative to its own script', async () => {
  const requested = [];
  await loadApp({
    fetchImpl: async (url) => {
      requested.push(String(url));
      return { ok: true, status: 200, json: async () => ({ sectors: [] }) };
    },
  });
  assert.equal(requested.length, 1);
  assert.match(requested[0], /public\/data\/sectores\.json$/);
});
