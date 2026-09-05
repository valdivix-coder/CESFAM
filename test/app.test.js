'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

/* ── The smallest DOM the page controller touches, so app.js runs unmodified ─ */

class Text {
  constructor(value) { this.data = String(value); }
  get text() { return this.data; }
}

class Fragment {
  constructor() { this.children = []; }
  append(...nodes) { this.children.push(...flatten(nodes)); }
}

function flatten(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node instanceof Fragment) out.push(...node.children);
    else if (node instanceof Text || node instanceof Element) out.push(node);
    else out.push(new Text(node));
  }
  return out;
}

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.value = '';
    this.focused = false;
  }

  set textContent(value) { this.children = [new Text(value)]; }
  get textContent() { return this.text; }

  append(...nodes) { this.children.push(...flatten(nodes)); }
  replaceChildren(...nodes) { this.children = flatten(nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focused = true; }

  addEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) || []).concat(handler));
  }

  dispatch(name, event = {}) {
    const handlers = this.listeners.get(name) || [];
    assert.ok(handlers.length, `no "${name}" listener on <${this.tagName}${this.id ? ` id=${this.id}` : ''}>`);
    for (const handler of handlers) handler({ preventDefault() {}, ...event });
  }

  /** Depth-first descendants whose class list contains `name`. */
  byClass(name, found = []) {
    for (const child of this.children) {
      if (!(child instanceof Element)) continue;
      if (child.className.split(' ').includes(name)) found.push(child);
      child.byClass(name, found);
    }
    return found;
  }

  querySelectorAll(selector) {
    assert.ok(selector.startsWith('.'), `unsupported selector ${selector}`);
    return this.byClass(selector.slice(1));
  }

  get text() { return this.children.map((child) => child.text).join(''); }
}

function createPage() {
  const elements = {};
  for (const [selector, tag] of [
    ['#street-form', 'form'],
    ['#street-input', 'input'],
    ['#clear-button', 'button'],
    ['#suggestions', 'ul'],
    ['#answer', 'section'],
  ]) {
    const node = new Element(tag);
    node.id = selector.slice(1);
    elements[selector] = node;
  }
  elements['#suggestions'].hidden = true;
  elements['#clear-button'].hidden = true;

  return {
    elements,
    document: {
      currentScript: { src: pathToFileURL(require.resolve('../public/app.js')).href },
      querySelector: (selector) => elements[selector] ?? null,
      createElement: (tag) => new Element(tag),
      createElementNS: (_ns, tag) => new Element(tag),
      createDocumentFragment: () => new Fragment(),
    },
  };
}

const database = JSON.parse(readFileSync('data/sectores.json', 'utf8'));

/** Loads sector-lookup.js and app.js in one sandbox, with a stubbed fetch. */
function loadApp({ fetchImpl, seeded } = {}) {
  const page = createPage();
  const sandbox = {
    document: page.document,
    console,
    URL,
    setTimeout,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => database })),
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  if (seeded) sandbox.SECTOR_DATABASE = database;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('public/sector-lookup.js', 'utf8'), sandbox, { filename: 'sector-lookup.js' });
  vm.runInContext(readFileSync('public/app.js', 'utf8'), sandbox, { filename: 'app.js' });

  // Flush the whole microtask queue so a rejected fetch reaches its catch.
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { ...page, settle };
}

async function ready() {
  const page = loadApp();
  await page.settle();
  return page;
}

function type(page, value) {
  page.elements['#street-input'].value = value;
  page.elements['#street-input'].dispatch('input');
}

const options = (page) => page.elements['#suggestions'].byClass('suggestion');
const panels = (page) => page.elements['#answer'].byClass('panel');
const sectorsShown = (page) => panels(page).map((node) => node.dataset.sector);
const answerText = (page) => page.elements['#answer'].text;

/* ── Tests ─────────────────────────────────────────────────────────────── */

