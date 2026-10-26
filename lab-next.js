/* Financial Lab 4.2.0.0 — Next-phase modules
   1. Notifications (bill alerts, payday check-ins, missed nudges, quarterly tax)
      — one alert a day max, never a dollar amount on the lock screen.
   2. Multiple incomes — primary income drives the journey, the rest pool in
      once you mark them received.
   3. Dexx Actions — tell Dexx a bill, expense, payment or invoice; a
      confirmation card shows the numbers and nothing saves until you tap.
   4. Photo intake — snap paperwork, Dexx classifies + extracts fields and
      routes them to a confirmation card. The photo is never stored.
   5. Business Lab — blue mode for LLC owners: invoices, business expenses,
      tax set-aside from every payment, quarterly reminders, owner pay.
   Loaded after app.js and reuses its globals (data, save, render, show, $,
   money, iso, dateAtNoon, dateText, clamp, setRecoveryContext …). */

const FLX_VERSION='4.2.0.0';
const flxId=p=>crypto.randomUUID?crypto.randomUUID():`${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const flxTodayIso=()=>iso(new Date());
const flxAddDays=(d,n)=>{const x=dateAtNoon(d);x.setDate(x.getDate()+n);return x};
const flxTitle=s=>String(s||'').trim().replace(/\s+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

function flxEnsureData(){
  if(!Array.isArray(data.incomes))data.incomes=[];
  data.incomes.forEach(i=>{i.amount=Math.max(0,Number(i.amount)||0);if(!Array.isArray(i.received))i.received=[]});
  /* Normalise IN PLACE so references held elsewhere never go stale. */
  if(!data.business||typeof data.business!=='object')data.business={};
  const b=data.business;
  b.mode=b.mode==='business'?'business':'personal';b.name=b.name||'';b.taxRate=Number.isFinite(Number(b.taxRate))?Number(b.taxRate):25;
  ['invoices','expenses','draws'].forEach(k=>{if(!Array.isArray(b[k]))b[k]=[]});
  if(!b.quarterlyPaid||typeof b.quarterlyPaid!=='object')b.quarterlyPaid={};
}

/* ───────────────────────── 2. MULTIPLE INCOMES ───────────────────────── */
const FLX_FREQ={weekly:'Weekly',biweekly:'Every 2 weeks',monthly:'Monthly',once:'One time'};
function flxIncomeOccurrences(inc,start,end){
  const base=dateAtNoon(inc.nextDate),s=dateAtNoon(start),e=dateAtNoon(end);if(!base||!s||!e)return [];
  const out=[];const f=inc.frequency||'monthly';
  if(f==='once'){if(base>=s&&base<e)out.push(iso(base));return out}
  const step=d=>{const x=new Date(d);if(f==='monthly')x.setMonth(x.getMonth()+1);else x.setDate(x.getDate()+(f==='biweekly'?14:7));return x};
  const back=d=>{const x=new Date(d);if(f==='monthly')x.setMonth(x.getMonth()-1);else x.setDate(x.getDate()-(f==='biweekly'?14:7));return x};
  let d=new Date(base);let guard=0;while(d>=s&&guard++<400)d=back(d);
  guard=0;while(d<e&&guard++<400){if(d>=s)out.push(iso(d));d=step(d)}
  return out;
}
function flxCycleWindow(){
  const start=dateAtNoon(data.payDate)||dateAtNoon(new Date());
  let end=dateAtNoon(data.nextPayday);
  if(!end||end<=start)end=flxAddDays(start,typeof payFrequencyDays==='function'?payFrequencyDays():7);
  return {start,end};
}
/* Called by paycheckPlan() in app.js: only RECEIVED secondary income pools in. */
function pooledIncomeForCycle(start,end){
  if(!Array.isArray(data.incomes))return 0;
  const s=dateAtNoon(start),e=dateAtNoon(end);if(!s||!e)return 0;
  let total=0;
  data.incomes.forEach(inc=>(inc.received||[]).forEach(r=>{const d=dateAtNoon(r.date);if(d&&d>=s&&d<e)total+=Number(r.amount)||0}));
  return Math.round(total*100)/100;
}
function flxIncomeFormHTML(scope){
  return `<form class="flx-income-form" data-income-form="${scope}">
    <input type="hidden" data-f="id"/>
    <div class="form-grid"><label>Income name<input data-f="name" placeholder="Side job, rental, benefits…" maxlength="40" data-testid="${scope}-income-name"/></label>
    <label>Amount each time<input data-f="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="$0.00" data-testid="${scope}-income-amount"/></label></div>
    <div class="form-grid"><label>How often<select data-f="frequency" data-testid="${scope}-income-frequency"><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly" selected>Monthly</option><option value="once">One time</option></select></label>
    <label>Next date<input data-f="nextDate" type="date" data-testid="${scope}-income-date"/></label></div>
    <button class="primary" type="submit" data-testid="${scope}-income-save">SAVE INCOME</button>
    <p class="status" data-income-status></p></form>
    <div class="flx-income-list" data-income-list="${scope}"></div>`;
}
function flxRenderIncomeLists(){
  document.querySelectorAll('[data-income-list]').forEach(host=>{
    const list=data.incomes||[];
    host.innerHTML=list.length?list.map(i=>`<div class="managed-bill flx-income-row" data-testid="income-row"><div class="managed-bill-main"><div><strong>${escapeHTML(i.name)}</strong><span>${FLX_FREQ[i.frequency]||'Monthly'} · next ${dateText(i.nextDate,{month:'short',day:'numeric'})}</span></div><b>${money(i.amount)}</b></div><div class="managed-bill-meta"><span>Pools into the primary journey when received</span><div><button type="button" data-income-edit="${i.id}">Edit</button><button type="button" data-income-delete="${i.id}" class="danger-link">Delete</button></div></div></div>`).join(''):'<p class="empty-copy">No additional incomes yet. Your primary paycheck drives the journey.</p>';
  });
  const setupBox=$('flxSetupIncomeBox');
  if(setupBox){const m=data.setup?.multipleIncomes;setupBox.hidden=m!==true;document.querySelectorAll('[data-multi-income]').forEach(b=>b.classList.toggle('active',String(m)===b.dataset.multiIncome))}
}
function flxRenderIncomeCycle(){
  const host=$('incomeCycleCard');if(!host)return;
  const list=data.incomes||[];
  if(!list.length){host.innerHTML=`<div class="section-head"><span>OTHER INCOME THIS CYCLE</span><button type="button" data-go="profile" data-flx-scroll="incomes">Add</button></div><p class="manager-copy">Have more than one income? Add it in your Financial Profile and Dexx will pool it into this journey when it lands.</p>`;return}
  const {start,end}=flxCycleWindow();
  const rows=[];list.forEach(inc=>flxIncomeOccurrences(inc,start,end).forEach(date=>{const r=(inc.received||[]).find(x=>x.date===date);rows.push({inc,date,r})}));
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  const pooled=pooledIncomeForCycle(start,end);
  host.innerHTML=`<div class="section-head"><span>OTHER INCOME THIS CYCLE</span><b data-testid="pooled-income-total">${money(pooled)} pooled</b></div>
  <p class="manager-copy">Your primary paycheck drives the journey. Mark other income received when it actually lands — only then does Dexx pool it into the plan.</p>
  ${rows.length?rows.map(x=>`<div class="flx-cycle-income ${x.r?'received':''}" data-testid="cycle-income-row"><div><strong>${escapeHTML(x.inc.name)}</strong><small>${x.r?'Received':'Expected'} ${dateText(x.date,{month:'short',day:'numeric'})}</small></div>${x.r?`<b>${money(x.r.amount)}</b><button type="button" class="secondary" data-income-unreceive="${x.inc.id}" data-date="${x.date}">Undo</button>`:`<input type="number" inputmode="decimal" min="0" step="0.01" value="${Number(x.inc.amount).toFixed(2)}" data-receive-amount aria-label="Amount received"/><button type="button" class="primary" data-income-receive="${x.inc.id}" data-date="${x.date}" data-testid="income-mark-received">RECEIVED</button>`}</div>`).join(''):'<p class="empty-copy">No other income expected before your next payday.</p>'}`;
}
document.addEventListener('submit',e=>{
  const form=e.target.closest('[data-income-form]');if(!form)return;e.preventDefault();
  const f=k=>form.querySelector(`[data-f="${k}"]`);const st=form.querySelector('[data-income-status]');
  const name=f('name').value.trim(),amount=clamp(f('amount').value,0,1e9),nextDate=f('nextDate').value,frequency=f('frequency').value,id=f('id').value;
  if(!name||amount<=0||!nextDate){st.textContent='Add the income name, amount, and next date.';return}
  flxEnsureData();const existing=id?data.incomes.find(i=>i.id===id):null;
  if(existing)Object.assign(existing,{name,amount,nextDate,frequency});else data.incomes.push({id:flxId('income'),name,amount,frequency,nextDate,received:[]});
  if(data.setup)data.setup.multipleIncomes=true;
  setRecoveryContext(existing?`Update income: ${name}`:`Add income: ${name}`,`${money(amount)} ${FLX_FREQ[frequency]||''} income; next ${dateText(nextDate,{month:'short',day:'numeric'})}.`,'change');
  save();form.reset();f('id').value='';st.textContent=existing?'Income updated.':`${name} saved. Dexx will pool it in when you mark it received.`;
});
document.addEventListener('click',e=>{
  const t=e.target;
  const multi=t.closest('[data-multi-income]');
  if(multi){data.setup={...(data.setup||{}),multipleIncomes:multi.dataset.multiIncome==='true'};save({skipRecovery:true,skipActivity:true});return}
  const del=t.closest('[data-income-delete]');
  if(del){const inc=data.incomes.find(i=>i.id===del.dataset.incomeDelete);if(!inc)return;if(!confirm(`Delete ${inc.name}?`))return;data.incomes=data.incomes.filter(i=>i!==inc);setRecoveryContext(`Delete income: ${inc.name}`,'Additional income removed.','change');save();return}
  const ed=t.closest('[data-income-edit]');
  if(ed){const inc=data.incomes.find(i=>i.id===ed.dataset.incomeEdit);const form=ed.closest('.card')?.querySelector('[data-income-form]');if(!inc||!form)return;const f=k=>form.querySelector(`[data-f="${k}"]`);f('id').value=inc.id;f('name').value=inc.name;f('amount').value=inc.amount;f('frequency').value=inc.frequency;f('nextDate').value=inc.nextDate;form.scrollIntoView({behavior:'smooth',block:'center'});return}
  const rec=t.closest('[data-income-receive]');
  if(rec){const inc=data.incomes.find(i=>i.id===rec.dataset.incomeReceive);if(!inc)return;const amt=clamp(rec.parentElement.querySelector('[data-receive-amount]')?.value,0,1e9);if(amt<=0)return;inc.received=(inc.received||[]).filter(r=>r.date!==rec.dataset.date);inc.received.push({date:rec.dataset.date,amount:amt});data.approvedPlan=null;setRecoveryContext(`Income received: ${inc.name}`,`${money(amt)} pooled into this payday journey.`,'change');save();return}
  const un=t.closest('[data-income-unreceive]');
  if(un){const inc=data.incomes.find(i=>i.id===un.dataset.incomeUnreceive);if(!inc)return;inc.received=(inc.received||[]).filter(r=>r.date!==un.dataset.date);data.approvedPlan=null;setRecoveryContext(`Income un-marked: ${inc.name}`,'Removed from this payday pool.','change');save();return}
  const sc=t.closest('[data-flx-scroll]');
  if(sc)setTimeout(()=>$('flxProfileIncomes')?.scrollIntoView({behavior:'smooth',block:'start'}),160);
});

/* ───────────────────────── 5. BUSINESS LAB ───────────────────────── */
const FLX_BIZ_CATS={supplies:'Supplies',software:'Software',equipment:'Equipment',travel:'Travel',meals:'Meals',marketing:'Marketing',contractors:'Contractors',fees:'Fees',other:'Other'};
function flxQuarters(year){
  /* IRS estimated-tax periods (US). due = payment date for that period. */
  return [
    {key:`${year}-Q1`,label:'Q1',from:`${year}-01-01`,to:`${year}-03-31`,due:`${year}-04-15`},
    {key:`${year}-Q2`,label:'Q2',from:`${year}-04-01`,to:`${year}-05-31`,due:`${year}-06-15`},
    {key:`${year}-Q3`,label:'Q3',from:`${year}-06-01`,to:`${year}-08-31`,due:`${year}-09-15`},
    {key:`${year}-Q4`,label:'Q4',from:`${year}-09-01`,to:`${year}-12-31`,due:`${year+1}-01-15`}];
}
function flxBizState(){
  flxEnsureData();const b=data.business,today=flxTodayIso(),year=new Date().getFullYear();
  const inYear=d=>String(d||'').startsWith(String(year));
  const paid=b.invoices.filter(i=>i.status==='paid');
  const received=paid.reduce((s,i)=>s+Number(i.received||i.amount||0),0);
  const taxAside=paid.reduce((s,i)=>s+Number(i.taxSetAside||0),0);
  const expenses=b.expenses.reduce((s,x)=>s+Number(x.amount||0),0);
  const draws=b.draws.reduce((s,x)=>s+Number(x.amount||0),0);
  const taxPaid=Object.values(b.quarterlyPaid).reduce((s,q)=>s+Number(q.amount||0),0);
  const open=b.invoices.filter(i=>i.status!=='paid');
  const overdue=open.filter(i=>i.dueDate&&i.dueDate<today);
  const quarters=[...flxQuarters(year-1),...flxQuarters(year)].map(q=>({...q,setAside:paid.filter(i=>i.paidDate>=q.from&&i.paidDate<=q.to).reduce((s,i)=>s+Number(i.taxSetAside||0),0),paid:b.quarterlyPaid[q.key]||null}));
  const nextQ=quarters.find(q=>q.due>=today&&!q.paid)||quarters[quarters.length-1];
  return {b,received,receivedYTD:paid.filter(i=>inYear(i.paidDate)).reduce((s,i)=>s+Number(i.received||i.amount||0),0),taxAside,taxPaid,taxReserve:Math.max(0,taxAside-taxPaid),expenses,expensesYTD:b.expenses.filter(x=>inYear(x.date)).reduce((s,x)=>s+Number(x.amount||0),0),draws,cash:received-taxAside-expenses-draws,open,openTotal:open.reduce((s,i)=>s+Number(i.amount||0),0),overdue,quarters,nextQ};
}
function flxApplyMode(){
  flxEnsureData();const biz=data.business.mode==='business';
  document.body.classList.toggle('business-mode',biz);
  const first=document.querySelector('.bottom-nav button');
  if(first){first.dataset.go=biz?'business':'laboratory';const sp=first.querySelector('span');if(sp)sp.textContent=biz?'Business':'Today'}
  document.querySelectorAll('[data-lab-mode]').forEach(x=>x.classList.toggle('active',x.dataset.labMode===data.business.mode));
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=biz?'#04070d':'#050807';
  /* Business Dexx: suit + shades everywhere he appears (FAB, chat header, hero, observation). */
  document.querySelectorAll('img').forEach(img=>{const src=img.getAttribute('src')||'';if(/dexx-character-(clean|business)\.jpg/.test(src)){const want=biz?'dexx-character-business.jpg':'dexx-character-clean.jpg';if(src!==want)img.setAttribute('src',want)}});
  const sub=document.querySelector('.dexx-header p');if(sub)sub.textContent=biz?'Your Business Partner':'Your Financial Scientist';
  const fab=$('dexxFab');if(fab)fab.setAttribute('aria-label',biz?'Ask Business Dexx':'Ask Dexx');
  const ci=$('chatInput');if(ci)ci.placeholder=biz?'Ask Dexx or tell him an invoice, expense…':'Ask Dexx or tell him a bill, expense…';
  const hint=document.querySelector('.flx-chat-hint');if(hint)hint.textContent=biz?'Tip: tell Dexx “invoice Acme $2000 due Nov 30” or “spent $60 on printer ink” — or snap a receipt or invoice.':'Tip: tell Dexx “Netflix bill $15.99 due the 20th” or “spent $42 on groceries” — or snap a pay stub, statement, receipt, or late notice.';
  if(flxApplyMode._last!==undefined&&flxApplyMode._last!==biz&&$('dexxHistory'))dexxAddBubble(biz?'Suit on, shades on. 😎 Business Dexx here — let’s talk invoices, cash flow, and what to set aside for taxes.':'Lab coat back on. 🧪 Back to your personal paycheck plan.','ai');
  flxApplyMode._last=biz;
}
/* Business-mode fallback answer when the AI is unreachable. */
const flxBaseScripted=dexxScriptedAnswer;
dexxScriptedAnswer=function(){
  if(data.business?.mode!=='business')return flxBaseScripted();
  const s=flxBizState();
  return `Business check: ${money(s.cash)} in business cash after taxes, expenses and owner pay. You have ${money(s.taxReserve)} set aside for taxes, and ${s.nextQ.label} estimated tax is due ${dateText(s.nextQ.due,{month:'short',day:'numeric'})}. ${s.open.length?`${s.open.length} invoice${s.open.length===1?'':'s'} open for ${money(s.openTotal)}${s.overdue.length?` — ${s.overdue.length} overdue, follow up today`:''}.`:'No open invoices — time to bill your next client.'}`;
};
function flxSetMode(mode){flxEnsureData();data.business.mode=mode;save({skipRecovery:true,skipActivity:true});flxApplyMode();show(mode==='business'?'business':'laboratory')}
function flxRenderBusiness(){
  const host=$('businessBody');if(!host)return;
  const s=flxBizState(),b=s.b;
  $('bizName')&&($('bizName').value===''&&($('bizName').value=b.name));
  if($('bizTaxRate')&&document.activeElement!==$('bizTaxRate'))$('bizTaxRate').value=b.taxRate;
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('bizCash',money(s.cash));set('bizTaxReserve',money(s.taxReserve));set('bizOpen',money(s.openTotal));set('bizDraws',money(s.draws));
  set('bizOpenNote',s.overdue.length?`${s.overdue.length} overdue`:`${s.open.length} open`);
  const q=s.nextQ;
  set('bizQuarterLabel',`${q.label} estimated tax · due ${dateText(q.due,{month:'short',day:'numeric',year:'numeric'})}`);
  set('bizQuarterAmount',money(q.setAside));
  const days=Math.round((dateAtNoon(q.due)-dateAtNoon(new Date()))/86400000);
  set('bizQuarterNote',q.paid?`Marked paid ${dateText(q.paid.date,{month:'short',day:'numeric'})}.`:days>=0?`${days} day${days===1?'':'s'} away. Set aside from ${q.label} payments: ${money(q.setAside)}.`:'Past due — pay it as soon as you can.');
  const qa=$('bizQuarterPaidAmount');if(qa&&document.activeElement!==qa){qa.value=q.setAside.toFixed(2);qa.hidden=!!q.paid}const qb=$('bizQuarterPaid');if(qb){qb.dataset.q=q.key;qb.disabled=!!q.paid;qb.textContent=q.paid?'QUARTER PAID ✓':'MARK QUARTER PAID'}
  const inv=[...b.invoices].sort((a,c)=>(a.status==='paid')-(c.status==='paid')||String(a.dueDate).localeCompare(String(c.dueDate)));
  $('bizInvoiceList').innerHTML=inv.length?inv.map(i=>{const late=i.status!=='paid'&&i.dueDate&&i.dueDate<flxTodayIso();return `<div class="managed-bill flx-invoice ${i.status} ${late?'late':''}" data-testid="invoice-row"><div class="managed-bill-main"><div><strong>${escapeHTML(i.client)}</strong><span>${i.status==='paid'?`Paid ${dateText(i.paidDate,{month:'short',day:'numeric'})} · ${money(i.taxSetAside)} set aside for tax`:`${late?'Overdue · ':''}Due ${dateText(i.dueDate,{month:'short',day:'numeric'})}`}</span></div><b>${money(i.status==='paid'?i.received:i.amount)}</b></div><div class="managed-bill-meta"><span>${i.note?escapeHTML(i.note):'Invoice'}</span><div>${i.status==='paid'?`<button type="button" data-inv-unpay="${i.id}">Undo paid</button>`:`<input class="flx-inline-amt" type="number" inputmode="decimal" min="0" step="0.01" value="${Number(i.amount).toFixed(2)}" data-inv-amt aria-label="Amount received"/><button type="button" data-inv-pay="${i.id}" data-testid="invoice-mark-paid">Mark paid</button>`}<button type="button" class="danger-link" data-inv-delete="${i.id}">Delete</button></div></div></div>`}).join(''):'<p class="empty-copy">No invoices yet. Add one above — Dexx sets aside tax the moment it is paid.</p>';
  const ex=[...b.expenses].sort((a,c)=>String(c.date).localeCompare(String(a.date))).slice(0,25);
  $('bizExpenseList').innerHTML=ex.length?ex.map(x=>`<div class="managed-bill" data-testid="biz-expense-row"><div class="managed-bill-main"><div><strong>${escapeHTML(x.name)}</strong><span>${FLX_BIZ_CATS[x.category]||'Other'} · ${dateText(x.date,{month:'short',day:'numeric'})}</span></div><b>${money(x.amount)}</b></div><div class="managed-bill-meta"><span>Business — not in your personal spending</span><div><button type="button" class="danger-link" data-bizexp-delete="${x.id}">Delete</button></div></div></div>`).join(''):'<p class="empty-copy">No business expenses yet. Snap a receipt with Dexx or add one above.</p>';
  set('bizExpenseYTD',`${money(s.expensesYTD)} this year`);
  const dr=[...b.draws].sort((a,c)=>String(c.date).localeCompare(String(a.date))).slice(0,10);
  $('bizDrawList').innerHTML=dr.length?dr.map(x=>`<div class="flx-cycle-income received"><div><strong>Owner pay</strong><small>${dateText(x.date,{month:'short',day:'numeric'})}${x.pooled?' · pooled into personal':''}</small></div><b>${money(x.amount)}</b></div>`).join(''):'';
}
function flxAddInvoice({client,amount,dueDate,issued,note}){
  flxEnsureData();const rec={id:flxId('invoice'),client:client||'Client',amount:clamp(amount,0,1e9),issued:issued||flxTodayIso(),dueDate:dueDate||iso(flxAddDays(new Date(),30)),status:'open',note:note||''};
  data.business.invoices.push(rec);setRecoveryContext(`Add invoice: ${rec.client}`,`${money(rec.amount)} invoice due ${dateText(rec.dueDate,{month:'short',day:'numeric'})}.`,'change');save();return rec;
}
function flxPayInvoice(inv,amount,date){
  const rate=clamp(data.business.taxRate,0,60)/100;const amt=clamp(amount||inv.amount,0,1e9);
  Object.assign(inv,{status:'paid',received:amt,paidDate:date||flxTodayIso(),taxSetAside:Math.round(amt*rate*100)/100});
  setRecoveryContext(`Invoice paid: ${inv.client}`,`${money(amt)} received; ${money(inv.taxSetAside)} set aside for taxes.`,'change');save();
}
function flxAddBizExpense({name,amount,date,category}){
  flxEnsureData();const rec={id:flxId('bizexp'),name:name||'Business expense',amount:clamp(amount,0,1e9),date:date||flxTodayIso(),category:FLX_BIZ_CATS[category]?category:'other'};
  data.business.expenses.push(rec);setRecoveryContext(`Business expense: ${rec.name}`,`${money(rec.amount)} recorded as a business expense.`,'expense');save();return rec;
}
document.addEventListener('submit',e=>{
  const id=e.target.id;
  if(id==='bizInvoiceForm'){e.preventDefault();const client=$('bizInvClient').value.trim(),amount=clamp($('bizInvAmount').value,0,1e9),dueDate=$('bizInvDue').value;if(!client||amount<=0||!dueDate){$('bizInvStatus').textContent='Add the client, amount, and due date.';return}flxAddInvoice({client,amount,dueDate,note:$('bizInvNote').value.trim(),repeat:!!$('bizInvRepeat')?.checked,email:($('bizInvEmail')?.value||'').trim()});e.target.reset();$('bizInvStatus').textContent='Invoice saved. Mark it paid when the money lands.'}
  if(id==='bizExpenseForm'){e.preventDefault();const name=$('bizExpName').value.trim(),amount=clamp($('bizExpAmount').value,0,1e9),date=$('bizExpDate').value||flxTodayIso();if(!name||amount<=0){$('bizExpStatus').textContent='Add the expense name, amount, and date.';return}flxAddBizExpense({name,amount,date,category:$('bizExpCategory').value});e.target.reset();$('bizExpStatus').textContent='Business expense saved — kept separate from personal spending.'}
  if(id==='bizDrawForm'){e.preventDefault();const amount=clamp($('bizDrawAmount').value,0,1e9),date=$('bizDrawDate').value||flxTodayIso();if(amount<=0){$('bizDrawStatus').textContent='Enter how much you paid yourself.';return}const pool=$('bizDrawPool').checked;flxEnsureData();const avail=flxBizState().cash;if(amount>avail&&!e.target.dataset.confirmOver){e.target.dataset.confirmOver='1';$('bizDrawStatus').textContent=`Heads up: that's more than the ${money(Math.max(0,avail))} of business cash left after taxes. Tap RECORD again to confirm.`;return}delete e.target.dataset.confirmOver;data.business.draws.push({id:flxId('draw'),amount,date,pooled:pool});if(pool){data.incomes.push({id:flxId('income'),name:`Owner pay${data.business.name?' — '+data.business.name:''}`,amount,frequency:'once',nextDate:date,received:[{date,amount}]});data.approvedPlan=null}setRecoveryContext('Owner pay',`${money(amount)} moved from business to personal${pool?' and pooled into this payday':''}.`,'change');save();e.target.reset();$('bizDrawStatus').textContent=pool?'Owner pay recorded and pooled into your personal payday.':'Owner pay recorded.'}
  if(id==='bizSettingsForm'){e.preventDefault();flxEnsureData();data.business.name=$('bizName').value.trim();data.business.taxRate=clamp($('bizTaxRate').value,0,60);setRecoveryContext('Business settings',`Tax set-aside rate ${data.business.taxRate}%.`,'change');save();$('bizSettingsStatus').textContent=`Saved. Dexx sets aside ${data.business.taxRate}% of every payment.`}
});
document.addEventListener('click',e=>{
  const t=e.target;
  const mode=t.closest('[data-lab-mode]');if(mode){flxSetMode(mode.dataset.labMode);return}
  const pay=t.closest('[data-inv-pay]');
  if(pay){const inv=data.business.invoices.find(i=>i.id===pay.dataset.invPay);if(!inv)return;const amt=clamp(pay.parentElement.querySelector('[data-inv-amt]')?.value,0,1e9);if(amt<=0)return;flxPayInvoice(inv,amt);return}
  const unpay=t.closest('[data-inv-unpay]');
  if(unpay){const inv=data.business.invoices.find(i=>i.id===unpay.dataset.invUnpay);if(!inv)return;Object.assign(inv,{status:'open',received:0,paidDate:'',taxSetAside:0});setRecoveryContext(`Invoice reopened: ${inv.client}`,'Marked unpaid again.','change');save();return}
  const del=t.closest('[data-inv-delete]');
  if(del){const inv=data.business.invoices.find(i=>i.id===del.dataset.invDelete);if(!inv||!confirm(`Delete invoice for ${inv.client}?`))return;data.business.invoices=data.business.invoices.filter(i=>i!==inv);setRecoveryContext(`Delete invoice: ${inv.client}`,'Invoice removed.','change');save();return}
  const dx=t.closest('[data-bizexp-delete]');
  if(dx){const x=data.business.expenses.find(i=>i.id===dx.dataset.bizexpDelete);if(!x||!confirm(`Delete ${x.name}?`))return;data.business.expenses=data.business.expenses.filter(i=>i!==x);setRecoveryContext(`Delete business expense: ${x.name}`,'Removed.','change');save();return}
  const qp=t.closest('#bizQuarterPaid');
  if(qp&&qp.dataset.q){const s=flxBizState(),q=s.quarters.find(x=>x.key===qp.dataset.q);if(!q)return;const v=clamp($('bizQuarterPaidAmount')?.value,0,1e9);data.business.quarterlyPaid[q.key]={date:flxTodayIso(),amount:v};setRecoveryContext(`${q.label} estimated tax paid`,`${money(v)} recorded.`,'change');save();return}
});

