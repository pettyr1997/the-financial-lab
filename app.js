// Financial Lab 4.4.0.0 — + invoice builder, cash forecast, restore, receipts; Business Lab Pro (mileage, follow-ups, P&L, contractors) + cloud accounts
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const STORAGE_KEY = 'financial-lab-v3-data';
const RECOVERY_KEY='financial-lab-recovery-v1';
const ACTIVITY_KEY='financial-lab-activity-v1';
const EXECUTION_KEY='financial-lab-payday-execution-v1';
const RECOVERY_LIMIT=12;
const ACTIVITY_LIMIT=30;

const MEMORY_DB_NAME='financial-lab-memory';
const MEMORY_DB_VERSION=1;
const MEMORY_STORE='snapshots';
const MEMORY_KEY='primary';
function openMemoryDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){resolve(null);return}
    const req=indexedDB.open(MEMORY_DB_NAME,MEMORY_DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(MEMORY_STORE))db.createObjectStore(MEMORY_STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB unavailable'));
  });
}
async function writeMemoryMirror(value){
  try{
    const db=await openMemoryDb();if(!db)return;
    await new Promise((resolve,reject)=>{const tx=db.transaction(MEMORY_STORE,'readwrite');tx.objectStore(MEMORY_STORE).put({savedAt:new Date().toISOString(),data:value},MEMORY_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
    db.close();
  }catch(err){console.warn('Financial Lab memory mirror could not save',err)}
}
async function readMemoryMirror(){
  try{
    const db=await openMemoryDb();if(!db)return null;
    const result=await new Promise((resolve,reject)=>{const tx=db.transaction(MEMORY_STORE,'readonly');const req=tx.objectStore(MEMORY_STORE).get(MEMORY_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});
    db.close();return result;
  }catch(err){console.warn('Financial Lab memory mirror could not load',err);return null}
}
async function requestDurableStorage(){
  try{
    if(navigator.storage&&navigator.storage.persist){return await navigator.storage.persist()}
  }catch(_){ }
  return false;
}
async function initializePersistentMemory(){
  const mirror=await readMemoryMirror();
  let localRaw=null;
  try{localRaw=localStorage.getItem(STORAGE_KEY)}catch(_){localRaw=null}
  // Save-hardening (beta fix): a corrupt saved payload counts as no payload —
  // the device backup layer (mirror) is tried first, factory defaults only if
  // it is empty too.
  if(localRaw){try{JSON.parse(localRaw)}catch(_){console.warn('Financial Lab: saved data was unreadable; trying the device backup layer.');localRaw=null}}
  if(!localRaw&&mirror&&mirror.data){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(mirror.data));
    data=load();normalizeApprovedPlanFunding();render();
    const status=$('memoryGuardStatus');if(status)status.textContent='Financial Lab recovered your saved memory from the device backup layer.';
  }else if(localRaw&&mirror&&mirror.data){
    const localTime=Date.parse(data.lastUpdated||0)||0,mirrorTime=Date.parse(mirror.data.lastUpdated||mirror.savedAt||0)||0;
    if(mirrorTime>localTime){localStorage.setItem(STORAGE_KEY,JSON.stringify(mirror.data));data=load();normalizeApprovedPlanFunding();render()}
  }
  await writeMemoryMirror(data);
  lastSavedSnapshot=cloneFinancialData(data);
  await requestDurableStorage();
  renderMemoryGuard();
}

function loadExecutionState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(EXECUTION_KEY)||'{}');
    return parsed&&typeof parsed==='object'?{planId:parsed.planId||'',done:parsed.done&&typeof parsed.done==='object'?parsed.done:{},updatedAt:parsed.updatedAt||''}:{planId:'',done:{},updatedAt:''};
  }catch(_){return {planId:'',done:{},updatedAt:''}}
}
let executionState=loadExecutionState();
function saveExecutionState(){
  executionState.updatedAt=new Date().toISOString();
  localStorage.setItem(EXECUTION_KEY,JSON.stringify(executionState));
}
function executionForPlan(plan){
  if(!plan)return {planId:'',done:{},updatedAt:''};
  if(executionState.planId!==plan.id){executionState={planId:plan.id,done:{},updatedAt:new Date().toISOString()};saveExecutionState()}
  return executionState;
}
function clearExecutionState(){executionState={planId:'',done:{},updatedAt:new Date().toISOString()};localStorage.removeItem(EXECUTION_KEY)}
function reconcileExecutionState(){
  const activeId=data?.approvedPlan?.id||'';
  const history=Array.isArray(data?.paycheckHistory)?data.paycheckHistory:[];
  const activeStillExists=!!activeId&&history.some(h=>h?.id===activeId);
  if(activeId&&!activeStillExists)data.approvedPlan=null;
  const validId=data?.approvedPlan?.id||'';
  if(!validId||executionState.planId!==validId){
    if(executionState.planId)clearExecutionState();
  }
}

