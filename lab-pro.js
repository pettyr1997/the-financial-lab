/* Financial Lab 4.3.0.0 — Business Lab Pro + Cloud Accounts
   • Mileage log with the IRS standard business rate → automatic deduction
   • Invoice follow-ups: overdue clients flagged, Dexx writes the reminder
   • Monthly profit & loss report that Dexx explains in plain words
   • Repeat (monthly) invoices, contractor payments with 1099 tracking,
     year-end tax packet CSV for your accountant
   • Cloud accounts (email code sign-in) + sync across devices + server push
     alerts so reminders arrive even when the Lab is closed.
   Loaded after lab-next.js. */

/* ───────────── shared helpers ───────────── */
const flpBiz=()=>{flxEnsureData();const b=data.business;['mileage','contractors','contractorPayments','reminders'].forEach(k=>{if(!Array.isArray(b[k]))b[k]=[]});if(!b.mileageRateOverride)b.mileageRateOverride='';return b};
const flpDaysLate=d=>Math.floor((dateAtNoon(new Date())-dateAtNoon(d))/86400000);
const flpMonthKey=d=>String(d||'').slice(0,7);
const flpMonthLabel=k=>{const [y,m]=k.split('-').map(Number);return new Date(y,m-1,15).toLocaleDateString(undefined,{month:'long',year:'numeric'})};
const flpSum=(arr,f=x=>x.amount)=>arr.reduce((s,x)=>s+(Number(f(x))||0),0);
const flpR2=n=>Math.round(n*100)/100;

/* IRS standard business mileage rates (cents/mile). 2026 had a mid-year change. */
const FLP_MILEAGE_RATES=[{from:'2024-01-01',rate:67},{from:'2025-01-01',rate:70},{from:'2026-01-01',rate:72.5},{from:'2026-07-01',rate:76}];
function flpMileageRate(dateIso){
  const o=Number(flpBiz().mileageRateOverride);if(o>0)return o;
  let r=FLP_MILEAGE_RATES[0].rate;FLP_MILEAGE_RATES.forEach(x=>{if(String(dateIso)>=x.from)r=x.rate});return r;
}
const flpTripDeduction=t=>flpR2((Number(t.miles)||0)*flpMileageRate(t.date)/100);

/* ───────────── 1. MILEAGE LOG ───────────── */
function flpAddTrip({date,miles,purpose,from,to,roundTrip}){
  const b=flpBiz();const m=flpR2(clamp(miles,0,5000)*(roundTrip?2:1));
  const rec={id:flxId('trip'),date:date||flxTodayIso(),miles:m,purpose:purpose||'Business drive',from:from||'',to:to||'',roundTrip:!!roundTrip};
  b.mileage.push(rec);setRecoveryContext(`Mileage: ${rec.purpose}`,`${m} business miles → ${money(flpTripDeduction(rec))} deduction.`,'change');save();return rec;
}
function flpRenderMileage(){
  const host=$('bizMileageList');if(!host)return;const b=flpBiz(),year=String(new Date().getFullYear());
  const ytd=b.mileage.filter(t=>String(t.date).startsWith(year));
  const miles=flpSum(ytd,t=>t.miles),ded=flpSum(ytd,flpTripDeduction);
  $('bizMilesYTD').textContent=`${miles.toLocaleString(undefined,{maximumFractionDigits:1})} mi`;
  $('bizMileageDeduction').textContent=money(ded);
  $('bizMileageRate').textContent=`${flpMileageRate(flxTodayIso())}¢ per mile${Number(b.mileageRateOverride)>0?' (your rate)':' · IRS standard rate'}`;
  const list=[...b.mileage].sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,20);
  host.innerHTML=list.length?list.map(t=>`<div class="managed-bill" data-testid="trip-row"><div class="managed-bill-main"><div><strong>${escapeHTML(t.purpose)}</strong><span>${dateText(t.date,{month:'short',day:'numeric'})} · ${t.miles} mi${t.roundTrip?' round trip':''}${t.from||t.to?` · ${escapeHTML([t.from,t.to].filter(Boolean).join(' → '))}`:''}</span></div><b>${money(flpTripDeduction(t))}</b></div><div class="managed-bill-meta"><span>Deduction at ${flpMileageRate(t.date)}¢/mi</span><div><button type="button" class="danger-link" data-trip-delete="${t.id}">Delete</button></div></div></div>`).join(''):'<p class="empty-copy">No drives logged yet. Log every client visit, supply run, and bank trip — it adds up fast.</p>';
}