/* ───────────────────────── 3. DEXX ACTIONS ───────────────────────── */
const FLX_MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const FLX_CATS=[['gas',/\b(gas|fuel|shell|exxon|chevron|sunoco|wawa|sheetz)\b/],['groceries',/\b(grocer\w*|walmart|kroger|aldi|publix|costco|food lion|safeway|heb|wegmans|trader joe)/],['food',/\b(lunch|dinner|breakfast|restaurant|mcdonald\w*|chick|pizza|coffee|starbucks|taco|burger|doordash|uber eats|wings|subway|wendy\w*)\b/],['entertainment',/\b(movie\w*|netflix|game\w*|concert|show|spotify|tickets?|hulu)\b/],['haircut',/\b(haircut|barber|salon|braids)\b/],['shopping',/\b(amazon|target|clothes|shoes|shopping|mall|nike)\b/],['transportation',/\b(uber|lyft|bus|train|parking|toll|car wash|metro)\b/],['medical',/\b(doctor|pharmacy|cvs|walgreens|medicine|dentist|hospital|copay|prescription)\b/],['personal',/\b(gift|toiletries|personal)\b/]];
function flxParseDate(text,{future=false}={}){
  const t=text.toLowerCase(),today=dateAtNoon(new Date());
  if(/\btoday\b|\btonight\b|\bthis morning\b/.test(t))return {date:iso(today),raw:/\btoday\b|\btonight\b|\bthis morning\b/};
  if(/\byesterday\b/.test(t))return {date:iso(flxAddDays(today,-1)),raw:/\byesterday\b/};
  if(/\btomorrow\b/.test(t))return {date:iso(flxAddDays(today,1)),raw:/\btomorrow\b/};
  let m=t.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if(m){let y=m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):today.getFullYear();let d=new Date(y,Number(m[1])-1,Number(m[2]),12);if(!m[3]&&future&&d<today)d.setFullYear(y+1);if(!Number.isNaN(d.getTime()))return {date:iso(d),raw:m[0]}}
  m=t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/);
  if(m){const mi=FLX_MONTHS.indexOf(m[1].slice(0,3));let y=m[3]?Number(m[3]):today.getFullYear();let d=new Date(y,mi,Number(m[2]),12);if(!m[3]&&future&&d<today)d.setFullYear(y+1);return {date:iso(d),raw:m[0]}}
  m=t.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b|\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if(m){const day=Number(m[1]||m[2]);let d=new Date(today.getFullYear(),today.getMonth(),day,12);if(future&&d<today)d.setMonth(d.getMonth()+1);if(!future&&d>today)d.setMonth(d.getMonth()-1);if(day>=1&&day<=31)return {date:iso(d),raw:m[0]}}
  const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  m=t.match(/\b(?:on\s+|next\s+|last\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if(m){const target=days.indexOf(m[1]);let d=new Date(today);const diff=(target-d.getDay()+7)%7;if(future||/next|this/.test(m[0]))d.setDate(d.getDate()+(diff||7));else d.setDate(d.getDate()-((7-diff)%7||7));return {date:iso(d),raw:m[0]}}
  return {date:'',raw:null};
}
function flxParseAmount(text){
  const direct=String(text).match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  if(direct)return Math.round((Number(direct[1].replace(/,/g,''))||0)*100)/100;
  let t=text.replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g,' ').replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi,' ').replace(/\b(19|20)\d{2}\b/g,' ');
  let m=t.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/)||t.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\s?(?:dollars|bucks|usd)\b/i)||t.match(/\b(\d[\d,]*\.\d{2})\b/)||t.match(/\b(\d[\d,]*)\b/);
  if(!m)return 0;return Math.round((Number(m[1].replace(/,/g,''))||0)*100)/100;
}
function flxMatchRecord(text,list,key='name'){
  const t=text.toLowerCase();let best=null,score=0;
  (list||[]).forEach(r=>{const n=String(r[key]||'').toLowerCase().trim();if(!n)return;if(t.includes(n)&&n.length>score){best=r;score=n.length;return}const w=n.split(/\s+/).find(w=>w.length>3&&new RegExp(`\\b${w.replace(/[^\w]/g,'')}\\b`).test(t));if(w&&w.length>score){best=r;score=w.length}});
  return best;
}
function flxCleanName(text,remove){
  let t=' '+text.toLowerCase()+' ';
  remove.forEach(r=>{if(r)t=t.replace(r,' ')});
  t=t.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\b/g,' ')
   .replace(/\b(add|added|new|a|an|my|the|is|it's|its|bill|bills|due|on|of|for|each|every|month|monthly|weekly|week|biweekly|two|2|weeks|per|subscription|dexx|please|i|have|got|need|to|track|set|up|one|time|once|dollars|bucks|that|and|at|by|recurring|payment|invoice|invoiced|sent|send|business|expense|client|net|30|15|60)\b/g,' ')
   .replace(/[^a-z0-9&' .-]/g,' ').replace(/\s+/g,' ').trim();
  return flxTitle(t).slice(0,40);
}
function flxDetectAction(text){
  const raw=text.trim(),t=raw.toLowerCase();
  if(!raw||raw.length>220)return null;
  if(/\?\s*$/.test(raw)||/^(what|how|why|when|can|could|should|is|am|are|do|does|will|would|which|where|who|tell me|explain|help)\b/.test(t))return null;
  const amount=flxParseAmount(raw);
  const biz=data.business?.mode==='business';
  if(/\b(invoice|invoiced|billed (?:a )?client)\b/.test(t)){
    const d=flxParseDate(raw,{future:true});const clientM=raw.match(/\b(?:to|for)\s+([A-Z][\w&'.\-]*(?:\s+[A-Z][\w&'.\-]*){0,3})/);
    return {type:'invoice',amount,client:clientM?clientM[1]:flxCleanName(raw,[d.raw]),dueDate:d.date||iso(flxAddDays(new Date(),30))};
  }
  const isPaidFor=/\b(paid for|spent|spend|bought|buy|purchased?|picked up|grabbed|cost me|expense)\b/.test(t);
  const isPayment=!isPaidFor&&/\b(paid|pay off|made (?:a )?payment|payment (?:to|on|for)|sent .* to)\b/.test(t)&&!/\b(payday|paycheck|got paid)\b/.test(t);
  const isBill=/\b(bill|due|subscription|every month|monthly|per month|a month|each month|weekly bill|recurring)\b/.test(t)&&!isPaidFor;
  if(!amount&&!isPayment&&!/\b(add|track|log|record)\b/.test(t))return null;
  if(isPayment){
    const debt=flxMatchRecord(raw,data.debts),bill=flxMatchRecord(raw,data.bills);
    const d=flxParseDate(raw);
    if(debt&&(!bill||/\b(card|loan|debt|balance)\b/.test(t)))return {type:'debt-payment',amount,targetId:debt.id,date:d.date||flxTodayIso()};
    if(bill)return {type:'bill-payment',amount:amount||Number(bill.amount)||0,targetId:bill.id,date:d.date||flxTodayIso()};
    if(!amount)return null;
  }
  if(isPayment||isPaidFor||amount){
  if(isBill){
    const d=flxParseDate(raw,{future:true});
    const frequency=/\b(weekly|every week|each week)\b/.test(t)?'weekly':/\b(biweekly|every (?:2|two) weeks)\b/.test(t)?'biweekly':/\b(one[- ]time|once)\b/.test(t)?'once':'monthly';
    const existing=flxMatchRecord(raw,data.bills);
    return {type:'bill',amount,name:existing?existing.name:(flxCleanName(raw,[d.raw])||'Bill'),dueDate:d.date,frequency:existing?.frequency||frequency,priority:existing?.priority||(/\b(rent|mortgage|electric|power|water|insurance|car note|phone)\b/.test(t)?'essential':'important'),existingId:existing?.id||''};
  }
    if(!isPaidFor&&!isPayment&&!/\b(add|log|record|track)\b/.test(t))return null;
    if(/\b(to|into) (my )?savings\b/.test(t))return null;
    const d=flxParseDate(raw);
    const stop=/\s+(?:today|yesterday|tonight|tomorrow|on|at|for|from|this|last|with)\b.*$/i;
    const nameM=raw.match(/\b(?:at|from)\s+([A-Za-z][\w'&.\-]*(?:\s+[A-Za-z][\w'&.\-]*){0,2})/)||raw.match(/\b(?:on|for)\s+(?!the\b|my\b)([A-Za-z][\w'&.\-]*(?:\s+[A-Za-z][\w'&.\-]*){0,2})/);
    let name=nameM?flxTitle(nameM[1].replace(stop,'').replace(/\b(today|yesterday|tonight|the|my)\b/gi,'').trim()):'';
    const cat=(FLX_CATS.find(([,re])=>re.test(t))||['other'])[0];
    if(!name)name=cat==='other'?'Expense':expenseCategoryLabel(cat);
    if(biz||/\b(business|for the business|llc|client)\b/.test(t))return {type:'biz-expense',amount,name,date:d.date||flxTodayIso(),category:/\b(software|app|subscription)\b/.test(t)?'software':/\b(gas|travel|flight|hotel|uber)\b/.test(t)?'travel':/\b(lunch|dinner|meal)\b/.test(t)?'meals':'supplies'};
    return {type:'expense',amount,name,category:cat,date:d.date||flxTodayIso()};
  }
  return null;
}
const FLX_TYPE_LABEL={bill:'Recurring bill','bill-payment':'Bill payment','debt-payment':'Debt payment',expense:'Personal expense','biz-expense':'Business expense',invoice:'Invoice',paycheck:'Paycheck'};
function flxField(label,key,value,type='text',extra=''){return `<label>${label}<input data-k="${key}" type="${type}" ${type==='number'?'inputmode="decimal" min="0" step="0.01"':''} value="${escapeHTML(value??'')}" ${extra} data-testid="action-field-${key}"/></label>`}
function flxSelect(label,key,value,opts){return `<label>${label}<select data-k="${key}" data-testid="action-field-${key}">${Object.entries(opts).map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${escapeHTML(l)}</option>`).join('')}</select></label>`}
function flxCardFields(a){
  const amt=a.amount?Number(a.amount).toFixed(2):'';
  if(a.type==='bill')return flxField('Bill name','name',a.name)+flxField('Amount','amount',amt,'number')+flxField('Next due date','dueDate',a.dueDate,'date')+flxSelect('How often','frequency',a.frequency||'monthly',{monthly:'Monthly',weekly:'Weekly',biweekly:'Every 2 weeks',once:'One time'})+flxSelect('Priority','priority',a.priority||'important',{essential:'Essential',important:'Important',flexible:'Flexible'})+(a.existingId?'<p class="flx-note">Already tracked — saving updates its amount and next due date.</p>':'')+(a.note?`<p class="flx-note">${escapeHTML(a.note)}</p>`:'');
  if(a.type==='expense')return flxField('What','name',a.name)+flxField('Amount','amount',amt,'number')+flxSelect('Category','category',a.category||'other',{gas:'Gas',groceries:'Groceries',food:'Food & dining',entertainment:'Entertainment',personal:'Personal',haircut:'Haircut',shopping:'Shopping',transportation:'Transportation',medical:'Medical',other:'Other'})+flxField('Date','date',a.date,'date');
  if(a.type==='biz-expense')return flxField('What','name',a.name)+flxField('Amount','amount',amt,'number')+flxSelect('Category','category',a.category||'supplies',FLX_BIZ_CATS)+flxField('Date','date',a.date,'date');
  if(a.type==='bill-payment')return flxSelect('Bill','targetId',a.targetId,Object.fromEntries((data.bills||[]).map(b=>[b.id,b.name])))+flxField('Amount paid','amount',amt,'number')+flxField('Date paid','date',a.date,'date')+'<p class="flx-note">Marks the closest unpaid due date for this bill as paid.</p>';
  if(a.type==='debt-payment')return flxSelect('Debt','targetId',a.targetId,Object.fromEntries((data.debts||[]).map(d=>[d.id,`${d.name} · ${money(d.balance)}`])))+flxField('Amount paid','amount',amt,'number')+flxField('Date paid','date',a.date,'date')+'<p class="flx-note">Lowers the balance Dexx tracks for this debt.</p>';
  if(a.type==='invoice')return flxField('Client','client',a.client)+flxField('Amount','amount',amt,'number')+flxField('Due date','dueDate',a.dueDate,'date');
  if(a.type==='paycheck')return flxField('Take-home pay','amount',amt,'number')+flxField('Pay date','date',a.date,'date')+(a.note?`<p class="flx-note">${escapeHTML(a.note)}</p>`:'')+'<p class="flx-note">Fills your Payday check — you still review and build the plan.</p>';
  return '';
}
function flxTypeOptions(a){
  const types=['bill','expense'];if((data.bills||[]).length)types.push('bill-payment');if((data.debts||[]).length)types.push('debt-payment');types.push('biz-expense','invoice');if(a.type==='paycheck')types.unshift('paycheck');
  return Object.fromEntries(types.map(t=>[t,FLX_TYPE_LABEL[t]]));
}
function flxShowActionCard(action,intro){
  const host=$('dexxHistory');if(!host)return;
  if(intro)dexxAddBubble(intro,'ai');
  const card=document.createElement('div');card.className='bubble flx-action-card';card.dataset.testid='dexx-action-card';card.setAttribute('data-testid','dexx-action-card');
  card._action={...action};
  const paint=()=>{const a=card._action;card.innerHTML=`<div class="flx-card-head"><span>CONFIRM BEFORE SAVING</span>${flxSelect('','type',a.type,flxTypeOptions(a)).replace('<label>','<label class="flx-type">')}</div><div class="flx-card-fields">${flxCardFields(a)}</div><div class="flx-card-actions"><button type="button" class="primary" data-flx-confirm data-testid="action-card-save">SAVE</button><button type="button" class="secondary" data-flx-cancel data-testid="action-card-cancel">CANCEL</button></div><p class="flx-card-error" data-flx-error></p>`};
  paint();card._paint=paint;host.appendChild(card);card.scrollIntoView({block:'end'});
}
function flxReadCard(card){const a={...card._action};card.querySelectorAll('[data-k]').forEach(el=>{if(el.dataset.k!=='type')a[el.dataset.k]=el.value});a.amount=clamp(a.amount,0,1e9);return a}
function flxExecuteAction(a){
  if(a.type!=='bill-payment'&&a.amount<=0)return 'Enter the amount.';
  if(a.type==='bill'){
    if(!a.name||!a.dueDate)return 'Add the bill name and next due date.';
    const existing=a.existingId?data.bills.find(b=>b.id===a.existingId):null;
    if(existing){const prior=existing.dueDate||existing.date;if(prior!==a.dueDate)clearReserveForBill(existing.id);Object.assign(existing,{name:a.name,amount:a.amount,dueDate:a.dueDate,date:a.dueDate,frequency:a.frequency,priority:a.priority})}
    else{data.bills.push({id:flxId('bill'),name:a.name,amount:a.amount,dueDate:a.dueDate,date:a.dueDate,priority:a.priority,frequency:a.frequency,autopay:false,paidOccurrences:[]});if(data.bills.length>Number(data.profile?.recurringBillCount||0))data.profile.recurringBillCount=data.bills.length}
    data.missions.bills=true;data.approvedPlan=null;setRecoveryContext(`Dexx ${existing?'updated':'added'} bill: ${a.name}`,`${money(a.amount)} ${a.frequency}; next due ${dateText(a.dueDate,{month:'short',day:'numeric'})}.`,'bill');save();
    return `Saved. ${a.name} (${money(a.amount)}) is in your bills, next due ${dateText(a.dueDate,{month:'short',day:'numeric'})}.`;
  }
  if(a.type==='expense'){
    if(!a.name||!a.date)return 'Add what it was and the date.';
    data.expenseRecords.push({id:flxId('expense'),name:a.name,amount:a.amount,category:a.category||'other',date:a.date,note:'Added by Dexx',cycleId:cycleIdForExpenseDate(a.date,'')});
    setRecoveryContext(`Dexx added expense: ${a.name}`,`${money(a.amount)} ${a.category} expense on ${dateText(a.date,{month:'short',day:'numeric'})}.`,'expense');save();
    return `Saved. ${money(a.amount)} for ${a.name}. TRUE Safe-to-Spend is now ${money(calc().safeToSpend)}.`;
  }
  if(a.type==='biz-expense'){if(!a.name)return 'Add what it was.';flxAddBizExpense(a);return `Saved as a business expense: ${a.name}, ${money(a.amount)}. It stays out of your personal spending.`}
  if(a.type==='invoice'){if(!a.client||!a.dueDate)return 'Add the client and due date.';flxAddInvoice(a);return `Invoice saved: ${a.client}, ${money(a.amount)}, due ${dateText(a.dueDate,{month:'short',day:'numeric'})}.`}
  if(a.type==='bill-payment'){
    const bill=data.bills.find(b=>b.id===a.targetId);if(!bill)return 'Pick the bill you paid.';
    const ref=dateAtNoon(a.date)||dateAtNoon(new Date());
    const occ=billOccurrences(flxAddDays(ref,-60),flxAddDays(ref,45)).filter(o=>(o.parentId||o.id)===bill.id&&!o.paid).sort((x,y)=>Math.abs(dateAtNoon(x.occurrenceDate||x.date)-ref)-Math.abs(dateAtNoon(y.occurrenceDate||y.date)-ref))[0];
    if(!occ)return `${bill.name} has no unpaid due date near then.`;
    toggleBillPaidOccurrence(occ);
    return `Marked ${bill.name} paid for ${dateText(occ.occurrenceDate||occ.date,{month:'short',day:'numeric'})}.`;
  }
  if(a.type==='debt-payment'){
    const debt=data.debts.find(d=>d.id===a.targetId);if(!debt)return 'Pick the debt you paid.';
    debt.balance=Math.max(0,Math.round((Number(debt.balance)-a.amount)*100)/100);
    setRecoveryContext(`Dexx debt payment: ${debt.name}`,`${money(a.amount)} paid; balance now ${money(debt.balance)}.`,'change');save();
    return `Logged ${money(a.amount)} to ${debt.name}. Balance now ${money(debt.balance)}.`;
  }
  if(a.type==='paycheck'){
    show('budget');setTimeout(()=>{if($('paycheck')){$('paycheck').value=a.amount.toFixed(2);$('paycheck').dispatchEvent(new Event('input',{bubbles:true}))}if(a.date&&$('payDate'))$('payDate').value=a.date;$('budgetForm')?.scrollIntoView({behavior:'smooth',block:'start'})},150);
    return `Filled your Payday check with ${money(a.amount)}. Review it and build your plan.`;
  }
  return 'Unknown action.';
}
document.addEventListener('change',e=>{
  const sel=e.target.closest('.flx-action-card [data-k="type"]');if(!sel)return;
  const card=sel.closest('.flx-action-card');const a=flxReadCard(card);a.type=sel.value;
  if(a.type==='bill-payment'&&!a.targetId)a.targetId=data.bills[0]?.id;if(a.type==='debt-payment')a.targetId=(data.debts.find(d=>d.id===a.targetId)||data.debts[0])?.id;
  if(a.type==='invoice'&&!a.client)a.client=a.name||'';if(!a.name)a.name=a.client||'';if(a.type==='bill'&&!a.dueDate)a.dueDate=a.date||'';if(a.type!=='bill'&&a.type!=='invoice'&&!a.date)a.date=a.dueDate&&a.dueDate<=flxTodayIso()?a.dueDate:flxTodayIso();if(a.type==='invoice'&&!a.dueDate)a.dueDate=iso(flxAddDays(new Date(),30));
  card._action=a;card._paint();
});
document.addEventListener('click',e=>{
  const card=e.target.closest('.flx-action-card');if(!card)return;
  if(e.target.closest('[data-flx-cancel]')){card.replaceWith(Object.assign(document.createElement('div'),{className:'bubble dexx-ai',textContent:'Canceled — nothing was saved.'}));return}
  if(e.target.closest('[data-flx-confirm]')){
    const a=flxReadCard(card);const res=flxExecuteAction(a);
    if(/^(Saved|Marked|Logged|Invoice saved|Filled)/.test(res)){card.replaceWith(Object.assign(document.createElement('div'),{className:'bubble dexx-ai flx-saved',textContent:'✓ '+res}))}
    else{const err=card.querySelector('[data-flx-error]');if(err)err.textContent=res}
  }
});
/* Called from the chat form in app.js. Returns true when Dexx handled it as an action. */
function dexxTryAction(text){
  const a=flxDetectAction(text);if(!a)return false;
  dexxAddBubble(text,'user');
  flxShowActionCard(a,(a.amount||a.miles)?"Here's what I heard. Check the numbers, then tap Save — nothing is saved until you do.":'I can add that. Fill in the amount, then tap Save.');
  return true;
}

/* ───────────────────────── 4. PHOTO INTAKE ───────────────────────── */
const FL_INTAKE_FN='dexx-intake';
async function flxImageToBase64(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const b64=c.toDataURL('image/jpeg',.82).split(',')[1];c.width=c.height=0;return b64;
  }finally{URL.revokeObjectURL(url)}
}
function flxRouteIntake(r){
  const f=r&&r.fields||{};const type=String(r&&r.docType||'other');const amt=Number(f.amount)||0;
  if(type==='pay_stub')return {type:'paycheck',amount:Number(f.netPay)||amt,date:f.payDate||f.date||flxTodayIso(),note:f.employer?`From ${f.employer}${f.grossPay?` · gross ${money(f.grossPay)}`:''}`:''};
  if(type==='receipt'){
    const biz=data.business?.mode==='business';
    return biz?{type:'biz-expense',amount:amt,name:f.merchant||f.name||'Receipt',date:f.date||flxTodayIso(),category:FLX_BIZ_CATS[f.businessCategory]?f.businessCategory:'supplies'}:{type:'expense',amount:amt,name:f.merchant||f.name||'Receipt',date:f.date||flxTodayIso(),category:['gas','groceries','food','entertainment','personal','haircut','shopping','transportation','medical'].includes(f.category)?f.category:'other'};
  }
  if(type==='statement'||type==='late_notice'||type==='bill'){
    const name=f.payee||f.name||'Bill';const debt=flxMatchRecord(name,data.debts);
    if(debt&&type==='statement'&&f.minimumPayment)return {type:'debt-payment',amount:Number(f.minimumPayment),targetId:debt.id,date:f.dueDate||flxTodayIso()};
    const existing=flxMatchRecord(name,data.bills);
    return {type:'bill',amount:Number(f.amountDue)||amt,name:existing?existing.name:flxTitle(name).slice(0,40),dueDate:f.dueDate||'',frequency:existing?.frequency||'monthly',priority:type==='late_notice'?'essential':(existing?.priority||'important'),existingId:existing?.id||'',note:type==='late_notice'?'Late notice — Dexx marked this essential.':''};
  }
  if(type==='invoice')return {type:'invoice',amount:amt,client:f.client||f.name||'',dueDate:f.dueDate||iso(flxAddDays(new Date(),30))};
  return {type:'expense',amount:amt,name:f.name||'',category:'other',date:f.date||flxTodayIso()};
}
async function flxHandlePhoto(file){
  if(!file)return;
  show('dexx');
  dexxAddBubble('📷 Sent a photo of paperwork','user');
  const thinking=dexxAddBubble('Dexx is reading the paperwork…','thinking');
  let b64='';
  try{
    b64=await flxImageToBase64(file);
    if(!dexxAIReady())throw new Error('offline');
    const r=await fetch(`${FL_DEXX.url}/functions/v1/${FL_INTAKE_FN}`,{method:'POST',headers:{'content-type':'application/json','apikey':FL_DEXX.anonKey,'authorization':'Bearer '+FL_DEXX.anonKey},body:JSON.stringify({image:b64,mediaType:'image/jpeg',businessMode:data.business?.mode==='business'})});
    b64='';
    const d=await r.json();thinking?.remove();
    if(!r.ok||!d||d.error)throw new Error(d&&d.error||'intake');
    const action=flxRouteIntake(d);const keepOffer=action.type==='biz-expense';
    const label={pay_stub:'a pay stub',receipt:'a receipt',statement:'a statement',late_notice:'a late notice',bill:'a bill',invoice:'an invoice'}[d.docType]||'paperwork I could not fully classify';
    flxShowActionCard(action,`This looks like ${label}${d.summary?` — ${dexxPlainText(d.summary)}`:''}. I pulled the numbers below; fix anything I got wrong, then tap Save. ${keepOffer?'Choose below whether to keep the photo as the receipt.':'The photo itself was not kept.'}`);
  }catch(err){
    b64='';thinking?.remove();
    flxShowActionCard({type:'expense',amount:0,name:'',category:'other',date:flxTodayIso()},'I couldn’t read that photo right now, so I set up a blank card — pick the type and type the numbers in. The photo was not kept.');
  }
}
document.addEventListener('change',e=>{
  if(e.target.id!=='dexxPhotoInput')return;
  const file=e.target.files&&e.target.files[0];e.target.value='';flxHandlePhoto(file);
});

/* ───────────────────────── 1. NOTIFICATIONS ───────────────────────── */
const FLX_NOTIFY_KEY='financial-lab-notify-v1';
function flxNotifySettings(){try{return {enabled:false,bills:true,payday:true,missed:true,tax:true,lastSent:'',...JSON.parse(localStorage.getItem(FLX_NOTIFY_KEY)||'{}')}}catch{return {enabled:false,bills:true,payday:true,missed:true,tax:true,lastSent:''}}}
function flxSaveNotify(s){localStorage.setItem(FLX_NOTIFY_KEY,JSON.stringify(s));flxWriteSchedule()}
function flxIsPayday(isoDay){
  const s=new Set([data.approvedPlan?.payDate,data.nextPayday,data.setup?.nextPayday].filter(Boolean).map(x=>iso(x)));
  try{const anchor=continuityAnchorIso();if(anchor)scheduledPaydaysFrom(anchor,60).forEach(p=>s.add(p))}catch(_){}
  return s.has(isoDay);
}
/* Alerts for a given day. `lock` text never has dollar amounts; `inapp` may. */
function flxAlertsFor(dayIso,{includeOverdue=true}={}){
  const out=[],st=flxNotifySettings(),day=dateAtNoon(dayIso),tomorrow=iso(flxAddDays(day,1));
  if(st.bills){
    const occ=billOccurrences(flxAddDays(day,-30),flxAddDays(day,1)).filter(o=>!o.paid&&!o.autopay);
    const d=o=>o.occurrenceDate||o.date;
    const overdue=includeOverdue?occ.filter(o=>d(o)<dayIso):[],dueToday=occ.filter(o=>d(o)===dayIso),dueTom=occ.filter(o=>d(o)===tomorrow);
    if(overdue.length)out.push({kind:'bill-overdue',rank:0,view:'calendar',title:'A bill is past due',body:`${overdue.length===1?'One bill is':overdue.length+' bills are'} past due. Open the Lab to see your plan.`,inapp:overdue.map(o=>`${o.name} · ${money(o.amount)} · was due ${dateText(d(o))}`).join('\n')});
    if(dueToday.length)out.push({kind:'bill-today',rank:2,view:'calendar',title:'Bill due today',body:`${dueToday.length===1?'A bill is':dueToday.length+' bills are'} due today. Tap to check it off.`,inapp:dueToday.map(o=>`${o.name} · ${money(o.amount)} · due today`).join('\n')});
    if(dueTom.length)out.push({kind:'bill-tomorrow',rank:3,view:'calendar',title:'Bill due tomorrow',body:`${dueTom.length===1?'A bill is':dueTom.length+' bills are'} due tomorrow. Dexx has your plan ready.`,inapp:dueTom.map(o=>`${o.name} · ${money(o.amount)} · due tomorrow`).join('\n')});
  }
  if(st.payday&&flxIsPayday(dayIso))out.push({kind:'payday',rank:1,view:'budget',title:'Payday check-in',body:'It’s payday. Confirm what landed and Dexx will protect it.',inapp:'Payday today — confirm what actually landed.'});
  if(st.missed&&includeOverdue){let n=0;try{n=missedCheckins().length}catch(_){}if(n)out.push({kind:'missed',rank:4,view:'budget',title:'Missed check-in',body:`You have ${n} missed payday check-in${n===1?'':'s'}. Catch up in under a minute.`,inapp:`${n} missed payday check-in${n===1?'':'s'} waiting.`})}
  if(st.tax&&data.business&&data.business.invoices.length){const q=flxBizState().nextQ;const days=Math.round((dateAtNoon(q.due)-day)/86400000);if(!q.paid&&(days===7||days===1||days===0))out.push({kind:'tax',rank:2,view:'business',title:'Quarterly tax reminder',body:`${q.label} estimated tax is due ${days===0?'today':days===1?'tomorrow':'in 7 days'}. Your set-aside is waiting.`,inapp:`${q.label} estimated tax due ${dateText(q.due)} · ${money(q.setAside)} set aside.`})}
  return out.sort((a,b)=>a.rank-b.rank);
}
function flxNotifySupport(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)){const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);const standalone=window.navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;return ios&&!standalone?'needs-home-screen':'unsupported'}
  return Notification.permission;
}
async function flxSendDaily(force=false){
  const st=flxNotifySettings(),today=flxTodayIso();
  if(!force&&(!st.enabled||st.lastSent===today))return false;
  if(flxNotifySupport()!=='granted')return false;
  const top=flxAlertsFor(today)[0];
  const alert=top||(force?{title:'Financial Lab alerts are on',body:'Dexx will send at most one alert a day — never with dollar amounts.',view:'laboratory',kind:'test'}:null);
  if(!alert)return false;
  try{
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification(alert.title,{body:alert.body,tag:'financial-lab-daily',icon:'icon-192.png',badge:'icon-192.png',data:{url:`./#${alert.view}`}});
    if(!force){st.lastSent=today;st.lastKind=alert.kind;flxSaveNotify(st)}
    return true;
  }catch(err){console.warn('Financial Lab notification failed',err);return false}
}
/* Pre-computed 14-day schedule in the existing IndexedDB, so the service
   worker can fire an alert in the background where the phone allows it
   (Periodic Background Sync — Android Chrome installed apps). */