const DEFAULTS = {
  researcherName:'', paycheck:0, currentBalance:0, payDate:'', nextPayday:'', savingsRate:10,
  billName:'', billDate:'', billAmount:0, saveAmount:0, debtAmount:0, debtGoal:0, expenses:0,
  customSavings:null, customDebt:null, bills:[], debts:[], expenseRecords:[], savingsGoals:[], savingsStrategy:'priority', debtStrategy:'balanced', paycheckHistory:[], approvedPlan:null, skippedPaydays:[], reserveMemory:{},
  missions:{spending:false,saving:false,bills:false,friday:false}, profile:{payFrequency:'weekly',paydayDay:5,incomePattern:'variable',recurringBillCount:9,financialStrategy:'balanced',reserveDays:14}, setup:{currentMoneyConfirmed:false,incomeConfirmed:false,expectedPaycheck:0,nextPayday:'',skipped:{bills:false,debt:false,savings:false,spending:false},completedAt:''}, lastUpdated:''
};
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
const dateAtNoon=v=>{
  if(!v)return null;
  let d;
  if(v instanceof Date)d=new Date(v.getTime());
  else{
    const s=String(v).trim();
    if(!s)return null;
    d=/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(`${s}T12:00:00`):new Date(s);
  }
  if(Number.isNaN(d.getTime()))return null;
  d.setHours(12,0,0,0);
  return d;
};
const iso=d=>{
  const x=dateAtNoon(d);
  return x?x.toISOString().slice(0,10):'';
};
const dateText=(v,opts={month:'short',day:'numeric'})=>{
  const d=dateAtNoon(v);
  return d?d.toLocaleDateString('en-US',opts):'TBD';
};
const dateTimeOrInfinity=v=>{
  const d=dateAtNoon(v);
  return d?d.getTime():Infinity;
};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||0));
function load(){try{const old=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');const migratedBills=Array.isArray(old.bills)?old.bills.map((b,i)=>({id:b.id||`bill-${i}-${Date.now()}`,name:b.name||'Bill',amount:Number(b.amount)||0,dueDate:b.dueDate||b.date||'',date:b.dueDate||b.date||'',priority:b.priority||'important',frequency:b.frequency||'monthly',autopay:!!b.autopay,paidOccurrences:Array.isArray(b.paidOccurrences)?b.paidOccurrences:(b.paid&&b.date?[b.date]:[])})):[];const migratedDebts=Array.isArray(old.debts)?old.debts.map((d,i)=>({id:d.id||`debt-${i}-${Date.now()}`,name:d.name||'Debt',balance:Math.max(0,Number(d.balance)||0),minimumPayment:Math.max(0,Number(d.minimumPayment??d.minimum??0)||0),dueDate:d.dueDate||d.date||'',apr:Math.max(0,Number(d.apr)||0),accountType:d.accountType||d.type||'credit-card'})):[];const migratedGoals=Array.isArray(old.savingsGoals)?old.savingsGoals.map((g,i)=>({id:g.id||`goal-${i}-${Date.now()}`,name:g.name||'Savings goal',target:Math.max(0,Number(g.target)||0),saved:Math.max(0,Number(g.saved)||0),priority:g.priority||'medium',targetDate:g.targetDate||'',category:g.category||'general'})):[];const migratedExpenses=Array.isArray(old.expenseRecords)?old.expenseRecords.map((x,i)=>({id:x.id||`expense-${i}-${Date.now()}`,name:x.name||x.merchant||'Expense',amount:Math.max(0,Number(x.amount)||0),category:x.category||'other',date:x.date||old.payDate||iso(new Date()),note:x.note||'',cycleId:x.cycleId||''})):((Number(old.expenses)||0)>0?[{id:`legacy-expense-${Date.now()}`,name:'Previous spending',amount:Math.max(0,Number(old.expenses)||0),category:'other',date:old.payDate||iso(new Date()),note:'Migrated from an earlier Financial Lab version'}]:[]);return {...DEFAULTS,...old,bills:migratedBills,debts:migratedDebts,expenseRecords:migratedExpenses,expenses:0,savingsGoals:migratedGoals,savingsStrategy:old.savingsStrategy||'priority',debtStrategy:old.debtStrategy||'balanced',paycheckHistory:Array.isArray(old.paycheckHistory)?old.paycheckHistory:[],reserveMemory:(old.reserveMemory&&typeof old.reserveMemory==='object'?old.reserveMemory:{}),missions:{...DEFAULTS.missions,...(old.missions||{})},profile:{...DEFAULTS.profile,...(old.profile||{})},setup:{...DEFAULTS.setup,...(old.setup||{}),skipped:{...DEFAULTS.setup.skipped,...(old.setup?.skipped||{})}}}}catch{return structuredClone(DEFAULTS)}}
/* ============ Phase 6 — Security & Recovery (v4.1.21.0) ============
   validateFinancialData sanitizes loaded data: coerces numeric fields,
   guarantees array shapes, clamps profile values. It never deletes user
   records — it only repairs types and counts what it fixed. */
function validateFinancialData(d){
  if(!d||typeof d!=='object')return structuredClone(DEFAULTS);
  let fixes=0;
  const num=(v,fb=0)=>{const n=Number(v);if(Number.isFinite(n))return n;fixes++;return fb};
  ['paycheck','currentBalance','saveAmount','debtAmount','debtGoal'].forEach(k=>{d[k]=Math.max(0,num(d[k],0))});
  ['bills','debts','expenseRecords','savingsGoals','paycheckHistory','skippedPaydays'].forEach(k=>{if(!Array.isArray(d[k])){d[k]=[];fixes++}});
  d.bills.forEach(b=>{if(!b||typeof b!=='object')return;b.amount=Math.max(0,num(b.amount,0));if(!Array.isArray(b.paidOccurrences)){b.paidOccurrences=[];fixes++}});
  d.debts.forEach(x=>{if(!x||typeof x!=='object')return;x.balance=Math.max(0,num(x.balance,0));x.minimumPayment=Math.max(0,num(x.minimumPayment,0));x.apr=Math.max(0,num(x.apr,0))});
  d.savingsGoals.forEach(g=>{if(!g||typeof g!=='object')return;g.target=Math.max(0,num(g.target,0));g.saved=Math.max(0,num(g.saved,0))});
  d.expenseRecords.forEach(x=>{if(!x||typeof x!=='object')return;x.amount=Math.max(0,num(x.amount,0))});
  if(d.profile&&typeof d.profile==='object'){d.profile.paydayDay=Math.max(0,Math.min(6,Math.round(num(d.profile.paydayDay,5))));}
  if(d.reserveMemory&&typeof d.reserveMemory!=='object'){d.reserveMemory={};fixes++}
  d.validationFixes=num(d.validationFixes,0)+fixes;
  return d;
}
let data=validateFinancialData(load());
function cloneFinancialData(value){
  try{return JSON.parse(JSON.stringify(value))}catch(_){return structuredClone(value)}
}
let lastSavedSnapshot=cloneFinancialData(data);
let pendingRecoveryContext=null;
function readJsonList(key){
  try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return []}
}
function writeJsonList(key,value){localStorage.setItem(key,JSON.stringify(value))}
function recoveryPoints(){return readJsonList(RECOVERY_KEY)}
function activityEntries(){return readJsonList(ACTIVITY_KEY)}
function setRecoveryContext(label,detail='',type='change'){pendingRecoveryContext={label,detail,type}}
function pushRecoveryPoint(snapshot,label='Financial Lab change',detail='',type='change'){
  if(!snapshot||typeof snapshot!=='object')return null;
  const points=recoveryPoints();
  const point={id:`recovery-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString(),label,detail,type,data:cloneFinancialData(snapshot)};
  points.push(point);
  writeJsonList(RECOVERY_KEY,points.slice(-RECOVERY_LIMIT));
  return point;
}
function logRecoveryActivity(label,detail='',type='change'){
  const entries=activityEntries();
  entries.push({id:`activity-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString(),label,detail,type});
  writeJsonList(ACTIVITY_KEY,entries.slice(-ACTIVITY_LIMIT));
}
function recoveryTimeText(value){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
  const today=new Date(),sameDay=d.toDateString()===today.toDateString();
  return d.toLocaleString('en-US',sameDay?{hour:'numeric',minute:'2-digit'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function recoveryIcon(type){return ({payday:'↪',reset:'↻',restore:'⟲',delete:'×',approval:'✓',expense:'−',bill:'▣',debt:'◇',savings:'▤'})[type]||'•'}
function renderSafetyRecovery(){
  const undo=$('undoLastChange'),select=$('recoveryPointSelect'),restore=$('restoreRecoveryPoint'),activity=$('recoveryActivityList');
  if(!undo||!select||!restore||!activity)return;
  const points=recoveryPoints();
  const latest=points[points.length-1];
  undo.disabled=!latest;
  undo.textContent=latest?`UNDO: ${latest.label.toUpperCase()}`:'NOTHING TO UNDO';
  if($('recoveryPointCount'))$('recoveryPointCount').textContent=`${points.length} safe state${points.length===1?'':'s'}`;
  select.replaceChildren();
  if(!points.length){const opt=document.createElement('option');opt.value='';opt.textContent='No recovery points yet';select.append(opt);restore.disabled=true}
  else{
    [...points].reverse().forEach(point=>{const opt=document.createElement('option');opt.value=point.id;opt.textContent=`${recoveryTimeText(point.createdAt)} · ${point.label}`;select.append(opt)});
    restore.disabled=false;
  }
  const entries=activityEntries().slice(-8).reverse();
  activity.replaceChildren();
  if(!entries.length){activity.innerHTML='<div class="empty-copy">Your protected changes will appear here as you use Financial Lab.</div>';return}
  entries.forEach(entry=>{const row=document.createElement('article');row.className='recovery-activity-row';row.innerHTML=`<i>${recoveryIcon(entry.type)}</i><div><strong>${escapeHTML(entry.label)}</strong><span>${escapeHTML(entry.detail||'Financial Lab saved the change.')}</span></div><small>${recoveryTimeText(entry.createdAt)}</small>`;activity.append(row)});
}
async function applyRecoveryData(snapshot,statusText){
  data={...structuredClone(DEFAULTS),...cloneFinancialData(snapshot),missions:{...DEFAULTS.missions,...(snapshot?.missions||{})},profile:{...DEFAULTS.profile,...(snapshot?.profile||{})},setup:{...DEFAULTS.setup,...(snapshot?.setup||{}),skipped:{...DEFAULTS.setup.skipped,...(snapshot?.setup?.skipped||{})}}};
  data.lastUpdated=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  lastSavedSnapshot=cloneFinancialData(data);
  await writeMemoryMirror(data);
  render();
  const status=$('safetyRecoveryStatus');if(status)status.textContent=statusText;
  const paydayStatus=$('nextPaycheckStatus');
  if(paydayStatus && /paycheck|payday|safe state|recovery/i.test(statusText||'')) paydayStatus.textContent=`Recovery complete. ${statusText}`;
}
async function undoLastFinancialChange(){
  const points=recoveryPoints();const point=points.pop();
  if(!point){const status=$('safetyRecoveryStatus');if(status)status.textContent='Nothing to undo yet.';return}
  writeJsonList(RECOVERY_KEY,points);
  await applyRecoveryData(point.data,`Undone: ${point.label}.`);
  logRecoveryActivity(`Undid ${point.label}`,point.detail||'Returned to the previous safe state.','restore');
  renderSafetyRecovery();
}
async function restoreSelectedRecoveryPoint(){
  const id=$('recoveryPointSelect')?.value;if(!id)return;
  const point=recoveryPoints().find(x=>x.id===id);if(!point)return;
  if(!confirm(`Restore the safe state from ${recoveryTimeText(point.createdAt)} — ${point.label}?

Financial Lab will first save your current state so this restore can be reversed.`))return;
  pushRecoveryPoint(data,'Before recovery restore','State saved automatically before restoring an earlier safe state.','restore');
  await applyRecoveryData(point.data,`Restored safe state: ${point.label}.`);
  logRecoveryActivity(`Restored ${point.label}`,'Financial Lab returned to a selected safe state.','restore');
  renderSafetyRecovery();
}
function resetFinancialArea(area){
  const labels={paycheck:'current paycheck',expenses:'tracked expenses',bills:'recurring bills + Reserve Memory',debts:'debt accounts',savings:'savings goals'};
  const label=labels[area];if(!label)return;
  if(!confirm(`Reset ${label}?

Financial Lab will create an undo point first. Other areas will stay saved.`))return;
  if(area==='paycheck'){
    data.paycheck=0;data.currentBalance=0;data.payDate='';data.nextPayday='';data.customSavings=null;data.customDebt=null;data.approvedPlan=null;data.missions={...data.missions,friday:false,spending:false};
  }else if(area==='expenses'){
    data.expenseRecords=[];data.expenses=0;data.missions.spending=false;
  }else if(area==='bills'){
    data.bills=[];data.reserveMemory={};data.billName='';data.billDate='';data.billAmount=0;data.approvedPlan=null;data.missions.bills=false;
  }else if(area==='debts'){
    data.debts=[];data.debtAmount=0;data.debtGoal=0;data.confirmedNoDebt=false;data.approvedPlan=null;
  }else if(area==='savings'){
    data.savingsGoals=[];data.saveAmount=0;data.approvedPlan=null;data.missions.saving=false;
  }
  setRecoveryContext(`Reset ${label}`,`Only ${label} was reset. Other Financial Lab areas were preserved.`,'reset');
  save();
  const status=$('safetyRecoveryStatus');if(status)status.textContent=`${label[0].toUpperCase()+label.slice(1)} reset. Tap Undo if that was a mistake.`;
}
function fullFinancialLabReset(){
  const typed=prompt('FULL RESET removes all Financial Lab working data on this device. Type RESET to continue.');
  if(typed!=='RESET'){const status=$('safetyRecoveryStatus');if(status)status.textContent='Full reset canceled.';return}
  if(!confirm('Final confirmation: reset the entire Financial Lab? A local undo point will be created first.'))return;
  data=structuredClone(DEFAULTS);
  setRecoveryContext('Full Financial Lab reset','All working Financial Lab data was reset to defaults.','reset');
  save();
  const status=$('safetyRecoveryStatus');if(status)status.textContent='Financial Lab reset. Undo is available while this device recovery history remains.';
}
const priorityRank={essential:0,important:1,flexible:2};
function billDefinitions(){return (Array.isArray(data.bills)?data.bills:[]).filter(b=>b.name||b.dueDate||b.date||Number(b.amount)).map((b,i)=>({id:b.id||`bill-${i}-${b.name||'bill'}`,name:b.name||'Bill',amount:Number(b.amount)||0,dueDate:b.dueDate||b.date||'',date:b.dueDate||b.date||'',priority:b.priority||'important',frequency:b.frequency||'monthly',autopay:!!b.autopay,paidOccurrences:Array.isArray(b.paidOccurrences)?b.paidOccurrences:[]}))}




function paycheckCycleId(payDate,nextPayday){
  return payDate&&nextPayday ? `${payDate}__${nextPayday}` : '';
}
function cycleDatesFromId(cycleId){
  const [start,end]=String(cycleId||'').split('__');
  return start&&end?{start,end}:null;
}
function expenseDateFallsInCycle(date,start,end){
  const d=dateAtNoon(date),s=dateAtNoon(start),e=dateAtNoon(end);
  // A paycheck owns spending from its check date up to, but not including,
  // the next payday. The next payday begins the next paycheck cycle.
  return !!(d&&s&&e&&d>=s&&d<e);
}
function expenseDateMatchesCycleId(date,cycleId){
  const cycle=cycleDatesFromId(cycleId);
  return !!(cycle&&expenseDateFallsInCycle(date,cycle.start,cycle.end));
}
function normalizeExpenseCycleId(cycleId,date){
  return cycleId&&expenseDateMatchesCycleId(date,cycleId)?cycleId:'';
}
function activeExpenseCycleId(){
  return paycheckCycleId(data.payDate,data.nextPayday);
}
function cycleIdForExpenseDate(date,preferredCycleId=''){
  if(preferredCycleId&&expenseDateMatchesCycleId(date,preferredCycleId))return preferredCycleId;
  const activeId=activeExpenseCycleId();
  return activeId&&expenseDateMatchesCycleId(date,activeId)?activeId:'';
}
function attachUnboundExpensesToActiveCycle(){
  const id=activeExpenseCycleId();
  const cycle=cycleDatesFromId(id);
  if(!id||!cycle)return 0;
  let count=0;
  (Array.isArray(data.expenseRecords)?data.expenseRecords:[]).forEach(x=>{
    if(x && !x.cycleId && expenseDateFallsInCycle(x.date,cycle.start,cycle.end)){
      x.cycleId=id;
      count++;
    }
  });
  return count;
}

function expenseDefinitions(){return (Array.isArray(data.expenseRecords)?data.expenseRecords:[]).filter(x=>Number(x.amount)>0).map((x,i)=>({id:x.id||`expense-${i}`,name:x.name||'Expense',amount:Math.max(0,Number(x.amount)||0),category:x.category||'other',date:x.date||data.payDate||iso(new Date()),note:x.note||'',cycleId:normalizeExpenseCycleId(x.cycleId||'',x.date||data.payDate||iso(new Date()))}))}
function expensesForCycle(start,end){
  const s=dateAtNoon(start),e=dateAtNoon(end);
  if(!s||!e)return expenseDefinitions();
  const cycleId=paycheckCycleId(iso(s),iso(e));
  return expenseDefinitions().filter(x=>{
    const inDateWindow=expenseDateFallsInCycle(x.date,s,e);
    if(!inDateWindow)return false;
    return !x.cycleId||x.cycleId===cycleId;
  }).sort((a,b)=>b.date.localeCompare(a.date))
}
function currentCycleExpenses(){const start=data.payDate||iso(new Date()),end=data.nextPayday||iso(new Date(Date.now()+7*86400000));return expensesForCycle(start,end)}
function currentCycleExpenseTotal(){return currentCycleExpenses().reduce((s,x)=>s+Number(x.amount||0),0)}
function expenseCategoryLabel(c){return ({gas:'Gas',groceries:'Groceries',food:'Food & dining',entertainment:'Entertainment',personal:'Personal',haircut:'Haircut',shopping:'Shopping',transportation:'Transportation',medical:'Medical',other:'Other'})[c]||'Other'}
function spendingStatus(p){
  if(!p.paycheck)return 'Build a payday plan first so Dexx can calculate your spending allowance.';
  if(p.overspent>0)return `You are ${money(p.overspent)} over this cycle’s TRUE Safe-to-Spend. Pause flexible spending until the next payday or rebuild the plan if your situation changed.`;
  const used=p.safeBeforeExpenses>0?p.expenseTotal/p.safeBeforeExpenses:0;
  if(used>=.8)return `You have used ${Math.round(used*100)}% of your flexible spending allowance. ${money(p.safeToSpend)} remains until payday.`;
  if(p.expenseTotal>0)return `You have spent ${money(p.expenseTotal)} from this cycle’s flexible money. ${money(p.safeToSpend)} remains until payday.`;
  return `No flexible expenses recorded yet. Your current TRUE Safe-to-Spend is ${money(p.safeToSpend)}.`;
}
function resetExpenseForm(){if(!$('expenseForm'))return;$('expenseId').value='';$('expenseName').value='';$('expenseAmount').value='';$('expenseCategory').value='other';$('expenseDate').value=iso(new Date());$('expenseNote').value='';$('saveExpense').textContent='SAVE EXPENSE';$('cancelExpenseEdit').hidden=true}

function reportCategoryTotals(expenses){
  const totals={};
  (expenses||[]).forEach(x=>{
    const key=x.category||'other';
    totals[key]=(totals[key]||0)+Number(x.amount||0);
  });
  return Object.entries(totals).sort((a,b)=>b[1]-a[1]);
}
function reportObservationText(c){
  if(!c.paycheck)return 'Build a payday plan to unlock your report.';
  const protectedTotal=(c.payNow||0)+(c.reserve||0)+(c.savings||0)+(c.debtPayment||0);
  const used=c.safeBeforeExpenses>0?c.expenseTotal/c.safeBeforeExpenses:0;
  if(c.overspent>0)return `You are ${money(c.overspent)} over this cycle’s TRUE Safe-to-Spend. Protected money remains separated, but Dexx recommends pausing flexible spending until the next payday.`;
  if(c.shortfall>0)return `This paycheck is under pressure. ${money(c.shortfall)} of immediate bills is still unfunded. Protect essentials before adding more flexible spending.`;
  if(used>=.8)return `You protected ${money(protectedTotal)} and have used ${Math.round(used*100)}% of this cycle’s flexible spending allowance. ${money(c.safeToSpend)} remains.`;
  if(c.expenseTotal>0)return `You protected ${money(protectedTotal)}, recorded ${money(c.expenseTotal)} in spending, and still have ${money(c.safeToSpend)} truly safe to spend.`;
  return `You protected ${money(protectedTotal)} from this paycheck. No flexible spending is recorded yet, leaving ${money(c.safeToSpend)} truly safe to spend.`;
}


function historyExpenseCategory(x){
  const raw=String(x?.category||'').trim().toLowerCase();
  if(raw && raw!=='other')return raw;

  // Only use a name-based rescue when older records lost their category.
  // This does not override a real saved category.
  const name=String(x?.name||'').trim().toLowerCase();
  if(/\b(gas|fuel|uber|lyft|taxi|rideshare|parking|transit)\b/.test(name))return 'transportation';
  if(/\b(grocery|groceries|market)\b/.test(name))return 'groceries';
  if(/\b(lunch|dinner|breakfast|restaurant|food)\b/.test(name))return 'food';
  if(/\b(haircut|barber)\b/.test(name))return 'haircut';
  if(/\b(medical|doctor|pharmacy|prescription)\b/.test(name))return 'medical';
  return raw||'other';
}

function compactHistoryExpense(x){
  return {
    name:x?.name||'Expense',
    category:historyExpenseCategory(x),
    amount:Number(x?.amount)||0,
    date:x?.date||''
  };
}

function historyExpenses(h){
  const payDate=h?.payDate||'';
  const nextPayday=h?.nextPayday||'';
  const cycleId=h?.cycleId || (payDate&&nextPayday ? paycheckCycleId(payDate,nextPayday) : '');
  const all=expenseDefinitions();

  // 1. Best source: the original Spending Memory records bound to this cycle.
  // They contain the user's true category selection.
  if(cycleId){
    const bound=all.filter(x=>x.cycleId===cycleId);
    if(bound.length){
      return bound.map(compactHistoryExpense).filter(x=>x.amount>0);
    }
  }

  // 2. Legacy records that existed before cycle IDs: recover by paycheck dates.
  const start=dateAtNoon(payDate),end=dateAtNoon(nextPayday);
  if(start&&end){
    const dated=all.filter(x=>{
      if(x.cycleId)return false;
      const d=dateAtNoon(x.date);
      return d&&d>=start&&d<=end;
    });
    if(dated.length){
      return dated.map(compactHistoryExpense).filter(x=>x.amount>0);
    }
  }

  // 3. Embedded approval snapshot is the fallback if Spending Memory is gone.
  if(Array.isArray(h?.expenses) && h.expenses.length){
    return h.expenses.map(compactHistoryExpense).filter(x=>x.amount>0);
  }

  return [];
}
function recoveredHistorySpent(h){
  // New snapshots are authoritative, including a legitimate $0 spent.
  if(h && Object.prototype.hasOwnProperty.call(h,'spent')){
    return Number(h.spent)||0;
  }
  if(h && Object.prototype.hasOwnProperty.call(h,'expenseTotal')){
    return Number(h.expenseTotal)||0;
  }

  const expenses=historyExpenses(h);
  if(expenses.length){
    return expenses.reduce((s,x)=>s+(Number(x.amount)||0),0);
  }

  // Last-resort accounting recovery for old snapshots.
  // Paycheck = pay now + reserve + savings + debt + spent + safe left.
  const paycheck=Number(h?.paycheck)||0;
  const payNow=Number(h?.payNow)||0;
  const reserve=Number(h?.reserve)||0;
  const savings=Number(h?.savings)||0;
  const debt=Number(h?.debtPayment)||0;
  const safe=Number(h?.safeToSpend)||0;
  return Math.max(0,paycheck-payNow-reserve-savings-debt-safe);
}

function recoveredHistoryProtected(h){
  if(h && Object.prototype.hasOwnProperty.call(h,'protected')){
    return Number(h.protected)||0;
  }
  return (Number(h?.payNow)||0)
    +(Number(h?.reserve)||0)
    +(Number(h?.savings)||0)
    +(Number(h?.debtPayment)||0);
}

function normalizeHistoryRecord(h){
  const expenses=historyExpenses(h);
  return {
    ...h,
    cycleId:h?.cycleId||paycheckCycleId(h?.payDate||'',h?.nextPayday||''),
    spent:recoveredHistorySpent(h),
    protected:recoveredHistoryProtected(h),
    expenses
  };
}


function historyDisplayDate(h){
  return h?.payDate || h?.checkDate || h?.approvedAt || '';
}

function approvedHistory(){
  const raw=Array.isArray(data.paycheckHistory)?data.paycheckHistory:[];
  return raw.map(normalizeHistoryRecord);
}
function pctChange(current,previous){
  current=Number(current)||0;previous=Number(previous)||0;
  if(previous===0){
    if(current===0)return 0;
    return null;
  }
  return ((current-previous)/Math.abs(previous))*100;
}
function trendArrow(diff){
  if(Math.abs(diff)<0.005)return '→';
  return diff>0?'↑':'↓';
}
function trendText(current,previous,mode='neutral'){
  current=Number(current)||0;previous=Number(previous)||0;
  const diff=current-previous;
  const pct=pctChange(current,previous);
  if(Math.abs(diff)<0.005)return {label:'STEADY',detail:`No change · ${money(current)}`,tone:'neutral',diff,pct:0};

  let good;
  if(mode==='lower-good')good=diff<0;
  else if(mode==='higher-good')good=diff>0;
  else good=null;

  const pctText=pct===null?'new':`${Math.abs(pct).toFixed(0)}%`;
  return {
    label:`${trendArrow(diff)} ${money(Math.abs(diff))}`,
    detail:`${pctText} ${diff>0?'higher':'lower'} than last approved check`,
    tone:good===null?'neutral':(good?'good':'watch'),
    diff,pct
  };
}
function historyMetric(h,key){
  if(!h)return 0;
  if(key==='spent')return Number(h.spent ?? h.expenseTotal ?? 0)||0;
  if(key==='protected')return Number(h.protected ?? ((Number(h.payNow)||0)+(Number(h.reserve)||0)+(Number(h.savings)||0)+(Number(h.debtPayment)||0)))||0;
  return Number(h[key]||0);
}
function biggestCategoryChange(currentExpenses,priorExpenses){
  const a=reportCategoryTotals(currentExpenses||[]);
  const b=reportCategoryTotals(priorExpenses||[]);
  const map={};
  a.forEach(([k,v])=>{map[k]=(map[k]||0)+v});
  b.forEach(([k,v])=>{map[k]=(map[k]||0)-v});
  const rows=Object.entries(map)
    .filter(([,v])=>Math.abs(v)>=0.01)
    .sort((x,y)=>Math.abs(y[1])-Math.abs(x[1]));
  return rows[0]||null;
}
function buildTrendInsight(current,previous,currentExpenses=[],previousExpenses=[]){
  if(!current||!previous)return 'Once you approve at least two payday plans, Dexx will compare them and explain what changed.';

  const spentNow=historyMetric(current,'spent'),spentPrev=historyMetric(previous,'spent');
  const safeNow=historyMetric(current,'safeToSpend'),safePrev=historyMetric(previous,'safeToSpend');
  const saveNow=historyMetric(current,'savings'),savePrev=historyMetric(previous,'savings');
  const protectNow=historyMetric(current,'protected'),protectPrev=historyMetric(previous,'protected');
  const parts=[];

  const spendDiff=spentNow-spentPrev;
  if(Math.abs(spendDiff)>=0.01){
    parts.push(`You spent ${money(Math.abs(spendDiff))} ${spendDiff<0?'less':'more'} than the previous approved paycheck.`);
  }else{
    parts.push('Your flexible spending matched the previous approved paycheck.');
  }

  const safeDiff=safeNow-safePrev;
  if(Math.abs(safeDiff)>=0.01){
    parts.push(`Your safe-to-spend finished ${money(Math.abs(safeDiff))} ${safeDiff>0?'higher':'lower'}.`);
  }

  const saveDiff=saveNow-savePrev;
  if(Math.abs(saveDiff)>=0.01){
    parts.push(`Savings moved ${money(Math.abs(saveDiff))} ${saveDiff>0?'more':'less'} this check.`);
  }

  const protectDiff=protectNow-protectPrev;
  if(Math.abs(protectDiff)>=0.01){
    parts.push(`Protected money was ${money(Math.abs(protectDiff))} ${protectDiff>0?'higher':'lower'}.`);
  }

  const cat=biggestCategoryChange(currentExpenses,previousExpenses);
  if(cat && Math.abs(cat[1])>=0.01){
    parts.push(`${expenseCategoryLabel(cat[0])} changed the most, ${cat[1]>0?'up':'down'} ${money(Math.abs(cat[1]))}.`);
  }

  return parts.join(' ');
}
function renderTrends(c){
  if(!$('trendSpending'))return;
  const hist=approvedHistory();

  if(hist.length<2){
    $('trendWindowLabel').textContent='Need 2 plans';
    ['trendSpending','trendSavings','trendSafe','trendProtected'].forEach(id=>$(id).textContent='—');
    $('trendSpendingDetail').textContent='Approve another payday plan to compare.';
    $('trendSavingsDetail').textContent='Approve another payday plan to compare.';
    $('trendSafeDetail').textContent='Approve another payday plan to compare.';
    $('trendProtectedDetail').textContent='Approve another payday plan to compare.';
    $('trendInsight').textContent='Once you approve at least two payday plans, Dexx will compare them and explain what changed.';
  }else{
    const current=hist[hist.length-1],previous=hist[hist.length-2];
    $('trendWindowLabel').textContent='Last 2 approved plans';

    const spending=trendText(historyMetric(current,'spent'),historyMetric(previous,'spent'),'lower-good');
    const savings=trendText(historyMetric(current,'savings'),historyMetric(previous,'savings'),'higher-good');
    const safe=trendText(historyMetric(current,'safeToSpend'),historyMetric(previous,'safeToSpend'),'higher-good');
    const protectedTrend=trendText(historyMetric(current,'protected'),historyMetric(previous,'protected'),'neutral');

    const apply=(prefix,t)=>{
      $(prefix).textContent=t.label;
      $(prefix+'Detail').textContent=t.detail;
      $(prefix).dataset.tone=t.tone;
    };
    apply('trendSpending',spending);
    apply('trendSavings',savings);
    apply('trendSafe',safe);
    apply('trendProtected',protectedTrend);

    // Current approved history doesn't yet save expense detail by category,
    // so category commentary appears once future approvals carry snapshots.
    const currentExpenses=current.expenses||[];
    const previousExpenses=previous.expenses||[];
    $('trendInsight').textContent=buildTrendInsight(current,previous,currentExpenses,previousExpenses);
  }

  $('trendHistoryCount').textContent=String(hist.length);
  const host=$('trendHistory');host.replaceChildren();
  if(!hist.length){
    host.innerHTML='<div class="empty-copy">No approved paycheck cycles yet.</div>';
  }else{
    hist.slice(-6).reverse().forEach((h,idx)=>{
      const row=document.createElement('article');
      row.className='trend-history-row';
      const spent=historyMetric(h,'spent');
      const safe=historyMetric(h,'safeToSpend');
      const savings=historyMetric(h,'savings');
      const protectedAmount=historyMetric(h,'protected');
      row.innerHTML=`<div><strong>${dateText(historyDisplayDate(h),{month:'short',day:'numeric',year:'numeric'})}</strong><span>${money(h.paycheck||0)} paycheck</span></div><div class="trend-history-stats"><span>Protected ${money(protectedAmount)}</span><span>Spent ${money(spent)}</span><span>Saved ${money(savings)}</span><b>Safe ${money(safe)}</b></div>`;
      host.append(row);
    });
  }
}


function renderDebtStatusControl(){
  const box=$('confirmNoDebt');
  if(!box)return;
  box.checked=data.confirmedNoDebt===true;
  $('debtStatusBadge').textContent=data.confirmedNoDebt===true?'Confirmed debt-free':'Not confirmed';
}
function financialMemorySnapshot(){
  let parsed=data;
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw)parsed=JSON.parse(raw);
  }catch(_){}
  return {
    schema:'financial-lab-backup',
    version:'4.1.20.1',
    exportedAt:new Date().toISOString(),
    storageKey:STORAGE_KEY,
    data:parsed||data
  };
}
function memoryCounts(){
  return {
    plans:Array.isArray(data.paycheckHistory)?data.paycheckHistory.length:0,
    expenses:Array.isArray(data.expenseRecords)?data.expenseRecords.length:0,
    debts:debtDefinitions().length,
    goals:savingsGoalDefinitions().length
  };
}
function renderMemoryGuard(){
  if(!$('memoryStatusLabel'))return;
  const counts=memoryCounts();
  $('memoryStatusLabel').textContent=('standalone' in navigator && navigator.standalone)||window.matchMedia?.('(display-mode: standalone)').matches?'Installed + device memory':'Browser + device memory';
  $('memoryPlanCount').textContent=String(counts.plans);
  $('memoryExpenseCount').textContent=String(counts.expenses);
  $('memoryDebtCount').textContent=String(counts.debts);
  $('memoryGoalCount').textContent=String(counts.goals);
  $('memoryWarningText').textContent='Financial Lab now keeps two on-device copies of your working data and automatically restores the newer copy when possible. Clearing all Safari/site data or deleting the app can still remove both copies, so keep periodic JSON backups for important history.';
}
function downloadFinancialLabBackup(){
  const status=$('memoryGuardStatus');
  try{
    const snapshot=financialMemorySnapshot();
    const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const stamp=new Date().toISOString().slice(0,10);
    a.href=url;
    a.download=`financial-lab-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    if(status)status.textContent='Backup created. Keep that JSON file somewhere safe.';
  }catch(err){
    console.error(err);
    if(status)status.textContent=`Backup failed: ${err.message||err}`;
  }
}
function validateFinancialLabBackup(payload){
  if(!payload||typeof payload!=='object')throw new Error('Backup file is not valid JSON data.');
  if(payload.schema!=='financial-lab-backup')throw new Error('This file is not a Financial Lab backup.');
  if(!payload.data||typeof payload.data!=='object')throw new Error('Backup is missing Financial Lab data.');
  return payload.data;
}
function restoreFinancialLabBackup(file){
  const status=$('memoryGuardStatus');
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const payload=JSON.parse(String(reader.result||''));
      const restored=validateFinancialLabBackup(payload);
      pushRecoveryPoint(data,'Before JSON backup restore','Current state saved before importing a Financial Lab backup.','restore');
      logRecoveryActivity('Restore JSON backup','A Financial Lab backup file was imported.','restore');
      localStorage.setItem(STORAGE_KEY,JSON.stringify(restored));
      await writeMemoryMirror(restored);
      if(status)status.textContent='Backup restored successfully. Reloading Financial Lab…';
      setTimeout(()=>location.reload(),300);
    }catch(err){
      console.error(err);
      if(status)status.textContent=`Restore failed: ${err.message||err}`;
    }
  };
  reader.onerror=()=>{
    if(status)status.textContent='Restore failed: the backup file could not be read.';
  };
  reader.readAsText(file);
}


function clampScore(n,min=0,max=20){
  return Math.max(min,Math.min(max,Math.round(Number(n)||0)));
}
function scoreGrade(score){
  if(score>=90)return 'EXCELLENT';
  if(score>=80)return 'STRONG';
  if(score>=70)return 'GOOD';
  if(score>=60)return 'BUILDING';
  if(score>=40)return 'WATCH';
  return 'STARTING';
}
function calculateHealthScore(c){
  const history=approvedHistory();
  const latest=history[history.length-1]||null;
  const prior=history[history.length-2]||null;
  const debts=debtDefinitions();
  const goals=savingsGoalDefinitions();

  const hasPlan=Number(c.paycheck)>0;
  const hasHistory=history.length>0;
  const hasExpenses=(Array.isArray(data.expenses)&&data.expenses.length>0)||((c.currentExpenses||[]).length>0);
  const hasSavings=goals.length>0||Number(c.savings)>0||history.some(h=>Number(h.savings)>0);
  const readiness=guidedSetupState();
  const debtKnown=readiness.areas.debt;
  // 4.1.18: historical activity can contribute to the points, but it cannot
  // silently turn skipped/unknown setup into known financial information.
  const setupSignals=[readiness.areas.money,readiness.areas.income,readiness.areas.bills,readiness.areas.debt,readiness.areas.savings];
  const completeness=setupSignals.filter(Boolean).length;
  const baselineComplete=setupSignals.every(Boolean);

  let protection=0,protectionWhy='No active payday plan yet';
  if(hasPlan){
    if(c.shortfall>0){
      const need=(c.payNow||0)+(c.shortfall||0);
      const covered=Math.max(0,need-(c.shortfall||0));
      protection=need>0?clampScore((covered/need)*20):12;
      protectionWhy=`${money(c.shortfall)} of immediate bills still needs funding`;
    }else if((c.payNow||0)+(c.reserve||0)>0){
      protection=20; protectionWhy='Bills and required reserves are protected';
    }else{
      protection=16; protectionWhy='No uncovered bills in this paycheck cycle';
    }
  }else if(hasHistory){
    protection=15; protectionWhy='Approved history exists; build the current plan to refresh';
  }

  let spending=0,spendingWhy='Build a payday plan to establish safe spending';
  if(hasPlan){
    const allowance=Number(c.safeBeforeExpenses)||0;
    if(c.overspent>0){
      spending=clampScore(8-(c.overspent/Math.max(c.paycheck,1))*20);
      spendingWhy=`Over TRUE Safe-to-Spend by ${money(c.overspent)}`;
    }else if(allowance>0){
      const used=(c.expenseTotal||0)/allowance;
      if(used<=.50){spending=20;spendingWhy=`Only ${Math.round(used*100)}% of flexible money used`;}
      else if(used<=.75){spending=18;spendingWhy=`${Math.round(used*100)}% of flexible money used`;}
      else if(used<=.90){spending=15;spendingWhy='Spending is getting close to the limit';}
      else {spending=12;spendingWhy='Most flexible money has been used';}
    }else{
      spending=18; spendingWhy='No flexible overspending detected';
    }
  }

  let savings=0,savingsWhy='No savings contribution yet';
  const currentSavings=Number(c.savings)||0;
  if(currentSavings>0){
    const rate=hasPlan?currentSavings/c.paycheck:0;
    savings=rate>=.15?20:rate>=.10?18:rate>=.05?14:10;
    savingsWhy=`Saving ${Math.round(rate*100)}% of this paycheck`;
    if(!readiness.areas.savings)savingsWhy+=' · savings goals/current savings still need setup';
    if(latest&&prior&&historyMetric(latest,'savings')>historyMetric(prior,'savings')){
      savings=clampScore(savings+2); savingsWhy+=' and improving';
    }
  }else if(goals.length){
    savings=8; savingsWhy='Savings goals exist but this check has no contribution';
  }

  let debt=0,debtWhy='Debt status not confirmed yet';
  if(debts.length){
    const totalDebt=debts.reduce((s,x)=>s+Number(x.balance||0),0);
    const mins=debts.reduce((s,x)=>s+Number(x.minimum||x.minimumPayment||0),0);
    if(totalDebt<=0){debt=20;debtWhy='Tracked debt is paid off';}
    else if((c.debtPayment||0)>0){debt=18;debtWhy=`${money(c.debtPayment)} going toward extra debt progress`;}
    else if(mins>0){debt=13;debtWhy='Debt is tracked; extra progress can improve this score';}
    else {debt=10;debtWhy='Debt balances are tracked but need a payment strategy';}
  }else if(data.confirmedNoDebt===true){
    debt=20; debtWhy='You confirmed there is no debt to track';
  }else{
    debt=0; debtWhy='Add debt accounts or confirm that you currently have no debt';
  }

  let consistency=0;
  if(history.length>=1)consistency+=8;
  if(history.length>=2)consistency+=5;
  if(history.length>=4)consistency+=3;
  if((c.currentExpenses||[]).length>0)consistency+=2;
  if(data.payDate)consistency+=2;
  consistency=clampScore(consistency);
  let consistencyWhy='Start approving payday plans to build consistency';
  if(history.length>=2)consistencyWhy=`${history.length} approved plans are building reliable history`;
  else if(history.length===1)consistencyWhy='First approved plan is building your baseline';

  const total=protection+spending+savings+debt+consistency;
  let delta=null;
  const activePlanId=data?.approvedPlan?.id||'';
  const latestIsActive=Boolean(activePlanId&&latest?.id===activePlanId);
  const comparison=latestIsActive?prior:latest;
  if(comparison?.healthScore!=null)delta=total-Number(comparison.healthScore||0);

  return {total,grade:baselineComplete?scoreGrade(total):'BASELINE',baselineComplete,completeness,
    protection,spending,savings,debt,consistency,protectionWhy,spendingWhy,savingsWhy,debtWhy,consistencyWhy,delta};
}
function healthExplanation(h){
  if(!h.baselineComplete){
    const r=guidedSetupState();
    const missing=[];
    if(!r.areas.bills)missing.push('recurring bills');
    if(!r.areas.debt)missing.push('debt status');
    if(!r.areas.savings)missing.push('savings setup');
    if(!r.areas.money||!r.areas.income)missing.push('essential setup');
    const next=missing[0]||'financial setup';
    return `Dexx is still building an accurate baseline. Complete your ${next} before treating this number as a complete Financial Health Score.`;
  }
  const items=[['Protection',h.protection,h.protectionWhy],['Spending',h.spending,h.spendingWhy],['Savings',h.savings,h.savingsWhy],['Debt',h.debt,h.debtWhy],['Consistency',h.consistency,h.consistencyWhy]];
  const best=[...items].sort((a,b)=>b[1]-a[1])[0];
  const weakest=[...items].sort((a,b)=>a[1]-b[1])[0];
  if(h.total>=90)return `Your strongest area is ${best[0].toLowerCase()}. ${best[2]}. Keep the same system working across future paychecks.`;
  if(h.total>=70)return `${best[0]} is helping your score most. ${weakest[0]} is the biggest opportunity: ${weakest[2]}.`;
  if(h.total>=50)return `You have a foundation, but ${weakest[0].toLowerCase()} needs the most attention. ${weakest[2]}.`;
  return `Dexx is still building your financial baseline. Start with ${weakest[0].toLowerCase()}: ${weakest[2]}.`;
}
function renderHealthScore(c){
  if(!$('healthScoreValue'))return;
  const h=calculateHealthScore(c);
  $('healthScoreValue').textContent=String(h.total);
  $('healthScoreGrade').textContent=h.grade;
  $('healthScoreMeter').style.width=`${h.total}%`;
  $('healthProtection').textContent=`${h.protection}/20`;
  $('healthSpending').textContent=`${h.spending}/20`;
  $('healthSavings').textContent=`${h.savings}/20`;
  const readiness=guidedSetupState();
  $('healthDebt').textContent=readiness.areas.debt?`${h.debt}/20`:'—/20';
  $('healthConsistency').textContent=`${h.consistency}/20`;
  $('healthProtectionWhy').textContent=h.protectionWhy;
  $('healthSpendingWhy').textContent=h.spendingWhy;
  $('healthSavingsWhy').textContent=h.savingsWhy;
  $('healthDebtWhy').textContent=h.debtWhy;
  $('healthConsistencyWhy').textContent=h.consistencyWhy;
  const notice=$('healthBaselineNotice');
  if(h.baselineComplete){
    notice?.classList.add('complete');
    $('healthBaselineLabel').textContent='BASELINE COMPLETE';
    $('healthBaselineText').textContent='Dexx has enough real financial activity to treat this as a meaningful 100-point score.';
    $('healthScoreSummary').textContent=`${h.grade} financial health based on protection, spending, savings, debt, and consistency.`;
  }else{
    notice?.classList.remove('complete');
    $('healthBaselineLabel').textContent='BASELINE INCOMPLETE';
    const missingHealth=[];
    if(!readiness.areas.debt)missingHealth.push('debt');
    if(!readiness.areas.savings)missingHealth.push('full savings');
    const readyHealthSignals=5-missingHealth.length;
    $('healthBaselineText').textContent=`${readyHealthSignals} of 5 health signals are ready. ${missingHealth.length?`${missingHealth.join(' and ')} information ${missingHealth.length===1?'is':'are'} still needed before Dexx treats this as your complete score.`:'Finish setup before treating this as your complete score.'}`;
    $('healthScoreSummary').textContent='This is a provisional baseline, not a complete Financial Health Score yet.';
  }
  $('healthDexxExplanation').textContent=healthExplanation(h);
  const today=dateAtNoon(new Date());
  const payDate=dateAtNoon(data.payDate);
  const futureApprovedPlan=Boolean(data.approvedPlan&&payDate&&today&&payDate>today);
  if(!h.baselineComplete){
    const ready=guidedSetupState();
    const missing=['bills','debt','savings'].filter(key=>!ready.areas[key]).map(key=>key==='bills'?'bills':key);
    $('healthScoreChange').textContent='Provisional';
    $('healthScoreSummary').textContent=futureApprovedPlan
      ?`Your approved ${dateText(data.payDate,{month:'short',day:'numeric'})} plan is included, but ${missing.length?missing.join(' + '):'setup'} information is still incomplete.`
      :'This is a provisional baseline until the recommended financial setup is complete.';
  }else if(futureApprovedPlan){
    $('healthScoreChange').textContent='Plan readiness';
    $('healthScoreSummary').textContent=`Your approved ${dateText(data.payDate,{month:'short',day:'numeric'})} plan is included here. Live spending behavior begins on payday.`;
  }else if(h.delta===null)$('healthScoreChange').textContent='Building baseline';
  else if(Math.abs(h.delta)<1)$('healthScoreChange').textContent='No change';
  else $('healthScoreChange').textContent=`${h.delta>0?'+':''}${h.delta} vs prior approved`;
}

function actionItem(id,priority,title,why,label,target){
  return {id,priority,title,why,label,target};
}
function buildDexxActions(c){
  const h=calculateHealthScore(c);
  const actions=[];
  const debts=debtDefinitions();
  const goals=savingsGoalDefinitions();
  const history=approvedHistory();

  if(!h.baselineComplete){
    const readiness=guidedSetupState();
    if(!readiness.areas.bills){
      actions.push(actionItem('bills-setup',110,'Add your recurring bills','TRUE Safe-to-Spend and forecasts are more reliable when Dexx knows the bills and due dates that must be protected.','ADD RECURRING BILLS','profile'));
    }
    if(!readiness.areas.debt){
      actions.push(actionItem('debt-status',100,'Confirm your debt status','Add your debt accounts in Credit Lab, or confirm that you currently have no debt to track.','CHECK DEBT STATUS','more'));
    }
    if(Number(c.paycheck)<=0){
      actions.push(actionItem('payday-plan',95,'Build your payday plan','Enter your paycheck, pay date, and next payday so Dexx can calculate what is truly safe to spend.','OPEN BUDGET LAB','budget'));
    }
    if(!readiness.areas.savings){
      actions.push(actionItem('savings-setup',85,'Complete your savings setup',goals.length?'Your savings goals exist, but this paycheck has no savings contribution yet.':'Add current savings or a savings goal so Dexx can connect planned saving to real progress.','OPEN SAVINGS LAB','savings'));
    }
    if(history.length===0){
      actions.push(actionItem('approve-first',80,'Approve your first payday plan','Approved plans are what create reliable Financial Lab history and future trend comparisons.','OPEN BUDGET LAB','budget'));
    }
  }else{
    if(c.shortfall>0){
      actions.push(actionItem('shortfall',120,'Cover the immediate shortfall',`${money(c.shortfall)} of required money still needs funding before discretionary spending.`, 'REVIEW PAYDAY PLAN','budget'));
    }
    if(c.overspent>0){
      actions.push(actionItem('overspent',115,'Pause flexible spending',`You are ${money(c.overspent)} over TRUE Safe-to-Spend for this cycle.`, 'OPEN SPENDING LAB','spending'));
    }
    if(h.protection<16){
      actions.push(actionItem('protection',100,'Strengthen bill protection',h.protectionWhy,'REVIEW BILLS','budget'));
    }
    if(h.spending<15){
      actions.push(actionItem('spending',95,'Reduce flexible spending',h.spendingWhy,'OPEN SPENDING LAB','spending'));
    }
    if(h.savings<14){
      actions.push(actionItem('savings',90,'Increase savings progress',h.savingsWhy,'OPEN SAVINGS LAB','savings'));
    }
    if(h.debt<14){
      actions.push(actionItem('debt',88,'Improve debt progress',h.debtWhy,'OPEN CREDIT LAB','credit'));
    }
    if(h.consistency<15){
      actions.push(actionItem('consistency',75,'Build a stronger money routine',h.consistencyWhy,'OPEN BUDGET LAB','budget'));
    }

    const latest=history[history.length-1];
    const prior=history[history.length-2];
    if(latest&&prior){
      const spentChange=historyMetric(latest,'spent')-historyMetric(prior,'spent');
      const safeChange=historyMetric(latest,'safeToSpend')-historyMetric(prior,'safeToSpend');
      if(spentChange>0){
        actions.push(actionItem('trend-spending',70,'Reverse the spending trend',`Spending increased ${money(spentChange)} versus the previous approved paycheck.`,'VIEW REPORTS','reports'));
      }else if(safeChange>0){
        actions.push(actionItem('trend-win',40,'Keep the stronger pattern',`TRUE Safe-to-Spend finished ${money(safeChange)} higher than the prior approved paycheck.`,'VIEW REPORTS','reports'));
      }
    }
  }

  if(!actions.length){
    actions.push(actionItem('maintain',30,'Stay on the current plan','Your current setup has no urgent weak area. Keep tracking expenses and approving each payday plan.','OPEN BUDGET LAB','budget'));
  }

  return actions.sort((a,b)=>b.priority-a.priority).slice(0,4);
}
function actionTargetView(target){
  const map={
    budget:'budget',
    credit:'credit',
    savings:'savings',
    spending:'expense',
    reports:'reports',
    more:'more'
  };
  return map[target]||'laboratory';
}
function navigateDexxAction(target){
  const view=actionTargetView(target);

  // Financial Lab already has its own show(id) router.
  // Use it first so Action Center navigation behaves exactly like the app.
  if(typeof show==='function'){
    show(view);

    if(target==='more'){
      setTimeout(()=>{
        const card=document.querySelector('.debt-status-card');
        if(card){
          card.scrollIntoView({behavior:'smooth',block:'start'});
          card.classList.add('action-target-flash');
          setTimeout(()=>card.classList.remove('action-target-flash'),1200);
        }
      },120);
    }
    return true;
  }

  // Fallback for any future build where show() is renamed.
  const targetView=document.getElementById(view);
  if(targetView && targetView.classList.contains('view')){
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v===targetView));
    window.location.hash=`#${view}`;
    window.scrollTo({top:0,behavior:'smooth'});

    if(target==='more'){
      setTimeout(()=>document.querySelector('.debt-status-card')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    }
    return true;
  }
  return false;
}
function renderActionCenter(c){
  if(!$('dexxActionList'))return;
  const h=calculateHealthScore(c);
  const actions=buildDexxActions(c);
  const top=actions[0];

  $('actionCenterStatus').textContent=h.baselineComplete?'Live priorities':'Finish setup';
  $('actionTopTitle').textContent=top.title;
  $('actionTopWhy').textContent=top.why;
  $('actionTopButton').textContent=top.label;
  $('actionTopButton').dataset.target=top.target;

  const host=$('dexxActionList');
  host.replaceChildren();
  actions.slice(1).forEach((a,i)=>{
    const row=document.createElement('article');
    row.className='action-row';
    row.innerHTML=`<div class="action-rank">${String(i+2).padStart(2,'0')}</div><div><strong>${escapeHTML(a.title)}</strong><p>${escapeHTML(a.why)}</p></div><button type="button" data-action-target="${a.target}">${a.label}</button>`;
    host.append(row);
  });

  if(!h.baselineComplete){
    $('actionSummaryText').textContent='Dexx is prioritizing setup first. Once your baseline is complete, this list will shift from setup tasks to active financial recommendations.';
  }else{
    const weakest=[['Protection',h.protection],['Spending',h.spending],['Savings',h.savings],['Debt',h.debt],['Consistency',h.consistency]].sort((a,b)=>a[1]-b[1])[0];
    $('actionSummaryText').textContent=`Your current score is ${h.total}/100. Dexx is prioritizing ${weakest[0].toLowerCase()} because it is your lowest scoring area right now.`;
  }
}

let calendarCursor=null;
function calendarMoney(value){
  const n=Math.max(0,Number(value)||0);
  if(n>=1000000)return `$${(n/1000000).toFixed(n>=10000000?0:1).replace(/\.0$/,'')}m`;
  if(n>=1000)return `$${(n/1000).toFixed(n>=10000?0:1).replace(/\.0$/,'')}k`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
function payFrequencyDays(){return data.profile?.payFrequency==='biweekly'?14:data.profile?.payFrequency==='monthly'?30:7}
function shiftPayday(date,direction=1){
  const d=dateAtNoon(date);if(!d)return null;
  if(data.profile?.payFrequency==='monthly')return monthDate(d.getFullYear(),d.getMonth()+direction,d.getDate());
  return new Date(d.getTime()+direction*payFrequencyDays()*86400000);
}
function nextScheduledWeekday(fromDate,weekday){
  const d=dateAtNoon(fromDate)||new Date();d.setHours(12,0,0,0);
  const target=Number.isFinite(Number(weekday))?Number(weekday):5;
  const delta=(target-d.getDay()+7)%7;
  d.setDate(d.getDate()+delta);
  return d;
}
function suggestedNextPayCycle(){
  const history=approvedHistory();
  const latest=history[history.length-1]||null;
  const today=dateAtNoon(new Date());
  const activePayDate=dateAtNoon(data.payDate);
  const activeNextPayday=dateAtNoon(data.nextPayday);
  const activeAmount=Math.max(0,Number(data.paycheck)||0);

  // If an upcoming paycheck cycle was prepared early but no paycheck amount has
  // been entered yet, keep that real upcoming payday on the launchpad. Preparing
  // a cycle must not make the UI pretend the following payday is the next check.
  if(activePayDate&&activePayDate>=today&&activeAmount===0){
    const nextPayday=activeNextPayday||shiftPayday(activePayDate,1);
    return {payDate:iso(activePayDate),nextPayday:iso(nextPayday),suggestedAmount:0,preparedUpcoming:true};
  }

  let payDate=null;
  if(data.nextPayday)payDate=dateAtNoon(data.nextPayday);
  if(!payDate&&latest?.nextPayday)payDate=dateAtNoon(latest.nextPayday);
  if(!payDate)payDate=nextScheduledWeekday(new Date(),data.profile?.paydayDay??5);
  // Payday Continuity (v4.1.20.3): never suggest a cycle anchored on a payday
  // that already passed. Roll the schedule forward to the correct current
  // payday so missed weeks cannot leave the launchpad pointing at the past.
  let rollGuard=0;
  while(payDate&&today&&payDate<today&&rollGuard++<80){
    const stepped=shiftPayday(payDate,1);
    if(!stepped||iso(stepped)===iso(payDate))break;
    payDate=stepped;
  }
  let nextPayday=shiftPayday(payDate,1);
  if(!nextPayday)nextPayday=new Date(payDate.getTime()+payFrequencyDays()*86400000);
  const latestAmount=Math.max(0,Number(latest?.paycheck||data.paycheck)||0);
  const suggestedAmount=data.profile?.incomePattern==='steady'?latestAmount:0;
  return {payDate:iso(payDate),nextPayday:iso(nextPayday),suggestedAmount,preparedUpcoming:false};
}
function renderNextPaycheckLaunchpad(){
  const preview=suggestedNextPayCycle();
  if($('nextCyclePayDate'))$('nextCyclePayDate').textContent=dateText(preview.payDate,{weekday:'short',month:'short',day:'numeric'});
  if($('nextCycleNextPayday'))$('nextCycleNextPayday').textContent=dateText(preview.nextPayday,{weekday:'short',month:'short',day:'numeric'});
}
function startNextPaycheckCycle(){
  const preview=suggestedNextPayCycle();
  const hasActive=Boolean(data.payDate||data.nextPayday||Number(data.paycheck)>0||Number(data.currentBalance)>0);
  const cycleLabel=`${dateText(preview.payDate,{month:'short',day:'numeric'})} → ${dateText(preview.nextPayday,{month:'short',day:'numeric'})}`;
  const warning=hasActive
    ? `Start ${cycleLabel} paycheck cycle?\n\nThis will replace the active check fields with the next cycle. Your recurring bills, debts, savings goals, Reserve Memory, expenses, and approved history will stay saved.`
    : `Start ${cycleLabel} paycheck cycle?\n\nYour recurring bills, debts, savings goals, Reserve Memory, expenses, and approved history will stay saved.`;
  if(!confirm(warning))return;
  data.paycheck=preview.suggestedAmount;
  data.currentBalance=0;
  data.payDate=preview.payDate;
  data.nextPayday=preview.nextPayday;
  data.customSavings=null;
  data.customDebt=null;
  data.approvedPlan=null;
  data.missions={...data.missions,spending:false,saving:false,bills:data.bills.length>0,friday:false};
  setRecoveryContext(`Advance paycheck to ${cycleLabel}`,`Prepared ${cycleLabel}. Bills, debts, savings, Reserve Memory, expenses, and approved history were preserved.`,'payday');
  save();
  if($('nextPaycheckStatus'))$('nextPaycheckStatus').textContent=`Next cycle prepared: ${dateText(preview.payDate,{month:'short',day:'numeric'})} → ${dateText(preview.nextPayday,{month:'short',day:'numeric'})}. Enter this check’s amount${preview.suggestedAmount?' or confirm the prefilled amount':''}, then build the plan.`;
  setTimeout(()=>$('paycheck')?.focus(),120);
}

/* ================= Payday Continuity — v4.1.20.3 =================
   Keeps the app working when one or more paycheck check-ins are missed.
   - Detects scheduled paydays that passed with no confirmed check-in.
   - Lets the user confirm a missed payday late. A late-confirmed check is a
     real deposit: it counts toward Dexx's income learning, but it never
     funds reserves or savings retroactively.
   - Lets the user skip a missed payday. Skipped paydays are never counted
     as income, learned, or forecast.
   - Rolls new-cycle planning forward to the correct current payday.
   Core rule preserved: unconfirmed income is never treated as received. */
function continuityAnchorIso(){
  const cands=[];
  if(data.payDate)cands.push(data.payDate);
  (Array.isArray(data.paycheckHistory)?data.paycheckHistory:[]).forEach(h=>{if(h&&h.payDate)cands.push(h.payDate)});
  const dates=cands.map(dateAtNoon).filter(Boolean).sort((a,b)=>a-b);
  return dates.length?iso(dates[0]):'';
}
function scheduledPaydaysFrom(anchorIso,maxCount){
  const out=[];let d=dateAtNoon(anchorIso);let guard=0;
  while(d&&guard++<(maxCount||80)){
    out.push(iso(d));
    const n=shiftPayday(d,1);
    if(!n||iso(n)===iso(d))break;
    d=n;
  }
  return out;
}
function reconciledPayDateSet(){
  const set=new Set();
  (Array.isArray(data.paycheckHistory)?data.paycheckHistory:[]).forEach(h=>{
    if(h&&h.payDate&&Number(h.actualPaycheck)>0&&h.reconciledAt){
      const d=dateAtNoon(h.payDate);set.add(d?iso(d):h.payDate);
    }
  });
  return set;
}
function skippedPayDateSet(){
  const set=new Set();
  (Array.isArray(data.skippedPaydays)?data.skippedPaydays:[]).forEach(s=>{const d=dateAtNoon(s);set.add(d?iso(d):s)});
  return set;
}
function missedCheckins(){
  const anchor=continuityAnchorIso();if(!anchor)return [];
  const today=dateAtNoon(new Date());if(!today)return [];
  const reconciled=reconciledPayDateSet(),skipped=skippedPayDateSet();
  const activeRaw=(data.approvedPlan&&data.approvedPlan.payDate)||data.payDate||'';
  const activeD=dateAtNoon(activeRaw);const activePayDate=activeD?iso(activeD):'';
  // Only look back a bounded number of cycles so a very old schedule can never
  // produce phantom missed paydays.
  const earliest=new Date(today.getTime()-12*payFrequencyDays()*86400000);
  const missed=[];
  scheduledPaydaysFrom(anchor,80).forEach(pd=>{
    const d=dateAtNoon(pd);if(!d)return;
    if(d>=today||d<earliest)return;                  // strictly past, within lookback
    if(reconciled.has(pd)||skipped.has(pd))return;   // already accounted for
    if(pd===activePayDate)return;                    // active cycle uses the payday check-in UI
    missed.push({payDate:pd,nextPayday:iso(shiftPayday(d,1))});
  });
  return missed;
}
function confirmMissedCheckin(payDateIso,actualAmount){
  const actual=Math.max(0,Number(actualAmount)||0);
  if(!(actual>0))return {ok:false,error:'Enter the amount that actually reached your account.'};
  const d=dateAtNoon(payDateIso);if(!d)return {ok:false,error:'Unknown payday.'};
  const nextPayday=iso(shiftPayday(d,1));
  const history=Array.isArray(data.paycheckHistory)?data.paycheckHistory:[];
  const key=pd=>{const x=dateAtNoon(pd);return x?iso(x):pd};
  let entry=history.find(h=>h&&key(h.payDate)===payDateIso&&!(Number(h.actualPaycheck)>0&&h.reconciledAt));
  const now=new Date().toISOString();
  if(entry){
    entry.actualPaycheck=actual;entry.reconciledAt=now;entry.fundingStatus='late-confirmed';entry.late=true;
  }else{
    entry={id:`late-${payDateIso}-${Date.now()}`,payDate:payDateIso,nextPayday,cycleId:`${payDateIso}__${nextPayday}`,paycheck:0,plannedPaycheck:0,actualPaycheck:actual,reconciledAt:now,fundedAt:'',fundingStatus:'late-confirmed',late:true,reserveContributions:[],savingsContributions:[],approvedAt:now};
    history.push(entry);data.paycheckHistory=history;
  }
  setRecoveryContext('Late check-in confirmed',`${money(actual)} confirmed for the ${dateText(d,{month:'short',day:'numeric'})} payday. Dexx counts it as a confirmed check for income learning; no reserves were funded retroactively.`,'payday');
  save();
  return {ok:true};
}
function skipMissedCheckin(payDateIso){
  if(!Array.isArray(data.skippedPaydays))data.skippedPaydays=[];
  if(!data.skippedPaydays.includes(payDateIso))data.skippedPaydays.push(payDateIso);
  const d=dateAtNoon(payDateIso);
  setRecoveryContext('Check-in skipped',`${d?dateText(d,{month:'short',day:'numeric'}):payDateIso} payday marked as skipped. No income was counted for it.`,'payday');
  save();
}
function skipAllMissedCheckins(){
  const missed=missedCheckins();
  if(!missed.length)return;
  if(!Array.isArray(data.skippedPaydays))data.skippedPaydays=[];
  missed.forEach(m=>{if(!data.skippedPaydays.includes(m.payDate))data.skippedPaydays.push(m.payDate)});
  setRecoveryContext('Check-ins skipped',`${missed.length} missed payday${missed.length===1?'':'s'} marked as skipped. No income was counted for them.`,'payday');
  save();
}
function renderPaydayCatchup(){
  const card=$('paydayCatchup');if(!card)return;
  const missed=missedCheckins();
  card.hidden=missed.length===0;
  if(!missed.length)return;
  const set=(id,value)=>{if($(id))$(id).textContent=value};
  set('catchupCount',missed.length);
  set('catchupTitle',missed.length===1?'1 missed check-in':'Missed check-ins');
  const list=$('catchupList');if(!list)return;
  list.replaceChildren();
  missed.forEach(m=>{
    const d=dateAtNoon(m.payDate);
    const row=document.createElement('div');row.className='catchup-row';row.dataset.paydate=m.payDate;
    row.innerHTML=`<div class="catchup-row-main"><div><strong>${escapeHTML(dateText(d,{weekday:'short',month:'short',day:'numeric'}))}</strong><span>No confirmed check-in</span></div><div class="catchup-row-actions"><button type="button" class="catchup-enter" data-catchup="enter">Enter actual</button><button type="button" class="danger-link" data-catchup="skip">Skip</button></div></div><div class="catchup-form" hidden><label>Actual amount received<input type="number" inputmode="decimal" min="0" step="0.01" placeholder="$0.00" data-catchup-amount/></label><div class="catchup-form-actions"><button type="button" class="primary" data-catchup="confirm">Confirm</button><button type="button" data-catchup="cancel">Cancel</button></div><small class="catchup-error" data-catchup-error hidden></small></div>`;
    list.append(row);
  });
}

/* ================= Smart Bill Calendar — v4.1.20.4 =================
   Gives every bill a clear status and a reliable place in the paycheck plan.
   - Status per occurrence: paid | overdue | due-next | upcoming.
   - "Must cover by next paycheck" = overdue + due before the (continuity-aware)
     next payday. Overdue obligations carry forward as the SAME occurrence —
     keyed parentId|occurrenceDate — so they can never duplicate.
   - Payment confirmation is one shared toggle used by every bill list.
   - Upcoming pressure is visible per payday before it arrives. */
function billStatusOf(occ,todayIso,nextPayIso){
  if(occ&&occ.paid)return 'paid';
  const d=(occ&&(occ.occurrenceDate||occ.date))||'';
  if(d&&d<todayIso)return 'overdue';
  if(d&&nextPayIso&&d<=nextPayIso)return 'due-next';
  return 'upcoming';
}
function toggleBillPaidOccurrence(occ){
  if(!occ)return false;
  const real=(Array.isArray(data.bills)?data.bills:[]).find(x=>x.id===(occ.parentId||occ.id));
  if(!real)return false;
  real.paidOccurrences=Array.isArray(real.paidOccurrences)?real.paidOccurrences:[];
  const key=occ.occurrenceDate||occ.date;
  const isPaid=real.paidOccurrences.includes(key);
  real.paidOccurrences=isPaid?real.paidOccurrences.filter(x=>x!==key):[...real.paidOccurrences,key];
  if(!isPaid&&data.reserveMemory)delete data.reserveMemory[reserveKey(occ)];
  data.approvedPlan=null;
  const d=dateAtNoon(key);
  setRecoveryContext(isPaid?'Bill marked unpaid':'Bill marked paid',`${occ.name||'Bill'} · ${money(occ.amount)} · due ${d?dateText(d,{month:'short',day:'numeric'}):key}.`,'bill');
  save();
  return !isPaid;
}
function smartBillGroups(c){
  const empty={overdue:[],dueNext:[],upcoming:[],paidRecent:[]};
  const today=dateAtNoon(new Date());if(!today)return empty;
  const todayIso=iso(today);
  const nextPayD=c&&c.nextPay?dateAtNoon(c.nextPay):null;
  const nextPayIso=nextPayD?iso(nextPayD):'';
  const lookback=new Date(today.getTime()-90*86400000);
  const horizon=new Date(today.getTime()+30*86400000);
  const paidCutoff=new Date(today.getTime()-30*86400000);
  const groups={overdue:[],dueNext:[],upcoming:[],paidRecent:[]};
  const seen=new Set();
  billOccurrences(lookback,horizon).forEach(o=>{
    const key=`${o.parentId||o.id}|${o.occurrenceDate||o.date}`;
    if(seen.has(key))return;seen.add(key); // carry forward without duplicates
    const st=billStatusOf(o,todayIso,nextPayIso);
    const d=dateAtNoon(o.date);
    const enriched={...o,status:st,
      daysOverdue:st==='overdue'&&d?Math.max(0,Math.round((today-d)/86400000)):0,
      alreadyProtected:Number(o.alreadyProtected||protectedFor(o))||0};
    if(st==='paid'){
      if(d&&d>=paidCutoff)groups.paidRecent.push(enriched);
    }else{
      groups[st==='due-next'?'dueNext':st].push(enriched);
    }
  });
  const byDate=(a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''));
  groups.overdue.sort(byDate);groups.dueNext.sort(byDate);groups.upcoming.sort(byDate);
  groups.paidRecent.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return groups;
}
function billPressureWindows(c,groups){
  const today=dateAtNoon(new Date());if(!today)return [];
  const horizon=new Date(today.getTime()+60*86400000);
  const todayIso=iso(today);
  // Strictly future paydays: bills due today already sit in the must-cover list.
  const paydays=forecastPaydays(today,horizon).filter(pd=>pd>todayIso).slice(0,4);
  if(!paydays.length)return [];
  const learning=c&&c.learning?c.learning:cashFlowLearningState();
  const incomePerCheck=learning.learned?Number(learning.average)||0:0;
  const windows=[];let prev=iso(today);
  paydays.forEach(pd=>{
    const bills=[];
    billOccurrences(prev,pd).forEach(o=>{
      if(o.paid)return;
      if(o.date>prev&&o.date<=pd)bills.push(o);
    });
    // de-dupe by stable occurrence key
    const seen=new Set(),unique=[];
    bills.forEach(b=>{const k=`${b.parentId||b.id}|${b.occurrenceDate||b.date}`;if(!seen.has(k)){seen.add(k);unique.push(b)}});
    const total=unique.reduce((s,b)=>s+Number(b.amount||0),0);
    windows.push({payday:pd,bills:unique,total,incomePerCheck,covered:incomePerCheck>0?incomePerCheck-total:null});
    prev=pd;
  });
  return windows;
}
function renderSmartBills(c){
  const card=$('smartBillsCard');if(!card)return;
  const groups=smartBillGroups(c);
  const set=(id,value)=>{if($(id))$(id).textContent=value};
  const defs=billDefinitions();
  if(!defs.length){
    set('smartBillsStatus','No bills yet');
    set('smartBillsSummary','Add recurring bills in Financial Profile and every bill will get a clear status and a place in your paycheck plan.');
    const strip=$('pressureStrip');if(strip)strip.replaceChildren();
    const host=$('smartBillsGroups');if(host)host.innerHTML='<div class="empty-copy">No recurring bills saved yet.</div>';
    return;
  }
  const nextPayD=c&&c.nextPay?dateAtNoon(c.nextPay):null;
  const nextPayLabel=nextPayD?dateText(nextPayD,{weekday:'short',month:'short',day:'numeric'}):'next payday';
  const mustCover=[...groups.overdue,...groups.dueNext];
  const mustTotal=mustCover.reduce((s,b)=>s+Math.max(0,Number(b.amount||0)-Number(b.alreadyProtected||0)),0);
  const overdueTotal=groups.overdue.reduce((s,b)=>s+Number(b.amount||0),0);
  set('smartBillsStatus',groups.overdue.length?`${groups.overdue.length} overdue`:'On track');
  set('smartBillsSummary',mustCover.length
    ?`${money(mustTotal)} must be covered by ${nextPayLabel} across ${mustCover.length} bill${mustCover.length===1?'':'s'}${groups.overdue.length?` (${groups.overdue.length} overdue)`:''}.`
    :'No bills due before your next payday. Upcoming bills are listed below with their status.');
  // Pressure strip: per-payday bill load before it arrives.
  const strip=$('pressureStrip');
  if(strip){
    strip.replaceChildren();
    billPressureWindows(c,groups).forEach(w=>{
      const d=dateAtNoon(w.payday);
      const el=document.createElement('div');el.className='pressure-cell';
      const cov=w.covered===null?'':(w.covered>=0?` · ${money(w.covered)} headroom`:` · ${money(Math.abs(w.covered))} short`);
      el.innerHTML=`<span>${d?dateText(d,{weekday:'short',month:'short',day:'numeric'}):w.payday}</span><strong>${money(w.total)}</strong><small>${w.bills.length} bill${w.bills.length===1?'':'s'}${cov}</small>`;
      if(w.covered!==null&&w.covered<0)el.classList.add('short');
      strip.append(el);
    });
  }
  const host=$('smartBillsGroups');
  if(host){
    host.replaceChildren();
    const sections=[
      ['overdue','Overdue — carry forward into this check',groups.overdue],
      ['due-next','Due before '+nextPayLabel+' — covered by next paycheck',groups.dueNext],
      ['upcoming','Upcoming — next 30 days',groups.upcoming],
      ['paid','Recently paid',groups.paidRecent],
    ];
    sections.forEach(([key,title,items])=>{
      if(!items.length)return;
      const sec=document.createElement('div');sec.className=`bill-group ${key}`;
      const total=items.reduce((s,b)=>s+Number(b.amount||0),0);
      sec.innerHTML=`<div class="bill-group-head"><span class="bill-status-pill ${key}">${key==='due-next'?'DUE THIS CHECK':key.replace('-',' ').toUpperCase()}</span><strong>${title}</strong><b>${money(total)}</b></div>`;
      const list=document.createElement('div');list.className='bill-group-list';
      items.forEach(b=>{
        const row=document.createElement('div');row.className='smart-bill-row';
        const sub=b.status==='overdue'
          ?`${b.daysOverdue} day${b.daysOverdue===1?'':'s'} overdue`
          :b.status==='paid'?'Paid':`Due ${dateText(b.date,{month:'short',day:'numeric'})}`;
        const prot=Number(b.alreadyProtected||0)>0?` · ${money(b.alreadyProtected)} protected`:'';
        row.innerHTML=`<button type="button" class="check ${b.status==='paid'?'on':''}" data-bill-toggle data-parent="${escapeHTML(b.parentId||b.id)}" data-date="${escapeHTML(b.occurrenceDate||b.date)}" aria-label="${b.status==='paid'?'Mark unpaid':'Mark paid'}">${b.status==='paid'?'✓':''}</button><div><strong>${escapeHTML(b.name||'Bill')}</strong><span>${sub}${prot}${b.autopay?' · autopay':''}</span></div><b>${money(b.amount)}</b>`;
        list.append(row);
      });
      sec.append(list);host.append(sec);
    });
    if(!mustCover.length&&!groups.upcoming.length&&!groups.paidRecent.length){
      host.innerHTML='<div class="empty-copy">No bill activity in range.</div>';
    }
  }
}

function forecastPaydays(startDate,endDate){
  const start=dateAtNoon(startDate),end=dateAtNoon(endDate);if(!start||!end)return [];
  let anchor=dateAtNoon(data.nextPayday)||dateAtNoon(data.payDate)||dateAtNoon(new Date());
  if(!anchor)return [];
  let guard=0;
  while(anchor>start&&guard++<80){const prior=shiftPayday(anchor,-1);if(!prior||prior.getTime()===anchor.getTime())break;anchor=prior}
  guard=0;
  while(anchor<start&&guard++<80){const next=shiftPayday(anchor,1);if(!next||next.getTime()===anchor.getTime())break;anchor=next}
  const out=[];guard=0;
  for(let d=anchor;d&&d<=end&&guard++<80;d=shiftPayday(d,1)){if(d>=start)out.push(iso(d))}
  return [...new Set(out)];
}
function confirmedPaycheckHistory(){
  const raw=Array.isArray(data.paycheckHistory)?data.paycheckHistory:[];
  const byCycle=new Map();
  raw.forEach(h=>{
    const actual=Math.max(0,Number(h?.actualPaycheck)||0);
    if(!actual||!h?.reconciledAt)return;
    // Payday Continuity (v4.1.20.3): late-confirmed check-ins are real deposits
    // and teach Dexx income like any funded check. Skipped paydays never reach
    // here (no actual amount, no reconciliation timestamp).
    const fundingState=planFundingStatus(h);
    if(fundingState!=='funded'&&fundingState!=='late-confirmed')return;
    const key=h.cycleId||h.payDate||h.id;
    const prior=byCycle.get(key);
    if(!prior||Date.parse(h.reconciledAt||h.fundedAt||0)>=Date.parse(prior.reconciledAt||prior.fundedAt||0))byCycle.set(key,h);
  });
  return [...byCycle.values()].sort((a,b)=>Date.parse(a.reconciledAt||a.payDate||0)-Date.parse(b.reconciledAt||b.payDate||0));
}
function cashFlowLearningState(){
  const checks=confirmedPaycheckHistory();
  const threshold=3,count=checks.length;
  const recent=checks.slice(-6);
  const amounts=recent.map(h=>Math.max(0,Number(h.actualPaycheck)||0)).filter(Boolean);
  const average=amounts.length?amounts.reduce((sum,x)=>sum+x,0)/amounts.length:0;
  const low=amounts.length?Math.min(...amounts):0,high=amounts.length?Math.max(...amounts):0;
  const learned=count>=threshold;
  const confidence=count>=6?'Established pattern':learned?'Early pattern':'Learning';
  return {checks,count,threshold,remaining:Math.max(0,threshold-count),recent,average,low,high,learned,confidence};
}
function forecastWindow(days=30){
  const start=dateAtNoon(new Date()),end=new Date(start.getTime()+days*86400000);
  const bills=billOccurrences(start,end).filter(b=>!b.paid);
  const paydays=forecastPaydays(start,end).filter(date=>date>iso(start));
  const billTotal=bills.reduce((sum,b)=>sum+Number(b.amount||0),0);
  const learning=cashFlowLearningState();
  const incomePerCheck=learning.learned?learning.average:null;
  const estimatedIncome=learning.learned?incomePerCheck*paydays.length:null;
  const savingsTarget=learning.learned?estimatedIncome*clamp(data.savingsRate,0,100)/100:null;
  const room=learning.learned?estimatedIncome-billTotal-savingsTarget:null;
  return {start,end,bills,paydays,billTotal,incomePerCheck,estimatedIncome,savingsTarget,room,learning};
}
function forecastObservation(f){
  const l=f.learning;
  if(!billDefinitions().length&&!l.count)return 'Add recurring bills and confirm real paychecks to start teaching Dexx your cash flow.';
  if(!l.learned){
    const checkWord=l.count===1?'check':'checks';
    const remainingWord=l.remaining===1?'check':'checks';
    const billsText=f.billTotal>0?`${money(f.billTotal)} in bills is scheduled over the next 30 days. `:'';
    return `${billsText}Income forecast is still learning: ${l.count} of ${l.threshold} confirmed ${checkWord} recorded. Confirm ${l.remaining} more real ${remainingWord} before Dexx estimates future paycheck amounts.`;
  }
  const range=l.low&&l.high&&Math.abs(l.high-l.low)>.005?` Recent confirmed checks range from ${money(l.low)} to ${money(l.high)}.`:'';
  if(!billDefinitions().length)return `No recurring bills are saved in the next 30 days. ${l.confidence} income estimate uses ${l.count} confirmed paychecks.${range}`;
  if(f.room<0)return `Your saved bills and savings target are ${money(Math.abs(f.room))} above the learned income estimate over the next 30 days.${range}`;
  return `${money(f.billTotal)} in bills is scheduled over the next 30 days. Dexx is using ${l.count} confirmed paychecks — not a single planned check — to estimate cash flow.${range}`;
}
function moneyDatesBridgeState(c){
  const journey=moneyJourneyState(c);
  const plan=journey.plan;
  const today=dateAtNoon(new Date());
  const payDate=journey.payDate;
  const nextPay=journey.nextPay;
  const horizon=new Date(today.getTime()+60*86400000);
  const nextBill=billOccurrences(today,horizon).filter(b=>!b.paid).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
  const reserveDetails=Array.isArray(plan?.reserveDetails)?plan.reserveDetails.filter(x=>Number(x.currentCheckReserve||0)>0):[];
  const reserveTotal=reserveDetails.reduce((sum,x)=>sum+Number(x.currentCheckReserve||0),0);
  let status='Journey connected',gate='Build payday plan',gateNote='Approve a plan to connect payday dates to the calendar.';
  let impactTitle='Build the next plan';
  let impactText='Once a payday plan is approved, Dexx will show which date is blocking the next step and which future bills are driving protection.';

  if(!journey.readiness.requiredReady){
    status='Setup first';gate='Essential setup';gateNote='Money today plus income/payday must be confirmed first.';
    impactTitle='Calendar intelligence is waiting for setup';
    impactText='Complete the two essential setup steps so Dexx can connect real payday dates to bills and future steps.';
  }else if(plan&&journey.beforePayday){
    status='Current gate';gate=`Paycheck lands ${dateText(payDate,{month:'short',day:'numeric'})}`;gateNote='Planned money stays blocked until this date.';
    impactTitle=`${money(Number(plan.paycheck)||0)} is planned — not available yet`;
    impactText=`When the paycheck lands, enter the actual deposit before ${money(Number(plan.protected)||0)} of planned protection and the ${money(Number(plan.safeToSpend)||0)} runway can activate.`;
  }else if(plan&&journey.paydayReady&&!journey.preview){
    status='Ready now';gate='Enter actual paycheck';gateNote='Payday has arrived. Reconcile the real deposit before funding.';
    impactTitle='The payday gate is open';
    impactText='Enter what actually landed. Dexx will compare it with the planned check and recalculate protection before anything is funded.';
  }else if(plan&&journey.preview){
    status='Review now';gate='Review reconciliation';gateNote='Actual deposit entered. Review the recalculated plan.';
    impactTitle='Actual paycheck is entered';
    impactText='Review the variance, protection, and TRUE Safe-to-Spend before activating the paycheck cycle.';
  }else if(plan&&journey.liveRunway){
    status='Live cycle';gate=`Runway through ${dateText(nextPay,{month:'short',day:'numeric'})}`;gateNote='Protection is funded and the spending runway is active.';
    impactTitle='Your live runway is connected to the calendar';
    impactText=`Dexx is tracking spending against the active cycle through ${dateText(nextPay,{month:'short',day:'numeric'})}.`;
  }else if(plan&&journey.cycleEnded){
    status='Next cycle';gate='Start next paycheck';gateNote='This cycle reached its next-payday boundary.';
    impactTitle='This cycle is ready to roll forward';
    impactText='Review the finished cycle, then start the next paycheck so the calendar and Money Journey can advance together.';
  }

  if(reserveDetails.length){
    const first=reserveDetails[0];
    const extra=reserveDetails.length>1?` plus ${reserveDetails.length-1} other future bill${reserveDetails.length===2?'':'s'}`:'';
    impactText+=` This plan reserves ${money(reserveTotal)} this check toward ${first.name} due ${dateText(first.date,{month:'short',day:'numeric'})}${extra}.`;
  }

  return {journey,status,gate,gateNote,impactTitle,impactText,nextBill,payDate,nextPay};
}
function renderMoneyDatesBridge(c){
  if(!$('moneyDateBridge'))return;
  const b=moneyDatesBridgeState(c);
  const set=(id,value)=>{if($(id))$(id).textContent=value};
  set('moneyDateBridgeStatus',b.status);
  set('moneyDateGate',b.gate);
  set('moneyDateGateNote',b.gateNote);
  if(b.nextBill){
    set('moneyDateNextBill',`${dateText(b.nextBill.date,{month:'short',day:'numeric'})} · ${money(Number(b.nextBill.amount)||0)}`);
    set('moneyDateNextBillNote',`${b.nextBill.name}${b.nextBill.autopay?' · autopay':''}`);
  }else{
    set('moneyDateNextBill','None in 60 days');set('moneyDateNextBillNote','Add recurring bills to connect upcoming obligations.');
  }
  if(b.nextPay){
    set('moneyDateNextPayday',dateText(b.nextPay,{month:'short',day:'numeric'}));
    set('moneyDateNextPaydayNote',b.journey.funded?'Next cycle boundary':'Following payday after this planned check');
  }else if(b.payDate){
    set('moneyDateNextPayday',dateText(b.payDate,{month:'short',day:'numeric'}));set('moneyDateNextPaydayNote','Current planned payday');
  }else{
    set('moneyDateNextPayday','Not set');set('moneyDateNextPaydayNote','Add your pay schedule in setup.');
  }
  set('moneyDateImpactTitle',b.impactTitle);set('moneyDateImpactText',b.impactText);
}

function renderCalendar(c){
  const grid=$('billCalendarGrid');if(!grid)return;
  renderSmartBills(c);
  const today=dateAtNoon(new Date());
  if(!calendarCursor)calendarCursor=new Date(today.getFullYear(),today.getMonth(),1,12);
  const monthStart=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1,12);
  const monthEnd=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,0,12);
  const monthBills=billOccurrences(monthStart,monthEnd);
  const monthPaydays=forecastPaydays(monthStart,monthEnd);
  const bridge=moneyDatesBridgeState(c);
  const gateDate=!bridge.journey.funded&&bridge.payDate?iso(bridge.payDate):bridge.journey.liveRunway&&bridge.nextPay?iso(bridge.nextPay):'';
  const billMap=new Map(),paySet=new Set(monthPaydays);
  monthBills.forEach(b=>{const arr=billMap.get(b.date)||[];arr.push(b);billMap.set(b.date,arr)});
  $('calendarMonthLabel').textContent=monthStart.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  grid.replaceChildren();
  for(let i=0;i<monthStart.getDay();i++){const blank=document.createElement('div');blank.className='calendar-day blank';grid.append(blank)}
  for(let day=1;day<=monthEnd.getDate();day++){
    const d=new Date(monthStart.getFullYear(),monthStart.getMonth(),day,12),key=iso(d),bills=billMap.get(key)||[];
    const cell=document.createElement('article');cell.className='calendar-day';
    if(key===iso(today))cell.classList.add('today');
    if(gateDate&&key===gateDate)cell.classList.add('journey-gate');
    const due=bills.reduce((s,b)=>s+Number(b.amount||0),0),paid=bills.length&&bills.every(b=>b.paid);
    cell.innerHTML=`<div class="calendar-day-top"><strong>${day}</strong>${paySet.has(key)?'<i class="payday-dot" title="Estimated payday"></i>':''}</div>${bills.length?`<span class="calendar-due ${paid?'paid':''}">${paid?'Paid':calendarMoney(due)}</span><small>${bills.length} bill${bills.length===1?'':'s'}</small>`:'<span class="calendar-empty">·</span>'}`;
    grid.append(cell)
  }
  renderMoneyDatesBridge(c);
  const f=forecastWindow(30);
  $('forecastBills30').textContent=money(f.billTotal);$('forecastIncome30').textContent=f.learning.learned?money(f.estimatedIncome):`LEARNING ${f.learning.count}/${f.learning.threshold}`;$('forecastSavings30').textContent=f.learning.learned?money(f.savingsTarget):'WAITING';$('forecastRoom30').textContent=f.learning.learned?money(f.room):'WAITING';$('forecastRoom30').dataset.tone=f.learning.learned&&f.room<0?'watch':f.learning.learned?'good':'learning';$('forecastObservation').textContent=forecastObservation(f);
  if($('reportForecastBills'))$('reportForecastBills').textContent=money(f.billTotal);if($('reportForecastIncome'))$('reportForecastIncome').textContent=f.learning.learned?money(f.estimatedIncome):`LEARNING ${f.learning.count}/${f.learning.threshold}`;
  const upcoming=$('calendarUpcoming');upcoming.replaceChildren();
  const horizon=new Date(today.getTime()+45*86400000),events=[];
  billOccurrences(today,horizon).forEach(b=>{const reserveHit=Array.isArray(data.approvedPlan?.reserveDetails)&&data.approvedPlan.reserveDetails.some(x=>(x.parentId||'')===(b.parentId||b.id)&&x.date===b.date&&Number(x.currentCheckReserve||0)>0);events.push({date:b.date,type:b.paid?'paid':'bill',label:b.name,amount:Number(b.amount)||0,detail:b.paid?'Paid':`${b.priority}${b.autopay?' · autopay':''}${reserveHit?' · protected by current plan':''}`,tag:reserveHit?'PROTECTED':''})});
  forecastPaydays(today,horizon).forEach(date=>{const l=f.learning,isGate=!bridge.journey.funded&&bridge.payDate&&date===iso(bridge.payDate),isNext=bridge.nextPay&&date===iso(bridge.nextPay),amount=l.learned?Number(f.incomePerCheck)||0:0;events.push({date,type:'payday',label:isGate?'Payday check-in · current gate':isNext?'Next payday':'Expected payday',amount,detail:isGate?'Date reached — actual deposit still must be confirmed':l.learned?`${l.confidence} estimate from ${l.count} confirmed checks`:`Payday date only · income learning ${l.count}/${l.threshold}`,tag:isGate?'CURRENT GATE':isNext?'NEXT CYCLE':''})});
  events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='payday'?-1:1));
  $('calendarUpcomingCount').textContent=`${events.length} event${events.length===1?'':'s'}`;
  if(!events.length){upcoming.innerHTML='<div class="empty-copy">Add recurring bills or your pay schedule to build the calendar.</div>';return}
  events.slice(0,18).forEach(e=>{const row=document.createElement('article');row.className=`calendar-event ${e.type}${e.tag==='CURRENT GATE'?' journey-gate-event':''}${e.tag==='PROTECTED'?' protected-event':''}`;row.innerHTML=`<div><strong>${dateText(e.date,{weekday:'short',month:'short',day:'numeric'})}${e.tag?` <em>${e.tag}</em>`:''}</strong><span>${escapeHTML(e.label)}</span><small>${escapeHTML(e.detail)}</small></div><b>${e.type==='payday'?(e.amount?`+${money(e.amount)}`:'Payday'):money(e.amount)}</b>`;upcoming.append(row)})
}