/* ───────────── 2. INVOICE FOLLOW-UPS ───────────── */
function flpReminderText(inv){
  const late=flpDaysLate(inv.dueDate),biz=data.business.name||'',amt=money(inv.amount),due=dateText(inv.dueDate,{month:'long',day:'numeric'});
  const ref=inv.note?` (${inv.note})`:'';
  if(late<=7)return `Hi ${inv.client},\n\nHope you're doing well! Just a friendly reminder that the invoice for ${amt}${ref} was due on ${due}. If it's already on its way, thank you — please ignore this note.\n\nLet me know if you need anything from me to get it processed.\n\nThanks so much,${biz?'\n'+biz:''}`;
  if(late<=30)return `Hi ${inv.client},\n\nI'm following up on the invoice for ${amt}${ref}, which was due on ${due} and is now ${late} days past due. Could you let me know when I can expect payment?\n\nIf there's an issue with the invoice, I'm happy to help sort it out.\n\nThank you,${biz?'\n'+biz:''}`;
  return `Hi ${inv.client},\n\nThe invoice for ${amt}${ref} due on ${due} is now ${late} days past due. Please arrange payment this week, or reply so we can agree on a payment date.\n\nI value working with you and want to get this settled.\n\nBest regards,${biz?'\n'+biz:''}`;
}
function flpRenderFollowUps(){
  const host=$('bizFollowUps');if(!host)return;const b=flpBiz(),today=flxTodayIso();
  const overdue=b.invoices.filter(i=>i.status!=='paid'&&i.dueDate&&i.dueDate<today).sort((x,y)=>x.dueDate.localeCompare(y.dueDate));
  const soon=b.invoices.filter(i=>i.status!=='paid'&&i.dueDate>=today&&flpDaysLate(i.dueDate)>=-3);
  $('bizFollowCount').textContent=overdue.length?`${overdue.length} overdue · ${money(flpSum(overdue))}`:'All clear';
  host.innerHTML=(overdue.length?overdue.map(i=>{const late=flpDaysLate(i.dueDate);const last=(i.reminders||[]).slice(-1)[0];return `<div class="flp-follow ${late>30?'severe':late>7?'firm':''}" data-testid="followup-row"><div><strong>${escapeHTML(i.client)}</strong><small>${money(i.amount)} · ${late} day${late===1?'':'s'} late${last?` · reminded ${dateText(last,{month:'short',day:'numeric'})}`:' · no reminder yet'}</small></div><button type="button" class="primary" data-follow-write="${i.id}" data-testid="followup-write">WRITE REMINDER</button></div>`}).join(''):'<p class="empty-copy">No overdue clients. Dexx checks every invoice daily and flags the late ones here.</p>')
   +(soon.length?`<p class="flx-note">${soon.length} invoice${soon.length===1?'':'s'} due in the next 3 days: ${soon.map(i=>escapeHTML(i.client)).join(', ')}.</p>`:'');
}
function flpOpenReminder(inv){
  const sheet=$('flpReminderSheet');if(!sheet)return;
  sheet.dataset.inv=inv.id;$('flpReminderTo').textContent=`To ${inv.client}${inv.email?` · ${inv.email}`:''}`;
  $('flpReminderText').value=flpReminderText(inv);$('flpReminderStatus').textContent='';sheet.hidden=false;
}