test('opens on a resting hint, with no sector cards or counts', async () => {
  const page = await ready();
  assert.match(answerText(page), /no distingue mayúsculas ni tildes/);
  assert.equal(panels(page).length, 0);
  assert.equal(page.elements['#suggestions'].hidden, true);
  assert.doesNotMatch(answerText(page), /calles/, 'the page never advertises street counts');
});

test('suggests streets while typing and colours each by its sectors', async () => {
  const page = await ready();
  type(page, 'mill');

  const shown = options(page);
  assert.ok(shown.length > 0);
  assert.equal(page.elements['#suggestions'].hidden, false);
  assert.equal(page.elements['#street-input'].getAttribute('aria-expanded'), 'true');
  assert.match(shown[0].text, /MILLAHUIN/);
  assert.deepEqual(shown[0].byClass('dot-azul').length, 1);

  type(page, 'andres bel');
  assert.deepEqual(
    options(page)[0].byClass('suggestion-dots')[0].children.map((dot) => dot.className),
    ['dot-amarillo', 'dot-azul'],
    'a street in two sectors shows both colours before it is even chosen',
  );
});

test('marks the typed fragment inside each suggestion', async () => {
  const page = await ready();
  type(page, 'coig');
  const [name] = options(page)[0].byClass('suggestion-name');
  const marked = name.children.filter((child) => child.className === 'b' || child.tagName === 'b');
  assert.equal(marked.length, 1);
  assert.equal(marked[0].text, 'COIG', 'the highlight tracks the accented original');
});

test('a single letter is too broad to suggest anything', async () => {
  const page = await ready();
  type(page, 'a');
  assert.equal(options(page).length, 0);
  assert.equal(page.elements['#suggestions'].hidden, true);
});

test('typing a complete street name answers without pressing anything', async () => {
  const page = await ready();
  type(page, 'los coigues');
  assert.equal(page.elements['#suggestions'].hidden, true);
  assert.deepEqual(sectorsShown(page), ['amarillo']);
  assert.match(answerText(page), /Sector Amarillo/);
  assert.match(answerText(page), /LOS COIGÜES/);
});

test('clicking a suggestion fills the field and answers', async () => {
  const page = await ready();
  type(page, 'milla');
  options(page)[0].dispatch('click');
  assert.equal(page.elements['#street-input'].value, 'MILLAHUIN');
  assert.equal(page.elements['#suggestions'].hidden, true);
  assert.deepEqual(sectorsShown(page), ['azul']);
});

test('the arrow keys walk the list and Enter takes the highlighted option', async () => {
  const page = await ready();
  type(page, 'parque');
  const input = page.elements['#street-input'];

  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-activedescendant'), 'suggestion-0');
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-activedescendant'), 'suggestion-1');
  input.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(input.getAttribute('aria-activedescendant'), 'suggestion-0');
  assert.equal(options(page)[0].getAttribute('aria-selected'), 'true');

  const chosen = options(page)[0].text;
  page.elements['#street-form'].dispatch('submit');
  assert.equal(page.elements['#street-input'].value, chosen);
  assert.deepEqual(sectorsShown(page), ['verde']);
});

test('Escape closes the list without answering', async () => {
  const page = await ready();
  type(page, 'parque');
  page.elements['#street-input'].dispatch('keydown', { key: 'Escape' });
  assert.equal(page.elements['#suggestions'].hidden, true);
  assert.equal(page.elements['#street-input'].getAttribute('aria-activedescendant'), null);
});

test('asks for the house number only when the street splits between sectors', async () => {
  const page = await ready();

  type(page, 'los coigues');
  assert.equal(page.elements['#answer'].byClass('number-ask').length, 0, 'a settled street never asks');

  type(page, 'andres bello');
  assert.deepEqual(sectorsShown(page), ['amarillo', 'azul']);
  const [ask] = page.elements['#answer'].byClass('number-ask');
  assert.ok(ask, 'a split street asks for the number');
  assert.match(ask.text, /Qué número es tu casa/);
});

