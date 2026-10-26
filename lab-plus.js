/* Financial Lab 4.4.0.0 — Invoice Builder, Cash Forecast, Restore my Lab, Receipt Attachments
   Loaded after lab-pro.js and reuses its globals. */

/* ═════════════ 1. INVOICE BUILDER ═════════════ */
function fliBizProfile(){const b=flpBiz();if(!b.profile||typeof b.profile!=='object')b.profile={address:'',email:'',phone:'',payInfo:''};if(!Number.isFinite(Number(b.invoiceSeq)))b.invoiceSeq=0;return b.profile}
function fliEnsureNumber(inv){fliBizProfile();const b=data.business;/* flpBiz() rebuilds data.business, so read it after */if(!inv.number){b.invoiceSeq=Number(b.invoiceSeq||0)+1;inv.number=`INV-${String(b.invoiceSeq).padStart(4,'0')}`}return inv.number}
function fliItems(inv){return Array.isArray(inv.items)&&inv.items.length?inv.items:[{d:inv.note||'Services',q:1,r:Number(inv.amount)||0}]}
function fliB64url(obj){const bytes=new TextEncoder().encode(JSON.stringify(obj));let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fliLink(inv){
  const b=flpBiz(),p=fliBizProfile();fliEnsureNumber(inv);
  const payload={n:inv.number,b:b.name||'',a:p.address||'',e:p.email||'',ph:p.phone||'',c:inv.client,ce:inv.email||'',iss:inv.issued||'',due:inv.dueDate||'',i:fliItems(inv).map(x=>({d:x.d,q:Number(x.q)||0,r:Number(x.r)||0})),pay:p.payInfo||'',no:inv.clientNote||'',p:inv.status==='paid'?1:0,cur:'USD'};
  return new URL('invoice.html',location.href.split('#')[0]).href+'#'+fliB64url(payload);
}
let fliDraft=[];
function fliRenderItems(){
  const host=$('fliItems');const inv=fliCurrent();if(!host||!inv)return;
  const items=fliDraft;
  host.innerHTML=items.map((x,i)=>`<div class="fli-item" data-i="${i}"><input data-f="d" value="${escapeHTML(x.d)}" placeholder="Description" maxlength="80" data-testid="invoice-item-desc"/><input data-f="q" type="number" inputmode="decimal" min="0" step="0.25" value="${x.q}" aria-label="Quantity" data-testid="invoice-item-qty"/><input data-f="r" type="number" inputmode="decimal" min="0" step="0.01" value="${x.r}" aria-label="Rate" data-testid="invoice-item-rate"/><button type="button" data-fli-remove="${i}" aria-label="Remove line">✕</button></div>`).join('');
  $('fliTotal').textContent=money(items.reduce((s,x)=>s+(Number(x.q)||0)*(Number(x.r)||0),0));
}
const fliCurrent=()=>{const s=$('fliSheet');return s&&data.business.invoices.find(i=>i.id===s.dataset.inv)};
function fliOpen(inv){
  const s=$('fliSheet');if(!s)return;s.dataset.inv=inv.id;fliEnsureNumber(inv);
  fliDraft=fliItems(inv).map(x=>({...x}));
  $('fliTitle').textContent=`${inv.number} · ${inv.client}`;
  $('fliClientEmail').value=inv.email||'';$('fliClientNote').value=inv.clientNote||'';
  const p=fliBizProfile();$('fliMissing').hidden=!!(data.business.name&&(p.payInfo||p.email));
  $('fliStatus').textContent=inv.status==='paid'?'This invoice is paid — the link shows a PAID stamp (good as a receipt).':'';
  fliRenderItems();s.hidden=false;
}
function fliCommit(){
  const inv=fliCurrent();if(!inv)return null;
  const items=fliDraft.filter(x=>String(x.d).trim()||Number(x.r)>0).map(x=>({d:String(x.d).trim()||'Services',q:clamp(x.q,0,1e6),r:clamp(x.r,0,1e9)}));
  const total=flpR2(items.reduce((s,x)=>s+x.q*x.r,0));
  inv.items=items;inv.email=$('fliClientEmail').value.trim();inv.clientNote=$('fliClientNote').value.trim();
  if(inv.status!=='paid'&&total>0)inv.amount=total;
  delete inv._draft;fliDraft=items.map(x=>({...x})); // drop any draft saved by older builds
  setRecoveryContext(`Invoice ${inv.number} updated`,`${money(inv.amount)} for ${inv.client}.`,'change');save({skipRecovery:true});
  return inv;
}

/* ═════════════ 2. 60-DAY CASH FORECAST ═════════════ */
function flcForecast(days=60){
  const b=flpBiz(),s=flxBizState(),today=dateAtNoon(new Date()),end=flxAddDays(today,days),todayIso=iso(today),endIso=iso(end);
  const rate=clamp(b.taxRate,0,60)/100;const ev=[];
  b.invoices.filter(i=>i.status!=='paid'&&i.dueDate>=todayIso&&i.dueDate<=endIso).forEach(i=>ev.push({date:i.dueDate,kind:'invoice',label:`${i.client} invoice due`,amount:Number(i.amount)||0}));
  const late=b.invoices.filter(i=>i.status!=='paid'&&i.dueDate&&i.dueDate<todayIso);
  b.invoices.filter(i=>i.repeat==='monthly'&&!i.spawned).forEach(i=>{let due=dateAtNoon(i.dueDate);for(let k=0;k<4;k++){due=new Date(due);due.setMonth(due.getMonth()+1);if(due>end)break;if(due>=today)ev.push({date:iso(due),kind:'repeat',label:`${i.client} repeat invoice (projected)`,amount:Number(i.amount)||0})}});
  ev.filter(e=>e.amount>0&&(e.kind==='invoice'||e.kind==='repeat')).slice().forEach(e=>ev.push({date:e.date,kind:'tax-aside',label:`Tax set-aside from ${e.label.split(' ')[0]} (${b.taxRate}%)`,amount:-flpR2(e.amount*rate)}));
  const since=iso(flxAddDays(today,-90));
  const spend90=flpSum(b.expenses.filter(x=>x.date>=since&&x.date<=todayIso))+flpSum(b.contractorPayments.filter(x=>x.date>=since&&x.date<=todayIso))+flpSum(b.draws.filter(x=>x.date>=since&&x.date<=todayIso));
  const weekly=flpR2(spend90/90*7);
  if(weekly>0)for(let w=1;w*7<=days;w++)ev.push({date:iso(flxAddDays(today,w*7)),kind:'burn',label:'Usual weekly costs + owner pay (90-day average)',amount:-weekly});
  const taxes=s.quarters.filter(q=>!q.paid&&q.due>=todayIso&&q.due<=endIso).map(q=>({date:q.due,label:`${q.label} estimated tax`,reserve:q.setAside}));
  ev.sort((a,c)=>a.date.localeCompare(c.date));
  let bal=s.cash;const points=[{date:todayIso,bal}];let low={date:todayIso,bal};
  const weekEnds=Array.from({length:Math.ceil(days/7)},(_,w)=>iso(flxAddDays(today,Math.min(days,(w+1)*7))));
  let idx=0;weekEnds.forEach(we=>{while(idx<ev.length&&ev[idx].date<=we){bal+=ev[idx].amount;if(bal<low.bal)low={date:ev[idx].date,bal};idx++}points.push({date:we,bal:flpR2(bal)})});
  const inflow=flpSum(ev.filter(e=>e.amount>0)),outflow=-flpSum(ev.filter(e=>e.amount<0));
  return {start:s.cash,end:flpR2(bal),inflow,outflow,low,points,events:ev,late,lateTotal:flpSum(late),weekly,taxes,taxReserve:s.taxReserve};
}
function flcExplain(f){
  const parts=[];const n=f.events.filter(e=>e.amount>0).length;
  parts.push(`Starting from ${money(f.start)} in business cash, I expect ${money(f.inflow)} to come in over the next 60 days from ${n} invoice${n===1?'':'s'}${f.events.some(e=>e.kind==='repeat')?' (including repeat ones)':''}, and about ${money(f.outflow)} to go out for taxes set aside and your usual costs.`);
  parts.push(`That leaves you around ${money(f.end)} in 60 days.`);
  if(f.low.bal<0)parts.push(`Watch out: cash dips below zero around ${dateText(f.low.date,{month:'short',day:'numeric'})} (${money(f.low.bal)}). Chase late invoices or hold off on owner pay before then.`);
  else if(f.low.date!==f.points[0].date)parts.push(`Your lowest point is ${money(f.low.bal)} around ${dateText(f.low.date,{month:'short',day:'numeric'})}.`);
  if(f.late.length)parts.push(`I'm not counting ${money(f.lateTotal)} in late invoices — collect those and you're ahead of this forecast.`);
  f.taxes.forEach(t=>parts.push(`${t.label} is due ${dateText(t.date,{month:'short',day:'numeric'})}; it's paid from your tax reserve (${money(f.taxReserve)} saved so far), not from this cash.`));
  if(!f.inflow&&!f.weekly)parts.push('Add invoices and expenses so I can make this forecast sharper.');
  return parts.join(' ');
}
function flcRender(){
  const host=$('bizForecastChart');if(!host)return;const f=flcForecast();
  $('bizForecastEnd').textContent=money(f.end);$('bizForecastEnd').classList.toggle('neg',f.end<0);
  const max=Math.max(1,...f.points.map(p=>Math.abs(p.bal)));const W=320,H=120,mid=f.points.some(p=>p.bal<0)?H/2:H-14,bw=W/f.points.length;
  const scale=(mid-8)/max;
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H+16}" role="img" aria-label="60 day cash forecast" preserveAspectRatio="none">${f.points.map((p,i)=>{const h=Math.max(2,Math.abs(p.bal)*scale);const y=p.bal>=0?mid-h:mid;return `<rect x="${i*bw+bw*.18}" y="${y}" width="${bw*.64}" height="${h}" rx="3" class="${p.bal<0?'neg':''}${p.date===f.low.date?' low':''}"/>`}).join('')}<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="axis"/>${f.points.map((p,i)=>i%2===0?`<text x="${i*bw+bw/2}" y="${H+12}" text-anchor="middle">${i===0?'Now':dateText(p.date,{month:'short',day:'numeric'})}</text>`:'').join('')}</svg>`;
  $('bizForecastExplain').textContent=flcExplain(f);
  $('bizForecastEvents').innerHTML=f.events.filter(e=>e.kind!=='burn').slice(0,8).map(e=>`<div class="flp-pl-row ${e.amount<0?'sub':''}"><span>${dateText(e.date,{month:'short',day:'numeric'})} · ${escapeHTML(e.label)}</span><b>${e.amount<0?'−':'+'}${money(Math.abs(e.amount))}</b></div>`).join('')+(f.weekly?`<div class="flp-pl-row sub"><span>Every week · usual costs + owner pay</span><b>−${money(f.weekly)}</b></div>`:'');
}

