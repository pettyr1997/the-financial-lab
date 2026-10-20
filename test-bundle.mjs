// Phases 3-6 bundle (v4.1.21.0) logic tests.
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
  paycheckPlan, billCoverageDetails, validatePaydayPlan,
  debtPayoffSchedule, simulateDebtPayoff, savingsOutlook, orderDebtsFor,
  validateFinancialData, financialMemorySnapshot, escapeHTML,
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
    researcherName: 'Rob', paycheck: 0, currentBalance: 0, payDate: '', nextPayday: '',
    bills: [], debts: [], expenseRecords: [], savingsGoals: [], saveAmount: 0, debtGoal: 0,
    paycheckHistory: [], approvedPlan: null, skippedPaydays: [],
    profile: { payFrequency: 'weekly', paydayDay: 5, incomePattern: 'variable', recurringBillCount: 0, financialStrategy: 'balanced', reserveDays: 14 },
    setup: {}, missions: {},
  };
}

console.log('Phase 3: bill coverage explainer');
{
  const d = freshData();
  d.paycheck = 400; d.payDate = daysOut(0); d.nextPayday = daysOut(7);
  d.bills = [
    { id: 'b1', name: 'Rent', amount: 300, dueDate: daysOut(2), frequency: 'monthly', priority: 'essential' },
    { id: 'b2', name: 'Internet', amount: 250, dueDate: daysOut(3), frequency: 'monthly', priority: 'important' },
  ];
  T.setData(d);
  const p = T.paycheckPlan();
  ok('shortfall detected', p.shortfall > 149 && p.shortfall < 151, `shortfall=${p.shortfall}`);
  const det = T.billCoverageDetails(p);
  ok('essential bill fully covered first', det.covered.length === 1 && det.covered[0].id === 'b1');
  ok('short bill named with uncovered amount', det.short.length === 1 && det.short[0].id === 'b2' && Math.abs(det.short[0].uncovered - 150) < 0.02, JSON.stringify(det.short.map(s => s.uncovered)));
}

console.log('Phase 3: plan math validation');
{
  const d = T.getData();
  const p = T.paycheckPlan();
  ok('valid plan has no issues', T.validatePaydayPlan(p).length === 0, JSON.stringify(T.validatePaydayPlan(p)));
  const tampered = { ...p, safeToSpend: p.safeToSpend + 1000 };
  ok('inflated plan flagged', T.validatePaydayPlan(tampered).length > 0);
  ok('null plan handled', T.validatePaydayPlan(null).length > 0);
}

console.log('Phase 5: debt payoff schedule math');
{
  const s = T.debtPayoffSchedule(1000, 24, 100);
  ok('1000 @ 24% / $100mo = 12 months', s.months === 12 && !s.never, JSON.stringify(s));
  ok('interest is exact (< $200 naive overestimate)', s.interest > 100 && s.interest < 200, `interest=${s.interest}`);
  const never = T.debtPayoffSchedule(1000, 24, 10);
  ok('payment below monthly interest = never', never.never === true);
  const zero = T.debtPayoffSchedule(0, 24, 100);
  ok('zero balance = 0 months', zero.months === 0);
}

console.log('Phase 5: snowball vs avalanche simulation');
{
  const d = freshData();
  d.debts = [
    { id: 'd1', name: 'Card A', balance: 500, minimumPayment: 25, apr: 24, accountType: 'credit-card' },
    { id: 'd2', name: 'Card B', balance: 2000, minimumPayment: 50, apr: 12, accountType: 'credit-card' },
  ];
  d.debtGoal = 100; // extra per paycheck
  T.setData(d);
  const snow = T.simulateDebtPayoff('snowball', 100);
  const ava = T.simulateDebtPayoff('avalanche', 100);
  ok('both strategies complete', !snow.never && !ava.never, JSON.stringify([snow.months, ava.months]));
  ok('avalanche costs <= snowball interest', ava.interest <= snow.interest + 0.01, `ava=${ava.interest} snow=${snow.interest}`);
  const ord = T.orderDebtsFor(d.debts, 'snowball');
  ok('snowball orders smallest first', ord[0].id === 'd1');
  const ord2 = T.orderDebtsFor(d.debts, 'avalanche');
  ok('avalanche orders highest APR first', ord2[0].id === 'd1');
}

console.log('Phase 5: savings outlook');
{
  const d = freshData();
  d.saveAmount = 50;
  d.savingsGoals = [{ id: 'g1', name: 'Emergency fund', target: 1000, saved: 200, priority: 'high', category: 'emergency' }];
  d.bills = [{ id: 'b1', name: 'Rent', amount: 300, dueDate: daysOut(5), frequency: 'monthly', priority: 'essential' }];
  T.setData(d);
  const o = T.savingsOutlook();
  ok('goal 20% funded, $800 left', o.items[0].pct === 20 && o.items[0].remaining === 800);
  ok('finish ≈ 4 months at $216.67/mo', Math.ceil(o.items[0].monthsLeft) === 4, `${o.items[0].monthsLeft}`);
  ok('emergency benchmark = 1 month essential bills', o.emergencyBenchmark === 300 && o.emergencyPct === 67, `${o.emergencyBenchmark}/${o.emergencyPct}`);
}

console.log('Phase 6: load-time validation');
{
  const dirty = { paycheck: 'abc', currentBalance: NaN, bills: null, debts: [{ balance: 'NaN', minimumPayment: undefined, apr: null }], expenseRecords: 'nope', savingsGoals: [{ target: 'x', saved: -5 }], profile: { paydayDay: 99 }, skippedPaydays: 'bad' };
  const clean = T.validateFinancialData(dirty);
  ok('paycheck sanitized to 0', clean.paycheck === 0);
  ok('bills defaulted to []', Array.isArray(clean.bills) && clean.bills.length === 0);
  ok('debt numbers sanitized', clean.debts[0].balance === 0 && clean.debts[0].minimumPayment === 0 && clean.debts[0].apr === 0);
  ok('negative savings clamped', clean.savingsGoals[0].saved === 0);
  ok('paydayDay clamped to 0-6', clean.paydayDay === undefined && clean.profile.paydayDay === 6, `paydayDay=${clean.profile.paydayDay}`);
  ok('fixes counted', clean.validationFixes > 0, `fixes=${clean.validationFixes}`);
  ok('null input returns defaults', Array.isArray(T.validateFinancialData(null).bills));
}

console.log('Phase 6: backup round-trip');
{
  const d = freshData();
  d.bills = [{ id: 'b1', name: 'Rent', amount: 300, dueDate: daysOut(5), frequency: 'monthly', priority: 'essential', paidOccurrences: [] }];
  T.setData(d);
  const snap = T.financialMemorySnapshot();
  const rt = JSON.parse(JSON.stringify(snap));
  ok('snapshot has schema + version', rt.schema === 'financial-lab-backup' && !!rt.version);
  ok('data survives round-trip', Array.isArray(rt.data.bills) && rt.data.bills[0].name === 'Rent');
  ok('malicious names escape cleanly', T.escapeHTML('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
