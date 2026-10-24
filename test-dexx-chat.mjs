// AI Dexx chat (v4.1.22.0) logic tests.
// Loads the real app.js in a stubbed DOM and verifies the chat wiring:
// AI path is disabled until keys are stamped, the Lab snapshot carries the
// right numbers (and no markup injection), and the scripted fallback answers.
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
    scrollIntoView() {}, focus() {}, click() {}, remove() {},
    textContent: '', innerHTML: '', value: '', hidden: false, disabled: false,
  };
  return new Proxy(t, { get: (o, p) => (p in o ? o[p] : undefined), set: (o, p, v) => { o[p] = v; return true; } });
}

const store = {};
const sandbox = {
  console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object,
  setTimeout: (fn) => 0, clearTimeout: () => {}, setInterval: () => 0,
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
    addEventListener() {}, body: makeEl(),
  },
  location: { hash: '' },
  history: { replaceState() {} },
  navigator: {}, window: {},
  scrollTo() {}, confirm: () => true,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const harness = `
;globalThis.__T = {
  dexxAIReady, dexxSnapshotText, dexxScriptedAnswer, dexxAddBubble, dexxAsk,
  calc, moneyJourneyState,
  setData(d){ data = d; },
  getConfig(){ return FL_DEXX; },
};`;
vm.runInContext(src + harness, sandbox);
const T = sandbox.__T;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

const isoD = (d) => d.toISOString().slice(0, 10);
const noon = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
function fridaysAgo(n) {
  const t = noon(new Date());
  const delta = (t.getDay() - 5 + 7) % 7;
  const f = new Date(t); f.setDate(f.getDate() - delta - 7 * n);
  return isoD(f);
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoD(d); };

function freshData() {
  return {
    researcherName: 'Rob', paycheck: 0, currentBalance: 500, payDate: '', nextPayday: '',
    bills: [], debts: [], expenseRecords: [], savingsGoals: [],
    paycheckHistory: [], approvedPlan: null, skippedPaydays: [],
    profile: { payFrequency: 'weekly', paydayDay: 5, incomePattern: 'variable', recurringBillCount: 0, financialStrategy: 'balanced', reserveDays: 14 },
    setup: {}, missions: {},
  };
}

console.log('AI gate');
{
  ok('AI disabled with unstamped placeholders', T.dexxAIReady() === false);
  const cfg = T.getConfig();
  ok('config carries no real key or URL', !/supabase\.co/.test(cfg.url) && !/^sk-/.test(cfg.anonKey));
}

console.log('Snapshot — planned check (no confirmed paycheck)');
{
  const d = freshData();
  d.payDate = fridaysAgo(0); d.nextPayday = addDays(fridaysAgo(0), 7);
  d.bills = [{ id: 'b1', name: 'Ameren Missouri', amount: 143.27, date: addDays(fridaysAgo(0), 3), status: 'due' }];
  T.setData(d);
  const s = T.dexxSnapshotText(T.calc());
  ok('names the journey step', /Journey step \d of 7:/.test(s), s.slice(0, 60));
  ok('labels safe-to-spend as planned', /Safe-to-spend: .*planned/.test(s));
  ok('lists the bill with amount and name', s.includes('Ameren Missouri') && s.includes('143.27'), s);
  ok('snapshot stays under the server cap', s.length <= 6000, String(s.length));
}

console.log('Snapshot — live check (confirmed paycheck)');
{
  const d = freshData();
  d.paycheck = 1842; d.payDate = fridaysAgo(0); d.nextPayday = addDays(fridaysAgo(0), 7);
  T.setData(d);
  const s = T.dexxSnapshotText(T.calc());
  ok('labels safe-to-spend as live', /Safe-to-spend: .*live/.test(s));
}

console.log('Scripted fallback');
{
  const d = freshData();
  d.paycheck = 1842; d.payDate = fridaysAgo(0); d.nextPayday = addDays(fridaysAgo(0), 7);
  T.setData(d);
  const a = T.dexxScriptedAnswer();
  ok('fallback keeps the classic payday paragraph', a.startsWith('Based on this payday, cover'));
  ok('fallback quotes real figures', /\$/.test(a));
}

console.log('Bubble rendering (XSS by construction)');
{
  const evil = '<img src=x onerror=alert(1)>';
  const b = T.dexxAddBubble(evil, 'user');
  ok('user text lands in textContent, never markup', b && b.textContent === evil && !/<img/.test(b.innerHTML || ''));
  const fnSrc = T.dexxAddBubble.toString();
  ok('dexxAddBubble never uses innerHTML', !/innerHTML/.test(fnSrc));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