/* ═════════════ 4. RECEIPT ATTACHMENTS ═════════════ */
const FLR_DB='financial-lab-receipts';
function flrDb(){return new Promise((res,rej)=>{const r=indexedDB.open(FLR_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function flrTx(mode,fn){const db=await flrDb();try{return await new Promise((res,rej)=>{const tx=db.transaction('files',mode);const st=tx.objectStore('files');const out=fn(st);tx.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);tx.onerror=()=>rej(tx.error)})}finally{db.close()}}
const flrPut=(id,blob)=>flrTx('readwrite',st=>st.put({blob,addedAt:new Date().toISOString()},id));
const flrGetLocal=id=>flrTx('readonly',st=>st.get(id)).then(r=>r&&r.blob||null);
const flrDelLocal=id=>flrTx('readwrite',st=>st.delete(id));
async function flrCompress(file){
  const url=URL.createObjectURL(file);
  try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const sc=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return await new Promise(res=>c.toBlob(b=>res(b),'image/jpeg',.8));
  }finally{URL.revokeObjectURL(url)}
}
const flrPath=id=>`${flpSession.user.id}/${id}.jpg`;
async function flrStorageFetch(path,opts={}){
  if(flpSession&&flpSession.expires_at&&Date.now()/1000>flpSession.expires_at-60)await flpRefresh();
  const r=await fetch(`${FL_DEXX.url}/storage/v1/object/${path}`,{...opts,headers:{apikey:FL_DEXX.anonKey,authorization:`Bearer ${flpSession.access_token}`,...(opts.headers||{})}});
  if(!r.ok)throw new Error(`Storage ${r.status}`);return r;
}
async function flrUpload(exp){
  if(!flpSession||!exp.receipt)return false;
  const blob=await flrGetLocal(exp.id);if(!blob)return false;
  try{await flrStorageFetch(`receipts/${flrPath(exp.id)}`,{method:'POST',headers:{'content-type':'image/jpeg','x-upsert':'true'},body:blob});exp.receipt.cloud=true;save({skipRecovery:true,skipActivity:true});return true}
  catch(err){console.warn('Receipt upload waiting',err);return false}
}
async function flrUploadPending(){if(!flpSession)return;for(const x of flpBiz().expenses.filter(x=>x.receipt&&!x.receipt.cloud))await flrUpload(x)}
async function flrGet(exp){
  let blob=await flrGetLocal(exp.id).catch(()=>null);
  if(!blob&&exp.receipt?.cloud&&flpSession){try{blob=await (await flrStorageFetch(`authenticated/receipts/${flrPath(exp.id)}`)).blob();await flrPut(exp.id,blob)}catch(_){blob=null}}
  return blob;
}
async function flrAttach(exp,fileOrBlob){
  const blob=fileOrBlob instanceof Blob&&fileOrBlob.type==='image/jpeg'&&fileOrBlob.size<900000?fileOrBlob:await flrCompress(fileOrBlob);
  await flrPut(exp.id,blob);exp.receipt={addedAt:new Date().toISOString(),size:blob.size,cloud:false};
  setRecoveryContext(`Receipt attached: ${exp.name}`,'Receipt photo saved with the business expense.','change');save();
  flrUpload(exp);
}
async function flrRemove(exp){
  await flrDelLocal(exp.id).catch(()=>{});
  if(exp.receipt?.cloud&&flpSession){try{await flrStorageFetch(`receipts`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({prefixes:[flrPath(exp.id)]})})}catch(_){}}
  delete exp.receipt;setRecoveryContext(`Receipt removed: ${exp.name}`,'Receipt photo removed.','change');save();
}
let flrPending=null,flrIntakeBlob=null,flrViewUrl='';
function flrDecorateExpenses(){
  const b=flpBiz();
  document.querySelectorAll('#bizExpenseList [data-bizexp-delete]').forEach(btn=>{
    const exp=b.expenses.find(x=>x.id===btn.dataset.bizexpDelete);if(!exp||btn.parentElement.querySelector('[data-receipt]'))return;
    const r=document.createElement('button');r.type='button';r.dataset.receipt=exp.id;r.setAttribute('data-testid',exp.receipt?'receipt-view':'receipt-attach');
    r.textContent=exp.receipt?'🧾 Receipt':'+ Receipt';if(exp.receipt)r.classList.add('flr-has');
    btn.parentElement.insertBefore(r,btn);
  });
}
async function flrOpenViewer(exp){
  const s=$('flrSheet');if(!s)return;s.dataset.exp=exp.id;$('flrTitle').textContent=`${exp.name} · ${money(exp.amount)} · ${dateText(exp.date,{month:'short',day:'numeric',year:'numeric'})}`;
  const img=$('flrImage');if(flrViewUrl)URL.revokeObjectURL(flrViewUrl);flrViewUrl='';img.hidden=true;$('flrEmpty').hidden=true;
  $('flrRemove').hidden=!exp.receipt;$('flrDownload').hidden=!exp.receipt;
  $('flrCloud').textContent=exp.receipt?(exp.receipt.cloud?'Backed up to your cloud account.':flpSession?'Uploading to your cloud account…':'Saved on this device. Sign in to a cloud account to back it up.'):'';
  s.hidden=false;
  if(exp.receipt){const blob=await flrGet(exp);if(blob){flrViewUrl=URL.createObjectURL(blob);img.src=flrViewUrl;img.hidden=false}else{$('flrEmpty').hidden=false;$('flrEmpty').textContent='This receipt is stored on another device. Sign in to the same cloud account to see it here.'}}
  else{$('flrEmpty').hidden=false;$('flrEmpty').textContent='No receipt yet. Snap or choose a photo to keep with this expense.'}
}

/* ═════════════ 3. RESTORE MY LAB (front door) ═════════════ */
async function flrsRestoreAfterSignIn(){
  const st=$('restoreStatus');
  try{
    const row=await flpPull();
    if(!row||!row.payload||!row.payload.data){st.textContent='Signed in, but there is no saved Lab for this email yet. Tap JOIN THE LAB to set one up — it will back up automatically.';Object.assign(flpMeta,{remoteUpdatedAt:'',dirty:false});flpSaveMeta();flpRenderCloud();return}
    flpApplyRemote(row);
    if(row.payload.notify&&row.payload.notify.enabled){const ns=flxNotifySettings();ns.enabled=true;localStorage.setItem(FLX_NOTIFY_KEY,JSON.stringify(ns))}
    $('restoreSheet').hidden=true;
    openFinancialLab(data.business?.mode==='business'?'business':'laboratory');
    flrUploadPending();
  }catch(err){st.textContent=/relation|does not exist|42P01|schema cache/i.test(err.message)?'Cloud backup is not set up yet for this Lab.':`Couldn't restore: ${err.message}`}
}

/* ═════════════ events ═════════════ */
document.addEventListener('submit',e=>{ // capture: grab receipt + extra settings before lab-next resets the forms
  if(e.target.id==='bizExpenseForm'){const f=$('bizExpReceipt')?.files?.[0];flrPending=f||null}
  if(e.target.id==='bizSettingsForm'){const p=fliBizProfile();p.address=$('bizAddress').value.trim();p.email=$('bizEmail').value.trim();p.phone=$('bizPhone').value.trim();p.payInfo=$('bizPayInfo').value.trim()}
},true);
document.addEventListener('submit',async e=>{
  if(e.target.id==='restoreEmailForm'){
    e.preventDefault();const email=$('restoreEmail').value.trim().toLowerCase();const st=$('restoreStatus');
    if(!/^\S+@\S+\.\S+$/.test(email)){st.textContent='Enter the email you backed up with.';return}
    try{await flpFetch('/auth/v1/otp',{method:'POST',body:JSON.stringify({email,create_user:false})},false);$('restoreCodeForm').hidden=false;$('restoreCodeForm').dataset.email=email;st.textContent=`We emailed a 6-digit code to ${email}.`;$('restoreCode').focus()}
    catch(err){st.textContent=err.status===429?'Too many tries — wait a minute.':/signups not allowed|not found|otp_disabled/i.test(err.message)?'No Lab account found for that email.':`Couldn't send the code: ${err.message}`}
  }
  if(e.target.id==='restoreCodeForm'){
    e.preventDefault();const email=e.target.dataset.email,token=$('restoreCode').value.replace(/\s/g,'');if(!token)return;
    try{const s=await flpFetch('/auth/v1/verify',{method:'POST',body:JSON.stringify({email,token,type:'email'})},false);if(!s.expires_at)s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);flpSetSession(s);await flrsRestoreAfterSignIn()}
    catch(err){$('restoreStatus').textContent='That code didn\'t work or expired. Request a new one.'}
  }
});
document.addEventListener('click',async e=>{
  const t=e.target;
  if(t.closest('#businessLabFrontBtn')){e.preventDefault();flxEnsureData();data.business.mode='business';save({skipRecovery:true,skipActivity:true});flxApplyMode();openFinancialLab('business');return}
  if(t.closest('#restoreLabBtn')){e.preventDefault();$('restoreSheet').hidden=false;$('restoreStatus').textContent='';return}
  if(t.closest('[data-restore-close]')||t.id==='restoreSheet'){$('restoreSheet').hidden=true;return}
  const ib=t.closest('[data-inv-build]');if(ib){const inv=data.business.invoices.find(i=>i.id===ib.dataset.invBuild);if(inv)fliOpen(inv);return}
  if(t.closest('[data-fli-close]')||t.id==='fliSheet'){const inv=fliCurrent();fliDraft=[];$('fliSheet').hidden=true;return}
  if(t.closest('#fliAddItem')){const inv=fliCurrent();if(inv){fliDraft.push({d:'',q:1,r:0});fliRenderItems()}return}
  const rm=t.closest('[data-fli-remove]');if(rm){const inv=fliCurrent();if(inv&&fliDraft.length>1){fliDraft.splice(Number(rm.dataset.fliRemove),1);fliRenderItems()}return}
  if(t.closest('#fliSave')){const inv=fliCommit();if(inv)$('fliStatus').textContent=`Saved. Total ${money(inv.amount)}.`;return}
  if(t.closest('#fliShare')||t.closest('#fliPreview')){
    const inv=fliCommit();if(!inv)return;const url=fliLink(inv);
    if(t.closest('#fliPreview')){window.open(url,'_blank','noopener');return}
    inv.sentAt=flxTodayIso();save({skipRecovery:true,skipActivity:true});
    const text=`Invoice ${inv.number} from ${data.business.name||'me'} — ${money(inv.amount)} due ${dateText(inv.dueDate,{month:'short',day:'numeric'})}`;
    if(navigator.share){try{await navigator.share({title:text,text,url});$('fliStatus').textContent='Shared.'}catch(_){}}
    else{try{await navigator.clipboard.writeText(url);$('fliStatus').textContent='Link copied — paste it into a text or email.'}catch(_){prompt('Copy this invoice link',url)}}
    return;
  }
  const rb=t.closest('[data-receipt]');if(rb){const exp=flpBiz().expenses.find(x=>x.id===rb.dataset.receipt);if(exp)flrOpenViewer(exp);return}
  if(t.closest('[data-flr-close]')||t.id==='flrSheet'){$('flrSheet').hidden=true;if(flrViewUrl){URL.revokeObjectURL(flrViewUrl);flrViewUrl=''}return}
  const exp=$('flrSheet')&&flpBiz().expenses.find(x=>x.id===$('flrSheet').dataset.exp);
  if(t.closest('#flrRemove')&&exp){if(!confirm('Remove this receipt photo?'))return;await flrRemove(exp);flrOpenViewer(exp);return}
  if(t.closest('#flrDownload')&&exp){const blob=await flrGet(exp);if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`receipt-${exp.date}-${String(exp.name).replace(/[^\w]+/g,'-')}.jpg`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);return}
});
document.addEventListener('input',e=>{
  const row=e.target.closest('.fli-item');if(!row)return;const inv=fliCurrent();if(!inv)return;
  const it=fliDraft[Number(row.dataset.i)];if(!it)return;it[e.target.dataset.f]=e.target.dataset.f==='d'?e.target.value:Number(e.target.value)||0;
  $('fliTotal').textContent=money(fliDraft.reduce((s,x)=>s+(Number(x.q)||0)*(Number(x.r)||0),0));
});
document.addEventListener('change',async e=>{
  if(e.target.id!=='flrPicker')return;const f=e.target.files&&e.target.files[0];e.target.value='';
  const exp=flpBiz().expenses.find(x=>x.id===$('flrSheet').dataset.exp);if(!f||!exp)return;
  $('flrCloud').textContent='Saving receipt…';await flrAttach(exp,f);flrOpenViewer(exp);
});

