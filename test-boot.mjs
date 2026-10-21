// Front-door boot behavior (v4.1.21.4).
// First-run visitors (guided setup not started) must land on the front door
// ("JOIN THE LAB"). Returning users skip it. Deep links (#savings etc.) are
// honored for returning users and overridden by the front door for first-run.
import { readFileSync } from 'fs';
import vm from 'vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function makeEl() {
  const t = {
    children: [], dataset: {}, style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {},
    append() {}, appendChild(c) { return c; }, replaceChildren() {},
    querySelector: () => makeEl(), querySelectorAll: () => [],
    closest: () => null, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollIntoView() {}, scrollTo() {}, focus() {}, click() {},
    textContent: '', innerHTML: '', value: '', hidden: false, disabled: false,
  };
  return new Proxy(t, { get: (o, p) => (p in o ? o[p] : undefined), set: (o, p, v) => { o[p] = v; return true; } });
}

function makeBody() {
  const classes = new Set(['front-door-active']); // index.html ships with the class
  const el = makeEl();
  el.classList = {
    add: (c) => classes.add(c),
    remove: (c) => classes.delete(c),
    toggle: (c, f) => { f ? classes.add(c) : classes.delete(c); },
    contains: (c) => classes.has(c),
  };
  return { el, classes };
}

function boot({ storedData = null, hash = '' } = {}) {
  const store = {};
  if (storedData) store['financial-lab-v3-data'] = JSON.stringify(storedData);
  const body = makeBody();
  const replaced = [];
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    structuredClone: (v) => JSON.parse(JSON.stringify(v)),
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: {
      getElementById: () => makeEl(),
      createElement: () => makeEl(),
      querySelector: () => makeEl(), querySelectorAll: () => [],
      addEventListener() {}, body: body.el,
    },
    location: { hash, pathname: '/', search: '' },
    history: { replaceState: (s, t, u) => { replaced.push(u); } },
    navigator: {}, window: {},
    scrollTo() {}, confirm: () => true,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { frontDoorUp: body.classes.has('front-door-active'), replaced };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

console.log('Front-door boot behavior');
{
  const r = boot();
  check('first-run visitor sees the front door (JOIN THE LAB)', r.frontDoorUp === true);
}
{
  const r = boot({ hash: '#savings' });
  check('first-run deep link still lands on the front door', r.frontDoorUp === true);
  check('first-run deep link hash is cleared', r.replaced.length > 0 && !String(r.replaced[r.replaced.length - 1]).includes('#savings'));
}
{
  const r = boot({ storedData: { setup: { currentMoneyConfirmed: true } } });
  check('returning user skips the front door', r.frontDoorUp === false);
}
{
  const r = boot({ storedData: { setup: { currentMoneyConfirmed: true } }, hash: '#savings' });
  check('returning user with #savings skips the front door', r.frontDoorUp === false);
  check('returning deep link is honored (#savings kept)', r.replaced.some((u) => u === '#savings'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