function renderReports(c){
  if(!$('reportPaycheck'))return;

  const expenses=c.currentExpenses||[];
  const protectedTotal=(c.payNow||0)+(c.reserve||0)+(c.savings||0)+(c.debtPayment||0);
  const cycleStart=c.expenseCycleStart||dateAtNoon(data.payDate);
  const cycleEnd=c.expenseCycleEnd||c.nextPay;

  $('reportCycleLabel').textContent=`${dateText(cycleStart,{month:'short',day:'numeric'})} – ${dateText(cycleEnd,{month:'short',day:'numeric'})}`;
  $('reportPaycheck').textContent=money(c.paycheck||0);
  $('reportProtected').textContent=money(protectedTotal);
  $('reportSpent').textContent=money(c.expenseTotal||0);
  $('reportSafe').textContent=money(c.safeToSpend||0);
  $('reportObservation').textContent=reportObservationText(c);

  const allocation=[
    ['Pay now',c.payNow||0,'a-pay'],
    ['Bill reserve',c.reserve||0,'a-reserve'],
    ['Savings',c.savings||0,'a-save'],
    ['Extra debt',c.debtPayment||0,'a-debt'],
    ['Spent',c.expenseTotal||0,'a-spent'],
    ['Safe left',c.safeToSpend||0,'a-safe']
  ];
  const allocationTotal=allocation.reduce((s,x)=>s+x[1],0);
  $('reportAllocationTotal').textContent=money(allocationTotal);
  const chart=$('allocationChart'),legend=$('allocationLegend');
  chart.replaceChildren();legend.replaceChildren();
  allocation.filter(x=>x[1]>0).forEach(([name,value,cls])=>{
    const part=document.createElement('i');
    part.className=cls;
    part.style.width=`${allocationTotal?Math.max(2,value/allocationTotal*100):0}%`;
    chart.append(part);
    const row=document.createElement('div');
    row.innerHTML=`<span class="${cls}"></span><b>${name}</b><strong>${money(value)}</strong>`;
    legend.append(row);
  });
  if(!chart.children.length)chart.innerHTML='<em class="empty-copy">Build a payday plan to see where your check goes.</em>';

  const categories=reportCategoryTotals(expenses);
  $('reportExpenseCount').textContent=`${expenses.length} expense${expenses.length===1?'':'s'}`;
  const bars=$('categoryBars');bars.replaceChildren();
  if(!categories.length){
    bars.innerHTML='<div class="empty-copy">No spending recorded for this paycheck cycle.</div>';
  }else{
    const max=categories[0][1]||1;
    categories.forEach(([key,value])=>{
      const row=document.createElement('div');
      row.className='category-row';
      row.innerHTML=`<div class="category-row-head"><b>${expenseCategoryLabel(key)}</b><strong>${money(value)}</strong></div><div class="category-track"><i style="width:${Math.max(3,value/max*100)}%"></i></div>`;
      bars.append(row);
    });
  }

  $('scoreProtection').textContent=!c.paycheck?'—':(c.shortfall===0?'GOOD':'CHECK');
  $('scoreSavings').textContent=!c.paycheck?'—':(c.savings>0?'GOOD':'CHECK');
  $('scoreDebt').textContent=!debtDefinitions().length?'N/A':(c.debtPayment>0?'GOOD':'WATCH');
  $('scoreSpending').textContent=!c.paycheck?'—':(c.overspent>0?'CHECK':'GOOD');

  const history=[...approvedHistory()].reverse();
  $('reportHistoryCount').textContent=`${history.length} plan${history.length===1?'':'s'}`;
  const historyHost=$('reportHistory');historyHost.replaceChildren();
  if(!history.length){
    historyHost.innerHTML='<div class="empty-copy">Approve payday plans to build your history.</div>';
  }else{
    history.slice(0,12).forEach(h=>{
      const row=document.createElement('article');
      row.className='report-history-row';
      const approvedDate=dateText(historyDisplayDate(h),{month:'short',day:'numeric',year:'numeric'});
      row.innerHTML=`<div><strong>${approvedDate}</strong><span>${money(h.paycheck||0)} paycheck</span></div><div class="history-mini"><span>Spent ${money(h.spent||0)} · Saved ${money(h.savings||0)}</span><span>Protected ${money(h.protected||0)}</span><b>Safe ${money(h.safeToSpend||0)}</b></div>`;
      historyHost.append(row);
    });
  }

  const debts=debtDefinitions(),goals=savingsGoalDefinitions();
  $('reportDebt').textContent=money(debts.reduce((s,x)=>s+Number(x.balance||0),0));
  $('reportSavings').textContent=money(goals.reduce((s,x)=>s+Number(x.saved||0),0));
  $('reportGoalCount').textContent=String(goals.length);
  $('reportDebtCount').textContent=String(debts.length);
  renderTrends(c);
}