test('the house number narrows the answer without remounting the field', async () => {
  const page = await ready();
  type(page, 'andres bello');
  const [ask] = page.elements['#answer'].byClass('number-ask');
  const field = ask.children.find((child) => child.tagName === 'input');

  field.value = '450';
  field.dispatch('input');
  assert.deepEqual(sectorsShown(page), ['amarillo']);
  assert.match(answerText(page), /menor de 800/);
  assert.equal(page.elements['#answer'].byClass('number-ask')[0], ask, 'the field survives the update');

  field.value = '950';
  field.dispatch('input');
  assert.deepEqual(sectorsShown(page), ['azul']);
  assert.match(answerText(page), /mayor de 800/);

  field.value = '';
  field.dispatch('input');
  assert.deepEqual(sectorsShown(page), ['amarillo', 'azul'], 'clearing the number restores both tramos');
});

test('the dividing number itself is flagged, never guessed', async () => {
  const page = await ready();
  type(page, 'andres bello');
  const field = page.elements['#answer'].byClass('number-ask')[0].children.find((c) => c.tagName === 'input');
  field.value = '800';
  field.dispatch('input');

  assert.deepEqual(sectorsShown(page), ['amarillo', 'azul']);
  assert.match(answerText(page), /divide esta calle justo en el 800/);
  assert.match(answerText(page), /Confírmalo en el CESFAM/);
});

test('a street listed in two sectors without tramos says so and asks nothing', async () => {
  const page = await ready();
  type(page, 'barros arana');
  assert.deepEqual(sectorsShown(page), ['amarillo', 'azul']);
  assert.match(answerText(page), /no la divide por número/);
  assert.equal(page.elements['#answer'].byClass('number-ask').length, 0);
});

test('a street written with its tramo still resolves', async () => {
  const page = await ready();
  type(page, 'andres bello 950');
  assert.deepEqual(sectorsShown(page), ['azul']);
});

test('explains a miss instead of leaving the page blank', async () => {
  const page = await ready();
  type(page, 'zzzz');
  assert.equal(options(page).length, 0);
  assert.match(answerText(page), /No encontramos/);
  assert.match(answerText(page), /zzzz/);
});

test('the clear button empties the field and returns to the resting state', async () => {
  const page = await ready();
  type(page, 'los coigues');
  assert.equal(page.elements['#clear-button'].hidden, false);

  page.elements['#clear-button'].dispatch('click');
  assert.equal(page.elements['#street-input'].value, '');
  assert.equal(page.elements['#clear-button'].hidden, true);
  assert.equal(panels(page).length, 0);
  assert.match(answerText(page), /no distingue mayúsculas ni tildes/);
  assert.equal(page.elements['#street-input'].focused, true);
});

test('an early Enter never falls through to a native form submit', async () => {
  let release;
  const page = loadApp({ fetchImpl: () => new Promise((resolve) => { release = resolve; }) });

  let defaultPrevented = false;
  page.elements['#street-input'].value = 'Millahuin';
  page.elements['#street-form'].dispatch('submit', { preventDefault: () => { defaultPrevented = true; } });
  assert.ok(defaultPrevented);
  assert.match(answerText(page), /Cargando/);

  release({ ok: true, status: 200, json: async () => database });
  await page.settle();
  assert.deepEqual(sectorsShown(page), ['azul'], 'the pending query resolves once the listing arrives');
});

test('reports a failed load and keeps saying so', async () => {
  const page = loadApp({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  await page.settle();
  assert.match(answerText(page), /No pudimos cargar/);
  type(page, 'los coigues');
  assert.match(answerText(page), /Recarga la página/);
});

test('runs from a pre-seeded database without fetching', async () => {
  const page = loadApp({
    seeded: true,
    fetchImpl: () => { throw new Error('the seeded build must not fetch'); },
  });
  type(page, 'ambar');
  assert.deepEqual(sectorsShown(page), ['verde']);
});

test('resolves the database relative to its own script', async () => {
  const requested = [];
  loadApp({
    fetchImpl: async (url) => {
      requested.push(String(url));
      return { ok: true, status: 200, json: async () => database };
    },
  });
  assert.equal(requested.length, 1);
  assert.match(requested[0], /public\/data\/sectores\.json$/);
});