async function flxWriteSchedule(){
  try{
    const st=flxNotifySettings();const schedule=[];
    if(st.enabled)for(let i=0;i<14;i++){const d=iso(flxAddDays(new Date(),i));const a=flxAlertsFor(d,{includeOverdue:i===0})[0];if(a)schedule.push({date:d,title:a.title,body:a.body,view:a.view,kind:a.kind})}
    const db=await openMemoryDb();if(!db)return;
    await new Promise((res,rej)=>{const tx=db.transaction(MEMORY_STORE,'readwrite');tx.objectStore(MEMORY_STORE).put({enabled:st.enabled,lastSent:st.lastSent,schedule,savedAt:new Date().toISOString()},'notify');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();
  }catch(err){console.warn('Notification schedule not saved',err)}
}
async function flxSyncLastSentFromSW(){
  try{const db=await openMemoryDb();if(!db)return;const v=await new Promise(res=>{const tx=db.transaction(MEMORY_STORE,'readonly');const r=tx.objectStore(MEMORY_STORE).get('notify');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)});db.close();const st=flxNotifySettings();if(v&&v.lastSent&&v.lastSent>st.lastSent){st.lastSent=v.lastSent;localStorage.setItem(FLX_NOTIFY_KEY,JSON.stringify(st))}}catch(_){}
}
async function flxRegisterPeriodic(){
  try{const reg=await navigator.serviceWorker.ready;if(reg.periodicSync){const p=await navigator.permissions.query({name:'periodic-background-sync'}).catch(()=>null);if(!p||p.state==='granted')await reg.periodicSync.register('financial-lab-daily',{minInterval:6*3600*1000})}}catch(_){}
}
function flxRenderNotifySettings(){
  const st=flxNotifySettings(),sup=flxNotifySupport();
  const label={granted:st.enabled?'On':'Allowed · off',denied:'Blocked',default:'Off','needs-home-screen':'Add to Home Screen first',unsupported:'Not supported here'}[sup]||'Off';
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
  set('notifyStatusBadge',label);
  set('notifyHelp',sup==='needs-home-screen'?'On iPhone, alerts only work from the installed app: tap Share → Add to Home Screen, open Financial Lab from your Home Screen, then turn alerts on here.':sup==='denied'?'Alerts are blocked for this app. Turn them on in your phone Settings → Notifications → Financial Lab, then come back.':sup==='unsupported'?'This browser can’t show alerts. Install the Lab to your Home Screen or use Safari/Chrome.':'One alert a day at most. The lock screen never shows dollar amounts — open the Lab to see the numbers.');
  const btn=$('notifyEnableBtn');if(btn){btn.textContent=st.enabled&&sup==='granted'?'TURN ALERTS OFF':'TURN ON ALERTS';btn.disabled=sup==='unsupported'||sup==='needs-home-screen'||sup==='denied'}
  const test=$('notifyTestBtn');if(test)test.disabled=!(st.enabled&&sup==='granted');
  ['bills','payday','missed','tax'].forEach(k=>{const el=$(`notify-${k}`);if(el)el.checked=!!st[k]});
  const today=flxAlertsFor(flxTodayIso());
  const dot=document.querySelector('#notifyBtn .notify-dot');if(dot)dot.style.display=today.length?'':'none';
}
function flxOpenAlertsSheet(){
  const sheet=$('flxAlertSheet');if(!sheet)return;
  const list=flxAlertsFor(flxTodayIso());
  $('flxAlertList').innerHTML=list.length?list.map(a=>`<button type="button" class="flx-alert-row" data-go="${a.view}" data-flx-close data-testid="alert-row"><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(a.inapp).replace(/\n/g,'<br>')}</small></button>`).join(''):'<p class="empty-copy">Nothing needs you today. Dexx will nudge you when something does.</p>';
  sheet.hidden=false;
}
document.addEventListener('click',async e=>{
  if(e.target.closest('#notifyBtn')){flxOpenAlertsSheet();return}
  if(e.target.closest('[data-flx-close]')||e.target.id==='flxAlertSheet'){const s=$('flxAlertSheet');if(s)s.hidden=true}
  if(e.target.closest('#notifyEnableBtn')){
    const st=flxNotifySettings();
    if(st.enabled&&Notification.permission==='granted'){st.enabled=false;flxSaveNotify(st);flxRenderNotifySettings();return}
    let p=Notification.permission;if(p==='default')p=await Notification.requestPermission();
    if(p==='granted'){st.enabled=true;flxSaveNotify(st);flxRegisterPeriodic();flxSendDaily()}
    flxRenderNotifySettings();return;
  }
  if(e.target.closest('#notifyTestBtn')){const ok=await flxSendDaily(true);const s=$('notifyTestStatus');if(s)s.textContent=ok?'Test alert sent.':'Could not send — check that alerts are allowed.';return}
});
document.addEventListener('change',e=>{
  const m=e.target.id&&e.target.id.match(/^notify-(bills|payday|missed|tax)$/);if(!m)return;
  const st=flxNotifySettings();st[m[1]]=e.target.checked;flxSaveNotify(st);flxRenderNotifySettings();
});

/* ───────────────────────── wiring ───────────────────────── */
function flxRenderAll(){try{flxEnsureData();flxApplyMode();flxRenderIncomeLists();flxRenderIncomeCycle();flxRenderBusiness();flxRenderNotifySettings()}catch(err){console.warn('Financial Lab next modules render failed',err)}}
(function flxInit(){
  flxEnsureData();
  const mount=(id,scope)=>{const el=$(id);if(el&&!el.dataset.ready){el.innerHTML=flxIncomeFormHTML(scope);el.dataset.ready='1'}};
  mount('flxSetupIncomeForm','setup');mount('flxProfileIncomeForm','profile');
  const baseRender=render;
  render=function(){baseRender.apply(this,arguments);flxRenderAll()};
  flxRenderAll();
  if(data.business.mode==='business'&&!document.body.classList.contains('front-door-active')&&(!location.hash||location.hash==='#laboratory'))show('business');
  else if(location.hash==='#business'&&!document.body.classList.contains('front-door-active'))show('business');
  const tick=async()=>{await flxSyncLastSentFromSW();flxWriteSchedule();flxSendDaily();flxRenderNotifySettings()};
  tick();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick()});
  setInterval(tick,30*60*1000);
})();