function renderExpenseManager(c){
  const host=$('expenseList');if(!host)return;
  const list=c.currentExpenses||currentCycleExpenses(),spent=list.reduce((s,x)=>s+x.amount,0),start=c.safeBeforeExpenses||0,remaining=c.safeToSpend||0;
  if($('expenseCycleLabel'))$('expenseCycleLabel').textContent=`${dateText(c.expenseCycleStart||data.payDate,{month:'short',day:'numeric'})} – ${dateText(c.expenseCycleEnd||c.nextPay,{month:'short',day:'numeric'})}`;
  if($('expenseStarting'))$('expenseStarting').textContent=money(start);
  if($('expenseSpent'))$('expenseSpent').textContent=money(spent);
  if($('expenseRemaining'))$('expenseRemaining').textContent=money(remaining);
  if($('expenseDexxStatus'))$('expenseDexxStatus').textContent=spendingStatus(c);
  const pct=start>0?Math.min(100,Math.round(spent/start*100)):0;
  if($('expenseMeter'))$('expenseMeter').style.width=`${pct}%`;
  if($('expenseMeterText'))$('expenseMeterText').textContent=start?`${pct}% used · ${money(remaining)} remaining`:'Build a payday plan to start tracking';
  host.replaceChildren();
  if(!list.length){host.innerHTML='<div class="empty-copy">No expenses recorded for this paycheck cycle yet.</div>';return}
  list.forEach(x=>{
    const row=document.createElement('article');row.className='expense-row';
    row.innerHTML=`<div class="expense-row-main"><div><strong>${escapeHTML(x.name)}</strong><span>${expenseCategoryLabel(x.category)} · ${dateText(x.date,{month:'short',day:'numeric'})}${x.note?` · ${escapeHTML(x.note)}`:''}</span></div><b>${money(x.amount)}</b></div><div class="expense-row-actions"><button type="button" data-edit-expense="${x.id}">Edit</button><button type="button" class="danger-link" data-delete-expense="${x.id}">Delete</button></div>`;
    host.append(row)
  })
}

function savingsGoalDefinitions(){return (Array.isArray(data.savingsGoals)?data.savingsGoals:[]).filter(g=>g.name||Number(g.target)||Number(g.saved)).map((g,i)=>({id:g.id||`goal-${i}`,name:g.name||'Savings goal',target:Math.max(0,Number(g.target)||0),saved:Math.max(0,Number(g.saved)||0),priority:g.priority||'medium',targetDate:g.targetDate||'',category:g.category||'general'}))}
function totalGoalSavings(){return savingsGoalDefinitions().reduce((s,g)=>s+g.saved,0)}
function goalRemaining(g){return Math.max(0,Number(g.target||0)-Number(g.saved||0))}
function savingsPriorityScore(p){return({high:0,medium:1,low:2})[p]??1}
function orderedSavingsGoals(){
  const active=savingsGoalDefinitions().filter(g=>goalRemaining(g)>0.004);
  const strategy=data.savingsStrategy||'priority';
  if(strategy==='deadline')return [...active].sort((a,b)=>{
    const ad=dateTimeOrInfinity(a.targetDate),bd=dateTimeOrInfinity(b.targetDate);
    return ad-bd||savingsPriorityScore(a.priority)-savingsPriorityScore(b.priority)||goalRemaining(a)-goalRemaining(b)
  });
  if(strategy==='quick-win')return [...active].sort((a,b)=>goalRemaining(a)-goalRemaining(b)||savingsPriorityScore(a.priority)-savingsPriorityScore(b.priority));
  return [...active].sort((a,b)=>savingsPriorityScore(a.priority)-savingsPriorityScore(b.priority)||(dateTimeOrInfinity(a.targetDate)-dateTimeOrInfinity(b.targetDate))||goalRemaining(a)-goalRemaining(b))
}
function savingsTarget(){return orderedSavingsGoals()[0]||null}
function plannedSavingsAllocations(amount){
  let remaining=Math.max(0,Number(amount)||0);const out=[];
  for(const g of orderedSavingsGoals()){
    if(remaining<=0.004)break;
    const contribution=Math.min(goalRemaining(g),remaining);
    if(contribution>0.004){out.push({goalId:g.id,name:g.name,amount:Math.round(contribution*100)/100,before:g.saved,after:Math.round((g.saved+contribution)*100)/100});remaining-=contribution}
  }
  return out
}
function applySavingsContributions(amount){
  const allocations=plannedSavingsAllocations(amount);
  allocations.forEach(a=>{const g=data.savingsGoals.find(x=>x.id===a.goalId);if(g)g.saved=Math.min(Number(g.target)||Infinity,Math.round((Number(g.saved||0)+a.amount)*100)/100)});
  return allocations
}
function rollbackSavingsContributions(snapshot){
  if(!snapshot?.savingsContributions?.length)return;
  snapshot.savingsContributions.forEach(c=>{const g=data.savingsGoals.find(x=>x.id===c.goalId);if(g)g.saved=Math.max(0,Math.round((Number(g.saved||0)-Number(c.amount||0))*100)/100)})
}
function savingsStrategyLabel(){return({priority:'Priority first',deadline:'Nearest deadline first','quick-win':'Quick win · closest goal first'})[data.savingsStrategy||'priority']}

function debtDefinitions(){return (Array.isArray(data.debts)?data.debts:[]).filter(d=>d.name||Number(d.balance)).map((d,i)=>({id:d.id||`debt-${i}`,name:d.name||'Debt',balance:Math.max(0,Number(d.balance)||0),minimumPayment:Math.max(0,Number(d.minimumPayment)||0),dueDate:d.dueDate||'',apr:Math.max(0,Number(d.apr)||0),accountType:d.accountType||'credit-card'}))}
function totalDebtBalance(){const managed=debtDefinitions().reduce((s,d)=>s+d.balance,0);return managed>0?managed:clamp(data.debtAmount,0,1e9)}
function debtTarget(){
  const debts=debtDefinitions().filter(d=>d.balance>0);
  if(!debts.length)return null;
  const strategy=data.debtStrategy||'balanced';
  if(strategy==='snowball')return [...debts].sort((a,b)=>a.balance-b.balance||b.apr-a.apr)[0];
  if(strategy==='avalanche')return [...debts].sort((a,b)=>b.apr-a.apr||a.balance-b.balance)[0];
  // Balanced: attack very high APR first; otherwise take the quick-win smallest balance.
  const high=[...debts].sort((a,b)=>b.apr-a.apr)[0];
  if(high&&high.apr>=20)return high;
  return [...debts].sort((a,b)=>a.balance-b.balance||b.apr-a.apr)[0];
}
function debtStrategyLabel(){return({snowball:'Snowball · smallest balance first',avalanche:'Avalanche · highest APR first',balanced:'Balanced · high APR + quick wins'})[data.debtStrategy||'balanced']}
/* ============ Phase 5 — Debt & Savings Intelligence (v4.1.21.0) ============
   Payoff projections are ESTIMATES from current balances, APRs, and minimums.
   They are not guarantees: APR changes, fees, and new spending alter them. */
function paychecksPerYear(){return data.profile?.payFrequency==='biweekly'?26:data.profile?.payFrequency==='monthly'?12:52}
function debtPayoffSchedule(balance,apr,monthlyPayment){
  balance=Math.max(0,Number(balance)||0);apr=Math.max(0,Number(apr)||0);monthlyPayment=Math.max(0,Number(monthlyPayment)||0);
  if(balance<0.005)return {months:0,interest:0,never:false};
  const r=apr/100/12;
  if(monthlyPayment<0.005||monthlyPayment<=balance*r+1e-9)return {months:Infinity,interest:Infinity,never:true};
  let b=balance,interest=0,months=0;
  while(b>0.005&&months<1200){
    months++;
    const mi=b*r;interest+=mi;b+=mi;
    b-=Math.min(b,monthlyPayment);
  }
  if(b>0.005)return {months:Infinity,interest:Infinity,never:true};
  return {months,interest,never:false};
}
function orderDebtsFor(debts,strategy){
  const list=[...debts];
  if(strategy==='snowball')return list.sort((a,b)=>a.balance-b.balance||b.apr-a.apr);
  return list.sort((a,b)=>b.apr-a.apr||a.balance-b.balance);
}
function simulateDebtPayoff(strategy,extraPerPaycheck){
  const debts=debtDefinitions().filter(d=>d.balance>0.005);
  if(!debts.length)return {months:0,interest:0,never:false,strategy};
  const extraMonthly=Math.max(0,Number(extraPerPaycheck)||0)*paychecksPerYear()/12;
  const ds=orderDebtsFor(debts,strategy).map(d=>({balance:d.balance,apr:d.apr,minimum:Math.max(0,d.minimumPayment),cleared:false}));
  let month=0,totalInterest=0;
  while(month<600){
    if(!ds.some(d=>!d.cleared&&d.balance>0.005))break;
    if(extraMonthly<=0&&ds.every(d=>d.cleared||d.minimum<=0.005))break;
    month++;
    let extra=extraMonthly+ds.filter(d=>d.cleared).reduce((s,d)=>s+d.minimum,0);
    for(const d of ds){
      if(d.cleared||d.balance<=0.005)continue;
      const mi=d.balance*d.apr/100/12;
      totalInterest+=mi;d.balance+=mi;
      const base=Math.min(d.balance,d.minimum);
      const extraUse=Math.min(extra,Math.max(0,d.balance-base));
      d.balance-=(base+extraUse);extra-=extraUse;
      if(d.balance<=0.005){d.balance=0;d.cleared=true}
    }
  }
  const done=!ds.some(d=>!d.cleared&&d.balance>0.005);
  return {months:done?month:Infinity,interest:totalInterest,never:!done,strategy};
}
function savingsOutlook(){
  const goals=savingsGoalDefinitions();
  const perPaycheck=Math.max(0,clamp(data.saveAmount,0,1e9));
  const monthly=perPaycheck*paychecksPerYear()/12;
  const items=goals.map(g=>{
    const remaining=Math.max(0,g.target-g.saved);
    const pct=g.target>0?Math.min(100,Math.round(g.saved/g.target*100)):100;
    const monthsLeft=remaining<0.005?0:(monthly>0?remaining/monthly:Infinity);
    return {...g,remaining,pct,monthsLeft};
  });
  const monthlyEssential=billDefinitions()
    .filter(b=>b.priority==='essential'&&b.frequency!=='once')
    .reduce((s,b)=>s+Number(b.amount||0)*(b.frequency==='weekly'?52/12:b.frequency==='biweekly'?26/12:1),0);
  const totalSaved=goals.reduce((s,g)=>s+Number(g.saved||0),0);
  return {items,monthly,emergencyBenchmark:monthlyEssential,emergencySaved:totalSaved,
    emergencyPct:monthlyEssential>0?Math.min(100,Math.round(totalSaved/monthlyEssential*100)):100};
}
function renderDebtOutlook(){
  const card=$('debtOutlookCard');if(!card)return;
  const host=$('debtOutlookBody');if(!host)return;
  host.replaceChildren();
  const debts=debtDefinitions().filter(d=>d.balance>0.005);
  if(!debts.length){host.innerHTML='<div class="empty-copy">Add a debt account to see payoff projections.</div>';return}
  const extra=Math.max(0,clamp(data.debtGoal,0,1e9));
  const snow=simulateDebtPayoff('snowball',extra),ava=simulateDebtPayoff('avalanche',extra);
  const fmt=r=>r.never?'Never at current payments':`${r.months} mo · ${money(r.interest)} interest`;
  const cmp=document.createElement('div');cmp.className='outlook-compare';
  cmp.innerHTML=`<div><span>SNOWBALL · smallest first</span><strong>${escapeHTML(fmt(snow))}</strong></div><div><span>AVALANCHE · highest APR first</span><strong>${escapeHTML(fmt(ava))}</strong></div>`;
  host.append(cmp);
  if(!snow.never&&!ava.never&&snow.interest!==ava.interest){
    const note=document.createElement('p');note.className='outlook-note';
    const winner=ava.interest<snow.interest?'Avalanche':'Snowball';
    note.textContent=`${winner} wins here by ${money(Math.abs(snow.interest-ava.interest))} in interest. Estimates, not guarantees.`;
    host.append(note);
  }
  const list=document.createElement('div');list.className='outlook-list';
  debts.forEach(d=>{
    const row=document.createElement('div');row.className='outlook-row';
    const proj=d.minimumPayment>0.005?debtPayoffSchedule(d.balance,d.apr,d.minimumPayment):null;
    const eta=!proj?'Set a minimum payment':proj.never?'Never at minimum — raise the payment':`~${proj.months} mo at minimum`;
    row.innerHTML=`<div><strong>${escapeHTML(d.name)}</strong><span>${money(d.balance)} · ${Number(d.apr).toFixed(2)}% APR · min ${money(d.minimumPayment)}</span></div><b>${escapeHTML(eta)}</b>`;
    list.append(row);
  });
  host.append(list);
  const st=$('debtOutlookStatus');if(st)st.textContent=`${debts.length} account${debts.length===1?'':'s'} projected`;
}
function renderSavingsOutlook(){
  const card=$('savingsOutlookCard');if(!card)return;
  const host=$('savingsOutlookBody');if(!host)return;
  host.replaceChildren();
  const o=savingsOutlook();
  if(!o.items.length){host.innerHTML='<div class="empty-copy">Add a savings goal to see milestones.</div>';return}
  o.items.forEach(g=>{
    const row=document.createElement('div');row.className='outlook-row';
    const eta=g.remaining<0.005?'Complete':(g.monthsLeft===Infinity?'Set a per-check savings amount':`~${Math.ceil(g.monthsLeft)} mo at ${money(o.monthly)}/mo`);
    row.innerHTML=`<div><strong>${escapeHTML(g.name)}</strong><span>${g.pct}% · ${money(g.remaining)} to go</span><div class="progress"><i style="width:${g.pct}%"></i></div></div><b>${escapeHTML(eta)}</b>`;
    host.append(row);
  });
  const em=document.createElement('p');em.className='outlook-note';
  em.textContent=`Emergency readiness: ${money(o.emergencySaved)} saved vs ${money(o.emergencyBenchmark)} one-month essential-bill benchmark (${o.emergencyPct}%).`;
  host.append(em);
  const st=$('savingsOutlookStatus');if(st)st.textContent=`${o.items.length} goal${o.items.length===1?'':'s'} tracked`;
}

function monthDate(year,month,day){const last=new Date(year,month+1,0,12).getDate();return new Date(year,month,Math.min(day,last),12)}
function billOccurrences(startDate,endDate){
  const start=dateAtNoon(startDate),end=dateAtNoon(endDate);
  if(!start||!end)return [];
  const out=[];
  for(const b of billDefinitions()){
    const base=dateAtNoon(b.dueDate);
    if(!base)continue;
    const paid=new Set((b.paidOccurrences||[]).filter(x=>dateAtNoon(x)));
    const add=d=>{
      const safe=dateAtNoon(d);
      if(!safe||safe>end)return;
      const key=iso(safe);
      if(!key)return;
      out.push({...b,parentId:b.id,occurrenceDate:key,date:key,paid:paid.has(key)});
    };
    if(b.frequency==='once'){
      if(base<=end)add(base);
      continue;
    }
    if(b.frequency==='monthly'){
      const scanStart=new Date(start.getFullYear(),start.getMonth(),1,12);
      for(let cursor=new Date(scanStart);cursor<=end;cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12)){
        const d=monthDate(cursor.getFullYear(),cursor.getMonth(),base.getDate());
        if(d&&d>=base&&d<=end)add(d);
      }
      continue;
    }
    const step=b.frequency==='biweekly'?14:7;
    let d=new Date(base);
    while(d<start)d=new Date(d.getTime()+step*86400000);
    const prior=new Date(d.getTime()-step*86400000);
    if(prior>=base&&prior<start&&prior>=new Date(start.getTime()-step*86400000))add(prior);
    for(;d<=end;d=new Date(d.getTime()+step*86400000))add(new Date(d));
  }
  return out.sort((a,b)=>(priorityRank[a.priority]-priorityRank[b.priority])||String(a.date||'').localeCompare(String(b.date||'')));
}
function normalizedBills(){const today=dateAtNoon(data.payDate)||new Date();today.setHours(12,0,0,0);const horizon=new Date(today.getTime()+45*86400000);return billOccurrences(today,horizon)}

function reserveKey(b){return `${b.parentId||b.id}|${b.occurrenceDate||b.date}`}
function protectedFor(b){const key=reserveKey(b);return Math.min(Number(b.amount||0),Math.max(0,Number(data.reserveMemory?.[key]||0)))}
function clearReserveForBill(billId){if(!data.reserveMemory||!billId)return;Object.keys(data.reserveMemory).forEach(k=>{if(k.startsWith(`${billId}|`))delete data.reserveMemory[k]})}
function rollbackReserveContributions(snapshot){
  // 4.1.16: a planned future paycheck has not funded anything yet, so there
  // is nothing to roll back when that planned check is deleted.
  if(snapshot?.fundingStatus==='planned')return;
  if(snapshot?.reserveContributions?.length){
    data.reserveMemory=data.reserveMemory&&typeof data.reserveMemory==='object'?data.reserveMemory:{};
    snapshot.reserveContributions.forEach(c=>{
      const next=Math.max(0,Number(data.reserveMemory[c.key]||0)-Number(c.amount||0));
      if(next>0.004)data.reserveMemory[c.key]=Math.round(next*100)/100;else delete data.reserveMemory[c.key];
    });
  }
  rollbackSavingsContributions(snapshot);
}
function applyReserveContributions(plan){
  data.reserveMemory=data.reserveMemory&&typeof data.reserveMemory==='object'?data.reserveMemory:{};
  let remaining=Number(plan.reserve||0);
  const out=[];
  for(const b of plan.upcomingBills){
    if(remaining<=0.004)break;
    const amount=Math.min(Number(b.currentCheckReserve||0),remaining,Math.max(0,Number(b.amount||0)-protectedFor(b)));
    if(amount<=0.004)continue;
    const key=reserveKey(b),before=protectedFor(b),after=Math.min(Number(b.amount||0),before+amount);
    data.reserveMemory[key]=Math.round(after*100)/100;
    out.push({key,parentId:b.parentId||b.id,name:b.name,date:b.date,amount:Math.round(amount*100)/100,protectedBefore:before,protectedAfter:after});
    remaining-=amount;
  }
  return out;
}

function paydaysThrough(dueDate,today,nextPay,freqDays,includeCurrentCheck=true){
  const due=dateAtNoon(dueDate);if(!due||due<=today)return 1;
  // 4.1.9.3: only count a separate "current paycheck" when an active
  // paycheck cycle actually exists. After an approved check is deleted,
  // nextPay is already the first real remaining paycheck; counting both a
  // phantom current check and nextPay made reserves too small (4 x $75
  // instead of 3 x $100 for a $300 Oct 16 bill after deleting Oct 2).
  let count=includeCurrentCheck?1:0;
  let cursor=dateAtNoon(nextPay);
  let guard=0;
  while(cursor&&cursor<=due&&guard<60){count+=1;cursor=new Date(cursor.getTime()+freqDays*86400000);guard+=1}
  return Math.max(1,count)
}
function reserveTargets(upcomingBills,today,nextPay,freqDays){
  const includeCurrentCheck=Boolean(dateAtNoon(data.payDate));
  return upcomingBills.map(b=>{
    const checks=paydaysThrough(b.date,today,nextPay,freqDays,includeCurrentCheck);
    const alreadyProtected=protectedFor(b);
    const remainingToFund=Math.max(0,Number(b.amount||0)-alreadyProtected);
    const target=Math.round((remainingToFund/checks)*100)/100;
    return {...b,paychecksRemaining:checks,alreadyProtected,remainingToFund,currentCheckReserve:target,reserveKey:reserveKey(b)};
  }).filter(b=>b.remainingToFund>0.004)
}
function paycheckPlan(){
  const paycheck=clamp(data.paycheck,0,1e9), balance=clamp(data.currentBalance,0,1e9), available=paycheck+balance;
  const today=dateAtNoon(data.payDate)||new Date();today.setHours(12,0,0,0);
  const freqDays=data.profile?.payFrequency==='biweekly'?14:data.profile?.payFrequency==='monthly'?30:7;
  // 4.1.9.2: when no active check/next-payday fields exist, anchor the
  // waiting state to the saved payday schedule instead of simply using today + cadence.
  // This keeps a Sunday app-open from inventing a Sunday payday for Friday-paid users.
  let nextPay=dateAtNoon(data.nextPayday);
  if(!nextPay){
    if(dateAtNoon(data.payDate)) nextPay=shiftPayday(today,1);
    else nextPay=dateAtNoon(suggestedNextPayCycle().payDate)||shiftPayday(today,1);
  }
  // 4.2.0.0 Multiple incomes: received secondary income pools into this journey.
  const pooledIncome=(typeof pooledIncomeForCycle==='function')?pooledIncomeForCycle(today,nextPay):0;
  const reserveDays=clamp(data.profile?.reserveDays||14,7,31);
  const reserveEnd=new Date(nextPay.getTime()+reserveDays*86400000);
  // 4.0.6: Dexx plans across several future paychecks, not only the short reserve window.
  // Weekly users see at least four paychecks ahead; biweekly/monthly horizons scale with cadence.
  const intelligenceDays=Math.min(90,Math.max(reserveDays,freqDays*4));
  const planningEnd=new Date(nextPay.getTime()+intelligenceDays*86400000);
  const windowStart=new Date(today);windowStart.setDate(windowStart.getDate()-14);
  const unpaid=billOccurrences(windowStart,planningEnd).filter(b=>!b.paid).sort((a,b)=>(priorityRank[a.priority]-priorityRank[b.priority])||a.date.localeCompare(b.date));
  const dueNowBills=unpaid.filter(b=>dateAtNoon(b.date)<=nextPay).map(b=>({...b,alreadyProtected:protectedFor(b),currentCheckDue:Math.max(0,Number(b.amount||0)-protectedFor(b))}));
  const upcomingRaw=unpaid.filter(b=>dateAtNoon(b.date)>nextPay&&dateAtNoon(b.date)<=planningEnd);
  const upcomingBills=reserveTargets(upcomingRaw,today,nextPay,freqDays);
  const laterBills=upcomingBills.filter(b=>dateAtNoon(b.date)>reserveEnd);

  const dueNow=dueNowBills.reduce((s,b)=>s+Number((b.currentCheckDue ?? b.amount) || 0),0);
  const upcomingTotal=upcomingBills.reduce((s,b)=>s+Number(b.amount||0),0);
  const reserveTarget=upcomingBills.reduce((s,b)=>s+Number(b.currentCheckReserve||0),0);
  const desiredSavings=Math.max(clamp(data.saveAmount,0,1e9),paycheck*clamp(data.savingsRate,0,100)/100);
  const savingsGoalTarget=savingsTarget(),managedDebtTotal=totalDebtBalance(),targetDebt=debtTarget();const desiredDebt=Math.min(clamp(data.debtGoal,0,1e9),managedDebtTotal);

  // Priority order: immediate bills -> future-bill reserve -> savings -> extra debt -> safe spending.
  let remaining=available+pooledIncome;
  const payNow=Math.min(remaining,dueNow);remaining-=payNow;
  const reserve=Math.min(remaining,reserveTarget);remaining-=reserve;
  const recommendedSavings=Math.min(remaining,desiredSavings);
  const chosenSavings=data.customSavings===null?recommendedSavings:Math.min(clamp(data.customSavings,0,1e9),remaining);
  remaining-=chosenSavings;
  const recommendedDebt=Math.min(remaining,desiredDebt);
  const chosenDebt=data.customDebt===null?recommendedDebt:Math.min(clamp(data.customDebt,0,1e9),remaining);
  remaining-=chosenDebt;
  const expenseCycleStart=dateAtNoon(data.payDate)||today,expenseCycleEnd=dateAtNoon(data.nextPayday)||nextPay;
  const safeBeforeExpenses=Math.max(0,remaining),currentExpenses=expensesForCycle(expenseCycleStart,expenseCycleEnd),expenseTotal=currentExpenses.reduce((s,x)=>s+Number(x.amount||0),0),safeToSpend=Math.max(0,safeBeforeExpenses-expenseTotal),overspent=Math.max(0,expenseTotal-safeBeforeExpenses);
  const rememberedReserve=[...dueNowBills,...upcomingBills].reduce((s,b)=>s+Number(b.alreadyProtected||0),0);return {paycheck,balance,available:available+pooledIncome,pooledIncome,today,nextPay,reserveEnd,planningEnd,dueNowBills,upcomingBills,laterBills,dueNow,upcomingTotal,reserveTarget,rememberedReserve,desiredSavings,savingsGoalTarget,desiredDebt,targetDebt,managedDebtTotal,payNow,reserve,savings:chosenSavings,debtPayment:chosenDebt,expenseCycleStart,expenseCycleEnd,safeBeforeExpenses,currentExpenses,expenseTotal,overspent,safeToSpend,shortfall:Math.max(0,dueNow-payNow),reserveShortfall:Math.max(0,reserveTarget-reserve)};
}
function calc(){const p=paycheckPlan(),bills=[...p.dueNowBills,...p.upcomingBills],billTotal=bills.filter(b=>!b.paid).reduce((s,b)=>s+Number(b.amount||0),0);let score=35;if(p.paycheck>0)score+=15;if(bills.length)score+=10;if(p.savings>0)score+=15;if(p.shortfall===0&&p.paycheck>0)score+=15;if(p.reserveShortfall===0&&p.upcomingBills.length)score+=5;if(data.approvedPlan)score+=5;const missionDone=Object.values(data.missions).filter(Boolean).length;return {...p,bills,billTotal,cash:p.safeToSpend,score:Math.min(score,100),progress:Math.round(missionDone/4*100),missionDone}}
// Save-hardening (beta fix): a throwing device-storage write (private
// browsing, quota exceeded) must never fail silently — the user sees an
// error instead of a tap that looks ignored. The IndexedDB mirror is still
// attempted (separate storage layer) and the screen still re-renders.
let storageErrorTimer=null;
function showStorageError(message){
  try{
    let bar=document.getElementById('financialLabStorageError');
    if(!bar){
      bar=document.createElement('div');
      bar.id='financialLabStorageError';
      bar.setAttribute('role','alert');
      bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;padding:14px 16px;background:#7f1d1d;color:#fff;font-size:14px;line-height:1.4;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35)';
      document.body.prepend(bar);
    }
    bar.textContent=message;
    bar.hidden=false;
    clearTimeout(storageErrorTimer);
    storageErrorTimer=setTimeout(()=>{bar.hidden=true},15000);
  }catch(_){/* an error path must never throw */}
}
function save(options={}){
  const context=pendingRecoveryContext||{label:'Financial Lab update',detail:'A saved Financial Lab value changed.',type:'change'};
  try{
    if(!options.skipRecovery){pushRecoveryPoint(lastSavedSnapshot,context.label,context.detail,context.type)}
    data.lastUpdated=new Date().toISOString();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    lastSavedSnapshot=cloneFinancialData(data);
    pendingRecoveryContext=null;
    if(!options.skipActivity)logRecoveryActivity(context.label,context.detail,context.type);
  }catch(err){
    console.error('Financial Lab could not write to device storage.',err);
    showStorageError('Heads up — Financial Lab could not save to this device\u2019s storage (private browsing or storage full). What you see on screen is not saved yet.');
  }
  writeMemoryMirror(data);
  render();
}
function billRows(host,bills){if(!host)return;host.replaceChildren();if(!bills.length){host.innerHTML='<div class="empty-copy">No bills in this payday window. Manage recurring bills in Financial Profile.</div>';return}bills.forEach(b=>{const row=document.createElement('div');row.className=`bill-row${b.paid?' paid':''}`;const btn=document.createElement('button');btn.className='check';btn.textContent=b.paid?'✓':'';btn.setAttribute('aria-label',b.paid?'Mark unpaid':'Mark paid');btn.onclick=()=>toggleBillPaidOccurrence(b);const name=document.createElement('span');const held=Number(b.alreadyProtected||protectedFor(b));name.innerHTML=`${b.name||'Bill'} <em class="priority ${b.priority}">${b.priority}</em>${b.autopay?' <em class="autopay">auto</em>':''}${held>0?` <em class="reserve-held">${money(held)} reserved</em>`:''}`;const amt=document.createElement('strong');amt.textContent=money(b.amount);const date=document.createElement('small');date.textContent=b.paid?'Paid':b.date?dateText(b.date,{month:'short',day:'numeric'}):'TBD';row.append(btn,name,amt,date);host.append(row)})}
function prepareRows(host,bills){
  if(!host)return;host.replaceChildren();
  if(!bills.length){host.innerHTML='<div class="empty-copy">No farther-out bills need a reserve yet.</div>';return}
  bills.forEach(b=>{
    const row=document.createElement('div');row.className='prepare-row';
    const due=dateAtNoon(b.date),held=Number(b.alreadyProtected||0),left=Math.max(0,Number(b.amount||0)-held);
    row.innerHTML=`<div><strong>${escapeHTML(b.name)}</strong><small>${money(b.amount)} due ${due?due.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'soon'} · ${money(held)} already protected · ${money(left)} left · ${b.paychecksRemaining} paycheck${b.paychecksRemaining===1?'':'s'} including this one</small></div><div class="prepare-amount"><span>Protect this check</span><b>${money(b.currentCheckReserve)}</b></div>`;
    host.append(row);
  });
}
function commandCenterPlan(c){
  const a=data.approvedPlan;
  if(!a)return c;
  const currentSpent=Number(c.expenseTotal||0),approvedSpent=Number(a.spent||0);
  const addedSpending=Math.max(0,currentSpent-approvedSpent);
  return {...c,
    paycheck:Number(a.paycheck)||0,
    payNow:Number(a.payNow)||0,
    reserve:Number(a.reserve)||0,
    savings:Number(a.savings)||0,
    debtPayment:Number(a.debtPayment)||0,
    expenseTotal:currentSpent,
    safeToSpend:Math.max(0,Number(a.safeToSpend||0)-addedSpending),
    nextPay:dateAtNoon(a.nextPayday)||c.nextPay,
    shortfall:Number(a.shortfall)||0,
    reserveShortfall:0,
    desiredSavings:Number(a.savings)||0,
    desiredDebt:Number(a.debtPayment)||0,
    dueNowBills:Array.isArray(a.bills)?a.bills:c.dueNowBills,
    upcomingBills:Array.isArray(a.reserveDetails)?a.reserveDetails:c.upcomingBills
  };
}
function planFundingStatus(plan){
  if(!plan)return 'none';
  if(plan.fundingStatus==='planned'||plan.fundingStatus==='funded')return plan.fundingStatus;
  const payDate=dateAtNoon(plan.payDate||data.payDate),today=dateAtNoon(new Date());
  return payDate&&today&&payDate>today?'planned':'funded';
}
function syncApprovedPlanHistory(plan){
  if(!plan?.id||!Array.isArray(data.paycheckHistory))return;
  const idx=data.paycheckHistory.findIndex(h=>h.id===plan.id);
  if(idx>=0)data.paycheckHistory[idx]={...data.paycheckHistory[idx],...plan};
}
function normalizeApprovedPlanFunding(){
  const plan=data.approvedPlan;if(!plan||plan.fundingStatus)return false;
  const hasFundingEvidence=Boolean(plan.reconciledAt&&Number(plan.actualPaycheck)>0)||Boolean(plan.fundedAt)||Boolean((plan.reserveContributions||[]).length)||Boolean((plan.savingsContributions||[]).length);
  if(hasFundingEvidence){
    plan.fundingStatus='funded';
    plan.fundedAt=plan.fundedAt||plan.reconciledAt||plan.approvedAt||new Date().toISOString();
  }else{
    plan.fundingStatus='planned';plan.reserveContributions=[];plan.savingsContributions=[];plan.fundedAt='';
  }
  syncApprovedPlanHistory(plan);localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true;
}
function fundApprovedPlan(){
  const plan=data.approvedPlan;if(!plan||planFundingStatus(plan)!=='planned')return false;
  const payDate=dateAtNoon(plan.payDate||data.payDate),today=dateAtNoon(new Date());
  if(payDate&&today&&today<payDate)return false;
  const reserveContributions=applyReserveContributions({reserve:Number(plan.reserve)||0,upcomingBills:Array.isArray(plan.reserveDetails)?plan.reserveDetails:[]});
  const savingsContributions=applySavingsContributions(Number(plan.savings)||0);
  plan.reserveContributions=reserveContributions;
  plan.savingsContributions=savingsContributions;
  plan.fundingStatus='funded';
  plan.fundedAt=new Date().toISOString();
  syncApprovedPlanHistory(plan);
  setRecoveryContext('Confirm paycheck landed',`${money(plan.paycheck||0)} paycheck activated. ${money(reserveContributions.reduce((sum,x)=>sum+Number(x.amount||0),0))} funded in bill reserves and ${money(savingsContributions.reduce((sum,x)=>sum+Number(x.amount||0),0))} recorded to savings.`,'approval');
  save();
  return true;
}
let paydayReconciliationPreview=null;
function actualPaycheckPreview(actual){
  const prior=data.paycheck;
  data.paycheck=Math.max(0,Number(actual)||0);
  const preview=paycheckPlan();
  data.paycheck=prior;
  return preview;
}
function updatePlannedSnapshotFromActual(actual,preview){
  const plan=data.approvedPlan;if(!plan||planFundingStatus(plan)!=='planned')return false;
  const plannedAmount=Number(plan.plannedPaycheck??plan.paycheck)||0;
  data.paycheck=Math.max(0,Number(actual)||0);
  Object.assign(plan,{
    plannedPaycheck:plannedAmount,
    actualPaycheck:data.paycheck,
    paycheck:data.paycheck,
    paycheckVariance:Math.round((data.paycheck-plannedAmount)*100)/100,
    reconciledAt:new Date().toISOString(),
    healthScore:calculateHealthScore(preview).total,
    payNow:Number(preview.payNow)||0,
    reserve:Number(preview.reserve)||0,
    reserveTarget:Number(preview.reserveTarget)||0,
    reserveContributions:[],
    savingsContributions:[],
    reserveDetails:preview.upcomingBills.map(b=>({parentId:b.parentId||b.id,name:b.name,amount:b.amount,date:b.date,alreadyProtected:b.alreadyProtected,currentCheckReserve:b.currentCheckReserve,paychecksRemaining:b.paychecksRemaining})),
    savings:Number(preview.savings)||0,
    debtPayment:Number(preview.debtPayment)||0,
    debtTarget:preview.targetDebt?{id:preview.targetDebt.id,name:preview.targetDebt.name}:null,
    spent:Number(preview.expenseTotal)||0,
    protected:(Number(preview.payNow)||0)+(Number(preview.reserve)||0)+(Number(preview.savings)||0)+(Number(preview.debtPayment)||0),
    expenses:(preview.currentExpenses||[]).map(x=>({name:x.name||'Expense',category:historyExpenseCategory(x),amount:Number(x.amount)||0,date:x.date||''})),
    safeToSpend:Number(preview.safeToSpend)||0,
    shortfall:Number(preview.shortfall)||0,
    bills:preview.dueNowBills.map(b=>({parentId:b.parentId||b.id,occurrenceDate:b.occurrenceDate||b.date,name:b.name,amount:b.amount,date:b.date,priority:b.priority,alreadyProtected:b.alreadyProtected,currentCheckDue:b.currentCheckDue}))
  });
  syncApprovedPlanHistory(plan);
  return true;
}
function sendReconciledPlanBackForReview(actual){
  const plan=data.approvedPlan;if(!plan)return false;
  const id=plan.id;
  data.paycheck=Math.max(0,Number(actual)||0);
  data.paycheckHistory=(data.paycheckHistory||[]).filter(h=>h.id!==id);
  data.approvedPlan=null;
  clearExecutionState();
  paydayReconciliationPreview=null;
  setRecoveryContext('Reconcile paycheck amount',`${money(data.paycheck)} actually landed. Dexx paused funding because the updated plan needs review.`,'payday');
  save();
  if($('approvalStatus'))$('approvalStatus').textContent=`Actual paycheck recorded as ${money(data.paycheck)}. Review the recalculated plan before approving — nothing has been funded yet.`;
  setTimeout(()=>document.querySelector('.paycheck-planner')?.scrollIntoView({behavior:'smooth',block:'start'}),100);
  return true;
}
function activateReconciledPayday(actual,preview){
  if(!updatePlannedSnapshotFromActual(actual,preview))return false;
  const plan=data.approvedPlan;
  const planned=Number(plan.plannedPaycheck)||0,variance=Number(plan.paycheckVariance)||0;
  if(!fundApprovedPlan())return false;
  setRecoveryContext('Reconcile + activate paycheck',`${money(plan.actualPaycheck)} landed vs ${money(planned)} planned (${variance>=0?'+':''}${money(variance)} difference). Dexx recalculated before funding the payday plan.`,'approval');
  save();
  paydayReconciliationPreview=null;
  return true;
}

