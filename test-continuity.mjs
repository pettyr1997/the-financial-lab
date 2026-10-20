// Payday Continuity (v4.1.20.3) logic tests.
// Loads the real app.js in a stubbed DOM and exercises missed-week scenarios.
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
  missedCheckins, confirmMissedCheckin, skipMissedCheckin, skipAllMissedCheckins,
  suggestedNextPayCycle, confirmedPaycheckHistory, cashFlowLearningState,
  setData(d){ data = d; },
  getData(){ return data; },
  saveData(){ save({skipRecovery:true, skipActivity:true}); },
};`;
vm.runInContext(src + harness, sandbox);
const T = sandbox.__T;

// --- date helpers (Fridays) ---
const isoD = (d) => d.toISOString().slice(0, 10);
const noon = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
function fridaysAgo(n) {
  const t = noon(new Date());
  const delta = (t.getDay() - 5 + 7) % 7; // days since Friday
  const f = new Date(t); f.setDate(f.getDate() - delta - 7 * n);
  return isoD(f);
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoD(d); };

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

console.log('Scenario 1: 3 weeks missed, approved plan for oldest payday');
{
  const f3 = fridaysAgo(3), f2 = fridaysAgo(2), f1 = fridaysAgo(1);
  const d = freshData();
  d.payDate = f3; d.nextPayday = f2;
  const plan = { id: 'plan-1', payDate: f3, nextPayday: f2, paycheck: 700, plannedPaycheck: 700, fundingStatus: 'planned', approvedAt: new Date().toISOString() };
  d.approvedPlan = plan;
  d.paycheckHistory = [{ ...plan }]; // real app pushes the approved plan into history
  T.setData(d);
  const missed = T.missedCheckins();
  ok('detects 3 missed (excludes active plan payday)', missed.length === 3 && missed[0].payDate === f2 && missed[2].payDate === fridaysAgo(0), JSON.stringify(missed.map(m => m.payDate)));
}

console.log('Scenario 2: late-confirm one missed payday');
{
  const f2 = fridaysAgo(2);
  const r = T.confirmMissedCheckin(f2, 685.5);
  ok('confirm returns ok', r.ok === true);
  const missed = T.missedCheckins();
  ok('missed drops to 2', missed.length === 2, JSON.stringify(missed.map(m => m.payDate)));
  const learned = T.confirmedPaycheckHistory();
  ok('late check counts toward income learning', learned.length === 1 && learned[0].fundingStatus === 'late-confirmed' && Number(learned[0].actualPaycheck) === 685.5);
  ok('no retroactive funding on late entry', (learned[0].reserveContributions || []).length === 0 && (learned[0].savingsContributions || []).length === 0);
  const l = T.cashFlowLearningState();
  ok('learning shows 1/3', l.count === 1 && l.learned === false);
}

console.log('Scenario 3: skip the remaining missed payday');
{
  const f1 = fridaysAgo(1);
  T.skipMissedCheckin(f1);
  ok('missed drops to 1 (most recent Friday still pending)', T.missedCheckins().length === 1);
  ok('skipped payday not learned', T.confirmedPaycheckHistory().length === 1);
  ok('skippedPaydays persisted', T.getData().skippedPaydays.includes(f1));
}

console.log('Scenario 4: launchpad rolls forward to correct payday');
{
  const s = T.suggestedNextPayCycle();
  const today = isoD(noon(new Date()));
  ok('suggested payDate is not in the past', s.payDate >= today, s.payDate + ' vs ' + today);
  ok('nextPayday after payDate', s.nextPayday > s.payDate);
}

console.log('Scenario 5: fresh user, nothing set up');
{
  T.setData(freshData());
  ok('no missed check-ins', T.missedCheckins().length === 0);
  const s = T.suggestedNextPayCycle();
  ok('suggests a valid upcoming cycle', !!s.payDate && !!s.nextPayday && s.nextPayday > s.payDate);
}

console.log('Scenario 6: overdue active plan plus newer missed paydays');
{
  const f3 = fridaysAgo(3);
  const d = freshData();
  d.payDate = f3; d.nextPayday = addDays(f3, 7);
  const plan = { id: 'plan-1', payDate: f3, nextPayday: addDays(f3, 7), paycheck: 700, fundingStatus: 'planned', approvedAt: new Date().toISOString() };
  d.approvedPlan = plan;
  d.paycheckHistory = [{ ...plan }];
  T.setData(d);
  const missed = T.missedCheckins();
  ok('active overdue payday excluded, newer ones listed', missed.length === 3 && !missed.some(m => m.payDate === f3), JSON.stringify(missed.map(m => m.payDate)));
}

console.log('Scenario 7: biweekly roll-forward');
{
  const d = freshData();
  d.profile.payFrequency = 'biweekly';
  const old = addDays(isoD(noon(new Date())), -35);
  d.nextPayday = old;
  T.setData(d);
  const s = T.suggestedNextPayCycle();
  const today = isoD(noon(new Date()));
  ok('biweekly rolls forward past stale date', s.payDate >= today && s.payDate !== old, s.payDate);
}

console.log('Scenario 8: invalid confirm amount rejected');
{
  const f1 = fridaysAgo(1);
  const d = freshData();
  d.payDate = fridaysAgo(4); d.nextPayday = fridaysAgo(3);
  T.setData(d);
  const r = T.confirmMissedCheckin(f1, 0);
  ok('zero amount rejected', r.ok === false && !!r.error);
  ok('nothing recorded', T.confirmedPaycheckHistory().length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