/* ───────────── 3. MONTHLY PROFIT & LOSS ───────────── */
let flpReportMonth=flpMonthKey(flxTodayIso());
function flpMonthPL(key){
  const b=flpBiz();
  const inv=b.invoices.filter(i=>i.status==='paid'&&flpMonthKey(i.paidDate)===key);
  const exp=b.expenses.filter(x=>flpMonthKey(x.date)===key);
  const trips=b.mileage.filter(t=>flpMonthKey(t.date)===key);
  const contr=b.contractorPayments.filter(p=>flpMonthKey(p.date)===key);
  const income=flpSum(inv,i=>i.received||i.amount),expenses=flpSum(exp),contractors=flpSum(contr),mileage=flpSum(trips,flpTripDeduction);
  const byCat={};exp.forEach(x=>{byCat[x.category]=(byCat[x.category]||0)+Number(x.amount||0)});if(contractors)byCat.contractors=(byCat.contractors||0)+contractors;
  const profit=income-expenses-contractors,taxable=profit-mileage;
  return {key,inv,income,expenses,contractors,mileage,miles:flpSum(trips,t=>t.miles),byCat,profit,taxable,taxAside:flpSum(inv,i=>i.taxSetAside),draws:flpSum(b.draws.filter(d=>flpMonthKey(d.date)===key))};
}
function flpExplain(pl,prev){
  if(!pl.income&&!pl.expenses&&!pl.mileage&&!pl.contractors)return `Nothing recorded for ${flpMonthLabel(pl.key)} yet. Mark invoices paid and log expenses and drives, and I'll break the month down for you.`;
  const parts=[];
  parts.push(`In ${flpMonthLabel(pl.key)} you brought in ${money(pl.income)} ${pl.inv.length?`from ${pl.inv.length} paid invoice${pl.inv.length===1?'':'s'}`:'with no paid invoices'} and spent ${money(pl.expenses+pl.contractors)} running the business, so your profit was ${money(pl.profit)}.`);
  const top=Object.entries(pl.byCat).sort((a,b)=>b[1]-a[1])[0];
  if(top)parts.push(`Your biggest cost was ${(FLX_BIZ_CATS[top[0]]||top[0]).toLowerCase()} at ${money(top[1])}.`);
  if(pl.mileage)parts.push(`You also drove ${pl.miles.toLocaleString()} business miles, worth a ${money(pl.mileage)} deduction, which brings your estimated taxable profit to ${money(pl.taxable)}.`);
  if(pl.income)parts.push(pl.taxable<=0?`You set aside ${money(pl.taxAside)} for taxes. With no taxable profit this month, that money is extra cushion for the quarter.`:`You set aside ${money(pl.taxAside)} for taxes — ${pl.taxAside>=pl.taxable*.25?'that looks like a healthy cushion.':'that may be light for this profit; consider raising your set-aside rate.'}`);
  if(prev&&(prev.income||prev.expenses)){const d=pl.profit-prev.profit;parts.push(`That's ${d>=0?'up':'down'} ${money(Math.abs(d))} from last month.`)}
  if(pl.profit<0)parts.push('You spent more than you earned this month — check for invoices you haven\'t billed or collected yet.');
  parts.push('For tax time: keep this report with your receipts. I\'m not a tax professional, so have one confirm your final numbers.');
  return parts.join(' ');
}
function flpRenderReport(){
  const host=$('bizReportBody');if(!host)return;
  const pl=flpMonthPL(flpReportMonth);const [y,m]=flpReportMonth.split('-').map(Number);const prevKey=iso(new Date(y,m-2,15)).slice(0,7);
  $('bizReportMonth').textContent=flpMonthLabel(flpReportMonth);
  const row=(l,v,cls='')=>`<div class="flp-pl-row ${cls}"><span>${l}</span><b>${v}</b></div>`;
  host.innerHTML=row('Income (paid invoices)',money(pl.income))
    +Object.entries(pl.byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>row(`− ${FLX_BIZ_CATS[k]||k}`,money(v),'sub')).join('')
    +row('Total expenses',money(pl.expenses+pl.contractors))
    +row('Profit',money(pl.profit),pl.profit<0?'neg total':'total')
    +row(`Mileage deduction · ${pl.miles} mi`,money(pl.mileage),'sub')
    +row('Est. taxable profit',money(pl.taxable),'total')
    +row('Tax set aside',money(pl.taxAside),'sub')+row('Owner pay',money(pl.draws),'sub');
  $('bizReportExplain').textContent=flpExplain(pl,flpMonthPL(prevKey));
}
function flpCsv(rows){return rows.map(r=>r.map(c=>{const s=String(c??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}).join(',')).join('\n')}
function flpExportYear(){
  const b=flpBiz(),year=String(new Date().getFullYear()),inY=d=>String(d||'').startsWith(year);
  const rows=[['Type','Date','Name / client','Category','Amount','Miles','Deduction','Tax set aside','Notes']];
  b.invoices.filter(i=>i.status==='paid'&&inY(i.paidDate)).forEach(i=>rows.push(['Income',i.paidDate,i.client,'Invoice',i.received||i.amount,'','',i.taxSetAside||0,i.note||'']));
  b.expenses.filter(x=>inY(x.date)).forEach(x=>rows.push(['Expense',x.date,x.name,FLX_BIZ_CATS[x.category]||x.category,x.amount,'','','',x.receipt?'Receipt photo on file':'No receipt']));
  b.contractorPayments.filter(p=>inY(p.date)).forEach(p=>{const c=b.contractors.find(x=>x.id===p.contractorId);rows.push(['Contractor payment',p.date,c?c.name:'Contractor','Contractors',p.amount,'','','',p.note||''])});
  b.mileage.filter(t=>inY(t.date)).forEach(t=>rows.push(['Mileage',t.date,t.purpose,'Vehicle','',t.miles,flpTripDeduction(t),'',`${flpMileageRate(t.date)}¢/mi ${[t.from,t.to].filter(Boolean).join(' → ')}`]));
  Object.entries(b.quarterlyPaid).filter(([k])=>k.startsWith(year)).forEach(([k,q])=>rows.push(['Estimated tax paid',q.date,k,'Taxes',q.amount,'','','','']));
  b.draws.filter(d=>inY(d.date)).forEach(d=>rows.push(['Owner pay',d.date,'Owner draw','Owner pay',d.amount,'','','','']));
  const blob=new Blob([flpCsv(rows)],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(b.name||'business').replace(/[^\w]+/g,'-')}-${year}-tax-packet.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  return rows.length-1;
}

/* ───────────── 4. REPEAT INVOICES + CONTRACTORS ───────────── */
function flpRunRepeatInvoices(){
  const b=flpBiz();let made=0;const today=dateAtNoon(new Date());
  for(let pass=0;pass<12;pass++){
    let any=false;
    b.invoices.filter(i=>i.repeat==='monthly'&&!i.spawned).forEach(i=>{
      const next=dateAtNoon(i.issued);next.setMonth(next.getMonth()+1);
      if(flxAddDays(next,-3)>today)return;
      const due=dateAtNoon(i.dueDate);due.setMonth(due.getMonth()+1);
      i.spawned=true;b.invoices.push({id:flxId('invoice'),client:i.client,email:i.email||'',amount:i.amount,issued:iso(next),dueDate:iso(due),status:'open',note:i.note||'',repeat:'monthly'});made++;any=true;
    });
    if(!any)break;
  }
  if(made){setRecoveryContext('Repeat invoices',`${made} monthly invoice${made===1?'':'s'} created automatically.`,'change');save({skipRecovery:true})}
  return made;
}
const FLP_1099=2000; // 1099-NEC threshold for payments made in 2026+ (was $600 before 2026)
function flpRenderContractors(){
  const host=$('bizContractorList');if(!host)return;const b=flpBiz(),year=String(new Date().getFullYear());
  const sel=$('bizContrPick');if(sel){const v=sel.value;sel.innerHTML='<option value="">+ New contractor</option>'+b.contractors.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');sel.value=b.contractors.some(c=>c.id===v)?v:''}
  host.innerHTML=b.contractors.length?b.contractors.map(c=>{const paid=flpSum(b.contractorPayments.filter(p=>p.contractorId===c.id&&String(p.date).startsWith(year)));const need=paid>=FLP_1099;return `<div class="managed-bill" data-testid="contractor-row"><div class="managed-bill-main"><div><strong>${escapeHTML(c.name)}</strong><span>${need?'1099-NEC needed for '+year:`${money(Math.max(0,FLP_1099-paid))} until 1099 threshold`}</span></div><b>${money(paid)}</b></div><div class="managed-bill-meta"><span class="${need?'flp-1099':''}">${need?'Collect a W-9 and file by Jan 31':'Paid this year'}</span><div><button type="button" class="danger-link" data-contr-delete="${c.id}">Delete</button></div></div></div>`}).join(''):'<p class="empty-copy">Pay freelancers or helpers? Track them here — Dexx flags anyone who reaches the 1099 threshold.</p>';
}

/* ───────────── Dexx Actions: mileage ───────────── */
const flpBaseDetect=flxDetectAction;
flxDetectAction=function(text){
  const t=String(text).toLowerCase();const m=t.match(/\b(\d+(?:\.\d+)?)\s*(?:mi|miles?)\b/);
  if(m&&/\b(drove|drive|driving|drive to|trip|mileage|miles)\b/.test(t)&&!/\?\s*$/.test(t)){
    const d=flxParseDate(text);const purposeM=text.match(/\b(?:to|for)\s+(?:the\s+)?([A-Za-z][\w'&.\- ]{1,40}?)(?=\s+(?:today|yesterday|and|round|on)\b|[.,!]|$)/i);
    return {type:'mileage',miles:Number(m[1]),amount:0,purpose:purposeM?flxTitle(purposeM[1]):'Business drive',date:d.date||flxTodayIso(),roundTrip:/round[- ]?trip|there and back/.test(t)?'yes':'no'};
  }
  return flpBaseDetect(text);
};
FLX_TYPE_LABEL.mileage='Business mileage';
const flpBaseFields=flxCardFields;
flxCardFields=function(a){
  if(a.type!=='mileage')return flpBaseFields(a);
  const miles=(Number(a.miles)||0)*(a.roundTrip==='yes'?2:1);
  return flxField('Purpose','purpose',a.purpose||'')+flxField('Miles (one way)','miles',a.miles||'','number')+flxSelect('Round trip?','roundTrip',a.roundTrip||'no',{no:'No',yes:'Yes, double it'})+flxField('Date','date',a.date||flxTodayIso(),'date')+`<p class="flx-note">${miles} mi × ${flpMileageRate(a.date||flxTodayIso())}¢ = ${money(miles*flpMileageRate(a.date||flxTodayIso())/100)} deduction</p>`;
};
const flpBaseTypes=flxTypeOptions;
flxTypeOptions=function(a){const o=flpBaseTypes(a);o.mileage=FLX_TYPE_LABEL.mileage;return o};
const flpBaseExec=flxExecuteAction;
flxExecuteAction=function(a){
  if(a.type!=='mileage')return flpBaseExec(a);
  const miles=clamp(a.miles,0,5000);if(miles<=0)return 'Enter the miles.';
  const t=flpAddTrip({date:a.date,miles,purpose:a.purpose,roundTrip:a.roundTrip==='yes'});
  return `Saved. ${t.miles} business miles — a ${money(flpTripDeduction(t))} tax deduction.`;
};
/* mileage cards need amount>0 bypass: the base card reader clamps amount; mileage uses miles. */

/* ───────────── alerts: overdue invoices ───────────── */
const flpBaseAlerts=flxAlertsFor;
flxAlertsFor=function(dayIso,opts={}){
  const out=flpBaseAlerts(dayIso,opts);
  if(opts.includeOverdue!==false&&data.business&&flxNotifySettings().tax){
    const od=data.business.invoices.filter(i=>i.status!=='paid'&&i.dueDate&&i.dueDate<dayIso);
    if(od.length)out.push({kind:'invoice-overdue',rank:3,view:'business',title:'Client payment is late',body:`${od.length===1?'One invoice is':od.length+' invoices are'} overdue. Dexx wrote a reminder for you.`,inapp:od.map(i=>`${i.client} · ${money(i.amount)} · ${flpDaysLate(i.dueDate)} days late`).join('\n')});
  }
  return out.sort((a,b)=>a.rank-b.rank);
};

/* ───────────── Dexx business context ───────────── */
const flpBaseSnapshot=dexxSnapshotText;
dexxSnapshotText=function(){
  const base=flpBaseSnapshot.apply(this,arguments);
  if(data.business?.mode!=='business')return base;
  const b=flpBiz(),pl=flpMonthPL(flpMonthKey(flxTodayIso())),year=String(new Date().getFullYear());
  const od=b.invoices.filter(i=>i.status!=='paid'&&i.dueDate<flxTodayIso());
  const ytdMiles=flpSum(b.mileage.filter(t=>String(t.date).startsWith(year)),t=>t.miles);
  return base+`\nBusiness this month: income ${money(pl.income)}, expenses ${money(pl.expenses+pl.contractors)}, profit ${money(pl.profit)}, mileage deduction ${money(pl.mileage)}. Overdue clients: ${od.length?od.map(i=>`${i.client} ${money(i.amount)} ${flpDaysLate(i.dueDate)}d late`).join('; '):'none'}. Business miles this year: ${ytdMiles}.`;
};

/* ───────────── events ───────────── */
document.addEventListener('submit',e=>{
  const id=e.target.id;
  if(id==='bizMileageForm'){e.preventDefault();let miles=clamp($('bizTripMiles').value,0,5000);const s=clamp($('bizOdoStart').value,0,1e7),f=clamp($('bizOdoEnd').value,0,1e7);if(!miles&&f>s)miles=f-s;if(miles<=0){$('bizTripStatus').textContent='Enter the miles, or start and end odometer readings.';return}const t=flpAddTrip({date:$('bizTripDate').value,miles,purpose:$('bizTripPurpose').value.trim(),from:$('bizTripFrom').value.trim(),to:$('bizTripTo').value.trim(),roundTrip:$('bizTripRound').checked});e.target.reset();$('bizTripStatus').textContent=`Logged ${t.miles} mi — ${money(flpTripDeduction(t))} deduction.`}
  if(id==='bizContractorForm'){e.preventDefault();const b=flpBiz();let cid=$('bizContrPick').value;const name=$('bizContrName').value.trim(),amount=clamp($('bizContrAmount').value,0,1e9),date=$('bizContrDate').value||flxTodayIso();if(!cid&&!name){$('bizContrStatus').textContent='Pick a contractor or type a new name.';return}if(amount<=0){$('bizContrStatus').textContent='Enter the amount paid.';return}if(!cid){cid=flxId('contractor');b.contractors.push({id:cid,name})}const c=b.contractors.find(x=>x.id===cid);b.contractorPayments.push({id:flxId('cpay'),contractorId:cid,amount,date,note:$('bizContrNote').value.trim()});setRecoveryContext(`Contractor payment: ${c.name}`,`${money(amount)} paid.`,'expense');save();e.target.reset();$('bizContrStatus').textContent=`Saved ${money(amount)} to ${c.name}.`}
  if(id==='bizMileageRateForm'){e.preventDefault();flpBiz().mileageRateOverride=clamp($('bizMileageRateInput').value,0,200)||'';save({skipRecovery:true});$('bizMileageRateStatus').textContent=flpBiz().mileageRateOverride?'Using your custom rate.':'Using the IRS standard rate.'}
});
document.addEventListener('click',async e=>{
  const t=e.target;
  const td=t.closest('[data-trip-delete]');if(td){const b=flpBiz();const x=b.mileage.find(m=>m.id===td.dataset.tripDelete);if(!x||!confirm('Delete this drive?'))return;b.mileage=b.mileage.filter(m=>m!==x);setRecoveryContext('Delete drive',x.purpose,'change');save();return}
  const cd=t.closest('[data-contr-delete]');if(cd){const b=flpBiz();const c=b.contractors.find(x=>x.id===cd.dataset.contrDelete);if(!c||!confirm(`Delete ${c.name} and their payments?`))return;b.contractors=b.contractors.filter(x=>x!==c);b.contractorPayments=b.contractorPayments.filter(p=>p.contractorId!==c.id);setRecoveryContext(`Delete contractor: ${c.name}`,'Removed.','change');save();return}
  const fw=t.closest('[data-follow-write]');if(fw){const inv=data.business.invoices.find(i=>i.id===fw.dataset.followWrite);if(inv)flpOpenReminder(inv);return}
  if(t.closest('[data-flp-close]')||t.id==='flpReminderSheet'){$('flpReminderSheet').hidden=true;return}
  const sheet=$('flpReminderSheet');const inv=sheet&&data.business.invoices.find(i=>i.id===sheet.dataset.inv);
  if(t.closest('#flpReminderCopy')&&inv){const txt=$('flpReminderText').value;try{await navigator.clipboard.writeText(txt);$('flpReminderStatus').textContent='Copied — paste it into a text or email.'}catch(_){$('flpReminderText').select();document.execCommand&&document.execCommand('copy');$('flpReminderStatus').textContent='Selected — copy it from the box.'}return}
  if(t.closest('#flpReminderShare')&&inv){const txt=$('flpReminderText').value;const subject=`Invoice reminder — ${money(inv.amount)}`;if(navigator.share){try{await navigator.share({title:subject,text:txt})}catch(_){}}else location.href=`mailto:${encodeURIComponent(inv.email||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(txt)}`;return}
  if(t.closest('#flpReminderSent')&&inv){inv.reminders=[...(inv.reminders||[]),flxTodayIso()];setRecoveryContext(`Reminder sent: ${inv.client}`,'Follow-up logged.','change');save();sheet.hidden=true;return}
  if(t.closest('#bizReportPrev')||t.closest('#bizReportNext')){const [y,m]=flpReportMonth.split('-').map(Number);flpReportMonth=iso(new Date(y,m-1+(t.closest('#bizReportPrev')?-1:1),15)).slice(0,7);flpRenderReport();return}
  if(t.closest('#bizExportBtn')){const n=flpExportYear();$('bizExportStatus').textContent=`Downloaded ${n} records for your accountant.`;return}
});
document.addEventListener('change',e=>{if(e.target.id==='bizContrPick'){const w=$('bizContrNameWrap');if(w)w.hidden=!!e.target.value}});

/* ═════════════ CLOUD ACCOUNTS + SYNC + SERVER PUSH ═════════════ */
/* After running supabase/sql/cloud-sync.sql and generating VAPID keys, paste
   the PUBLIC VAPID key here to switch on server push alerts. */
const FL_PUSH_VAPID_PUBLIC_KEY='';
const FLP_SESSION='financial-lab-cloud-session-v1',FLP_META='financial-lab-cloud-meta-v1';
const flpJSON=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d}catch{return d}};
let flpSession=flpJSON(FLP_SESSION,null);
let flpMeta={lastSyncedAt:'',remoteUpdatedAt:'',dirty:false,pushActive:false,status:'',...flpJSON(FLP_META,{})};
const flpSaveMeta=()=>localStorage.setItem(FLP_META,JSON.stringify(flpMeta));
const flpSetSession=s=>{flpSession=s;if(s)localStorage.setItem(FLP_SESSION,JSON.stringify(s));else localStorage.removeItem(FLP_SESSION)};
async function flpFetch(path,opts={},auth=true){
  if(auth&&flpSession&&flpSession.expires_at&&Date.now()/1000>flpSession.expires_at-60)await flpRefresh();
  const r=await fetch(`${FL_DEXX.url}${path}`,{...opts,headers:{apikey:FL_DEXX.anonKey,'content-type':'application/json',...(auth&&flpSession?.access_token?{authorization:`Bearer ${flpSession.access_token}`}:{}),...(opts.headers||{})}});
  const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch(_){body=text}
  if(!r.ok){const err=new Error((body&&(body.msg||body.message||body.error_description||body.error))||`HTTP ${r.status}`);err.status=r.status;err.code=body&&body.code;throw err}
  return body;
}
async function flpRefresh(){
  if(!flpSession?.refresh_token)return;
  try{const s=await flpFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:flpSession.refresh_token})},false);if(!s.expires_at)s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);flpSetSession(s)}
  catch(err){if(err.status===400||err.status===401){flpSetSession(null);flpMeta.status='Signed out — please sign in again.';flpSaveMeta()}throw err}
}
const flpLocalSnapshot=()=>({data,execution:typeof executionState==='object'?executionState:null,notify:flpNotifyPayload(),device:navigator.userAgent.slice(0,80),app:'4.3.0.0'});
function flpNotifyPayload(){
  const st=flxNotifySettings();const schedule=[];
  if(st.enabled)for(let i=0;i<14;i++){const d=iso(flxAddDays(new Date(),i));const a=flxAlertsFor(d,{includeOverdue:i===0})[0];if(a)schedule.push({date:d,title:a.title,body:a.body,view:a.view,kind:a.kind})}
  return {enabled:!!st.enabled,schedule,tzOffset:new Date().getTimezoneOffset(),sendHour:9};
}
async function flpPull(){const rows=await flpFetch(`/rest/v1/user_sync?select=payload,updated_at&user_id=eq.${encodeURIComponent(flpSession.user.id)}`);return rows&&rows[0]||null}
async function flpPush(){
  const now=new Date().toISOString();
  await flpFetch('/rest/v1/user_sync?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:flpSession.user.id,payload:flpLocalSnapshot(),updated_at:now})});
  Object.assign(flpMeta,{lastSyncedAt:now,remoteUpdatedAt:now,dirty:false,status:''});flpSaveMeta();flpRenderCloud();
}
function flpApplyRemote(row){
  const remote=row.payload&&row.payload.data;if(!remote)return;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(remote));
  if(row.payload.execution)localStorage.setItem(EXECUTION_KEY,JSON.stringify(row.payload.execution));
  data=load();try{executionState=loadExecutionState()}catch(_){}
  try{normalizeApprovedPlanFunding()}catch(_){}
  /* keep the device backup layer (IndexedDB mirror) in step, otherwise the next open restores the old device copy over the cloud copy */
  try{writeMemoryMirror(data);lastSavedSnapshot=cloneFinancialData(data)}catch(_){}
  flxEnsureData();Object.assign(flpMeta,{lastSyncedAt:new Date().toISOString(),remoteUpdatedAt:row.updated_at,dirty:false,status:''});flpSaveMeta();render();
}
const flpHasLocalData=()=>{const s=data.setup||{},b=data.business||{};return !!(s.completed||s.completedAt||s.currentMoneyConfirmed||s.incomeConfirmed||Number(s.expectedPaycheck)>0||(data.bills||[]).length||(data.expenseRecords||[]).length||(data.incomes||[]).length||Number(data.paycheck)>0||Number(data.currentBalance)>0||['invoices','expenses','mileage','contractors','draws'].some(k=>Array.isArray(b[k])&&b[k].length))};
let flpSyncTimer=null,flpSyncing=false;
function flpScheduleSync(){if(!flpSession)return;flpMeta.dirty=true;flpSaveMeta();clearTimeout(flpSyncTimer);flpSyncTimer=setTimeout(()=>flpSyncNow(),2500)}
async function flpSyncNow({fromOpen=false}={}){
  if(!flpSession||!navigator.onLine)return;if(flpSyncing){clearTimeout(flpSyncTimer);flpSyncTimer=setTimeout(()=>flpSyncNow(),2500);return}flpSyncing=true;
  try{
    const row=await flpPull();
    const remoteChanged=row&&row.updated_at&&row.updated_at!==flpMeta.remoteUpdatedAt;
    if(!row){await flpPush()}
    else if(remoteChanged&&!flpMeta.remoteUpdatedAt){ // first sync on this device
      if(flpHasLocalData())flpOpenConflict(row);else flpApplyRemote(row);
    }
    else if(remoteChanged&&flpMeta.dirty)flpOpenConflict(row);
    else if(remoteChanged)flpApplyRemote(row);
    else if(flpMeta.dirty)await flpPush();
  }catch(err){
    flpMeta.status=err.code==='42P01'||/relation|does not exist|schema cache/i.test(err.message)?'Cloud tables are not set up yet (run cloud-sync.sql).':`Sync paused: ${err.message}`;flpSaveMeta();
  }finally{flpSyncing=false;flpRenderCloud()}
}
function flpOpenConflict(row){
  const s=$('flpConflictSheet');if(!s)return;s._row=row;
  $('flpConflictInfo').textContent=`Cloud copy saved ${new Date(row.updated_at).toLocaleString()}. This device last changed ${data.lastUpdated?new Date(data.lastUpdated).toLocaleString():'—'}.`;s.hidden=false;
}
async function flpEnablePush(){
  if(!FL_PUSH_VAPID_PUBLIC_KEY||!flpSession||!('PushManager' in window))return false;
  if(Notification.permission!=='granted')return false;
  try{
    const reg=await navigator.serviceWorker.ready;
    const b64=s=>Uint8Array.from(atob((s+'==='.slice((s.length+3)%4)).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const sub=(await reg.pushManager.getSubscription())||(await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(FL_PUSH_VAPID_PUBLIC_KEY)}));
    await flpFetch('/rest/v1/push_subscriptions?on_conflict=endpoint',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:flpSession.user.id,endpoint:sub.endpoint,subscription:sub.toJSON()})});
    flpMeta.pushActive=true;flpSaveMeta();return true;
  }catch(err){console.warn('Push subscribe failed',err);flpMeta.pushActive=false;flpSaveMeta();return false}
}
/* With server push active, the server sends the one daily alert — the device stops sending its own so you never get two. */
const flpBaseSendDaily=flxSendDaily;
flxSendDaily=function(force){if(!force&&flpMeta.pushActive&&flpSession)return Promise.resolve(false);return flpBaseSendDaily(force)};
function flpRenderCloud(){
  const card=$('cloudCard');if(!card)return;
  const signed=!!flpSession?.user;
  $('cloudSignedOut').hidden=signed;$('cloudSignedIn').hidden=!signed;
  $('cloudBadge').textContent=signed?(flpMeta.status?'Paused':flpMeta.dirty?'Saving…':'Synced'):'Not signed in';
  if(signed){
    $('cloudEmail').textContent=flpSession.user.email||'Signed in';
    $('cloudLast').textContent=flpMeta.lastSyncedAt?`Last synced ${new Date(flpMeta.lastSyncedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'Not synced yet';
    $('cloudPush').textContent=flpMeta.pushActive?'Reliable alerts: on — reminders arrive even when the Lab is closed.':FL_PUSH_VAPID_PUBLIC_KEY?'Reliable alerts: turn on Dexx Alerts below to connect them.':'Reliable alerts: waiting for server setup (see README).';
  }
  $('cloudStatus').textContent=flpMeta.status||'';
}
document.addEventListener('submit',async e=>{
  if(e.target.id==='cloudEmailForm'){
    e.preventDefault();const email=$('cloudEmailInput').value.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)){$('cloudStatus').textContent='Enter a valid email.';return}
    const btn=e.submitter;if(btn)btn.disabled=true;
    try{await flpFetch('/auth/v1/otp',{method:'POST',body:JSON.stringify({email,create_user:true})},false);$('cloudCodeForm').hidden=false;$('cloudCodeForm').dataset.email=email;$('cloudStatus').textContent=`We emailed a 6-digit code to ${email}.`;$('cloudCodeInput').focus()}
    catch(err){$('cloudStatus').textContent=err.status===429?'Too many tries — wait a minute and try again.':`Couldn't send the code: ${err.message}`}
    finally{if(btn)btn.disabled=false}
  }
  if(e.target.id==='cloudCodeForm'){
    e.preventDefault();const email=e.target.dataset.email,token=$('cloudCodeInput').value.replace(/\s/g,'');if(!token){return}
    try{const s=await flpFetch('/auth/v1/verify',{method:'POST',body:JSON.stringify({email,token,type:'email'})},false);if(!s.expires_at)s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);flpSetSession(s);Object.assign(flpMeta,{remoteUpdatedAt:'',dirty:false,status:''});flpSaveMeta();e.target.reset();e.target.hidden=true;flpRenderCloud();await flpSyncNow({fromOpen:true});flpEnablePush()}
    catch(err){$('cloudStatus').textContent='That code didn\'t work or expired. Request a new one.'}
  }
});
document.addEventListener('click',async e=>{
  const t=e.target;
  if(t.closest('#cloudSyncNow')){await flpSyncNow({fromOpen:true});return}
  if(t.closest('#cloudSignOut')){if(!confirm('Sign out? Your data stays on this device.'))return;try{await flpFetch('/auth/v1/logout',{method:'POST'})}catch(_){}flpSetSession(null);Object.assign(flpMeta,{lastSyncedAt:'',remoteUpdatedAt:'',dirty:false,pushActive:false,status:''});flpSaveMeta();flpRenderCloud();return}
  const s=$('flpConflictSheet');
  if(t.closest('#flpUseCloud')&&s?._row){flpApplyRemote(s._row);s.hidden=true;return}
  if(t.closest('#flpUseDevice')&&s){s.hidden=true;flpMeta.remoteUpdatedAt=s._row?.updated_at||'';await flpPush().catch(err=>{flpMeta.status=`Sync paused: ${err.message}`;flpRenderCloud()});return}
  if(t.closest('#notifyEnableBtn'))setTimeout(()=>{if(flxNotifySettings().enabled)flpEnablePush().then(flpRenderCloud);flpScheduleSync()},800);
});
document.addEventListener('change',e=>{if(/^notify-/.test(e.target.id||''))flpScheduleSync()});

/* ───────────── wiring ───────────── */
function flpRenderAll(){try{flpBiz();flpRenderMileage();flpRenderFollowUps();flpRenderReport();flpRenderContractors();flpRenderCloud()}catch(err){console.warn('Business Pro render failed',err)}}
(function flpInit(){
  flpBiz();
  const baseRender=render;render=function(){baseRender.apply(this,arguments);flpRenderAll()};
  const baseSave=save;save=function(){const r=baseSave.apply(this,arguments);flpScheduleSync();return r};
  const baseAddInv=flxAddInvoice;flxAddInvoice=function(o){const rec=baseAddInv(o);if(o.repeat||o.email){rec.repeat=o.repeat?'monthly':'';rec.email=o.email||'';save({skipRecovery:true})}return rec};
  flpRunRepeatInvoices();flpRenderAll();
  if(flpSession)flpSyncNow({fromOpen:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){flpRunRepeatInvoices();if(flpSession)flpSyncNow({fromOpen:false})}});
  window.addEventListener('online',()=>{if(flpSession&&flpMeta.dirty)flpSyncNow()});
})();