function executionTasks(plan,c){
  if(!plan)return [];
  const tasks=[];
  (plan.bills||[]).forEach((b,i)=>tasks.push({id:`bill-${i}`,kind:'bill',title:`Pay ${b.name||'bill'}`,amount:Number(b.currentCheckDue??b.amount)||0,note:`Due ${dateText(b.date,{month:'short',day:'numeric'})}`,auto:false,action:'CONFIRM PAID'}));
  if(Number(plan.reserve)>0)tasks.push({id:'reserve',kind:'reserve',title:'Protect future bills',amount:Number(plan.reserve),note:'Reserve Memory locked this in when the plan was approved.',auto:true});
  if(Number(plan.savings)>0)tasks.push({id:'savings',kind:'savings',title:'Move money to savings',amount:Number(plan.savings),note:plan.savingsContributions?.[0]?.name?`Recorded toward ${plan.savingsContributions[0].name} when approved.`:'Recorded to savings when approved.',auto:true});
  if(Number(plan.debtPayment)>0)tasks.push({id:'debt',kind:'debt',title:`Send extra debt payment${plan.debtTarget?.name?` · ${plan.debtTarget.name}`:''}`,amount:Number(plan.debtPayment),note:'Confirm after you send the payment.',auto:false,action:'CONFIRM SENT'});
  tasks.push({id:'spending-guard',kind:'spending',title:`Stay within ${money(c.safeToSpend)} TRUE Safe-to-Spend`,amount:null,note:`Track expenses through ${dateText(plan.nextPayday,{month:'short',day:'numeric'})}. This limit updates as new spending is recorded.`,auto:true,active:true});
  return tasks;
}
function renderPaydayExecution(c){
  const panel=$('paydayExecutionMode'),host=$('executionTasks'),status=$('executionStatus'),progress=$('executionProgress'),landing=$('confirmPaycheckLanded'),reconcile=$('paycheckReconcile');
  if(!panel||!host)return;
  const plan=data.approvedPlan;
  panel.hidden=!plan;
  if(!plan){host.replaceChildren();if(landing)landing.hidden=true;if(reconcile)reconcile.hidden=true;return}
  const funding=planFundingStatus(plan),planned=funding==='planned';
  const payDate=dateAtNoon(plan.payDate||data.payDate),today=dateAtNoon(new Date()),beforePayday=Boolean(payDate&&today&&today<payDate);
  if(landing){
    landing.hidden=!planned||!beforePayday;
    landing.disabled=true;
    landing.textContent=beforePayday?`PAYCHECK LANDS ${dateText(payDate,{month:'short',day:'numeric'}).toUpperCase()}`:'PAYCHECK READY';
  }
  if(reconcile){
    reconcile.hidden=!planned||beforePayday;
    if(!reconcile.hidden){
      if($('reconcilePlanned'))$('reconcilePlanned').textContent=money(plan.plannedPaycheck??plan.paycheck??0);
      const actualInput=$('actualPaycheckAmount');if(actualInput){if(actualInput.dataset.planId!==plan.id){actualInput.value='';actualInput.dataset.planId=plan.id;paydayReconciliationPreview=null}actualInput.placeholder='0.00';}
    }
  }
  const state=executionForPlan(plan),tasks=executionTasks(plan,c);
  host.replaceChildren();
  let done=0,counted=0;
  tasks.forEach(task=>{
    const scheduled=planned;
    const isDone=scheduled?false:(task.auto&&!task.active?true:!!state.done[task.id]);
    if(!task.active){counted++;if(isDone)done++}
    const row=document.createElement('article');row.className=`execution-task${isDone?' done':''}${task.active&&!scheduled?' active':''}${scheduled?' scheduled':''}`;
    const badge=scheduled?'SCHEDULED':task.active?'ACTIVE':isDone?'DONE':'TO DO';
    const icon=scheduled?'◷':task.active?'→':isDone?'✓':'○';
    const actionButton=!scheduled&&!task.auto&&task.action?`<button type="button" data-execution-task="${task.id}">${isDone?'UNDO':task.action}</button>`:'';
    row.innerHTML=`<div class="execution-check" aria-hidden="true">${icon}</div><div class="execution-copy"><span>${task.kind.toUpperCase()}</span><strong>${escapeHTML(task.title)}</strong><small>${scheduled?'Waiting for the paycheck to land. No money is recorded as funded yet.':task.note}</small></div>${task.amount===null?'':`<b>${money(task.amount)}</b>`}${actionButton}<em>${badge}</em>`;
    host.append(row);
  });
  if(planned){
    if(progress)progress.textContent='0 moves funded';
    if(status)status.textContent=beforePayday?`Plan ready for ${dateText(payDate,{month:'short',day:'numeric'})}. The ${money(plan.paycheck||0)} check, ${money(plan.reserve||0)} reserve, and ${money(plan.savings||0)} savings are still planned — not money available or funded today.`:'Payday has arrived. Confirm the paycheck landed before Dexx records reserve and savings funding.';
    return;
  }
  if(progress)progress.textContent=counted?`${done} of ${counted} moves done`:'Execution ready';
  if(status)status.textContent=counted&&done===counted?`Payday moves complete. Keep tracking spending — ${money(c.safeToSpend)} is currently safe through ${dateText(plan.nextPayday,{month:'short',day:'numeric'})}.`:`${counted-done} payday move${counted-done===1?'':'s'} still need confirmation. Protected money stays separated from TRUE Safe-to-Spend.`;
}
function weeklyRunwayState(c,now=new Date()){
  const plan=data.approvedPlan;
  if(!plan)return null;
  const payDate=dateAtNoon(plan.payDate||data.payDate),nextPay=dateAtNoon(plan.nextPayday||data.nextPayday);
  if(!payDate||!nextPay)return null;
  const today=dateAtNoon(now),dayMs=86400000,cycleMs=Math.max(dayMs,nextPay-payDate);
  const cycleDays=Math.max(1,Math.round(cycleMs/dayMs));
  const beforeCycle=today<payDate,afterCycle=today>=nextPay;
  const effectiveDay=beforeCycle?payDate:(afterCycle?nextPay:today);
  const daysLeft=afterCycle?0:Math.max(1,Math.ceil((nextPay-effectiveDay)/dayMs));
  const startingSafe=Math.max(0,Number(plan.safeToSpend||0)+Number(plan.spent||0));
  const spent=Math.max(0,Number(c.expenseTotal||0));
  const safe=Math.max(0,Number(c.safeToSpend||0));
  const daily=daysLeft>0?safe/daysLeft:0;
  const usedRatio=startingSafe>0?spent/startingSafe:0;

  // 4.1.12 Pace Coach uses whole paycheck days and adds a live action guide.
  // On payday, day 1 of a 7-day cycle means roughly 1/7 of flexible money
  // can be used without being labeled "too fast." The next payday remains
  // exclusive and belongs to the next paycheck cycle.
  const elapsedDays=beforeCycle?0:afterCycle?cycleDays:Math.max(1,Math.min(cycleDays,Math.floor((today-payDate)/dayMs)+1));
  const expectedUsedRatio=cycleDays>0?elapsedDays/cycleDays:0;
  const expectedSpent=startingSafe*expectedUsedRatio;
  const paceGap=expectedSpent-spent;
  const paceDelta=usedRatio-expectedUsedRatio;

  let status='On pace',tone='good';
  if(beforeCycle){status='Ready';tone='good'}
  else if(afterCycle){status='Cycle complete';tone='good'}
  else if(safe<=0&&startingSafe>0){status='Limit reached';tone='danger'}
  else if(paceDelta>.20){status='Spending too fast';tone='danger'}
  else if(paceDelta>.10){status='Watch spending';tone='watch'}
  else if(paceDelta<-.10){status='Ahead of pace';tone='good'}

  let coachMessage='Your pace coach is ready.';
  if(beforeCycle){
    coachMessage=`Your cycle starts ${dateText(payDate,{month:'short',day:'numeric'})}. Spending before that date will not affect this runway.`;
  }else if(afterCycle){
    coachMessage=`This runway ended ${dateText(nextPay,{month:'short',day:'numeric'})}. Start the next paycheck cycle to reset the pace coach.`;
  }else if(startingSafe<=0){
    coachMessage='Build flexible Safe-to-Spend into the plan to activate pace coaching.';
  }else if(status==='Limit reached'){
    coachMessage=`You have used the full ${money(startingSafe)} flexible budget for this cycle. Keep new flexible spending at $0 until the next payday.`;
  }else if(status==='Spending too fast'){
    coachMessage=`You are ${money(Math.abs(paceGap))} over the calendar pace. Slow flexible spending so the remaining ${money(safe)} can last through ${dateText(nextPay,{month:'short',day:'numeric'})}.`;
  }else if(status==='Watch spending'){
    coachMessage=`You are ${money(Math.abs(paceGap))} over the calendar spending pace. Keep the next purchases light; your current daily runway is ${money(daily)}.`;
  }else if(status==='Ahead of pace'){
    coachMessage=`You are ${money(Math.max(0,paceGap))} under the calendar pace. That cushion gives the remaining ${money(safe)} more room to last until payday.`;
  }else{
    coachMessage=`Your spending is close to the calendar pace. Keep flexible spending around ${money(daily)} per remaining day to stay on track.`;
  }

  const pacePct=Math.max(0,Math.min(100,usedRatio*100));
  const actionRoom=beforeCycle||afterCycle||startingSafe<=0?0:Math.max(0,paceGap);
  let actionAmount='Starts on payday',actionText=`On ${dateText(payDate,{month:'short',day:'numeric'})}, Dexx will show how much room remains before you reach the calendar spending pace.`;
  if(afterCycle){
    actionAmount='Cycle complete';
    actionText='Start the next paycheck cycle to create a new live pace target.';
  }else if(!beforeCycle&&startingSafe<=0){
    actionAmount='$0.00';
    actionText='There is no flexible Safe-to-Spend budget in this plan to pace.';
  }else if(!beforeCycle&&safe<=0){
    actionAmount='$0.00';
    actionText='The flexible limit has been reached. Hold new flexible spending until the next payday.';
  }else if(!beforeCycle&&paceGap<0){
    actionAmount='$0.00';
    actionText=`You are ${money(Math.abs(paceGap))} over today’s calendar pace. Pause flexible spending to let the calendar catch up.`;
  }else if(!beforeCycle){
    actionAmount=money(actionRoom);
    actionText=`You can use up to ${money(actionRoom)} more before reaching today’s calendar pace. This is a pace guide, not extra money beyond your ${money(safe)} TRUE Safe-to-Spend.`;
  }
  return {payDate,nextPay,today,cycleDays,beforeCycle,afterCycle,daysLeft,startingSafe,spent,safe,daily,usedRatio,elapsedDays,expectedUsedRatio,expectedSpent,paceGap,status,tone,coachMessage,pacePct,actionRoom,actionAmount,actionText};
}
function renderWeeklyRunway(c){
  const panel=$('weeklyRunway');if(!panel)return;
  const plan=data.approvedPlan;
  if(plan&&planFundingStatus(plan)!=='funded'){
    panel.hidden=false;panel.classList.add('runway-locked');
    const payDate=dateAtNoon(plan.payDate||data.payDate),today=dateAtNoon(new Date()),beforePayday=payDate&&today<payDate;
    $('runwayStatus').textContent='LOCKED';$('runwayStatus').dataset.tone='watch';
    $('runwayDays').textContent='—';$('runwayDaysNote').textContent=beforePayday?`Payday ${dateText(payDate,{month:'short',day:'numeric'})}`:'Payday check-in required';
    $('runwaySafe').textContent='$0.00';$('runwayDaily').textContent='$0.00';$('runwayDailyNote').textContent='Unlocks after reconciliation';
    $('runwayPace').textContent='LOCKED';$('runwayPaceNote').textContent='No live spending pace yet';$('runwayMeter').style.width='0%';
    if($('runwayCoachBadge')){$('runwayCoachBadge').textContent='Waiting';$('runwayCoachBadge').dataset.tone='watch'}
    if($('runwayCoachMessage'))$('runwayCoachMessage').textContent=beforePayday?'The paycheck is still planned. Dexx will unlock check-in on payday, but will not assume the money arrived.':'Payday has arrived, but the money is not confirmed. Enter the actual deposit to unlock live pace coaching.';
    if($('runwayExpectedPace'))$('runwayExpectedPace').textContent='—';if($('runwayExpectedNote'))$('runwayExpectedNote').textContent='Starts after confirmed funding';
    if($('runwayPaceGap'))$('runwayPaceGap').textContent='—';if($('runwayPaceGapNote'))$('runwayPaceGapNote').textContent='No pace gap before confirmation';
    if($('runwayActionAmount'))$('runwayActionAmount').textContent=beforePayday?'Wait for payday':'Confirm paycheck';
    if($('runwayActionText'))$('runwayActionText').textContent=beforePayday?`On ${dateText(payDate,{month:'short',day:'numeric'})}, enter what actually reached your account.`:'Enter the real deposit, review Dexx’s recalculation, and activate the reconciled payday before spending guidance begins.';
    if($('runwayActionGuide'))$('runwayActionGuide').dataset.tone='watch';
    $('runwayReadout').textContent=`${money(Number(plan.safeToSpend)||0)} is still PLANNED TRUE Safe-to-Spend. It is not available until the actual paycheck is confirmed and protection is funded.`;
    return;
  }
  panel.classList.remove('runway-locked');
  const r=weeklyRunwayState(c);
  panel.hidden=!r;
  if(!r)return;
  $('runwayStatus').textContent=r.status;$('runwayStatus').dataset.tone=r.tone;
  $('runwayDays').textContent=r.afterCycle?'0':String(r.daysLeft);
  $('runwaySafe').textContent=money(r.safe);
  $('runwayDaily').textContent=money(r.daily);
  $('runwayPace').textContent=r.startingSafe>0?`${Math.round(r.usedRatio*100)}% used`:'No flex budget';
  $('runwayMeter').style.width=`${r.pacePct}%`;

  const coachBadge=$('runwayCoachBadge'),coachMessage=$('runwayCoachMessage');
  if(coachBadge){coachBadge.textContent=r.status;coachBadge.dataset.tone=r.tone}
  if(coachMessage)coachMessage.textContent=r.coachMessage;
  if($('runwayExpectedPace'))$('runwayExpectedPace').textContent=r.beforeCycle?'0% used':`${Math.round(r.expectedUsedRatio*100)}% used`;
  if($('runwayExpectedNote'))$('runwayExpectedNote').textContent=r.beforeCycle?'Pace starts on check date':r.afterCycle?'Full cycle completed':`Calendar pace through day ${r.elapsedDays} of ${r.cycleDays}`;
  if($('runwayPaceGap'))$('runwayPaceGap').textContent=r.beforeCycle?'$0.00':money(Math.abs(r.paceGap));
  if($('runwayPaceGapNote')){
    $('runwayPaceGapNote').textContent=r.beforeCycle?'No pace gap before payday':r.afterCycle?'Final difference from calendar pace':Math.abs(r.paceGap)<0.005?'Right on the pace budget':r.paceGap>=0?'Under the pace budget':'Over the pace budget';
  }
  if($('runwayActionAmount'))$('runwayActionAmount').textContent=r.actionAmount;
  if($('runwayActionText'))$('runwayActionText').textContent=r.actionText;
  if($('runwayActionGuide'))$('runwayActionGuide').dataset.tone=r.tone;

  if(r.beforeCycle){
    const until=Math.max(0,Math.ceil((r.payDate-r.today)/86400000));
    $('runwayDaysNote').textContent=`Cycle starts ${dateText(r.payDate,{month:'short',day:'numeric'})}`;
    $('runwayDailyNote').textContent=`Across ${r.cycleDays} cycle days`;
    $('runwayPaceNote').textContent='Spending pace begins on check date';
    $('runwayReadout').textContent=`Your approved cycle starts in ${until} day${until===1?'':'s'}. ${money(r.safe)} is protected as TRUE Safe-to-Spend for the ${r.cycleDays}-day runway to ${dateText(r.nextPay,{month:'short',day:'numeric'})}.`;
  }else if(r.afterCycle){
    $('runwayDaysNote').textContent='Next payday reached';
    $('runwayDailyNote').textContent='Start the next paycheck cycle';
    $('runwayPaceNote').textContent=`${money(r.spent)} recorded this cycle`;
    $('runwayReadout').textContent=`This paycheck runway has reached ${dateText(r.nextPay,{month:'short',day:'numeric'})}. Start the next paycheck cycle so Dexx can rebuild your daily runway from the new check.`;
  }else{
    $('runwayDaysNote').textContent=`Until ${dateText(r.nextPay,{month:'short',day:'numeric'})}`;
    $('runwayDailyNote').textContent='Average safe amount per day';
    $('runwayPaceNote').textContent=`${money(r.spent)} of ${money(r.startingSafe)} flexible money used`;
    const paceText=r.status==='Ahead of pace'?'You are using flexible money slower than the calendar pace.':r.status==='Spending too fast'||r.status==='Watch spending'?'Spending is moving faster than the calendar pace.':'Your spending is tracking with the paycheck cycle.';
    $('runwayReadout').textContent=`${money(r.safe)} remains for ${r.daysLeft} day${r.daysLeft===1?'':'s'} — about ${money(r.daily)} per day if spread evenly. ${paceText}`;
  }
}
function renderPaydayCommandCenter(c){
  if(!$('paydayCommandCenter'))return;
  const p=commandCenterPlan(c);
  const protectedTotal=Math.max(0,Number(p.payNow||0)+Number(p.reserve||0)+Number(p.savings||0)+Number(p.debtPayment||0));
  const nextPay=p.nextPay||dateAtNoon(data.nextPayday);
  const today=dateAtNoon(new Date());
  const checkDate=p.paycheck&&data.payDate?dateAtNoon(data.payDate):null;
  const countdownAnchor=checkDate||today;
  const days=nextPay&&countdownAnchor?Math.max(0,Math.round((nextPay-countdownAnchor)/86400000)):null;
  $('commandPaycheck').textContent=money(p.paycheck||0);
  $('commandCheckDate').textContent=p.paycheck&&data.payDate?`Check ${dateText(data.payDate,{month:'short',day:'numeric'})}`:'No check entered';
  $('commandProtected').textContent=money(protectedTotal);
  $('commandSafe').textContent=money(p.safeToSpend||0);
  $('commandSafeThrough').textContent=p.paycheck&&nextPay?`Through ${dateText(nextPay,{month:'short',day:'numeric'})}`:'Build your plan';
  $('commandBillsNow').textContent=money(p.payNow||0);
  $('commandReserve').textContent=money(p.reserve||0);
  $('commandSavings').textContent=money(p.savings||0);
  $('commandDebt').textContent=money(p.debtPayment||0);
  $('commandSpent').textContent=money(p.expenseTotal||0);
  $('commandNextPayday').textContent=nextPay?dateText(nextPay,{month:'short',day:'numeric'}):'—';
  $('commandDaysToPayday').textContent=days===null?'Schedule not set':checkDate?(days===0?'Same-day payday':`${days} day${days===1?'':'s'} after this check`):(days===0?'Payday today':`${days} day${days===1?'':'s'} away`);
  const funding=data.approvedPlan?planFundingStatus(data.approvedPlan):'none';
  const plannedFunding=funding==='planned';
  const status=!p.paycheck?'Waiting for check':p.shortfall?'Needs attention':plannedFunding?'Plan scheduled':data.approvedPlan?'Execution mode':'Plan ready';
  $('commandCenterStatus').textContent=status;
  $('commandCenterStatus').dataset.state=p.shortfall?'watch':data.approvedPlan?'approved':p.paycheck?'ready':'waiting';
  if($('commandPaycheckLabel'))$('commandPaycheckLabel').textContent=plannedFunding?'PLANNED PAYCHECK':'PAYCHECK';if($('commandProtectedLabel'))$('commandProtectedLabel').textContent=plannedFunding?'PLANNED PROTECTED':'PROTECTED';if($('commandSafeLabel'))$('commandSafeLabel').textContent=plannedFunding?'PLANNED TRUE SAFE-TO-SPEND':'TRUE SAFE-TO-SPEND';
  const action=$('commandPlanAction');
  if(action)action.textContent=!p.paycheck?'ENTER CHECK':data.approvedPlan?'PAYDAY CHECKLIST':'REVIEW / APPROVE PLAN';
  const readout=!p.paycheck
    ?`Next scheduled check: ${dateText(suggestedNextPayCycle().payDate,{weekday:'short',month:'short',day:'numeric'})}. Enter the amount and Dexx will connect bills, reserves, savings, debt, and spending.`
    :p.shortfall>0
      ?`This check is ${money(p.shortfall)} short on immediate priorities. Protect required bills first; TRUE Safe-to-Spend stays at ${money(p.safeToSpend)}.`
      :plannedFunding
        ?`${money(protectedTotal)} is planned to be protected when the ${money(p.paycheck)} paycheck lands. Nothing from this future check is counted as funded today; ${money(p.safeToSpend)} is the planned TRUE Safe-to-Spend for the upcoming cycle.`
        :data.approvedPlan
          ?`Execution mode is active. ${money(protectedTotal)} stays assigned to the approved plan and ${money(p.safeToSpend)} is your current TRUE Safe-to-Spend after ${money(p.expenseTotal)} recorded spending.`
          :`Plan ready. ${money(p.payNow)} goes to bills now, ${money(p.reserve)} protects future bills, ${money(p.savings)} goes to savings, and ${money(p.safeToSpend)} remains truly safe to spend.`;
  $('commandDexxReadout').textContent=readout;
  renderWeeklyRunway(p);
  renderPaydayExecution(p);
}
function allocationRows(p){const host=$('allocationList');if(!host)return;host.replaceChildren();[['Bills due before next payday',p.payNow,p.shortfall?`${money(p.shortfall)} still unfunded`:`${p.dueNowBills.length} covered`],['Bills reserve — this check',p.reserve,p.reserveShortfall?`${money(p.reserveShortfall)} still needed`:`${p.upcomingBills.length} future bill${p.upcomingBills.length===1?'':'s'} protected`],['Move to savings',p.savings,`Target: ${money(p.desiredSavings)}${p.savingsGoalTarget?` · ${p.savingsGoalTarget.name}`:''}`],['Extra debt payment',p.debtPayment,p.desiredDebt?`Goal: ${money(p.desiredDebt)}${p.targetDebt?` · Target ${p.targetDebt.name}`:''}`:'Optional after priorities'],['Spent this cycle',p.expenseTotal,`${p.currentExpenses.length} expense${p.currentExpenses.length===1?'':'s'} recorded`],['TRUE safe to spend',p.safeToSpend,`Through ${dateText(p.nextPay,{month:'short',day:'numeric'})}`]].forEach(([label,amount,note])=>{const row=document.createElement('div');row.className='allocation-row';row.innerHTML=`<div><strong>${label}</strong><small>${note}</small></div><b>${money(amount)}</b>`;host.append(row)})}
/* ============ Phase 3 — Intelligent Payday Plan (v4.1.21.0) ============
   billCoverageDetails answers "which exact bills does this check cover?" in
   priority order, and names what stays short — shortfalls are never hidden.
   validatePaydayPlan checks the math invariants every plan must satisfy. */
