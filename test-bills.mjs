// Smart Bill Calendar (v4.1.20.4) logic tests.
// Loads the real app.js in a stubbed DOM and exercises bill status scenarios.
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
    scrollIntoView() {}, focus() {}, click() {},
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
  billStatusOf, smartBillGroups, toggleBillPaidOccurrence, billOccurrences,
  billPressureWindows, billDefinitions,
  setData(d){ data = d; },
  getData(){ return data; },
};`;
vm.runInContext(src + harness, sandbox);
const T = sandbox.__T;

const isoD = (d) => d.toISOString().slice(0, 10);
const noon = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
const daysOut = (n) => { const t = noon(new Date()); t.setDate(t.getDate() + n); return isoD(t); };

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

function freshData() {
  return {
    researcherName: 'Rob', paycheck: 0, currentBalance: 500, payDate: '', nextPayday: '',
    bills: [], debts: [], expenseRecords: [], savingsGoals: [],
    paycheckHistory: [], approvedPlan: null, skippedPaydays: [],
    profile: { payFrequency: 'weekly', paydayDay: 5, incomePattern: 'variable', recurringBillCount: 0, financialStrategy: 'balanced', reserveDays: 14 },
    setup: {}, missions: {},
  };
}
const C = (nextPayIso) => ({ nextPay: nextPayIso });

console.log('Scenario 1: status classification');
{
  const d = freshData();
  d.bills = [
    { id: 'b-over', name: 'Overdue Electric', amount: 120, dueDate: daysOut(-10), frequency: 'once', priority: 'essential' },
    { id: 'b-next', name: 'Due Soon Water', amount: 60, dueDate: daysOut(3), frequency: 'once', priority: 'important' },
    { id: 'b-later', name: 'Later Internet', amount: 80, dueDate: daysOut(20), frequency: 'once', priority: 'flexible' },
  ];
  T.setData(d);
  const g = T.smartBillGroups(C(daysOut(7)));
  ok('overdue bucket', g.overdue.length === 1 && g.overdue[0].id === 'b-over' && g.overdue[0].daysOverdue === 10, JSON.stringify(g.overdue.map(b => [b.id, b.daysOverdue])));
  ok('due-next bucket', g.dueNext.length === 1 && g.dueNext[0].id === 'b-next');
  ok('upcoming bucket', g.upcoming.length === 1 && g.upcoming[0].id === 'b-later');
  ok('paid bucket empty', g.paidRecent.length === 0);
  ok('billStatusOf direct: paid wins', T.billStatusOf({ paid: true, date: daysOut(-5) }, daysOut(0), daysOut(7)) === 'paid');
}

console.log('Scenario 2: payment confirmation toggle');
{
  const d = T.getData();
  const before = T.smartBillGroups(C(daysOut(7)));
  const occ = before.dueNext[0];
  const paidNow = T.toggleBillPaidOccurrence(occ);
  ok('toggle returns true (now paid)', paidNow === true);
  const after = T.smartBillGroups(C(daysOut(7)));
  ok('moves to paidRecent', after.paidRecent.length === 1 && after.paidRecent[0].id === 'b-next');
  ok('leaves dueNext', after.dueNext.length === 0);
  const back = T.toggleBillPaidOccurrence({ parentId: 'b-next', id: 'b-next', occurrenceDate: occ.occurrenceDate, date: occ.date });
  ok('toggle back returns false (now unpaid)', back === false);
  const again = T.smartBillGroups(C(daysOut(7)));
  ok('returns to dueNext, no duplicates', again.dueNext.length === 1 && again.paidRecent.length === 0);
}

console.log('Scenario 3: no-duplicate invariant over wide window');
{
  const d = freshData();
  d.bills = [
    { id: 'b-weekly', name: 'Weekly Groceries', amount: 150, dueDate: daysOut(-100), frequency: 'weekly', priority: 'essential' },
    { id: 'b-monthly', name: 'Rent', amount: 1200, dueDate: daysOut(-100), frequency: 'monthly', priority: 'essential' },
  ];
  T.setData(d);
  const occs = T.billOccurrences(daysOut(-90), daysOut(30));
  const keys = occs.map(o => `${o.parentId || o.id}|${o.occurrenceDate || o.date}`);
  ok('all occurrence keys unique', new Set(keys).size === keys.length, `${keys.length} occs, ${new Set(keys).size} unique`);
  ok('generates expected volume', keys.length >= 15, `${keys.length} occurrences`);
}

console.log('Scenario 4: overdue carries forward across a new cycle, listed once');
{
  const d = freshData();
  d.bills = [{ id: 'b-over', name: 'Overdue Electric', amount: 120, dueDate: daysOut(-10), frequency: 'once', priority: 'essential' }];
  d.payDate = daysOut(-14); d.nextPayday = daysOut(-7); // stale cycle (missed weeks)
  T.setData(d);
  const g1 = T.smartBillGroups(C(daysOut(0)));
  // advance to a fresh cycle the way startNextPaycheckCycle would
  d.payDate = daysOut(0); d.nextPayday = daysOut(7);
  T.setData(d);
  const g2 = T.smartBillGroups(C(daysOut(7)));
  ok('overdue persists into new cycle', g2.overdue.length === 1 && g2.overdue[0].id === 'b-over');
  const keys = [...g2.overdue, ...g2.dueNext, ...g2.upcoming].map(o => `${o.parentId || o.id}|${o.occurrenceDate || o.date}`);
  ok('listed exactly once', keys.length === new Set(keys).size && keys.length === 1, JSON.stringify(keys));
}

console.log('Scenario 5: must-cover total = overdue + due-next minus protected');
{
  const d = freshData();
  d.bills = [
    { id: 'b-over', name: 'Overdue Electric', amount: 120, dueDate: daysOut(-10), frequency: 'once', priority: 'essential' },
    { id: 'b-next', name: 'Due Soon Water', amount: 60, dueDate: daysOut(3), frequency: 'once', priority: 'important' },
    { id: 'b-later', name: 'Later Internet', amount: 80, dueDate: daysOut(20), frequency: 'once', priority: 'flexible' },
  ];
  T.setData(d);
  const g = T.smartBillGroups(C(daysOut(7)));
  const must = [...g.overdue, ...g.dueNext].reduce((s, b) => s + Number(b.amount || 0), 0);
  ok('must-cover is 180', must === 180, `got ${must}`);
}

console.log('Scenario 6: pressure windows per payday');
{
  const d = freshData();
  d.bills = [
    { id: 'b1', name: 'Bill A', amount: 100, dueDate: daysOut(3), frequency: 'once', priority: 'essential' },
    { id: 'b2', name: 'Bill B', amount: 200, dueDate: daysOut(10), frequency: 'once', priority: 'important' },
  ];
  d.profile.payFrequency = 'weekly';
  d.nextPayday = daysOut(7);
  T.setData(d);
  const w = T.billPressureWindows({ nextPay: daysOut(7) });
  ok('windows generated', w.length >= 2, `${w.length} windows`);
  ok('first window has Bill A', w[0].bills.some(b => b.id === 'b1') && w[0].total === 100, JSON.stringify(w[0].total));
  const keys = w.flatMap(x => x.bills.map(b => `${b.parentId || b.id}|${b.occurrenceDate || b.date}`));
  ok('no bill double-counted across windows', keys.length === new Set(keys).size, JSON.stringify(keys));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