/* ═════════════ wiring into earlier modules ═════════════ */
(function fliInit(){
  fliBizProfile();
  const rs=$('restoreSheet');if(rs&&rs.parentElement!==document.body)document.body.appendChild(rs); // must sit outside the app shell so it shows over the welcome screen
  // invoice numbers on creation
  const baseAdd=flxAddInvoice;flxAddInvoice=function(o){const rec=baseAdd(o);fliEnsureNumber(rec);save({skipRecovery:true,skipActivity:true});return rec};
  // receipts on business expense creation (form or Dexx card)
  const baseExp=flxAddBizExpense;flxAddBizExpense=function(o){const rec=baseExp(o);const f=flrPending;flrPending=null;if(f)flrAttach(rec,f).then(()=>render());return rec};
  // photo intake: keep the photo in memory only until the card is saved/canceled, and only attach if the person opts in
  const baseHandle=flxHandlePhoto;flxHandlePhoto=async function(file){flrIntakeBlob=null;if(file){try{flrIntakeBlob=await flrCompress(file)}catch(_){}}return baseHandle(file)};
  const baseFields=flxCardFields;flxCardFields=function(a){const h=baseFields(a);return a.type==='biz-expense'&&flrIntakeBlob?h+flxSelect('Keep this photo as the receipt?','attachReceipt',a.attachReceipt||'yes',{yes:'Yes — attach to this expense',no:'No — discard the photo'}):h};
  const baseExec=flxExecuteAction;flxExecuteAction=function(a){const attach=a.type==='biz-expense'&&a.attachReceipt!=='no'&&!!flrIntakeBlob;if(attach)flrPending=flrIntakeBlob;const r=baseExec(a);flrPending=null;if(/^Saved/.test(r)){flrIntakeBlob=null;return attach?r+' Receipt photo attached.':r}return r};
  document.addEventListener('click',e=>{if(e.target.closest('.flx-action-card [data-flx-cancel]'))flrIntakeBlob=null},true);
  // invoice row "Invoice" button
  const decorateInvoices=()=>document.querySelectorAll('#bizInvoiceList [data-inv-delete]').forEach(btn=>{if(btn.parentElement.querySelector('[data-inv-build]'))return;const inv=data.business.invoices.find(i=>i.id===btn.dataset.invDelete);const b=document.createElement('button');b.type='button';b.dataset.invBuild=btn.dataset.invDelete;b.setAttribute('data-testid','invoice-build');b.textContent=inv&&inv.sentAt?'Invoice ✓':'Send invoice';btn.parentElement.insertBefore(b,btn)});
  // settings fields
  const fillSettings=()=>{const p=fliBizProfile();[['bizAddress','address'],['bizEmail','email'],['bizPhone','phone'],['bizPayInfo','payInfo']].forEach(([id,k])=>{const el=$(id);if(el&&document.activeElement!==el&&!el.dataset.touched)el.value=p[k]||''})};
  document.addEventListener('input',e=>{if(/^biz(Address|Email|Phone|PayInfo)$/.test(e.target.id))e.target.dataset.touched='1'});
  const baseRender=render;render=function(){baseRender.apply(this,arguments);try{decorateInvoices();flrDecorateExpenses();flcRender();fillSettings()}catch(err){console.warn('4.4 render failed',err)}};
  // Dexx knows the forecast
  const baseSnap=dexxSnapshotText;dexxSnapshotText=function(){const s=baseSnap.apply(this,arguments);if(data.business?.mode!=='business')return s;const f=flcForecast();return s+`\n60-day cash forecast: start ${money(f.start)}, expected in ${money(f.inflow)}, out ${money(f.outflow)}, end ${money(f.end)}, lowest ${money(f.low.bal)} on ${f.low.date}. Late invoices not counted: ${money(f.lateTotal)}.`};
  render();
  if(flpSession)flrUploadPending();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&flpSession)flrUploadPending()});
})();