function billCoverageDetails(p){
  const bills=[...p.dueNowBills].sort((a,b)=>(priorityRank[a.priority]-priorityRank[b.priority])||String(a.date||'').localeCompare(String(b.date||'')));
  let remaining=Math.max(0,Number(p.payNow)||0);
  const covered=[],short=[];
  bills.forEach(b=>{
    const need=Math.max(0,Number(b.currentCheckDue??b.amount)||0);
    if(need<=0.005){covered.push({...b,coveredAmount:0});return}
    if(remaining>=need-0.005){covered.push({...b,coveredAmount:need});remaining=Math.max(0,remaining-need)}
    else{short.push({...b,coveredAmount:Math.max(0,remaining),uncovered:need-Math.max(0,remaining)});remaining=0}
  });
  return {covered,short,shortfall:Math.max(0,Number(p.shortfall)||0)};
}
function validatePaydayPlan(p){
  const issues=[];
  if(!p||typeof p!=='object')return ['No plan to validate.'];
  const available=Math.max(0,Number(p.available)||0);
  const allocated=['payNow','reserve','savings','debtPayment','expenseTotal','safeToSpend'].reduce((s,k)=>s+Math.max(0,Number(p[k])||0),0);
  if(allocated-available>0.02)issues.push(`Allocations (${money(allocated)}) exceed available money (${money(available)}).`);
  ['payNow','reserve','savings','debtPayment','safeToSpend','expenseTotal'].forEach(k=>{if(Number(p[k]||0)<-0.005)issues.push(`${k} is negative.`)});
  const expectedShortfall=Math.max(0,Number(p.dueNow||0)-Number(p.payNow||0));
  if(Math.abs(Number(p.shortfall||0)-expectedShortfall)>0.02)issues.push('Shortfall does not equal bills due minus bills covered.');
  const expectedReserveShortfall=Math.max(0,Number(p.reserveTarget||0)-Number(p.reserve||0));
  if(Math.abs(Number(p.reserveShortfall||0)-expectedReserveShortfall)>0.02)issues.push('Reserve shortfall does not equal reserve target minus reserve.');
  return issues;
}
function renderBillCoverage(p){
  const host=$('billCoverage');if(!host)return;
  host.replaceChildren();
  if(!p||!Number(p.paycheck))return;
  const det=billCoverageDetails(p);
  if(!det.covered.length&&!det.short.length)return;
  const title=document.createElement('div');title.className='coverage-title';
  title.innerHTML=`<span>WHY THIS COVERAGE</span><strong>${det.short.length?`Short ${money(det.shortfall)} — see what's uncovered`:'Every bill before payday is covered'}</strong>`;
  host.append(title);
  det.covered.forEach(b=>{
    const row=document.createElement('div');row.className='coverage-row covered';
    row.innerHTML=`<i>✓</i><div><strong>${escapeHTML(b.name||'Bill')}</strong><small>${b.priority} · due ${dateText(b.date,{month:'short',day:'numeric'})}</small></div><b>${money(b.coveredAmount)}</b>`;
    host.append(row);
  });
  det.short.forEach(b=>{
    const row=document.createElement('div');row.className='coverage-row short';
    row.innerHTML=`<i>!</i><div><strong>${escapeHTML(b.name||'Bill')}</strong><small>${b.priority} · due ${dateText(b.date,{month:'short',day:'numeric'})} · ${money(b.uncovered)} still needed</small></div><b>${money(b.coveredAmount)}</b>`;
    host.append(row);
  });
}
function reserveExplanation(p){
  if(!p.upcomingBills.length)return'';
  return p.upcomingBills.slice(0,4).map(b=>{
    const due=dateAtNoon(b.date)?.toLocaleDateString('en-US',{month:'short',day:'numeric'})||'soon';
    const memory=b.alreadyProtected>0?`${money(b.alreadyProtected)} is already protected. `:'';
    return `${escapeHTML(b.name)}: ${memory}protect ${money(b.currentCheckReserve)} from this check toward ${money(b.amount)} due ${due} (${b.paychecksRemaining} paycheck${b.paychecksRemaining===1?'':'s'} including this one).`;
  }).join(' ')
}
function recommendation(p){
  if(!p.paycheck)return'Enter your check, next payday, and bills. I’ll prioritize the money automatically.';
  if(p.shortfall>0){const essentials=p.dueNowBills.filter(b=>b.priority==='essential').map(b=>b.name).slice(0,3).join(', ');return`This payday is ${money(p.shortfall)} short before future reserves. Protect ${essentials||'housing, utilities, transportation, and insurance'} first. Pause savings and extra debt payments if needed, reduce flexible spending to $0.00, and contact lower-priority billers before the due date.`}
  const why=reserveExplanation(p);
  if(p.reserveShortfall>0)return`Your immediate bills are covered, but this check cannot fully fund the ${money(p.reserveTarget)} future-bill reserve I recommend. Protect ${money(p.reserve)} now and keep flexible spending at ${money(p.safeToSpend)}. ${why} Savings and extra debt should stay behind this reserve until the gap is covered.`;
  if(p.upcomingBills.length)return`Your immediate bills are covered. I recommend protecting ${money(p.reserve)} from this check for future bills before treating the rest as available. ${why} Then move ${money(p.savings)} to ${p.savingsGoalTarget?.name||'savings'}${p.debtPayment?`, send ${money(p.debtPayment)} to ${p.targetDebt?.name||'debt'}`:''}. You have already recorded ${money(p.expenseTotal)} in flexible expenses this cycle. Your TRUE safe-to-spend amount is ${money(p.safeToSpend)}.`;
  return`Pay ${money(p.payNow)} now. No future-bill reserve is needed inside your current look-ahead window, so move ${money(p.savings)} to ${p.savingsGoalTarget?.name||'savings'}${p.debtPayment?`, send ${money(p.debtPayment)} to ${p.targetDebt?.name||'debt'}`:''}, and keep flexible spending at or below ${money(p.safeToSpend)} until payday.`
}
function experiment(p){if(!p.paycheck)return{title:'Build your first payday plan',text:'Add a paycheck and approve Dexx’s recommendation.',progress:0};if(!data.approvedPlan)return{title:'Approve the experiment',text:`Review the plan and protect ${money(p.savings)} for savings.`,progress:35};const target=Math.max(20,Math.min(p.safeToSpend*.2,75));return{title:`No-spend boost: save an extra ${money(target)}`,text:`Stay under ${money(p.safeToSpend)} in flexible spending and review your bills by Wednesday.`,progress:data.missions.spending&&data.missions.bills?100:data.missions.spending||data.missions.bills?70:50}}


function labReadinessIntelligence(){
  const state=guidedSetupState();
  const {areas,skipped}=state;
  const recommended=['bills','debt','savings'];
  const missing=recommended.filter(key=>!areas[key]);
  const labels={bills:'Recurring bills',debt:'Debt',savings:'Savings'};
  const next=missing[0]||(!areas.spending?'spending':'');
  let accuracy='Strong';
  let accuracyText='Your core money setup is complete.';
  if(!areas.bills){accuracy='Limited';accuracyText='Bills are missing, so TRUE Safe-to-Spend and forecasts should be treated as estimates.';}
  else if(!areas.debt){accuracy='Partial';accuracyText='Debt is not confirmed, so minimum payments may be missing from your financial picture.';}
  else if(!areas.savings){accuracy='Partial';accuracyText='Savings setup is incomplete, so Dexx cannot fully connect your goals to the plan.';}
  return {...state,missing,labels,next,accuracy,accuracyText,skipped};
}
function moneyJourneyState(c){
  const readiness=labReadinessIntelligence();
  const plan=data.approvedPlan;
  const today=dateAtNoon(new Date());
  const payDate=dateAtNoon(plan?.payDate||data.payDate);
  const nextPay=dateAtNoon(plan?.nextPayday||data.nextPayday);
  const funding=planFundingStatus(plan);
  const funded=!!plan&&funding==='funded';
  const beforePayday=!!(plan&&payDate&&today<payDate);
  const paydayReady=!!(plan&&payDate&&today>=payDate&&!funded);
  const preview=!!(paydayReconciliationPreview&&plan&&paydayReconciliationPreview.planId===plan.id);
  const cycleEnded=!!(funded&&nextPay&&today>=nextPay);
  const liveRunway=!!(funded&&!cycleEnded);
  const protectedTotal=Math.max(0,Number(plan?.protected||0));
  const actual=Number(plan?.actualPaycheck||plan?.paycheck||0);
  const planned=Number((plan?.plannedPaycheck??plan?.paycheck)||0);
  const steps=[];
  const add=(id,title,note,state,badge)=>steps.push({id,title,note,state,badge});

  add('setup','Essential setup',readiness.requiredReady?'Money today and income/payday are confirmed.':'Confirm money available today plus income and next payday.',readiness.requiredReady?'done':'current',readiness.requiredReady?'COMPLETE':'CURRENT');
  add('plan','Payday plan',plan?`${money(planned)} plan approved for ${payDate?dateText(payDate,{month:'short',day:'numeric'}):'payday'}.`:'Build and approve the next paycheck plan.',plan?'done':readiness.requiredReady?'current':'locked',plan?'COMPLETE':readiness.requiredReady?'CURRENT':'LOCKED');

  let landingState='locked',landingBadge='LOCKED',landingNote='Unlocks after a payday plan is approved.';
  if(plan&&funded){landingState='done';landingBadge='COMPLETE';landingNote=`${money(actual)} paycheck confirmed as landed.`}
  else if(plan&&preview){landingState='done';landingBadge='COMPLETE';landingNote=`${money(paydayReconciliationPreview.actual)} entered as the actual deposit.`}
  else if(plan&&beforePayday){landingNote=`Waiting for ${dateText(payDate,{month:'short',day:'numeric'})}. Planned money stays blocked until then.`;landingBadge=dateText(payDate,{month:'short',day:'numeric'}).toUpperCase()}
  else if(paydayReady){landingState='current';landingBadge='READY NOW';landingNote='Enter the amount that actually reached your account.'}
  add('landing','Paycheck lands',landingNote,landingState,landingBadge);

  let reconcileState='locked',reconcileBadge='LOCKED',reconcileNote='Unlocks after the actual paycheck amount is entered.';
  if(funded){reconcileState='done';reconcileBadge='COMPLETE';reconcileNote=`Actual vs. planned paycheck was reconciled before funding${Number(plan?.paycheckVariance||0)?` · ${Number(plan.paycheckVariance)>0?'+':''}${money(Number(plan.paycheckVariance))} variance`:''}.`}
  else if(preview){reconcileState='current';reconcileBadge='CURRENT';reconcileNote='Review Dexx’s recalculated protection and TRUE Safe-to-Spend before activation.'}
  add('reconcile','Reconcile actual check',reconcileNote,reconcileState,reconcileBadge);

  add('protect','Protect the money',funded?`${money(protectedTotal)} in approved protection is now funded.`:'Reserve, savings, bills, and debt moves stay scheduled until reconciliation is approved.',funded?'done':'locked',funded?'COMPLETE':'LOCKED');
  add('runway','Live TRUE Safe-to-Spend runway',cycleEnded?'This paycheck runway is complete.':liveRunway?`${money(c.safeToSpend)} remains safe through ${nextPay?dateText(nextPay,{month:'short',day:'numeric'}):'next payday'}.`:'Unlocks only after the real paycheck is reconciled and protection is funded.',cycleEnded?'done':liveRunway?'current':'locked',cycleEnded?'COMPLETE':liveRunway?'ACTIVE':'LOCKED');
  add('next','Next paycheck cycle',cycleEnded?'Review the finished cycle and build the next paycheck plan.':nextPay?`Upcoming ${dateText(nextPay,{month:'short',day:'numeric'})}. The next cycle stays blocked until this one reaches payday.`:'Dexx will schedule the next cycle after payday dates are known.',cycleEnded?'current':'locked',cycleEnded?'CURRENT':nextPay?dateText(nextPay,{month:'short',day:'numeric'}).toUpperCase():'LOCKED');

  const current=steps.find(x=>x.state==='current')||steps.find(x=>x.state==='locked')||steps[steps.length-1];
  return {steps,current,plan,payDate,nextPay,funded,beforePayday,paydayReady,preview,cycleEnded,liveRunway,readiness};
}
function renderMoneyJourney(c){
  const card=$('moneyJourneyCard'),host=$('moneyJourneyList'),action=$('moneyJourneyAction');
  if(!card||!host||!action)return;
  const j=moneyJourneyState(c);
  host.innerHTML=j.steps.map((step,index)=>`<article class="money-journey-step ${step.state}"><div class="money-journey-marker">${step.state==='done'?'✓':step.state==='current'?'→':'🔒'}</div><div><span>STEP ${index+1}</span><strong>${step.title}</strong><small>${step.note}</small></div><b>${step.badge}</b></article>`).join('');
  const completed=j.steps.filter(x=>x.state==='done').length;
  const set=(id,value)=>{if($(id))$(id).textContent=value};
  set('moneyJourneyStatus',j.current?.state==='locked'?`${completed} complete · waiting`:`Step ${Math.max(1,j.steps.indexOf(j.current)+1)} of ${j.steps.length}`);
  set('moneyJourneyNextTitle',j.current?.title||'Money journey ready');
  set('moneyJourneyNextText',j.current?.note||'Dexx will keep this journey updated as your money cycle changes.');
  action.disabled=false;action.removeAttribute('data-go');action.removeAttribute('data-journey-scroll');
  if(!j.readiness.requiredReady){action.textContent='COMPLETE ESSENTIAL SETUP';action.dataset.go='start'}
  else if(!j.plan){action.textContent='BUILD PAYDAY PLAN';action.dataset.go='budget';action.dataset.journeyScroll='plan'}
  else if(j.beforePayday){action.textContent=`PAYCHECK LANDS ${dateText(j.payDate,{month:'short',day:'numeric'}).toUpperCase()}`;action.disabled=true}
  else if(!j.funded){action.textContent=j.preview?'REVIEW RECONCILIATION':'CONFIRM ACTUAL PAYCHECK';action.dataset.go='budget';action.dataset.journeyScroll='execution'}
  else if(j.cycleEnded){action.textContent='START NEXT PAYCHECK';action.dataset.go='budget';action.dataset.journeyScroll='next'}
  else{action.textContent='OPEN LIVE PAYDAY MODE';action.dataset.go='budget';action.dataset.journeyScroll='execution'}
}

function renderLabReadinessIntelligence(){
  if(!$('labReadinessCard'))return;
  const r=labReadinessIntelligence();
  const set=(id,value)=>{if($(id))$(id).textContent=value};
  const readyCount=r.completeCount;
  set('labReadinessCount',`${readyCount} of 6 areas complete`);
  set('labReadinessStatus',r.missing.length?'Keep building':'Core setup ready');
  if($('labReadinessBar'))$('labReadinessBar').style.width=`${r.percent}%`;
  set('labReadinessAccuracy',`${r.accuracy} accuracy`);
  set('labReadinessAccuracyText',r.accuracyText);
  const missingText=r.missing.length?r.missing.map(k=>r.labels[k]).join(' · '):'Bills · Debt · Savings complete';
  set('labReadinessMissing',missingText);
  const nextLabel=r.next==='bills'?'ADD BILLS NEXT':r.next==='debt'?'ADD DEBT NEXT':r.next==='savings'?'ADD SAVINGS NEXT':r.next==='spending'?'ADD SPENDING LATER':'REVIEW SETUP';
  set('labReadinessNext',nextLabel);
  const btn=$('labReadinessOpen');
  if(btn)btn.textContent=r.missing.length?'CONTINUE SETUP':'REVIEW MY SETUP';
}

function renderLabBriefing(c){
  if(!$('labBriefing'))return;
  const plan=data.approvedPlan,today=dateAtNoon(new Date()),payDate=dateAtNoon(plan?.payDate||data.payDate),nextPay=dateAtNoon(plan?.nextPayday||data.nextPayday);
  const paycheck=Math.max(0,Number(plan?.paycheck??data.paycheck)||0),protectedTotal=plan?Math.max(0,Number(plan.protected||0)):Math.max(0,Number(c.payNow||0)+Number(c.reserve||0)+Number(c.savings||0)+Number(c.debtPayment||0)),plannedSafe=plan?Math.max(0,Number(plan.safeToSpend||0)):Math.max(0,Number(c.safeToSpend||0));
  const funded=!!plan&&planFundingStatus(plan)==='funded',beforeCycle=!!(plan&&payDate&&today<payDate),paydayWaiting=!!(plan&&!funded&&payDate&&today>=payDate),liveCycle=!!(plan&&funded&&payDate&&nextPay&&today>=payDate&&today<nextPay),endedCycle=!!(plan&&funded&&nextPay&&today>=nextPay);
  const set=(id,value)=>{if($(id))$(id).textContent=value};
  set('labProtectedMoney',money(protectedTotal));set('labProtectedLabel',plan&&!funded?'PLANNED PROTECTED':'PROTECTED');set('labCheckMoney',money(paycheck));set('labCheckNote',paycheck&&payDate?`${funded?'Confirmed':'Planned'} ${dateText(payDate,{month:'short',day:'numeric'})}`:'No check planned');
  if(beforeCycle){
    set('labBriefingStatus','Upcoming payday');set('labBriefingTitle',`${money(paycheck)} payday plan ready for ${dateText(payDate,{month:'short',day:'numeric'})}.`);set('labBriefingCopy','Planned money is not money available today. Payday will unlock check-in, not automatically create money.');
    set('labTodayLabel','AVAILABLE TODAY');set('labTodayMoney',money(Math.max(0,Number(data.currentBalance)||0)));set('labTodayNote','Current available balance before payday');set('labCheckLabel','PLANNED CHECK');set('labSafeLabel','PLANNED SAFE');set('labSafeMoney',money(plannedSafe));set('labSafeNote',nextPay?`Planned for ${dateText(payDate,{month:'short',day:'numeric'})} → ${dateText(nextPay,{month:'short',day:'numeric'})}`:'Starts after confirmation');set('labNextMoveTitle','Wait for payday check-in');set('labNextMoveText',`${money(plannedSafe)} remains planned. Dexx will ask what actually landed before anything becomes live.`);
  }else if(paydayWaiting){
    set('labBriefingStatus','Payday check-in');set('labBriefingTitle','Payday is here — confirm what actually landed.');set('labBriefingCopy',`The ${money(paycheck)} plan is still planned money. Dexx will not assume the deposit arrived just because the date did.`);
    set('labTodayLabel','AVAILABLE TODAY');set('labTodayMoney',money(Math.max(0,Number(data.currentBalance)||0)));set('labTodayNote','Confirmed money available before this paycheck');set('labCheckLabel','PLANNED CHECK');set('labSafeLabel','PLANNED SAFE');set('labSafeMoney',money(plannedSafe));set('labSafeNote','Locked until actual paycheck reconciliation');set('labNextMoveTitle','Confirm the actual paycheck');set('labNextMoveText','Open Payday Mode, enter the amount that actually reached your account, review the recalculated plan, then activate the live cycle.');
  }else if(liveCycle){
    const r=weeklyRunwayState(c);set('labBriefingStatus','Live paycheck cycle');set('labBriefingTitle',`Your ${dateText(payDate,{month:'short',day:'numeric'})} payday is confirmed and live.`);set('labBriefingCopy','This view reflects the confirmed paycheck cycle, recorded spending, and money still safe to use.');set('labTodayLabel','TRUE SAFE TODAY');set('labTodayMoney',money(Math.max(0,Number(c.safeToSpend)||0)));set('labTodayNote',nextPay?`Safe through ${dateText(nextPay,{month:'short',day:'numeric'})}`:'Current cycle');set('labCheckLabel','CONFIRMED CHECK');set('labSafeLabel','SPENT THIS CYCLE');set('labSafeMoney',money(Math.max(0,Number(c.expenseTotal)||0)));set('labSafeNote',r?`${r.status} · ${money(r.daily)}/day runway`:'Recorded flexible spending');set('labNextMoveTitle',r?.status==='Spending too fast'||r?.status==='Watch spending'?'Slow flexible spending':'Follow the live pace coach');set('labNextMoveText',r?.actionText||`Keep expenses inside the ${money(c.safeToSpend)} TRUE Safe-to-Spend amount until next payday.`);
  }else if(endedCycle){
    set('labBriefingStatus','Cycle complete');set('labBriefingTitle','This paycheck cycle has reached its next payday.');set('labBriefingCopy','The old confirmed plan stays in history, but Dexx needs the next real check to build a fresh runway.');set('labTodayLabel','AVAILABLE TODAY');set('labTodayMoney',money(Math.max(0,Number(data.currentBalance)||0)));set('labTodayNote','Enter the new check to refresh the Lab');set('labCheckLabel','LAST CONFIRMED CHECK');set('labSafeLabel','LAST SAFE');set('labSafeMoney',money(plannedSafe));set('labSafeNote','Previous confirmed cycle');set('labNextMoveTitle','Start the next paycheck cycle');set('labNextMoveText','Prepare the next plan. The next payday date can be expected, but the amount stays unknown until the real deposit is confirmed.');
  }else{
    set('labBriefingStatus',paycheck?'Plan not approved':'Setup needed');set('labBriefingTitle',paycheck?'Your next check is entered — finish the plan.':'Set up your next payday.');set('labBriefingCopy','Dexx connects paycheck, bills, reserves, savings, debt, and spending only after the plan is built and reality is confirmed.');set('labTodayLabel','AVAILABLE TODAY');set('labTodayMoney',money(Math.max(0,Number(data.currentBalance)||0)));set('labTodayNote','Current available balance');set('labCheckLabel',paycheck?'ENTERED CHECK':'UPCOMING CHECK');set('labSafeLabel','ESTIMATED SAFE');set('labSafeMoney',paycheck?money(plannedSafe):'$0.00');set('labSafeNote','Not live money');set('labNextMoveTitle',paycheck?'Review and approve the payday plan':'Enter your next check');set('labNextMoveText',paycheck?'Review Dexx’s allocations before payday check-in.':'Start in Payday Mode. Planned money stays separate from money available today.');
  }
  const readiness=labReadinessIntelligence(),accuracy=$('labPlanAccuracy');if(accuracy){accuracy.classList.toggle('warning',readiness.accuracy!=='Strong');accuracy.querySelector('strong').textContent=`${readiness.accuracy.toUpperCase()} PLAN ACCURACY`;accuracy.querySelector('span').textContent=readiness.accuracyText;}
}

function confidence(p){let level='LOW',pct=25,text='Complete your profile and enter a paycheck.';if(p.paycheck&&p.shortfall===0){level='MEDIUM';pct=65;text='Immediate bills are covered, but review reserves and savings.'}if(p.paycheck&&p.shortfall===0&&p.reserveShortfall===0&&p.savings>0){level='HIGH';pct=100;text='Bills, upcoming reserves and savings are protected.'}return{level,pct,text}}
function renderTimeline(c){
  const host=$('financialTimeline');if(!host)return;host.replaceChildren();const events=[];
  const plan=data.approvedPlan,funded=!!plan&&planFundingStatus(plan)==='funded';
  if(c.paycheck){const d=dateAtNoon(plan?.payDate||data.payDate)||c.today;events.push({date:d,label:funded?'Paycheck confirmed':'Planned paycheck',amount:c.paycheck,type:funded?'income':'planned'});}
  if(c.savings&&funded)events.push({date:c.today,label:'Move to savings',amount:-c.savings,type:'saving'});
  c.currentExpenses.forEach(x=>events.push({date:dateAtNoon(x.date)||c.today,label:x.name,amount:-x.amount,type:'expense'}));c.dueNowBills.forEach(b=>events.push({date:dateAtNoon(b.date)||c.today,label:b.name,amount:-Number(b.amount||0),type:'bill'}));c.upcomingBills.forEach(b=>events.push({date:dateAtNoon(b.date),label:`${funded?'Protected for':'Plan reserve for'} ${escapeHTML(b.name)}`,amount:-Number(b.currentCheckReserve||0),type:'reserve'}));events.push({date:c.nextPay,label:'Next payday date',amount:0,type:'payday'});
  events.filter(e=>dateAtNoon(e.date)).sort((a,b)=>dateAtNoon(a.date)-dateAtNoon(b.date)).slice(0,8).forEach(e=>{const row=document.createElement('div');row.className='timeline-row';row.innerHTML=`<div><strong>${dateText(e.date,{weekday:'short',month:'short',day:'numeric'})}</strong><span>${escapeHTML(e.label)}</span></div><b>${e.amount?money(e.amount):'Coming up'}</b>`;host.append(row)});if(!events.length)host.innerHTML='<div class="empty-copy">Add your paycheck and bills to build the week ahead.</div>';
}

function guidedSetupState(){
  const setup=data.setup||DEFAULTS.setup;
  const skipped={...DEFAULTS.setup.skipped,...(setup.skipped||{})};
  const hasActiveMoneyContext=!!data.approvedPlan||Number(data.paycheck||0)>0||!!data.payDate;
  const moneyComplete=!!setup.currentMoneyConfirmed||hasActiveMoneyContext||Number(data.currentBalance||0)>0;
  const incomeComplete=!!setup.incomeConfirmed||hasActiveMoneyContext;
  const areas={
    money:moneyComplete,
    income:incomeComplete,
    bills:billDefinitions().length>0,
    debt:debtDefinitions().length>0||data.confirmedNoDebt===true,
    savings:savingsGoalDefinitions().length>0,
    spending:(Array.isArray(data.expenseRecords)&&data.expenseRecords.length>0)
  };
  const completeCount=Object.values(areas).filter(Boolean).length;
  const requiredRemaining=[areas.money,areas.income].filter(v=>!v).length;
  return {setup,skipped,areas,completeCount,percent:Math.round(completeCount/6*100),requiredRemaining,requiredReady:requiredRemaining===0};
}
function renderGuidedSetup(){
  if(!$('setupReadinessList'))return;
  const state=guidedSetupState(),{setup,skipped,areas}=state;
  const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  if($('setupCurrentBalance'))$('setupCurrentBalance').value=areas.money?Number(data.currentBalance||0):'';
  if($('setupPayFrequency'))$('setupPayFrequency').value=data.profile?.payFrequency||'weekly';
  if($('setupIncomePattern'))$('setupIncomePattern').value=data.profile?.incomePattern||'variable';
  if($('setupExpectedPaycheck'))$('setupExpectedPaycheck').value=Number(setup.expectedPaycheck||data.paycheck||0)||'';
  if($('setupNextPayday'))$('setupNextPayday').value=setup.nextPayday||data.payDate||'';
  if($('setupReadinessBar'))$('setupReadinessBar').style.width=`${state.percent}%`;
  set('setupReadinessPercent',`${state.percent}% complete`);
  set('setupHeroStatus',state.requiredReady?'Ready to enter':`${state.requiredRemaining} essential${state.requiredRemaining===1?'':'s'} left`);
  set('setupReadinessNote',state.requiredReady?'Essentials complete · recommended details can be added now or later':'2 essentials are required before entering your Lab');
  set('setupMoneyState',areas.money?'READY':'NEEDS INFO');
  set('setupIncomeState',areas.income?'READY':'NEEDS INFO');
  set('setupRequiredStatus',state.requiredReady?'Essentials complete':`${state.requiredRemaining} essential${state.requiredRemaining===1?'':'s'} remaining`);
  const recState=(area,doneLabel)=>areas[area]?doneLabel:(skipped[area]?'Skipped · add later':(area==='spending'?'Optional':'Recommended'));
  set('setupBillsState',recState('bills',`${billDefinitions().length} saved`));
  set('setupDebtState',recState('debt',data.confirmedNoDebt===true?'Confirmed debt-free':`${debtDefinitions().length} saved`));
  set('setupSavingsState',recState('savings',`${savingsGoalDefinitions().length} saved`));
  set('setupSpendingState',recState('spending',`${data.expenseRecords.length} recorded`));
  document.querySelectorAll('[data-setup-area]').forEach(card=>{
    const area=card.dataset.setupArea;
    card.classList.toggle('complete',!!areas[area]);
    card.classList.toggle('skipped',!areas[area]&&!!skipped[area]);
    const skip=card.querySelector('[data-setup-skip]');
    if(skip){skip.textContent=skipped[area]&&!areas[area]?'ADD LATER ✓':'SKIP FOR NOW';skip.disabled=!!areas[area]}
  });
  const rows=[
    ['Money available today',areas.money,'Required',areas.money?money(data.currentBalance):'Confirm even if the balance is $0.00'],
    ['Income & next payday',areas.income,'Required',areas.income?`${money(setup.expectedPaycheck||data.paycheck)} expected · ${dateText(setup.nextPayday||data.payDate,{month:'short',day:'numeric'})}`:'Add pay frequency, expected check, and next payday'],
    ['Recurring bills',areas.bills,'Recommended',areas.bills?`${billDefinitions().length} bill${billDefinitions().length===1?'':'s'} saved`:(skipped.bills?'Skipped for now':'Makes bill protection and forecasts more accurate')],
    ['Debt',areas.debt,'Recommended',areas.debt?(data.confirmedNoDebt===true?'Confirmed no debt to track':`${debtDefinitions().length} account${debtDefinitions().length===1?'':'s'} saved`):(skipped.debt?'Skipped for now':'Helps Dexx plan minimums and extra payoff')],
    ['Savings',areas.savings,'Recommended',areas.savings?`${savingsGoalDefinitions().length} goal${savingsGoalDefinitions().length===1?'':'s'} saved`:(skipped.savings?'Skipped for now':'Helps Dexx protect progress before spending')],
    ['Spending history',areas.spending,'Optional',areas.spending?`${data.expenseRecords.length} expense${data.expenseRecords.length===1?'':'s'} recorded`:(skipped.spending?'Skipped for now':'Can be added later')]
  ];
  $('setupReadinessList').innerHTML=rows.map(([name,done,kind,note])=>`<article class="${done?'ready':''}"><span>${done?'✓':kind==='Required'?'!':'○'}</span><div><strong>${name}</strong><small>${note}</small></div><b>${done?'READY':kind.toUpperCase()}</b></article>`).join('');
  const missingRecommended=['bills','debt','savings'].filter(x=>!areas[x]);
  const next=missingRecommended[0];
  const guidance=!state.requiredReady?'Start with money available today and your income/payday. Those two essentials unlock the Lab.':next==='bills'?'Your essentials are ready. Add recurring bills next so Dexx knows what must be protected.':next==='debt'?'Bills are in. Add debt next so Dexx can account for minimums and payoff progress.':next==='savings'?'Add savings goals next so Dexx can protect progress before flexible spending.':'Your core setup is strong. Spending history is optional and can be added as you use the Lab.';
  set('setupDexxRecommendation',guidance);
  const enter=$('setupEnterLab');if(enter){enter.disabled=!state.requiredReady;enter.textContent=state.requiredReady?'ENTER MY LAB — FINISH LATER':'COMPLETE ESSENTIALS FIRST'}
  const cont=$('setupContinueRecommended');if(cont){cont.textContent=!state.requiredReady?'FINISH REQUIRED SETUP':next?`ADD ${next.toUpperCase()} NEXT`:'SETUP LOOKS GOOD';cont.disabled=state.requiredReady&&!next}
  set('setupFinalStatus',state.requiredReady?'Your Lab can open now. Recommended information can still be added before or after you enter.':'Complete the two required steps to enter your Lab. Bills, debt, savings, and spending can be added now or later.');
}
function renderProfile(){const p=data.profile||DEFAULTS.profile;const map={profileName:data.researcherName||'',payFrequency:p.payFrequency,paydayDay:String(p.paydayDay??5),incomePattern:p.incomePattern,recurringBillCount:p.recurringBillCount,financialStrategy:p.financialStrategy,profileSavingsRate:data.savingsRate||10,reserveDays:String(p.reserveDays||14)};Object.entries(map).forEach(([id,v])=>{if($(id))$(id).value=v});const fields=[data.researcherName,p.payFrequency,p.incomePattern,p.recurringBillCount,p.financialStrategy,data.savingsRate,p.reserveDays],pct=Math.round(fields.filter(v=>v!==''&&v!==null&&v!==undefined).length/fields.length*100);if($('profileCompletion'))$('profileCompletion').textContent=`${pct}% complete`;if($('profileReady'))$('profileReady').textContent=pct===100?'Ready for Payday Mode':'Needs setup';if($('profileSummary'))$('profileSummary').innerHTML=`<div><span>PAY SCHEDULE</span><strong>${p.payFrequency||'weekly'}</strong></div><div><span>CHECK AMOUNT</span><strong>${p.incomePattern==='variable'?'Variable':'Steady'}</strong></div><div><span>BILLS SAVED</span><strong>${billDefinitions().length} saved</strong></div><div><span>STRATEGY</span><strong>${p.financialStrategy||'balanced'}</strong></div>`;renderBillManager()}
function resetBillManagerForm(){if(!$('billManagerForm'))return;$('managerBillId').value='';$('managerBillName').value='';$('managerBillAmount').value='';$('managerBillDate').value='';$('managerBillFrequency').value='monthly';$('managerBillPriority').value='essential';$('managerBillAutopay').checked=false;$('saveManagedBill').textContent='SAVE RECURRING BILL';$('cancelBillEdit').hidden=true}
function renderBillManager(){const host=$('managedBills');if(!host)return;const defs=billDefinitions(),estimate=Number(data.profile?.recurringBillCount)||0;if($('billManagerProgress'))$('billManagerProgress').textContent=`${defs.length} bill${defs.length===1?'':'s'} saved`;if($('billManagerEstimate'))$('billManagerEstimate').textContent=estimate?`Profile estimate: ${estimate} recurring bill${estimate===1?'':'s'}. This is a planning estimate, not a limit.`:'Add as many recurring bills as you need. There is no bill limit.';host.replaceChildren();if(!defs.length){host.innerHTML='<div class="empty-copy">No recurring bills saved yet. Add your first bill above.</div>';return}defs.sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).forEach(b=>{const card=document.createElement('article');card.className='managed-bill';const freq={monthly:'Monthly',weekly:'Weekly',biweekly:'Every 2 weeks',once:'One time'}[b.frequency]||b.frequency;card.innerHTML=`<div class="managed-bill-main"><div><strong>${escapeHTML(b.name)}</strong><span>${freq} · ${b.priority}${b.autopay?' · Autopay':''}</span></div><b>${money(b.amount)}</b></div><div class="managed-bill-meta"><span>Next due ${b.dueDate?dateText(b.dueDate,{month:'short',day:'numeric',year:'numeric'}):'TBD'}</span><div><button type="button" data-edit-bill="${b.id}">Edit</button><button type="button" class="danger-link" data-delete-bill="${b.id}">Delete</button></div></div>`;host.append(card)})}

function resetDebtManagerForm(){if(!$('debtManagerForm'))return;$('managerDebtId').value='';$('managerDebtName').value='';$('managerDebtBalance').value='';$('managerDebtMinimum').value='';$('managerDebtDate').value='';$('managerDebtApr').value='';$('managerDebtType').value='credit-card';$('saveManagedDebt').textContent='SAVE DEBT ACCOUNT';$('cancelDebtEdit').hidden=true}

function resetSavingsGoalForm(){if(!$('savingsGoalForm'))return;$('savingsGoalId').value='';$('savingsGoalName').value='';$('savingsGoalTarget').value='';$('savingsGoalSaved').value='';$('savingsGoalDate').value='';$('savingsGoalPriority').value='medium';$('savingsGoalCategory').value='general';$('saveSavingsGoal').textContent='SAVE SAVINGS GOAL';$('cancelSavingsEdit').hidden=true}
function renderSavingsManager(){
  const host=$('savingsGoalsList');if(!host)return;
  const goals=savingsGoalDefinitions(),target=savingsTarget(),totalSaved=totalGoalSavings(),totalTargets=goals.reduce((s,g)=>s+g.target,0);
  if($('savingsGoalCount'))$('savingsGoalCount').textContent=`${goals.length} goal${goals.length===1?'':'s'} saved`;
  if($('savingsSavedTotal'))$('savingsSavedTotal').textContent=money(totalSaved);
  if($('savingsTargetTotal'))$('savingsTargetTotal').textContent=money(totalTargets);
  if($('savingsDexxTarget'))$('savingsDexxTarget').textContent=target?target.name:'Add a goal';
  if($('savingsStrategy'))$('savingsStrategy').value=data.savingsStrategy||'priority';
  if($('savingsStrategyCopy'))$('savingsStrategyCopy').textContent=savingsStrategyLabel();
  host.replaceChildren();
  if(!goals.length){host.innerHTML='<div class="empty-copy">No savings goals saved yet. Add your first goal above.</div>';return}
  goals.sort((a,b)=>savingsPriorityScore(a.priority)-savingsPriorityScore(b.priority)||goalRemaining(a)-goalRemaining(b)).forEach(g=>{
    const card=document.createElement('article');card.className='savings-goal-card';
    const pct=g.target?Math.min(100,Math.round(g.saved/g.target*100)):0;
    const due=g.targetDate?dateText(g.targetDate,{month:'short',day:'numeric',year:'numeric'}):'No deadline';
    card.innerHTML=`${target&&target.id===g.id?'<div class="dexx-savings-target">DEXX SAVINGS TARGET</div>':''}<div class="goal-card-head"><div><strong>${escapeHTML(g.name)}</strong><span>${g.category.replace('-',' ')} · ${g.priority} priority</span></div><b>${money(g.saved)} <small>/ ${money(g.target)}</small></b></div><div class="goal-progress"><i style="width:${pct}%"></i></div><div class="goal-meta"><span>${pct}% funded · ${money(goalRemaining(g))} left · ${due}</span><div><button type="button" data-add-saving="${g.id}">Add money</button><button type="button" data-withdraw-saving="${g.id}">Withdraw</button><button type="button" data-edit-saving="${g.id}">Edit</button><button type="button" class="danger-link" data-delete-saving="${g.id}">Delete</button></div></div>`;
    host.append(card)
  });
}

function renderDebtManager(){
  const host=$('managedDebts');if(!host)return;
  const debts=debtDefinitions(),total=debts.reduce((s,d)=>s+d.balance,0),mins=debts.reduce((s,d)=>s+d.minimumPayment,0),target=debtTarget();
  if($('debtManagerCount'))$('debtManagerCount').textContent=`${debts.length} account${debts.length===1?'':'s'} saved`;
  if($('debtTotalManaged'))$('debtTotalManaged').textContent=money(total);
  if($('debtMinimumTotal'))$('debtMinimumTotal').textContent=money(mins);
  if($('debtTargetName'))$('debtTargetName').textContent=target?target.name:'Add an account';
  if($('debtStrategy'))$('debtStrategy').value=data.debtStrategy||'balanced';
  if($('debtStrategyCopy'))$('debtStrategyCopy').textContent=debtStrategyLabel();
  host.replaceChildren();
  if(!debts.length){host.innerHTML='<div class="empty-copy">No debt accounts saved yet. Add your first account above.</div>';return}
  debts.sort((a,b)=>a.balance-b.balance).forEach(d=>{
    const card=document.createElement('article');card.className='managed-debt';
    const due=d.dueDate?dateText(d.dueDate,{month:'short',day:'numeric'}):'TBD';
    card.innerHTML=`<div class="debt-card-head"><div><strong>${escapeHTML(d.name)}</strong><span>${({'credit-card':'Credit card',loan:'Loan',medical:'Medical',other:'Other'})[d.accountType]||'Debt'} · ${d.apr.toFixed(2)}% APR</span></div><b>${money(d.balance)}</b></div><div class="debt-card-meta"><span>Minimum ${money(d.minimumPayment)} · Due ${due}</span><div><button type="button" data-pay-debt="${d.id}">Record payment</button><button type="button" data-edit-debt="${d.id}">Edit</button><button type="button" class="danger-link" data-delete-debt="${d.id}">Delete</button></div></div>`;
    if(target&&target.id===d.id){const badge=document.createElement('div');badge.className='dexx-target';badge.textContent='DEXX EXTRA-PAYMENT TARGET';card.prepend(badge)}
    host.append(card)
  });
}

function renderHistory(){const host=$('planHistory');if(!host)return;host.replaceChildren();const list=[...approvedHistory()].reverse().slice(0,12);if(!list.length){host.innerHTML='<div class="empty-copy">Approved plans will appear here.</div>';return}list.forEach(h=>{const row=document.createElement('article');row.className='history-row';if(h.late){row.innerHTML=`<div><strong>${money(h.actualPaycheck)} confirmed late</strong><small>${dateText(historyDisplayDate(h),{month:'short',day:'numeric',year:'numeric'})}</small></div><span>Late check-in · counts toward Dexx income learning · nothing funded retroactively</span><button class="danger-link history-delete" type="button" data-delete-plan="${h.id||''}">Delete</button>`}else{row.innerHTML=`<div><strong>${money(h.paycheck)} payday</strong><small>${dateText(historyDisplayDate(h),{month:'short',day:'numeric',year:'numeric'})}</small></div><span>Spent ${money(h.spent)} · Saved ${money(h.savings)}${h.savingsContributions?.[0]?.name?` to ${escapeHTML(h.savingsContributions[0].name)}`:''} · Safe ${money(h.safeToSpend)}</span><button class="danger-link history-delete" type="button" data-delete-plan="${h.id||''}">Delete</button>`}host.append(row)})}
function render(){reconcileExecutionState();const c=calc(),hour=new Date().getHours();renderNextPaycheckLaunchpad();renderPaydayCommandCenter(c);renderPaydayCatchup();renderLabBriefing(c);renderLabReadinessIntelligence();renderMoneyJourney(c);renderJourneyBar(c);$('greeting').textContent=`GOOD ${hour<12?'MORNING':hour<17?'AFTERNOON':'EVENING'}, ${(data.researcherName||'RESEARCHER').toUpperCase()} 👋`;if($('healthScore'))$('healthScore').textContent=c.score;if($('scoreRing'))$('scoreRing').style.setProperty('--score',c.score);if($('healthMessage'))$('healthMessage').textContent=c.score>=80?'Your payday plan is fully protected.':c.score>=60?'Your plan is gaining strength.':'Complete Payday Mode to improve your score.';const activeFunded=!!data.approvedPlan&&planFundingStatus(data.approvedPlan)==='funded';$('cashAvailable').textContent=money(activeFunded?c.safeToSpend:Math.max(0,Number(data.currentBalance)||0));$('billsWeek').textContent=money(c.payNow);$('savingsTotal').textContent=money(savingsGoalDefinitions().length?totalGoalSavings():c.savings);$('debtRemaining').textContent=money(totalDebtBalance());$('missionCount').textContent=`${c.missionDone} / 4`;$('progressText').textContent=`${c.progress}%`;$('progressBar').style.width=`${c.progress}%`;$('dexxObservation').textContent=recommendation(c);const conf=confidence(c);if($('confidenceLabel'))$('confidenceLabel').textContent=conf.level;if($('confidenceText'))$('confidenceText').textContent=conf.text;if($('confidenceBar'))$('confidenceBar').style.width=`${conf.pct}%`;renderTimeline(c);renderProfile();renderGuidedSetup();renderDebtManager();renderDebtOutlook();renderSavingsManager();renderSavingsOutlook();renderExpenseManager(c);renderReports(c);renderCalendar(c);renderMemoryGuard();renderSafetyRecovery();renderHealthScore(c);renderDebtStatusControl();renderActionCenter(c);if(debtDefinitions().length&&$('debtAmount')){$('debtAmount').value=totalDebtBalance();$('debtAmount').readOnly=true;$('debtAmount').title='Managed automatically from Credit Lab';}else if($('debtAmount')){$('debtAmount').readOnly=false;}document.querySelectorAll('[data-mission]').forEach(x=>x.checked=!!data.missions[x.dataset.mission]);billRows($('billList'),c.bills.filter(b=>!b.paid).slice(0,4));billRows($('allBills'),c.dueNowBills);prepareRows($('prepareBills'),c.upcomingBills);if($('reserveMemorySummary'))$('reserveMemorySummary').innerHTML=`<strong>${money(c.rememberedReserve)}</strong><span>already protected from approved payday plans</span>`;
  ['paycheck','currentBalance','saveAmount','debtAmount','debtGoal','savingsRate'].forEach(id=>{if($(id))$(id).value=data[id]||(id==='savingsRate'?10:'')});if($('payDate'))$('payDate').value=iso(dateAtNoon(data.payDate)||new Date());if($('nextPayday'))$('nextPayday').value=iso(dateAtNoon(data.nextPayday))||'';
  if($('planPayNow')){const d=commandCenterPlan(c);$('planPayNow').textContent=money(d.payNow);$('planReserve').textContent=money(d.reserve);$('planSavings').textContent=money(d.savings);$('planDebt').textContent=money(d.debtPayment);$('planSpend').textContent=money(d.safeToSpend);$('planStatus').textContent=d.shortfall?'Needs attention':data.approvedPlan?'Approved · executing':d.paycheck?'Plan ready':'Ready';$('dexxPlanText').textContent=recommendation(d);const total=d.paycheck||d.available||1;[['allocBills',d.payNow],['allocReserve',d.reserve],['allocSavings',d.savings],['allocDebt',d.debtPayment],['allocSpend',d.safeToSpend]].forEach(([id,val])=>$(id).style.width=`${Math.max(0,val/total*100)}%`);allocationRows(d);renderBillCoverage(d);$('customSavings').value=data.customSavings??'';$('customDebt').value=data.customDebt??'';const step=!c.paycheck?1:!c.bills.length?2:!data.approvedPlan?4:5;$('workflowStatus').textContent=`Step ${step} of 5`;$('workflowCopy').textContent=step===1?'Enter your check and payday dates.':step===2?'Add and confirm every bill coming before and after payday.':step===4?'Review Dexx’s recommendation and adjust only if needed.':'Plan approved. Track the experiment until next payday.';document.querySelectorAll('.step-track i').forEach((x,i)=>x.classList.toggle('active',i<step));const ex=experiment(c);$('experimentTitle').textContent=ex.title;$('experimentText').textContent=ex.text;$('experimentBar').style.width=`${ex.progress}%`;$('experimentProgress').textContent=`${ex.progress}% complete`;renderHistory()}}
function show(id){document.body.dataset.view=id;document.body.classList.remove('front-door-active');document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.go===id));history.replaceState(null,'','#'+id);scrollTo({top:0,behavior:'smooth'})}
document.addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(document.body.classList.contains('front-door-active'))return;if(go){e.preventDefault();show(go.dataset.go);const target=go.dataset.journeyScroll;if(target)setTimeout(()=>{const el=target==='execution'?$('paydayExecutionMode'):target==='next'?document.querySelector('.next-paycheck-launchpad'):document.querySelector('.paycheck-planner');el?.scrollIntoView({behavior:'smooth',block:'start'})},120)}const q=e.target.closest('[data-question]');if(q){const c=calc(),answers={score:`Your score is ${c.score}. Cover immediate bills, protect ${money(c.savings)} in savings, and stay within ${money(c.safeToSpend)}.`,spending:`Your safe-to-spend amount is ${money(c.safeToSpend)} through ${dateText(c.nextPay,{month:'short',day:'numeric'})}.`,challenge:experiment(c).text,saving:`I recommend ${money(c.savings)} this payday${c.savingsGoalTarget?` toward ${c.savingsGoalTarget.name}`:''}. Increase it only after immediate and upcoming bills are protected.`};dexxAsk(q.firstChild.textContent.trim(),answers[q.dataset.question])}});
document.addEventListener('click',e=>{
  const command=e.target.closest('[data-command]');
  if(!command)return;
  const type=command.dataset.command;
  if(type==='enter-check'){
    show('budget');
    setTimeout(()=>{$('budgetForm')?.scrollIntoView({behavior:'smooth',block:'start'});$('paycheck')?.focus()},120);
  }
  if(type==='plan'){
    show('budget');
    setTimeout(()=>{
      if(!clamp(data.paycheck,0,1e9)){$('budgetForm')?.scrollIntoView({behavior:'smooth',block:'start'});$('paycheck')?.focus();return}
      if(data.approvedPlan){$('paydayExecutionMode')?.scrollIntoView({behavior:'smooth',block:'start'});return}
      document.querySelector('.paycheck-planner')?.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
  }
});

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-execution-task]');if(!btn||!data.approvedPlan)return;
  const state=executionForPlan(data.approvedPlan),id=btn.dataset.executionTask;
  state.done[id]=!state.done[id];saveExecutionState();render();
});

$('confirmPaycheckLanded')?.addEventListener('click',()=>{
  if(!data.approvedPlan)return;
  const payDate=dateAtNoon(data.approvedPlan.payDate||data.payDate);
  if($('executionStatus'))$('executionStatus').textContent=`This paycheck is planned for ${dateText(payDate,{month:'short',day:'numeric'})}. Dexx will not fund it early.`;
});

$('checkPaycheckDifference')?.addEventListener('click',()=>{
  const plan=data.approvedPlan;if(!plan||planFundingStatus(plan)!=='planned')return;
  const payDate=dateAtNoon(plan.payDate||data.payDate),today=dateAtNoon(new Date());
  if(payDate&&today&&today<payDate)return;
  const actual=clamp($('actualPaycheckAmount')?.value,0,1e9);
  if(actual<=0){if($('reconcileMessage')){$('reconcileMessage').textContent='Enter the amount that actually reached your account.';$('reconcileMessage').classList.add('watch')}return}
  const preview=actualPaycheckPreview(actual),planned=Number(plan.plannedPaycheck??plan.paycheck)||0,variance=Math.round((actual-planned)*100)/100;
  paydayReconciliationPreview={actual,preview,planId:plan.id};
  const diff=$('reconcileDifference'),box=$('reconcilePreview'),varianceBox=diff?.closest('.reconcile-variance');
  if(diff)diff.textContent=`${variance>0?'+':''}${money(variance)}`;
  if(varianceBox){varianceBox.classList.toggle('positive',variance>0);varianceBox.classList.toggle('negative',variance<0)}
  if($('reconcileDifferenceNote'))$('reconcileDifferenceNote').textContent=Math.abs(variance)<.005?'Matches the planned paycheck':variance>0?`${money(variance)} more than planned`:`${money(Math.abs(variance))} less than planned`;
  if($('reconcileProtected'))$('reconcileProtected').textContent=money((preview.payNow||0)+(preview.reserve||0)+(preview.savings||0)+(preview.debtPayment||0));
  if($('reconcileSafe'))$('reconcileSafe').textContent=money(preview.safeToSpend||0);
  if($('reconcileBadge'))$('reconcileBadge').textContent='Step 2 of 2';
  const msg=$('reconcileMessage'),activate=$('activateReconciledPayday');
  if(preview.shortfall>0){
    if(msg){msg.textContent=`The actual check leaves ${money(preview.shortfall)} of immediate bills unfunded. Dexx will not activate this plan until you review the recalculated numbers.`;msg.classList.add('watch')}
    if(activate){activate.textContent='REVIEW UPDATED PLAN';activate.dataset.mode='review'}
  }else{
    if(msg){msg.textContent=Math.abs(variance)<.005?'The deposit matches the plan. Dexx is ready to activate the paycheck and fund the scheduled protection.':`Dexx recalculated the plan using ${money(actual)}. Review the updated protection and TRUE Safe-to-Spend above before activation.`;msg.classList.remove('watch')}
    if(activate){activate.textContent='ACTIVATE RECONCILED PAYDAY';activate.dataset.mode='activate'}
  }
  if(box)box.hidden=false;
  renderMoneyJourney(calc());
});

$('activateReconciledPayday')?.addEventListener('click',()=>{
  const r=paydayReconciliationPreview,plan=data.approvedPlan;if(!r||!plan||r.planId!==plan.id)return;
  if($('activateReconciledPayday')?.dataset.mode==='review'){sendReconciledPlanBackForReview(r.actual);return}
  if(activateReconciledPayday(r.actual,r.preview)){
    if($('approvalStatus'))$('approvalStatus').textContent=`Paycheck confirmed at ${money(r.actual)}. Dexx reconciled the amount before Reserve Memory and savings funding went live.`;
  }
});

document.querySelectorAll('[data-mission]').forEach(x=>x.addEventListener('change',()=>{data.missions[x.dataset.mission]=x.checked;save({skipRecovery:true,skipActivity:true})}));

$('expenseForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const id=$('expenseId').value,name=$('expenseName').value.trim(),amount=clamp($('expenseAmount').value,0,1e9),category=$('expenseCategory').value,date=$('expenseDate').value,note=$('expenseNote').value.trim();
  if(!name||amount<=0||!date){$('expenseStatus').textContent='Add the expense name, amount, and date.';return}
  const existing=id?data.expenseRecords.find(x=>x.id===id):null;
  // Bind only to a paycheck cycle that actually contains the expense date.
  // This prevents pre-payday spending from reducing a future check's runway.
  const cycleId=cycleIdForExpenseDate(date,existing?.cycleId||'');
  const record={id:id||(crypto.randomUUID?crypto.randomUUID():`expense-${Date.now()}`),name,amount,category,date,note,cycleId};
  if(existing)Object.assign(existing,record);else data.expenseRecords.push(record);
  setRecoveryContext(existing?`Update expense: ${name}`:`Add expense: ${name}`,`${money(amount)} ${category||'other'} expense ${existing?'updated':'recorded'} for ${dateText(date,{month:'short',day:'numeric'})}.`,'expense');
  save();
  const hasActiveCycle=!!activeExpenseCycleId();
  $('expenseStatus').textContent=existing
    ?(hasActiveCycle?'Expense updated. Dexx recalculated TRUE Safe-to-Spend.':'Expense updated. It will attach to the next paycheck plan you build.')
    :(hasActiveCycle?'Expense recorded. Dexx updated your remaining TRUE Safe-to-Spend.':'Expense saved as pending spending. Build your payday plan and Dexx will attach it to that paycheck cycle.');
  resetExpenseForm();
});
$('cancelExpenseEdit')?.addEventListener('click',()=>{resetExpenseForm();$('expenseStatus').textContent='Edit canceled.'});
document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-expense]');
  if(edit){const x=data.expenseRecords.find(v=>v.id===edit.dataset.editExpense);if(!x)return;$('expenseId').value=x.id;$('expenseName').value=x.name;$('expenseAmount').value=x.amount;$('expenseCategory').value=x.category||'other';$('expenseDate').value=x.date;$('expenseNote').value=x.note||'';$('saveExpense').textContent='UPDATE EXPENSE';$('cancelExpenseEdit').hidden=false;$('expenseStatus').textContent=`Editing ${escapeHTML(x.name)}.`;show('expense')}
  const del=e.target.closest('[data-delete-expense]');
  if(del){const x=data.expenseRecords.find(v=>v.id===del.dataset.deleteExpense);if(x&&confirm(`Delete ${escapeHTML(x.name)} expense?`)){data.expenseRecords=data.expenseRecords.filter(v=>v.id!==x.id);setRecoveryContext(`Delete expense: ${escapeHTML(x.name)}`,`${money(x.amount)} expense removed.`,'delete');save();$('expenseStatus').textContent=`${escapeHTML(x.name)} deleted. TRUE Safe-to-Spend was recalculated.`}}
});


window.FinancialLabBuildPaydayPlan=function(){
  const status=$('formStatus');
  const say=msg=>{if(status){status.textContent=msg;status.dataset.state='active';status.scrollIntoView({block:'nearest'});}};
  try{
    say('Button tapped — building your payday plan…');

    const paycheck=clamp($('paycheck')?.value,0,1e9);
    const currentBalance=clamp($('currentBalance')?.value,0,1e9);
    const payDate=$('payDate')?.value||'';
    const nextPayday=$('nextPayday')?.value||'';

    if(paycheck<=0){say('Enter your paycheck amount first.');return false}
    if(!payDate){say('Enter your check date.');return false}
    if(!nextPayday){say('Enter your next payday.');return false}

    const pd=dateAtNoon(payDate),np=dateAtNoon(nextPayday);
    if(!pd||!np){say('One of the payday dates is invalid.');return false}
    if(np<=pd){say('Next payday must be after the check date.');return false}

    data.paycheck=paycheck;
    data.currentBalance=currentBalance;
    data.payDate=payDate;
    data.nextPayday=nextPayday;
    data.savingsRate=clamp($('savingsRate')?.value,0,100);
    data.saveAmount=clamp($('saveAmount')?.value,0,1e9);
    if(!debtDefinitions().length && $('debtAmount')){
      data.debtAmount=clamp($('debtAmount').value,0,1e9);
    }
    data.debtGoal=clamp($('debtGoal')?.value,0,1e9);

    const billName=$('billName')?.value.trim()||'';
    const billDate=$('billDate')?.value||'';
    const billAmount=clamp($('billAmount')?.value,0,1e9);

    // Add-a-bill is optional. If any one piece is entered, require all three.
    if(billName||billDate||billAmount){
      if(!billName||!billDate||billAmount<=0){
        say('Finish the optional Add a Bill fields, or clear them before building.');
        return false;
      }
      data.bills.push({
        id:crypto.randomUUID?crypto.randomUUID():`bill-${Date.now()}`,
        name:billName,
        dueDate:billDate,
        date:billDate,
        amount:billAmount,
        priority:$('billPriority')?.value||'essential',
        frequency:$('billFrequency')?.value||'monthly',
        autopay:!!$('billAutopay')?.checked,
        paidOccurrences:[]
      });
      $('billName').value='';
      $('billDate').value='';
      $('billAmount').value='';
      $('billAutopay').checked=false;
    }

    data.customSavings=null;
    data.customDebt=null;
    data.approvedPlan=null;
    data.missions.bills=data.bills.length>0;

    const attached=attachUnboundExpensesToActiveCycle();

    // Persist directly so build success never depends on render(), while still
    // participating in the 4.1.7.3.1 recovery layer.
    pushRecoveryPoint(lastSavedSnapshot,'Build payday plan',`${money(paycheck)} paycheck · ${dateText(payDate,{month:'short',day:'numeric'})} → ${dateText(nextPayday,{month:'short',day:'numeric'})}.`,'payday');
    data.lastUpdated=new Date().toISOString();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    lastSavedSnapshot=cloneFinancialData(data);
    writeMemoryMirror(data);
    logRecoveryActivity('Build payday plan',`${money(paycheck)} paycheck saved for ${dateText(payDate,{month:'short',day:'numeric'})} → ${dateText(nextPayday,{month:'short',day:'numeric'})}.`,'payday');

    say(`Payday plan built successfully.${attached?` ${attached} pending expense${attached===1?'':'s'} attached.`:''}`);

    try{
      render();
      // render can rewrite some fields, restore visible confirmation afterward
      setTimeout(()=>say(`Payday plan built successfully.${attached?` ${attached} pending expense${attached===1?'':'s'} attached.`:''}`),0);
    }catch(err){
      console.error(err);
      say(`Plan SAVED, but screen refresh failed: ${err.message||err}`);
    }
    return true;
  }catch(err){
    console.error(err);
    say(`BUILD ERROR: ${err.message||err}`);
    return false;
  }
};


$('confirmNoDebt')?.addEventListener('change',e=>{
  data.confirmedNoDebt=Boolean(e.target.checked);
  save();
  render();
});

$('actionTopButton')?.addEventListener('click',e=>{
  e.preventDefault();
  const target=e.currentTarget.dataset.target;
  const moved=navigateDexxAction(target);
  if(moved && target==='more'){
    setTimeout(()=>document.querySelector('.debt-status-card')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }
});
$('dexxActionList')?.addEventListener('click',e=>{
  const button=e.target.closest('button[data-action-target]');
  if(!button)return;
  const target=button.dataset.actionTarget;
  const moved=navigateDexxAction(target);
  if(moved && target==='more'){
    setTimeout(()=>document.querySelector('.debt-status-card')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }
});

$('backupFinancialLab')?.addEventListener('click',e=>{
  e.preventDefault();
  downloadFinancialLabBackup();
});
$('restoreFinancialLab')?.addEventListener('change',e=>{
  const file=e.target.files?.[0];
  if(file)restoreFinancialLabBackup(file);
});

$('billManagerForm')?.addEventListener('submit',e=>{e.preventDefault();const id=$('managerBillId').value,name=$('managerBillName').value.trim(),amount=clamp($('managerBillAmount').value,0,1e9),dueDate=$('managerBillDate').value;if(!name||!amount||!dueDate){$('billManagerStatus').textContent='Add the bill name, amount, and next due date.';return}const existing=id?data.bills.find(b=>b.id===id):null;const priorDue=existing?.dueDate||existing?.date||'';const record={id:id||(crypto.randomUUID?crypto.randomUUID():`bill-${Date.now()}`),name,amount,dueDate,date:dueDate,priority:$('managerBillPriority').value,frequency:$('managerBillFrequency').value,autopay:$('managerBillAutopay').checked,paidOccurrences:existing?.paidOccurrences||[]};if(existing){if(priorDue&&priorDue!==dueDate)clearReserveForBill(existing.id);Object.assign(existing,record)}else data.bills.push(record);if(!existing&&data.bills.length>Number(data.profile?.recurringBillCount||0)){data.profile=data.profile||structuredClone(DEFAULTS.profile);data.profile.recurringBillCount=data.bills.length}data.missions.bills=data.bills.length>0;data.approvedPlan=null;setRecoveryContext(existing?`Update bill: ${name}`:`Add bill: ${name}`,`${money(amount)} recurring bill ${existing?'updated':'added'}; next due ${dateText(dueDate,{month:'short',day:'numeric'})}.`,'bill');save();$('billManagerStatus').textContent=existing?'Bill updated. Dexx recalculated your payday plan.':'Bill saved. Dexx will use it automatically every payday.';resetBillManagerForm()});
$('cancelBillEdit')?.addEventListener('click',()=>{resetBillManagerForm();$('billManagerStatus').textContent='Edit canceled.'});
document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit-bill]');if(edit){const b=data.bills.find(x=>x.id===edit.dataset.editBill);if(!b)return;$('managerBillId').value=b.id;$('managerBillName').value=b.name;$('managerBillAmount').value=b.amount;$('managerBillDate').value=b.dueDate||b.date||'';$('managerBillFrequency').value=b.frequency||'monthly';$('managerBillPriority').value=b.priority||'important';$('managerBillAutopay').checked=!!b.autopay;$('saveManagedBill').textContent='UPDATE BILL';$('cancelBillEdit').hidden=false;$('billManagerStatus').textContent=`Editing ${escapeHTML(b.name)}.`;if(location.hash!=='#profile')show('profile');setTimeout(()=>$('managerBillName').scrollIntoView({behavior:'smooth',block:'center'}),80)}const del=e.target.closest('[data-delete-bill]');if(del){const b=data.bills.find(x=>x.id===del.dataset.deleteBill);if(b&&confirm(`Delete ${escapeHTML(b.name)}?`)){clearReserveForBill(b.id);data.bills=data.bills.filter(x=>x.id!==b.id);data.approvedPlan=null;data.missions.bills=data.bills.length>0;setRecoveryContext(`Delete bill: ${escapeHTML(b.name)}`,`${money(b.amount)} recurring bill removed.`,'delete');save();$('billManagerStatus').textContent=`${escapeHTML(b.name)} deleted.`}}});


$('savingsGoalForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const id=$('savingsGoalId').value,name=$('savingsGoalName').value.trim(),target=clamp($('savingsGoalTarget').value,0,1e9),saved=clamp($('savingsGoalSaved').value,0,1e9),targetDate=$('savingsGoalDate').value,priority=$('savingsGoalPriority').value,category=$('savingsGoalCategory').value;
  if(!name||target<=0){$('savingsGoalStatus').textContent='Add a goal name and target amount.';return}
  const existing=id?data.savingsGoals.find(g=>g.id===id):null;
  const record={id:id||(crypto.randomUUID?crypto.randomUUID():`goal-${Date.now()}`),name,target,saved:Math.min(saved,target),targetDate,priority,category};
  if(existing)Object.assign(existing,record);else data.savingsGoals.push(record);
  data.approvedPlan=null;setRecoveryContext(existing?`Update savings goal: ${name}`:`Add savings goal: ${name}`,`${money(target)} target ${existing?'updated':'created'}.`,'savings');save();
  $('savingsGoalStatus').textContent=existing?'Savings goal updated. Dexx recalculated the target.':'Savings goal saved. Dexx can now direct payday savings toward it.';
  resetSavingsGoalForm();
});
$('cancelSavingsEdit')?.addEventListener('click',()=>{resetSavingsGoalForm();$('savingsGoalStatus').textContent='Edit canceled.'});
$('savingsStrategy')?.addEventListener('change',()=>{data.savingsStrategy=$('savingsStrategy').value;data.approvedPlan=null;save();$('savingsGoalStatus').textContent=`Savings strategy updated: ${savingsStrategyLabel()}.`});
document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-saving]');
  if(edit){const g=data.savingsGoals.find(x=>x.id===edit.dataset.editSaving);if(!g)return;$('savingsGoalId').value=g.id;$('savingsGoalName').value=g.name;$('savingsGoalTarget').value=g.target;$('savingsGoalSaved').value=g.saved;$('savingsGoalDate').value=g.targetDate||'';$('savingsGoalPriority').value=g.priority||'medium';$('savingsGoalCategory').value=g.category||'general';$('saveSavingsGoal').textContent='UPDATE SAVINGS GOAL';$('cancelSavingsEdit').hidden=false;$('savingsGoalStatus').textContent=`Editing ${escapeHTML(g.name)}.`;show('savings');setTimeout(()=>$('savingsGoalName').scrollIntoView({behavior:'smooth',block:'center'}),80)}
  const del=e.target.closest('[data-delete-saving]');
  if(del){const g=data.savingsGoals.find(x=>x.id===del.dataset.deleteSaving);if(g&&confirm(`Delete ${escapeHTML(g.name)}?`)){data.savingsGoals=data.savingsGoals.filter(x=>x.id!==g.id);data.approvedPlan=null;setRecoveryContext(`Delete savings goal: ${escapeHTML(g.name)}`,'Savings goal removed.','delete');save();$('savingsGoalStatus').textContent=`${escapeHTML(g.name)} deleted.`}}
  const add=e.target.closest('[data-add-saving]');
  if(add){const g=data.savingsGoals.find(x=>x.id===add.dataset.addSaving);if(!g)return;const raw=prompt(`Add money to ${escapeHTML(g.name)}`);const amount=clamp(raw,0,goalRemaining(g));if(!amount)return;g.saved=Math.min(g.target,Math.round((Number(g.saved||0)+amount)*100)/100);setRecoveryContext(`Add to savings: ${escapeHTML(g.name)}`,`${money(amount)} added to the goal.`,'savings');save();$('savingsGoalStatus').textContent=`Added ${money(amount)} to ${escapeHTML(g.name)}.`}
  const withdraw=e.target.closest('[data-withdraw-saving]');
  if(withdraw){const g=data.savingsGoals.find(x=>x.id===withdraw.dataset.withdrawSaving);if(!g)return;const raw=prompt(`Withdraw from ${escapeHTML(g.name)}`);const amount=clamp(raw,0,g.saved);if(!amount)return;g.saved=Math.max(0,Math.round((Number(g.saved||0)-amount)*100)/100);setRecoveryContext(`Withdraw savings: ${escapeHTML(g.name)}`,`${money(amount)} withdrawn from the goal.`,'savings');save();$('savingsGoalStatus').textContent=`Withdrew ${money(amount)} from ${escapeHTML(g.name)}.`}
});

$('debtManagerForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const id=$('managerDebtId').value,name=$('managerDebtName').value.trim(),balance=clamp($('managerDebtBalance').value,0,1e9),minimumPayment=clamp($('managerDebtMinimum').value,0,1e9),dueDate=$('managerDebtDate').value,apr=clamp($('managerDebtApr').value,0,100),accountType=$('managerDebtType').value;
  if(!name||balance<=0){$('debtManagerStatus').textContent='Add the account name and current balance.';return}
  const existing=id?data.debts.find(d=>d.id===id):null;
  const record={id:id||(crypto.randomUUID?crypto.randomUUID():`debt-${Date.now()}`),name,balance,minimumPayment,dueDate,apr,accountType};
  if(existing)Object.assign(existing,record);else data.debts.push(record);
  data.debtAmount=debtDefinitions().reduce((s,d)=>s+d.balance,0);data.approvedPlan=null;setRecoveryContext(existing?`Update debt: ${name}`:`Add debt: ${name}`,`${money(balance)} balance ${existing?'updated':'added'}.`,'debt');save();
  $('debtManagerStatus').textContent=existing?'Debt account updated. Dexx recalculated the target.':'Debt account saved. Dexx can now target extra payments intelligently.';
  resetDebtManagerForm();
});
$('cancelDebtEdit')?.addEventListener('click',()=>{resetDebtManagerForm();$('debtManagerStatus').textContent='Edit canceled.'});
$('debtStrategy')?.addEventListener('change',()=>{data.debtStrategy=$('debtStrategy').value;data.approvedPlan=null;save();$('debtManagerStatus').textContent=`Strategy updated: ${debtStrategyLabel()}.`});
document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-debt]');
  if(edit){const d=data.debts.find(x=>x.id===edit.dataset.editDebt);if(!d)return;$('managerDebtId').value=d.id;$('managerDebtName').value=d.name;$('managerDebtBalance').value=d.balance;$('managerDebtMinimum').value=d.minimumPayment;$('managerDebtDate').value=d.dueDate||'';$('managerDebtApr').value=d.apr;$('managerDebtType').value=d.accountType||'credit-card';$('saveManagedDebt').textContent='UPDATE DEBT ACCOUNT';$('cancelDebtEdit').hidden=false;$('debtManagerStatus').textContent=`Editing ${escapeHTML(d.name)}.`;show('credit');setTimeout(()=>$('managerDebtName').scrollIntoView({behavior:'smooth',block:'center'}),80)}
  const del=e.target.closest('[data-delete-debt]');
  if(del){const d=data.debts.find(x=>x.id===del.dataset.deleteDebt);if(d&&confirm(`Delete ${escapeHTML(d.name)}?`)){data.debts=data.debts.filter(x=>x.id!==d.id);data.debtAmount=debtDefinitions().reduce((s,x)=>s+x.balance,0);data.approvedPlan=null;setRecoveryContext(`Delete debt: ${escapeHTML(d.name)}`,'Debt account removed.','delete');save();$('debtManagerStatus').textContent=`${escapeHTML(d.name)} deleted.`}}
  const pay=e.target.closest('[data-pay-debt]');
  if(pay){const d=data.debts.find(x=>x.id===pay.dataset.payDebt);if(!d)return;const raw=prompt(`Record a payment to ${escapeHTML(d.name)}`);const amount=clamp(raw,0,d.balance);if(!amount)return;d.balance=Math.max(0,d.balance-amount);data.debtAmount=debtDefinitions().reduce((s,x)=>s+x.balance,0);data.approvedPlan=null;setRecoveryContext(`Debt payment: ${escapeHTML(d.name)}`,`${money(amount)} payment recorded.`,'debt');save();$('debtManagerStatus').textContent=`Recorded ${money(amount)} payment to ${escapeHTML(d.name)}.`}
});

$('customSavings').addEventListener('change',()=>{data.customSavings=$('customSavings').value===''?null:clamp($('customSavings').value,0,1e9);data.approvedPlan=null;save()});$('customDebt').addEventListener('change',()=>{data.customDebt=$('customDebt').value===''?null:clamp($('customDebt').value,0,1e9);data.approvedPlan=null;save()});
$('approvePlan').onclick=()=>{
  if(!clamp(data.paycheck,0,1e9)){$('approvalStatus').textContent='Enter your paycheck first.';return}
  const sameIndex=data.paycheckHistory.findIndex(h=>h.payDate===data.payDate&&h.nextPayday===data.nextPayday);
  if(sameIndex>=0){rollbackReserveContributions(data.paycheckHistory[sameIndex]);data.paycheckHistory.splice(sameIndex,1)}
  data.approvedPlan=null;
  const c=calc();
  const approvalToday=dateAtNoon(new Date()),approvalPayDate=dateAtNoon(data.payDate);
  const beforePayday=Boolean(approvalPayDate&&approvalToday&&approvalPayDate>approvalToday);
  const reserveContributions=[];
  const savingsContributions=[];
  const snapshot={id:`plan-${Date.now()}`,approvedAt:new Date().toISOString(),fundingStatus:'planned',fundedAt:'',healthScore:calculateHealthScore(c).total,paycheck:c.paycheck,balance:c.balance,payDate:data.payDate,nextPayday:data.nextPayday,cycleId:paycheckCycleId(data.payDate,data.nextPayday),payNow:c.payNow,reserve:c.reserve,reserveTarget:c.reserveTarget,reserveContributions,savingsContributions,reserveDetails:c.upcomingBills.map(b=>({parentId:b.parentId||b.id,name:b.name,amount:b.amount,date:b.date,alreadyProtected:b.alreadyProtected,currentCheckReserve:b.currentCheckReserve,paychecksRemaining:b.paychecksRemaining})),savings:c.savings,debtPayment:c.debtPayment,debtTarget:c.targetDebt?{id:c.targetDebt.id,name:c.targetDebt.name}:null,spent:c.expenseTotal||0,protected:(c.payNow||0)+(c.reserve||0)+(c.savings||0)+(c.debtPayment||0),expenses:(c.currentExpenses||[]).map(x=>({name:x.name||'Expense',category:historyExpenseCategory(x),amount:Number(x.amount)||0,date:x.date||''})),safeToSpend:c.safeToSpend,shortfall:c.shortfall,bills:c.dueNowBills.map(b=>({parentId:b.parentId||b.id,occurrenceDate:b.occurrenceDate||b.date,name:b.name,amount:b.amount,date:b.date,priority:b.priority,alreadyProtected:b.alreadyProtected,currentCheckDue:b.currentCheckDue}))};
  data.approvedPlan=snapshot;data.paycheckHistory.push(snapshot);data.missions.friday=true;data.missions.saving=c.savings>0;data.missions.bills=c.bills.length>0;
  executionState={planId:snapshot.id,done:{},updatedAt:new Date().toISOString()};saveExecutionState();
  setRecoveryContext('Approve payday plan',`${money(c.paycheck)} paycheck plan approved for ${dateText(data.payDate,{month:'short',day:'numeric'})}. Funding waits for actual-paycheck reconciliation.`,'approval');
  save();$('approvalStatus').textContent=beforePayday?`Payday plan approved for ${dateText(data.payDate,{month:'short',day:'numeric'})}. Nothing is funded yet — payday will unlock actual-paycheck check-in.`:`Payday plan approved. Enter the actual deposit and reconcile it before Dexx funds reserves, savings, or TRUE Safe-to-Spend.`;
};
$('clearBills').onclick=()=>resetFinancialArea('bills');
function clearActiveCheck(){
  data.paycheck=0;data.currentBalance=0;data.payDate='';data.nextPayday='';data.customSavings=null;data.customDebt=null;data.approvedPlan=null;clearExecutionState();
  setRecoveryContext('Clear active paycheck','Active check fields cleared; other Financial Lab data was preserved.','reset');
  save();
  if($('approvalStatus'))$('approvalStatus').textContent='Active check cleared. Bills, debts, savings goals, expenses, and approved history were kept.';
}
$('clearActivePlan')?.addEventListener('click',()=>{if(confirm('Clear only the active check? Your approved paycheck history and other financial data will stay saved.'))clearActiveCheck()});
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-delete-plan]');if(!btn)return;
  const snapshot=(Array.isArray(data.paycheckHistory)?data.paycheckHistory:[]).find(h=>h.id===btn.dataset.deletePlan);if(!snapshot)return;
  if(!confirm(`Delete the ${money(snapshot.paycheck||0)} paycheck from ${dateText(historyDisplayDate(snapshot),{month:'short',day:'numeric',year:'numeric'})}? Other Financial Lab data will stay saved.`))return;
  const deletingActive=data.approvedPlan?.id===snapshot.id;
  const sameActive=data.payDate===snapshot.payDate&&data.nextPayday===snapshot.nextPayday&&Math.abs(Number(data.paycheck||0)-Number(snapshot.paycheck||0))<0.005;
  rollbackReserveContributions(snapshot);
  data.paycheckHistory=data.paycheckHistory.filter(h=>h.id!==snapshot.id);
  if(deletingActive)data.approvedPlan=null;
  if(deletingActive||executionState.planId===snapshot.id)clearExecutionState();
  if(sameActive){data.paycheck=0;data.currentBalance=0;data.payDate='';data.nextPayday='';data.customSavings=null;data.customDebt=null;data.missions.friday=false;data.missions.saving=false;}
  setRecoveryContext('Delete approved paycheck',`${money(snapshot.paycheck||0)} approved paycheck removed. Active execution state was rolled back when linked to this plan.`,'delete');
  save();
  if($('approvalStatus'))$('approvalStatus').textContent='Paycheck deleted. Reserve/savings contributions and linked Execution Mode were rolled back; other Financial Lab data was kept.';
});
$('startNextPaycheck')?.addEventListener('click',startNextPaycheckCycle);
$('undoLastChange')?.addEventListener('click',undoLastFinancialChange);
$('restoreRecoveryPoint')?.addEventListener('click',restoreSelectedRecoveryPoint);
document.querySelectorAll('[data-reset-area]').forEach(button=>button.addEventListener('click',()=>resetFinancialArea(button.dataset.resetArea)));
$('fullFinancialLabReset')?.addEventListener('click',fullFinancialLabReset);
/* 4.1.22.0 — AI Dexx chat (talk-only).
   The app sends each question plus a snapshot of the user's real Lab numbers
   to the Supabase Edge Function "dexx-chat", which holds the Anthropic API
   key server-side. The key NEVER lives in this code.
   The two __FL_ placeholders are stamped at build time once Robert supplies
   the Supabase Project URL + anon key. Until then — and whenever the
   network, the function, or the API is unreachable (or the spend cap is hit)
   — chat quietly falls back to the built-in scripted Dexx answers. */
const FL_DEXX={url:'https://udmvocamaqspwvqwamnf.supabase.co',anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbXZvY2FtYXFzcHd2cXdhbW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3OTI4NjAsImV4cCI6MjEwODM2ODg2MH0.hDut94wiFK4CB7AP-WkW1CVWitCKQzX7RBUK--GJ5aA',fn:'dexx-chat'};
function dexxAIReady(){return typeof FL_DEXX.url==='string'&&!/^__FL_/.test(FL_DEXX.url)&&!/^__FL_/.test(FL_DEXX.anonKey)}
function dexxSnapshotText(c){
  const j=(typeof moneyJourneyState==='function')?moneyJourneyState(c):null;
  const idx=j&&j.current?j.steps.indexOf(j.current):-1;
  const step=j&&j.current?j.current.title:'setup';
  const bills=[...(c.dueNowBills||[]),...(c.upcomingBills||[])].filter(b=>!b.paid);
  const billLines=bills.slice(0,12).map(b=>`- ${b.name||'Bill'}: ${money(Number(b.amount||0))} due ${dateText(b.occurrenceDate||b.date,{month:'short',day:'numeric'})}${b.status==='overdue'?' (overdue)':''}`);
  const confirmed=c.paycheck>0;
  return [
    `Journey step ${idx+1} of 7: ${step}.`,
    `Safe-to-spend: ${money(c.safeToSpend)}${confirmed?' (live — paycheck confirmed)':' (planned — paycheck not confirmed yet)'}.`,
    `This check: ${money(c.paycheck||0)} expected${c.nextPay?'; next payday '+dateText(c.nextPay,{month:'short',day:'numeric'}):''}.`,
    `Cover now: ${money(c.payNow)}; protect for upcoming bills: ${money(c.reserve)}${c.reserveShortfall>0?` (shortfall ${money(c.reserveShortfall)})`:''}; savings this check: ${money(c.savings)}${c.savingsGoalTarget?` toward ${c.savingsGoalTarget.name}`:''}; debt payment: ${money(c.debtPayment)}${c.targetDebt?` toward ${c.targetDebt.name}`:''}.`,
    bills.length?`Bills before next payday (${bills.length}):\n${billLines.join('\n')}`:'No bills recorded before next payday.',
    `Flexible spending recorded this cycle: ${money(c.expenseTotal)}${c.overspent?' (over the safe amount)':''}.`,
    `Health score: ${c.score}.`,
    (Array.isArray(data.incomes)&&data.incomes.length)?`Other incomes (pool into the primary journey once received): ${data.incomes.map(i=>`${i.name} ${money(i.amount)} ${i.frequency}`).join('; ')}. Received this cycle: ${money(c.pooledIncome||0)}.`:'',
    (data.business&&data.business.mode==='business'&&typeof flxBizState==='function')?(()=>{const s=flxBizState();return `Business Lab mode: business cash ${money(s.cash)}, tax set aside ${money(s.taxReserve)} at ${s.b.taxRate}%, open invoices ${money(s.openTotal)} (${s.overdue.length} overdue), next ${s.nextQ.label} estimated tax due ${s.nextQ.due}.`})():'',
    (Array.isArray(data.bills)&&data.bills.length)?`All tracked bills: ${data.bills.slice(0,25).map(b=>`${b.name} ${money(b.amount)} ${b.frequency||'monthly'} next due ${b.dueDate||b.date||'?'}`).join('; ')}.`:'',
    (data.business&&data.business.mode==='business')?'PERSONA: The user switched to Business Lab. You are Business Dexx: a sharp, confident business partner and CFO in a navy suit and shades, not a lab scientist. Talk like a business advisor (cash flow, invoices, margins, tax set-aside, paying yourself, keeping business and personal money separate). Keep it friendly and short. You are not a tax professional; suggest confirming tax specifics with one.':'',
    'Reply in plain conversational text only: no markdown, no asterisks, no headings, no tables.'
  ].filter(Boolean).join('\n');
}
/* 4.2.0.0 — Dexx no-markdown fix: AI replies render as plain text, so strip
   markdown syntax (bold, headings, bullets, code, links) before showing it. */
function dexxPlainText(s){
  return String(s||'')
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi,'$1')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g,'$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm,'')
    .replace(/(^|\s)#{2,6}(?=\s|$)/g,'$1')
    .replace(/(\*\*|__)(.+?)\1/g,'$2')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g,'$1$2')
    .replace(/(^|\W)_(?!\s)([^_\n]+?)_(?!\w)/g,'$1$2')
    .replace(/^\s*[-*+]\s+/gm,'• ')
    .replace(/^\s*>\s?/gm,'')
    .replace(/^\s*([-*_]\s*){3,}$/gm,'')
    .replace(/\|/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function dexxAddBubble(text,who){
  const host=$('dexxHistory');if(!host)return null;
  const b=document.createElement('div');b.className='bubble dexx-'+who;
  b.textContent=text; /* textContent by design: user/AI text can never inject markup */
  host.appendChild(b);b.scrollIntoView({block:'end'});return b;
}
function dexxScriptedAnswer(){const c=calc();return `Based on this payday, cover ${money(c.payNow)} now, protect ${money(c.reserve)} for upcoming bills, save ${money(c.savings)}${c.savingsGoalTarget?` toward ${c.savingsGoalTarget.name}`:''}, pay ${money(c.debtPayment)} toward ${c.targetDebt?.name||'debt'}, and limit flexible spending to ${money(c.safeToSpend)}. You have recorded ${money(c.expenseTotal)} of flexible expenses this cycle.`}
/* One entry point for every Dexx question. `scripted` is the built-in answer
   (used for quick questions, or when AI is unavailable). Free text goes to
   the AI when the keys are stamped. */
let dexxSession=[]; /* {role:'user'|'assistant',content} — this chat session only */
function dexxAsk(question,scripted){
  dexxAddBubble(question,'user');
  if(scripted!=null){dexxAddBubble(scripted,'dexx');return}
  if(!dexxAIReady()){dexxAddBubble(dexxScriptedAnswer(),'dexx');return}
  const thinking=dexxAddBubble('Dexx is thinking…','thinking');
  const messages=[...dexxSession,{role:'user',content:question}].slice(-12);
  const context=dexxSnapshotText(calc());
  fetch(`${FL_DEXX.url}/functions/v1/${FL_DEXX.fn}`,{method:'POST',
    headers:{'content-type':'application/json','apikey':FL_DEXX.anonKey,'authorization':'Bearer '+FL_DEXX.anonKey},
    body:JSON.stringify({messages,context})})
  .then(r=>r.json().then(d=>({ok:r.ok,d})))
  .then(({ok,d})=>{if(thinking)thinking.remove();if(!ok||!d||!d.reply)throw new Error('dexx-ai');const reply=dexxPlainText(d.reply);dexxSession.push({role:'user',content:question},{role:'assistant',content:reply});dexxAddBubble(reply,'ai')})
  .catch(()=>{if(thinking)thinking.remove();dexxAddBubble(dexxScriptedAnswer(),'dexx')});
}
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const text=$('chatInput').value.trim();if(!text)return;$('chatInput').value='';if(typeof dexxTryAction==='function'&&dexxTryAction(text))return;dexxAsk(text)});
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const type=b.dataset.action;if(type==='income'){show('budget');setTimeout(()=>$('paycheck').focus(),200);return}if(type==='expense'){show('expense');setTimeout(()=>{resetExpenseForm();$('expenseName')?.focus()},150);return}});

function openFinancialLab(destination='laboratory'){
  document.body.classList.remove('front-door-active');
  document.body.style.overflow='';
  show(destination);
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
}
function openFrontDoor(){
  document.body.classList.add('front-door-active');
  document.body.style.overflow='hidden';
  history.replaceState(null,'',location.pathname+location.search);
  const door=$('frontDoor');
  if(door&&typeof door.scrollTo==='function')door.scrollTo({top:0,left:0,behavior:'auto'});
}
$('enterLabBtn')?.addEventListener('click',e=>{e.preventDefault();openFinancialLab('laboratory')});
$('joinLabBtn')?.addEventListener('click',e=>{e.preventDefault();openFinancialLab('start')});
$('frontDoorBtn')?.addEventListener('click',e=>{e.preventDefault();openFrontDoor()});

$('setupMoneyForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const raw=$('setupCurrentBalance')?.value;
  if(raw===''||raw===null){$('setupMoneyStatus').textContent='Enter your available money. $0.00 is valid if that is what you have today.';return}
  data.currentBalance=clamp(raw,0,1e9);
  data.setup={...DEFAULTS.setup,...(data.setup||{}),skipped:{...DEFAULTS.setup.skipped,...(data.setup?.skipped||{})},currentMoneyConfirmed:true};
  setRecoveryContext('Guided setup: money today',`${money(data.currentBalance)} confirmed as money available today.`,'change');
  save();
  if($('setupMoneyStatus'))$('setupMoneyStatus').textContent=`Saved. Dexx knows ${money(data.currentBalance)} is available today.`;
});
$('setupIncomeForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const expected=clamp($('setupExpectedPaycheck')?.value,0,1e9),next=$('setupNextPayday')?.value||'';
  if(expected<=0){$('setupIncomeStatus').textContent='Enter the paycheck amount you expect next.';return}
  if(!next){$('setupIncomeStatus').textContent='Choose the date of your next payday.';return}
  const nextDate=dateAtNoon(next);if(!nextDate){$('setupIncomeStatus').textContent='Choose a valid next payday.';return}
  data.profile={...DEFAULTS.profile,...(data.profile||{}),payFrequency:$('setupPayFrequency')?.value||'weekly',incomePattern:$('setupIncomePattern')?.value||'variable'};
  data.setup={...DEFAULTS.setup,...(data.setup||{}),expectedPaycheck:expected,nextPayday:next,incomeConfirmed:true,skipped:{...DEFAULTS.setup.skipped,...(data.setup?.skipped||{})}};
  setRecoveryContext('Guided setup: income & payday',`${money(expected)} expected on ${dateText(next,{month:'short',day:'numeric',year:'numeric'})}.`,'change');
  save();
  if($('setupIncomeStatus'))$('setupIncomeStatus').textContent='Saved as setup information. Dexx will not treat this paycheck as landed or funded.';
});
document.addEventListener('click',e=>{
  const skip=e.target.closest('[data-setup-skip]');
  if(skip){
    const area=skip.dataset.setupSkip;
    data.setup={...DEFAULTS.setup,...(data.setup||{}),skipped:{...DEFAULTS.setup.skipped,...(data.setup?.skipped||{}),[area]:true}};
    setRecoveryContext(`Guided setup: skip ${area}`,`${area} setup skipped for now. It can be added later.`,'change');
    save();
    if($('setupFinalStatus'))$('setupFinalStatus').textContent=`${area[0].toUpperCase()+area.slice(1)} skipped for now. Dexx will keep recommending it until real information is added.`;
    return;
  }
  if(e.target.closest('#setupEnterLab')){
    const state=guidedSetupState();if(!state.requiredReady)return;
    data.setup={...DEFAULTS.setup,...(data.setup||{}),completedAt:data.setup?.completedAt||new Date().toISOString(),skipped:{...DEFAULTS.setup.skipped,...(data.setup?.skipped||{})}};
    save({skipRecovery:true,skipActivity:true});show('laboratory');return;
  }
  if(e.target.closest('#setupContinueRecommended')){
    const state=guidedSetupState();
    if(!state.requiredReady){$('setupMoneyForm')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    const next=['bills','debt','savings'].find(x=>!state.areas[x]);
    if(next==='bills'){show('profile');setTimeout(()=>$('billManagerForm')?.scrollIntoView({behavior:'smooth',block:'start'}),120)}else if(next==='debt'){show('credit');setTimeout(()=>$('debtManagerForm')?.scrollIntoView({behavior:'smooth',block:'start'}),120)}else if(next==='savings'){show('savings');setTimeout(()=>$('savingsGoalForm')?.scrollIntoView({behavior:'smooth',block:'start'}),120)}
  }
});

/* Smart Bill Calendar (v4.1.20.4): paid-toggle from the status card. */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-bill-toggle]');if(!t)return;
  toggleBillPaidOccurrence({parentId:t.dataset.parent,id:t.dataset.parent,occurrenceDate:t.dataset.date,date:t.dataset.date,name:'',amount:0});
});
/* Payday Continuity (v4.1.20.3): catch-up card interactions. */
document.addEventListener('click',e=>{
  const skipAll=e.target.closest('#catchupSkipAll');
  if(skipAll){
    const missed=missedCheckins();if(!missed.length)return;
    if(confirm(`Mark all ${missed.length} missed check-in${missed.length===1?'':'s'} as skipped?\n\nNo income will be counted for them.`))skipAllMissedCheckins();
    return;
  }
  const btn=e.target.closest('[data-catchup]');if(!btn)return;
  const row=e.target.closest('.catchup-row');if(!row)return;
  const payDate=row.dataset.paydate||'';
  const action=btn.dataset.catchup;
  if(action==='enter'||action==='cancel'){
    const form=row.querySelector('.catchup-form');if(!form)return;
    form.hidden=action==='cancel'?true:!form.hidden;
    if(!form.hidden){const input=form.querySelector('[data-catchup-amount]');if(input)setTimeout(()=>input.focus(),60)}
  }else if(action==='skip'){
    if(payDate&&confirm(`Skip the ${payDate} payday check-in?\n\nNo income will be counted for it.`))skipMissedCheckin(payDate);
  }else if(action==='confirm'){
    const input=row.querySelector('[data-catchup-amount]');const err=row.querySelector('[data-catchup-error]');
    const res=confirmMissedCheckin(payDate,input?input.value:'');
    if(!res.ok&&err){err.textContent=res.error;err.hidden=false}
  }
});

normalizeApprovedPlanFunding();
const initial=location.hash.slice(1);
const firstRun=!data.setup||!data.setup.currentMoneyConfirmed;
if(firstRun){openFrontDoor()}else{show(['laboratory','budget','profile','credit','savings','expense','reports','calendar','more','start','dexx','business'].includes(initial)?initial:'laboratory')}
render();initializePersistentMemory();

$('calendarPrev')?.addEventListener('click',()=>{const base=calendarCursor||new Date();calendarCursor=new Date(base.getFullYear(),base.getMonth()-1,1,12);renderCalendar(calc())});
$('calendarNext')?.addEventListener('click',()=>{const base=calendarCursor||new Date();calendarCursor=new Date(base.getFullYear(),base.getMonth()+1,1,12);renderCalendar(calc())});
$('profileForm')?.addEventListener('submit',e=>{e.preventDefault();data.researcherName=$('profileName').value.trim();data.profile={payFrequency:$('payFrequency').value,paydayDay:Number($('paydayDay').value),incomePattern:$('incomePattern').value,recurringBillCount:clamp($('recurringBillCount').value,0,99),financialStrategy:$('financialStrategy').value,reserveDays:clamp($('reserveDays').value,7,31)};data.savingsRate=clamp($('profileSavingsRate').value,0,100);save();$('profileStatus').textContent='Financial Profile saved. Dexx will use it for every payday plan.'});

/* 4.1.21.6 — Flow: journey spine bar mirrors the Money Journey state.
   The bar button proxies the real journey action, so all gate logic,
   navigation, and scroll behavior stay in exactly one place. */
function renderJourneyBar(c){
  const bar=$('journeyBar');if(!bar)return;
  const j=moneyJourneyState(c);const idx=j.steps.indexOf(j.current);
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('journeyBarStep',j.current?`STEP ${idx+1} OF ${j.steps.length} · YOUR MONEY JOURNEY`:'YOUR MONEY JOURNEY');
  set('journeyBarTitle',j.current?j.current.title:'Journey ready');
  const src=$('moneyJourneyAction'),btn=$('journeyBarAction');
  if(src&&btn){btn.textContent=src.textContent;btn.disabled=!!src.disabled;btn.style.display=src.disabled?'none':''}
}
{const jb=$('journeyBarAction');if(jb)jb.addEventListener('click',()=>{const a=$('moneyJourneyAction');if(a&&!a.disabled)a.click()});}

/* ───────────── Quick actions drawer (hamburger menu) ───────────── */
(function(){
  const drawer=document.getElementById('quickDrawer');if(!drawer)return;
  function openDrawer(){drawer.hidden=false;document.body.style.overflow='hidden';}
  function closeDrawer(){drawer.hidden=true;if(!document.body.classList.contains('front-door-active'))document.body.style.overflow='';}
  const menuBtn=document.getElementById('menuBtn');
  if(menuBtn)menuBtn.addEventListener('click',function(e){e.preventDefault();if(drawer.hidden){openDrawer();}else{closeDrawer();}});
  drawer.addEventListener('click',function(e){
    if(e.target.closest('[data-quick-close]')){closeDrawer();return;}
    if(e.target.closest('button'))closeDrawer();
  });
  const doorBtn=document.getElementById('drawerFrontDoorBtn');
  if(doorBtn)doorBtn.addEventListener('click',function(e){e.preventDefault();openFrontDoor();});
})();
