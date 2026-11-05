/* Financial Lab 4.4.0.0 — Part A first-run flow (brief section 3).
   Built 2026-11-05, local only. Loaded AFTER app.js / lab-next.js /
   lab-pro.js / lab-plus.js, so the app's globals (data, save, calc,
   openFinancialLab, openFrontDoor, show, setRecoveryContext, clamp,
   dateAtNoon, iso, money) are already defined.
   ------------------------------------------------------------------
   WHAT IT DOES
   First-run users only (exact app.js boot gate, L6747:
   firstRun = !data.setup || !data.setup.currentMoneyConfirmed).
   Shows the 5-screen flow from the approved preview, but every answer
   writes REAL data (same records the app's own forms write) and saves
   with the app's save(), so the plan the flow shows IS the app's plan.
   Returning users: this file does nothing at all.
   ------------------------------------------------------------------
   DATA IT WRITES (all via the app's own save() + recovery context)
   - Screen 3: data.paycheck, data.payDate, data.nextPayday
     (= payDate + payFrequencyDays; profile.payFrequency defaults to
     'weekly', so +7 days), data.setup.expectedPaycheck,
     data.setup.nextPayday, data.setup.incomeConfirmed = true.
     "I don't know yet" path (added 2026-11-05): the amount can be
     marked UNKNOWN — unknown is a real state, never $0: no paycheck
     is saved, any stale paycheck is deleted, incomeConfirmed = false,
     setup.paycheckUnknown = true. The date is still required (cycle
     anchor). The amount is confirmed later at payday check-in.
     One-tap chips (added 2026-11-05): "This Friday" / "Next Friday"
     set the date only on tap — never pre-filled.
   - Screen 4: data.bills[] in the exact bill-manager shape (bill-name
     chips added 2026-11-05 fill the name on tap; the field stays editable)
     {id, name, amount, dueDate, date, priority:'essential',
     frequency:'monthly', autopay:false, paidOccurrences:[]};
     data.unexpectedFund (set-aside stepper, $25 steps).
   - Screen 5 (first render): data.setup.currentMoneyConfirmed = true
     + completedAt, so the next load skips the front door.
   IT NEVER: approves a plan (approval stays a deliberate tap in Payday
   Mode), touches debts, incomes, Dexx, Cloud Account, notifications,
   login-events, or existing data. Debts are not asked (brief section 3).
   ------------------------------------------------------------------
   DELIBERATE DEVIATIONS FROM THE PREVIEW (see PATCH-NOTES.md)
   - No pre-filled coming-Friday date: a default date in the real app
     would be saved as fact. The date input starts empty.
   - Bill due date is required: the app's bill math needs a due date
     (the bill manager requires name + amount + due date too).
   - Screen 5 shows the REAL plan from calc() (bills, set-aside,
     savings, reserve, safe), not the preview's simple subtraction —
     the app is the source of truth, and the two differ by Dexx's
     10% savings + reserves for the bills' next occurrences.
   - Screen 1 adds two quiet links the preview did not need: Restore
     my Lab (new-phone cloud restore) and "Set up the detailed way"
     (the existing guided setup). Business Lab is the brief's
     required secondary link. All three reuse the app's real buttons. */
(function () {
  'use strict';

  /* ---------- guards: the app must be loaded ---------- */
  if (typeof document === 'undefined') return;
  if (typeof data === 'undefined' || !data) return;
  if (typeof save !== 'function') return;

  /* First-run gate: the exact condition app.js uses at boot (L6747). */
  function flIsFirstRun() {
    try { return !data.setup || !data.setup.currentMoneyConfirmed; }
    catch (_) { return false; }
  }
  if (!flIsFirstRun()) return; /* Returning users: do nothing. */

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- small helpers (preview's fmt/fmtDate, verbatim) ---------- */
  function flFmt(n) {
    var neg = n < 0;
    var v = Math.abs(Math.round(n * 100) / 100);
    var s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: (v % 1 ? 2 : 0) });
    return (neg ? '-$' : '$') + s;
  }
  function flMoney(n) {
    try { if (typeof money === 'function') return money(n); } catch (_) {}
    return flFmt(n);
  }
  function flFmtDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function flParseAmt(el) {
    if (!el) return 0;
    var v = parseFloat(el.value);
    return isNaN(v) || v < 0 ? 0 : v;
  }
  function flClamp(v, min, max) {
    try { if (typeof clamp === 'function') return clamp(v, min, max); } catch (_) {}
    var n = Number(v) || 0;
    return Math.min(max, Math.max(min, n));
  }
  function flFreqDays() {
    var f = (data.profile && data.profile.payFrequency) || 'weekly';
    return f === 'biweekly' ? 14 : f === 'monthly' ? 30 : 7;
  }
  function flAddDaysISO(isoStr, days) {
    var d = null;
    try { if (typeof dateAtNoon === 'function') d = dateAtNoon(isoStr); } catch (_) {}
    if (!d) d = new Date(isoStr + 'T12:00:00');
    if (!d || isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  /* One-tap payday: This Friday = the nearest Friday that is today or
     in the future (today itself when today is Friday); Next Friday is
     +7 days. Labels carry the real date so the user sees exactly what
     they are picking. Nothing is pre-filled — these values only land
     in the date input when a chip is tapped. */
  function flLocalNoon(d) {
    var x = new Date(d.getTime());
    x.setHours(12, 0, 0, 0);
    return x;
  }
  function flISODate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function flShortDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function flThisFriday() {
    var today = flLocalNoon(new Date());
    var delta = (5 - today.getDay() + 7) % 7; /* Friday = 5; 0 when today is Friday */
    var f = new Date(today.getTime());
    f.setDate(f.getDate() + delta);
    return f;
  }
  function flFridayPair() {
    var thisFri = flThisFriday();
    var nextFri = new Date(thisFri.getTime());
    nextFri.setDate(nextFri.getDate() + 7);
    return {
      thisFri: { iso: flISODate(thisFri), label: flShortDate(thisFri) },
      nextFri: { iso: flISODate(nextFri), label: flShortDate(nextFri) }
    };
  }
  var flFridays = flFridayPair();
  /* One-tap bill names (Screen 4): the usual bills. Tapping one fills
     the name field for the bill being entered; the field stays editable. */
  var flBillChipNames = ['Rent', 'Electric', 'Water', 'Phone', 'Internet', 'Car payment', 'Insurance'];
  var flBillChipsHtml = flBillChipNames.map(function (n) {
    return '<button class="fl-chip" type="button" data-fl-bill="' + n + '">' + n + '</button>';
  }).join('');
  function flNewId(prefix) {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  }
  function flBillsTotal() {
    return (Array.isArray(data.bills) ? data.bills : []).reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);
  }
  function flSetAside() { return Math.max(0, Number(data.unexpectedFund) || 0); }
  function flSimpleSafe(payAmount) {
    return payAmount - flBillsTotal() - flSetAside();
  }

  /* ---------- save + Saved flash ---------- */
  var flFlashTimer = null;
  function flFlash() {
    var f = $('flSavedFlash');
    if (!f) return;
    f.classList.add('show');
    clearTimeout(flFlashTimer);
    flFlashTimer = setTimeout(function () { f.classList.remove('show'); }, 1400);
  }
  function flSave(label, detail) {
    try { if (typeof setRecoveryContext === 'function') setRecoveryContext(label, detail || '', 'change'); } catch (_) {}
    save();
  }

  /* ---------- overlay DOM (static copy only; user data via textContent) ---------- */
  var flOverlay = document.createElement('div');
  flOverlay.id = 'flFirstRun';
  flOverlay.innerHTML =
    '<div class="fl-saved-flash" id="flSavedFlash" role="status">Saved \u2713</div>' +
    '<div class="fl-stage">' +
      '<div class="fl-progress" id="flProgress" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
      '<div class="fl-topbar"><button class="fl-back-btn" id="flBackBtn" type="button">\u2039 Back</button><span class="fl-step-label" id="flStepLabel"></span></div>' +

      /* Screen 1 — front door */
      '<section class="fl-screen active" id="flScreen1">' +
        '<div class="fl-grow" style="display:flex; flex-direction:column; justify-content:center;">' +
          '<div class="fl-brand">Financial Lab</div>' +
          '<img class="fl-dexx" src="dexx-character-clean.jpg" alt="Dexx, the Financial Lab coach" onerror="this.onerror=null;this.style.display=\'none\'"/>' +
          '<h1>See what your paycheck can really do.</h1>' +
          '<p class="fl-dexx-quote">&ldquo;Before you spend the check, let&rsquo;s run the experiment.&rdquo;</p>' +
        '</div>' +
        '<button class="fl-btn" type="button" id="flShowPlan">Show me my plan</button>' +
        '<div class="fl-links">' +
          '<button class="fl-link" type="button" id="flBusinessLink">Business Lab</button>' +
          '<button class="fl-link" type="button" id="flRestoreLink">Restore my Lab</button><br/>' +
          '<button class="fl-link fl-link-quiet" type="button" id="flDetailedLink">Set up the detailed way</button>' +
        '</div>' +
      '</section>' +

      /* Screen 2 — sample plan */
      '<section class="fl-screen" id="flScreen2">' +
        '<h2>Here&rsquo;s what a plan looks like</h2>' +
        '<p class="fl-lede" style="font-size:16px;">One paycheck, sorted before payday even starts.</p>' +
        '<div style="height:18px;"></div>' +
        '<div class="fl-plan-card">' +
          '<span class="fl-plan-tag">Example plan</span>' +
          '<div class="fl-flow">' +
            '<div class="fl-node"><div class="fl-n-lbl">Paycheck</div><div class="fl-n-val">$1,500</div></div>' +
            '<div class="fl-chev">\u2192</div>' +
            '<div class="fl-node"><div class="fl-n-lbl">Bills covered</div><div class="fl-n-val">$900</div></div>' +
          '</div>' +
          '<div class="fl-flow">' +
            '<div class="fl-node"><div class="fl-n-lbl">Set aside</div><div class="fl-n-val">$200</div></div>' +
            '<div class="fl-chev">\u2192</div>' +
            '<div class="fl-node spend"><div class="fl-n-lbl">Safe to spend</div><div class="fl-n-val">$400</div></div>' +
          '</div>' +
          '<div class="fl-plan-row" style="margin-top:8px;"><span class="fl-lbl">Rent<span class="fl-sub">due the 1st</span></span><span class="fl-val">$650</span></div>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Electric<span class="fl-sub">due the 9th</span></span><span class="fl-val">$120</span></div>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Phone<span class="fl-sub">due the 14th</span></span><span class="fl-val">$85</span></div>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Car insurance<span class="fl-sub">due the 20th</span></span><span class="fl-val">$45</span></div>' +
        '</div>' +
        '<div class="fl-grow"></div>' +
        '<p style="font-size:17px; font-weight:600; margin:0 0 14px;">This is what yours looks like. Takes 2 minutes.</p>' +
        '<button class="fl-btn" type="button" id="flBuildMine">Build mine</button>' +
      '</section>' +

      /* Screen 3 — paycheck */
      '<section class="fl-screen" id="flScreen3">' +
        '<h2>When&rsquo;s your next paycheck?</h2>' +
        '<p class="fl-lede" style="font-size:16px;">Just the date and the amount. Nothing else.</p>' +
        '<div style="height:20px;"></div>' +
        '<div class="fl-chips" id="flPaydayChips">' +
          '<button class="fl-chip" type="button" id="flChipThisFri">This Friday \u00b7 ' + flFridays.thisFri.label + '</button>' +
          '<button class="fl-chip" type="button" id="flChipNextFri">Next Friday \u00b7 ' + flFridays.nextFri.label + '</button>' +
        '</div>' +
        '<div class="fl-field"><label for="flPayDate">Payday</label><input type="date" id="flPayDate" /></div>' +
        '<div class="fl-field"><label for="flPayAmount">How much is the check?</label><div class="fl-money"><input type="number" id="flPayAmount" inputmode="decimal" min="0" placeholder="0" /></div></div>' +
        '<button class="fl-unknown-link" type="button" id="flUnknownAmt">I don&rsquo;t know my check amount yet</button>' +
        '<div class="fl-preview" id="flPreview3" style="display:none;">' +
          '<h3>Your plan so far</h3>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Paycheck<span class="fl-sub" id="flPayDateSub"></span></span><span class="fl-val" id="flPv3Pay">$0</span></div>' +
          '<div class="fl-plan-row hero"><span class="fl-lbl">Safe to spend</span><span class="fl-val" id="flPv3Safe">$0</span></div>' +
          '<p class="fl-fine" id="flPv3Fine" style="margin:6px 0 10px;">Bills come next &mdash; watch this number move as you add them.</p>' +
        '</div>' +
        '<div class="fl-grow"></div>' +
        '<button class="fl-btn" type="button" id="flToBills" disabled>Next: your bills</button>' +
      '</section>' +

      /* Screen 4 — bills */
      '<section class="fl-screen" id="flScreen4">' +
        '<h2>What&rsquo;s due before that check?</h2>' +
        '<p class="fl-lede" style="font-size:16px;">One bill at a time. Rent, lights, phone &mdash; whatever has to be paid out of this check.</p>' +
        '<div style="height:18px;"></div>' +
        '<ul class="fl-bill-list" id="flBillList"></ul>' +
        '<div class="fl-chips" id="flBillChips">' + flBillChipsHtml + '</div>' +
        '<div class="fl-field"><label for="flBillName">Bill name</label><input type="text" id="flBillName" placeholder="Rent" autocomplete="off" /></div>' +
        '<div class="fl-field-row">' +
          '<div class="fl-field narrow"><label for="flBillAmount">Amount</label><div class="fl-money"><input type="number" id="flBillAmount" inputmode="decimal" min="0" placeholder="0" /></div></div>' +
          '<div class="fl-field"><label for="flBillDue">Due date</label><input type="date" id="flBillDue" /></div>' +
        '</div>' +
        '<button class="fl-btn-quiet" type="button" id="flAddBill" disabled>Add this bill</button>' +
        '<p class="fl-fine" id="flDueHint" style="display:none; margin:8px 0 0;">Add the due date to save this bill.</p>' +
        '<div class="fl-preview" id="flPreview4">' +
          '<h3>Your plan so far</h3>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Paycheck<span class="fl-sub" id="flPv4DateSub"></span></span><span class="fl-val" id="flPv4Pay">$0</span></div>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Bills covered</span><span class="fl-val" id="flPv4Bills">$0</span></div>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Set aside <span style="font-weight:500; color:var(--fl-ink-faint); font-size:13px;">(optional)</span></span>' +
            '<span class="fl-stepper"><button type="button" id="flAsideMinus" aria-label="Set aside less">\u2212</button><span class="fl-s-val" id="flPv4Aside">$0</span><button type="button" id="flAsidePlus" aria-label="Set aside more">+</button></span></div>' +
          '<div class="fl-plan-row hero"><span class="fl-lbl">Safe to spend</span><span class="fl-val" id="flPv4Safe">$0</span></div>' +
          '<div class="fl-warn" id="flOverWarn">These bills add up to more than this check. That happens &mdash; your plan will show you exactly where you stand, and what to tackle first.</div>' +
        '</div>' +
        '<div style="height:16px;"></div>' +
        '<button class="fl-btn" type="button" id="flToPlan">See my plan</button>' +
        '<p class="fl-fine" style="text-align:center; margin:10px 0 0;" id="flDoneHint">Add at least one bill, or tap &ldquo;See my plan&rdquo; if nothing&rsquo;s due before this check.</p>' +
      '</section>' +

      /* Screen 5 — her first plan (real calc() numbers) */
      '<section class="fl-screen" id="flScreen5">' +
        '<div class="fl-big-check">\u2713</div>' +
        '<h2>That&rsquo;s your plan.</h2>' +
        '<p class="fl-lede" id="flFinLede" style="font-size:16px;">Built around your real paycheck, in plain words.</p>' +
        '<div style="height:18px;"></div>' +
        '<div class="fl-plan-card">' +
          '<span class="fl-plan-tag mine">Your plan</span>' +
          '<div class="fl-plan-row" style="padding-top:2px;"><span class="fl-lbl">Paycheck<span class="fl-sub" id="flFinDateSub"></span></span><span class="fl-val" id="flFinPay">$0</span></div>' +
          '<div id="flFinBillsWrap"><p style="margin:14px 0 2px; font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--fl-ink-faint);">Bills covered first</p><ul class="fl-final-bills" id="flFinBills"></ul></div>' +
          '<div class="fl-plan-row"><span class="fl-lbl">Bills total</span><span class="fl-val" id="flFinBillsTotal">$0</span></div>' +
          '<div class="fl-plan-row" id="flFinAsideRow"><span class="fl-lbl">Set aside</span><span class="fl-val" id="flFinAside">$0</span></div>' +
          '<div class="fl-plan-row" id="flFinSavingsRow" style="display:none;"><span class="fl-lbl">Savings<span class="fl-sub">Dexx sets this aside for you</span></span><span class="fl-val" id="flFinSavings">$0</span></div>' +
          '<div class="fl-plan-row" id="flFinReserveRow" style="display:none;"><span class="fl-lbl">Reserve for later bills<span class="fl-sub">Held for bills due after this payday</span></span><span class="fl-val" id="flFinReserve">$0</span></div>' +
          '<div class="fl-plan-row hero"><span class="fl-lbl">Safe to spend</span><span class="fl-val" id="flFinSafe">$0</span></div>' +
        '</div>' +
        '<div class="fl-warn" id="flOverWarn5">These bills add up to more than this check. That happens &mdash; your plan will show you exactly where you stand, and what to tackle first.</div>' +
        '<p class="fl-fine" id="flFinShortfallNote" style="display:none; margin:12px 0 0;">Some bills fall after this payday &mdash; Dexx holds a reserve for them, so they are covered too.</p>' +
        '<div class="fl-next-step"><div class="fl-ns-lbl">Your one next step</div><p>That&rsquo;s it. Come back on payday &mdash; <span id="flFinPaydayText">your payday</span> &mdash; and check in. We&rsquo;ll take the next step together.</p></div>' +
        '<p class="fl-fine" id="flUnknownNote" style="display:none; margin:12px 0 0;">Your check amount is still to confirm &mdash; when the check lands, check in on payday with the real amount and we&rsquo;ll finish the plan together.</p>' +
        '<p class="fl-fine" id="flFreqNote" style="display:none; margin:12px 0 0;">Paid every 2 weeks or monthly? Your plan assumes weekly for now &mdash; change it in Financial Profile and it updates.</p>' +
        '<div class="fl-grow"></div>' +
        '<button class="fl-btn" type="button" id="flSeeApp">See it in the app \u2192</button>' +
        '<button class="fl-btn-ghost" type="button" id="flBackStart">\u2039 Back to the start</button>' +
      '</section>' +
    '</div>';
  document.body.appendChild(flOverlay);

  var flScreens = [1, 2, 3, 4, 5].map(function (n) { return $('flScreen' + n); });
  var flProgressBars = flOverlay.querySelectorAll('#flProgress span');
  var flCurrentScreen = 1;
  var flSetupCompleted = false;
  /* "I don't know yet" state: the check amount is UNKNOWN — a real
     state, never $0. flStashedAmount holds the typed value while the
     input is disabled, so toggling back restores it. */
  var flAmountUnknown = false;
  var flStashedAmount = '';

  function flShowScreen(n) {
    flCurrentScreen = n;
    flScreens.forEach(function (s, i) { s.classList.toggle('active', i === n - 1); });
    flProgressBars.forEach(function (b, i) { b.classList.toggle('on', i < n); });
    var back = $('flBackBtn');
    if (back) back.classList.toggle('show', n > 1 && n < 5);
    var label = $('flStepLabel');
    if (label) label.textContent = n === 1 ? '' : 'Step ' + (n - 1) + ' of 4';
    flOverlay.scrollTop = 0;
    window.scrollTo(0, 0);
    if (n === 5) flRenderFinal();
  }
  function flShowOverlay(n) {
    flOverlay.style.display = '';
    document.body.classList.add('front-door-active');
    document.body.style.overflow = 'hidden';
    flShowScreen(n || 1);
  }
  function flHideOverlay() { flOverlay.style.display = 'none'; }

  function flPulse(el) {
    if (!el) return;
    el.classList.remove('fl-pulse');
    void el.offsetWidth;
    el.classList.add('fl-pulse');
  }

  /* ---------- Screen 3: paycheck (date + amount, saved as answered) ---------- */
  var flPayDateEl = $('flPayDate'), flPayAmtEl = $('flPayAmount');
  var flPaySaveTimer = null;

  function flSavePaycheckNow(flash) {
    clearTimeout(flPaySaveTimer);
    var payDate = flPayDateEl ? flPayDateEl.value : '';
    /* Unknown is a real state, not $0: the effective amount is 0 only
       for gating math, and nothing below writes 0 as a paycheck. */
    var payAmount = flAmountUnknown ? 0 : flParseAmt(flPayAmtEl);
    if (!payDate && payAmount <= 0) return false;
    if (payDate) {
      data.payDate = payDate;
      data.nextPayday = flAddDaysISO(payDate, flFreqDays());
      data.setup = data.setup || {};
      data.setup.nextPayday = payDate;
    }
    if (flAmountUnknown) {
      /* Never save 0 as fact, and clear any stale paycheck saved by an
         earlier partial run. incomeConfirmed = false is the app's own
         "income not received" state. */
      try { delete data.paycheck; } catch (_) {}
      data.setup = data.setup || {};
      try { delete data.setup.expectedPaycheck; } catch (_) {}
      data.setup.incomeConfirmed = false;
      data.setup.paycheckUnknown = true;
    } else if (payAmount > 0) {
      data.paycheck = payAmount;
      data.setup = data.setup || {};
      data.setup.expectedPaycheck = payAmount;
      data.setup.paycheckUnknown = false;
      if (payDate) data.setup.incomeConfirmed = true;
    }
    flSave('First-run setup: paycheck',
      (flAmountUnknown ? 'Paycheck amount to confirm' :
       payAmount > 0 ? flMoney(payAmount) + ' paycheck' : 'Paycheck') +
      (payDate ? ' expected ' + flFmtDate(payDate) : '') + '.');
    if (flash) flFlash();
    return true;
  }
  function flSavePaycheckSoon() {
    clearTimeout(flPaySaveTimer);
    flPaySaveTimer = setTimeout(function () { flSavePaycheckNow(true); }, 450);
  }
  function flSyncPaycheck() {
    var payDate = flPayDateEl ? flPayDateEl.value : '';
    var payAmount = flAmountUnknown ? 0 : flParseAmt(flPayAmtEl);
    /* Next enables with the date + a known amount, OR the date + the
       amount marked unknown. The date stays required (cycle anchor). */
    var ready = !!payDate && (flAmountUnknown || payAmount > 0);
    var next = $('flToBills');
    if (next) next.disabled = !ready;
    var preview = $('flPreview3');
    if (preview) preview.style.display = ready ? '' : 'none';
    if (ready) {
      var sub = $('flPayDateSub');
      if (sub) sub.textContent = flFmtDate(payDate);
      var p = $('flPv3Pay'), s = $('flPv3Safe');
      if (flAmountUnknown) {
        /* Never a computed number from an unknown income. */
        if (p) p.textContent = 'To confirm';
        if (s) { s.textContent = 'To confirm'; s.classList.remove('neg'); }
      } else {
        if (p) p.textContent = flFmt(payAmount);
        if (s) {
          var safe = flSimpleSafe(payAmount);
          s.textContent = flFmt(safe);
          s.classList.toggle('neg', safe < 0);
          flPulse(s);
        }
      }
      var fine = $('flPv3Fine');
      if (fine) fine.textContent = flAmountUnknown
        ? 'Bills come next \u2014 your check amount gets confirmed at payday check-in.'
        : 'Bills come next \u2014 watch this number move as you add them.';
    }
    flSyncPaydayChips();
  }
  /* "I don't know yet" toggle: marks the amount UNKNOWN (a real state,
     never $0). The amount input is disabled and stashed while unknown,
     so the UI never shows a stale number as fact; toggling back
     restores it. */
  var flUnknownBtn = $('flUnknownAmt');
  function flSetAmountUnknown(on, saveIt) {
    flAmountUnknown = !!on;
    if (on) {
      flStashedAmount = flPayAmtEl ? flPayAmtEl.value : '';
      if (flPayAmtEl) flPayAmtEl.value = '';
    } else if (flPayAmtEl) {
      flPayAmtEl.value = flStashedAmount || '';
      flStashedAmount = '';
    }
    if (flPayAmtEl) flPayAmtEl.disabled = flAmountUnknown;
    if (flUnknownBtn) {
      flUnknownBtn.classList.toggle('on', flAmountUnknown);
      flUnknownBtn.textContent = flAmountUnknown
        ? '\u2713 To confirm \u2014 tap to enter an amount'
        : 'I don\u2019t know my check amount yet';
    }
    flSyncPaycheck();
    if (saveIt) flSavePaycheckNow(true);
  }
  if (flUnknownBtn) flUnknownBtn.addEventListener('click', function () { flSetAmountUnknown(!flAmountUnknown, true); });
  /* One-tap payday chips: tapping one sets the date input to that
     Friday and runs the same change handling as manual entry
     (live preview update, Next gating, debounced save). The selected
     chip is synced from the date value itself, so manually editing
     the date clears the selection — a chip is never shown selected
     for a date that isn't set. */
  function flSyncPaydayChips() {
    var v = flPayDateEl ? flPayDateEl.value : '';
    var t = $('flChipThisFri'), n = $('flChipNextFri');
    if (t) t.classList.toggle('on', v === flFridays.thisFri.iso);
    if (n) n.classList.toggle('on', v === flFridays.nextFri.iso);
  }
  function flPickFriday(iso) {
    if (!flPayDateEl) return;
    flPayDateEl.value = iso;
    flSyncPaycheck();
    flSavePaycheckSoon();
  }
  var flChipThisFri = $('flChipThisFri'), flChipNextFri = $('flChipNextFri');
  if (flChipThisFri) flChipThisFri.addEventListener('click', function () { flPickFriday(flFridays.thisFri.iso); });
  if (flChipNextFri) flChipNextFri.addEventListener('click', function () { flPickFriday(flFridays.nextFri.iso); });
  if (flPayDateEl) {
    flPayDateEl.addEventListener('change', function () { flSyncPaycheck(); flSavePaycheckSoon(); });
    flPayDateEl.addEventListener('input', function () { flSyncPaycheck(); flSavePaycheckSoon(); });
  }
  if (flPayAmtEl) {
    flPayAmtEl.addEventListener('input', function () { flSyncPaycheck(); flSavePaycheckSoon(); });
    flPayAmtEl.addEventListener('change', function () { flSyncPaycheck(); flSavePaycheckNow(true); });
  }

  /* ---------- Screen 4: bills, one at a time ---------- */
  var flBillNameEl = $('flBillName'), flBillAmtEl = $('flBillAmount'), flBillDueEl = $('flBillDue');
  var flAsideSaveTimer = null;

  function flSyncAddBtn() {
    var name = flBillNameEl ? flBillNameEl.value.trim() : '';
    var amount = flParseAmt(flBillAmtEl);
    var due = flBillDueEl ? flBillDueEl.value : '';
    var add = $('flAddBill');
    if (add) add.disabled = !(name && amount > 0 && due);
    var hint = $('flDueHint');
    if (hint) hint.style.display = (name && amount > 0 && !due) ? '' : 'none';
  }
  function flRenderBills() {
    var ul = $('flBillList');
    if (!ul) return;
    ul.innerHTML = '';
    (Array.isArray(data.bills) ? data.bills : []).forEach(function (b) {
      var li = document.createElement('li');
      var left = document.createElement('div');
      var nm = document.createElement('span');
      nm.className = 'fl-b-name'; nm.textContent = b.name || 'Bill';
      left.appendChild(nm);
      if (b.dueDate || b.date) {
        var du = document.createElement('span');
        du.className = 'fl-b-due'; du.textContent = 'due ' + flFmtDate(b.dueDate || b.date);
        left.appendChild(du);
      }
      var amt = document.createElement('span');
      amt.className = 'fl-b-amt'; amt.textContent = flFmt(Number(b.amount) || 0);
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'fl-b-x'; x.textContent = '\u00d7';
      x.setAttribute('aria-label', 'Remove ' + (b.name || 'bill'));
      x.addEventListener('click', function () {
        var id = b.id;
        data.bills = (Array.isArray(data.bills) ? data.bills : []).filter(function (v) { return v.id !== id; });
        data.missions = data.missions || {};
        data.missions.bills = data.bills.length > 0;
        data.approvedPlan = null;
        flSave('First-run setup: remove bill', (b.name || 'Bill') + ' removed.');
        flRenderBills(); flSyncPreview4();
      });
      li.appendChild(left); li.appendChild(amt); li.appendChild(x);
      ul.appendChild(li);
    });
  }
  function flSyncPreview4() {
    var payAmount = flAmountUnknown ? 0 : flParseAmt(flPayAmtEl);
    var payDate = flPayDateEl ? flPayDateEl.value : (data.payDate || '');
    var sub = $('flPv4DateSub');
    if (sub) sub.textContent = flFmtDate(payDate);
    var p = $('flPv4Pay');
    if (p) p.textContent = flAmountUnknown ? 'To confirm' : flFmt(payAmount);
    var b = $('flPv4Bills');
    if (b) b.textContent = flFmt(flBillsTotal());
    var a = $('flPv4Aside');
    if (a) a.textContent = flFmt(flSetAside());
    var s = $('flPv4Safe');
    if (s) {
      if (flAmountUnknown) {
        s.textContent = 'To confirm';
        s.classList.remove('neg');
      } else {
        var safe = flSimpleSafe(payAmount);
        s.textContent = flFmt(safe);
        s.classList.toggle('neg', safe < 0);
        flPulse(s);
      }
    }
    var warn = $('flOverWarn');
    if (warn) warn.classList.toggle('show', !flAmountUnknown && flSimpleSafe(payAmount) < 0);
  }
  function flSaveAsideSoon() {
    clearTimeout(flAsideSaveTimer);
    flAsideSaveTimer = setTimeout(function () {
      flSave('First-run setup: set aside', flMoney(flSetAside()) + ' set aside for the unexpected.');
      flFlash();
    }, 450);
  }
  function flSetAsideTo(value) {
    var payAmount = flAmountUnknown ? 0 : flParseAmt(flPayAmtEl);
    /* With an unknown check the set-aside is just a dollar amount the
       user picks, so it is not capped by an income that isn't known. */
    var cap = flAmountUnknown ? 100000 : Math.max(0, payAmount - flBillsTotal());
    data.unexpectedFund = flClamp(value, 0, cap);
    data.approvedPlan = null;
    flSaveAsideSoon();
    flSyncPreview4();
  }
  if (flBillNameEl) flBillNameEl.addEventListener('input', flSyncAddBtn);
  if (flBillAmtEl) flBillAmtEl.addEventListener('input', flSyncAddBtn);
  if (flBillDueEl) flBillDueEl.addEventListener('change', flSyncAddBtn);
  /* One-tap bill names: tapping a chip fills the name for the bill
     being entered and moves focus to the amount, so the next thing
     typed is the amount. The name field stays editable — a chip is a
     starting point, not a lock. Chips stay available after each bill
     is added (the add handler only clears the three inputs). */
  var flBillChips = $('flBillChips');
  if (flBillChips) flBillChips.addEventListener('click', function (e) {
    var t = e && e.target && e.target.closest ? e.target.closest('[data-fl-bill]') : null;
    if (!t || !flBillNameEl) return;
    var name = t.getAttribute('data-fl-bill');
    if (!name) return;
    flBillNameEl.value = name;
    flSyncAddBtn();
    if (flBillAmtEl) flBillAmtEl.focus();
  });
  var flAddBillBtn = $('flAddBill');
  if (flAddBillBtn) flAddBillBtn.addEventListener('click', function () {
    flSavePaycheckNow(false); /* flush any pending paycheck save first */
    var name = flBillNameEl.value.trim();
    var amount = flParseAmt(flBillAmtEl);
    var due = flBillDueEl.value || '';
    if (!name || amount <= 0 || !due) return;
    if (!Array.isArray(data.bills)) data.bills = [];
    data.bills.push({
      id: flNewId('bill'),
      name: name,
      dueDate: due,
      date: due,
      amount: amount,
      priority: 'essential',
      frequency: 'monthly',
      autopay: false,
      paidOccurrences: []
    });
    data.missions = data.missions || {};
    data.missions.bills = true;
    data.approvedPlan = null;
    flSave('First-run setup: add bill', name + ' ' + flMoney(amount) + ' due ' + flFmtDate(due) + '.');
    flBillNameEl.value = ''; flBillAmtEl.value = ''; flBillDueEl.value = '';
    flSyncAddBtn();
    flRenderBills(); flSyncPreview4();
    flFlash();
    flBillNameEl.focus();
  });
  var flAsideMinus = $('flAsideMinus'), flAsidePlus = $('flAsidePlus');
  if (flAsideMinus) flAsideMinus.addEventListener('click', function () { flSetAsideTo(flSetAside() - 25); });
  if (flAsidePlus) flAsidePlus.addEventListener('click', function () { flSetAsideTo(flSetAside() + 25); });

  /* ---------- Screen 5: her first plan (real calc() numbers) ---------- */
  function flRenderFinal() {
    /* Completing the flow is what retires the front door: mirror the old
       guided setup's ENTER MY LAB save (app.js L6659-6660). */
    if (!flSetupCompleted) {
      flSetupCompleted = true;
      try {
        data.setup = data.setup || {};
        data.setup.currentMoneyConfirmed = true;
        /* Unknown income stays unconfirmed: the amount gets confirmed
           at payday check-in, not here. */
        data.setup.incomeConfirmed = !flAmountUnknown;
        data.setup.completedAt = data.setup.completedAt || new Date().toISOString();
        flSave('First-run setup complete', flAmountUnknown ? 'Payday, bills, and set-aside saved. Check amount to confirm at check-in.' : 'Paycheck, bills, and set-aside saved. First plan built.');
      } catch (_) {}
    }
    var payDate = data.payDate || '';
    var lede = $('flFinLede');
    if (lede) lede.textContent = flAmountUnknown
      ? 'Your bills, sorted. Your check amount gets confirmed at check-in.'
      : 'Built around your real paycheck, in plain words.';
    var sub = $('flFinDateSub');
    if (sub) sub.textContent = flFmtDate(payDate);
    var paydayText = $('flFinPaydayText');
    if (paydayText) paydayText.textContent = flFmtDate(payDate) || 'payday';
    var pay = $('flFinPay');
    if (pay) pay.textContent = flAmountUnknown ? 'To confirm' : flFmt(Number(data.paycheck) || 0);

    var ul = $('flFinBills');
    var wrap = $('flFinBillsWrap');
    var bills = Array.isArray(data.bills) ? data.bills : [];
    if (wrap) wrap.style.display = bills.length ? '' : 'none';
    if (ul) {
      ul.innerHTML = '';
      bills.forEach(function (b) {
        var li = document.createElement('li');
        var left = document.createElement('span');
        left.textContent = b.name || 'Bill';
        if (b.dueDate || b.date) {
          var du = document.createElement('span');
          du.className = 'fl-fb-due'; du.textContent = 'due ' + flFmtDate(b.dueDate || b.date);
          left.appendChild(du);
        }
        var amt = document.createElement('span');
        amt.className = 'fl-fb-amt'; amt.textContent = flFmt(Number(b.amount) || 0);
        li.appendChild(left); li.appendChild(amt);
        ul.appendChild(li);
      });
    }
    var billsTotal = flBillsTotal();
    var totalEl = $('flFinBillsTotal');
    if (totalEl) totalEl.textContent = flFmt(billsTotal);

    /* Real plan math: calc() is the app's source of truth. Falls back to
       the preview's simple subtraction only if calc() is unavailable.
       With an unknown check amount, calc() is NOT called at all — no
       safe number can be derived from an income that isn't known. */
    var c = null;
    try { if (!flAmountUnknown && typeof calc === 'function') c = calc(); } catch (_) { c = null; }

    var setAside = c ? (Number(c.setAside) || 0) : flSetAside();
    var savings = c ? (Number(c.savings) || 0) : 0;
    var reserve = c ? (Number(c.reserve) || 0) : 0;
    var safe = null; /* null = "to confirm", never a number from unknown income */
    if (!flAmountUnknown) {
      safe = c ? (Number(c.safeToSpend) || 0) : flSimpleSafe(Number(data.paycheck) || 0);
    }
    var payNow = flAmountUnknown ? billsTotal : (c ? (Number(c.payNow) || 0) : billsTotal);
    var shortfall = flAmountUnknown ? 0 : (c ? (Number(c.shortfall) || 0) : Math.max(0, billsTotal - (Number(data.paycheck) || 0)));

    var asideRow = $('flFinAsideRow'), asideEl = $('flFinAside');
    if (asideRow) asideRow.style.display = setAside > 0 ? '' : 'none';
    if (asideEl) asideEl.textContent = flFmt(setAside);
    var savRow = $('flFinSavingsRow'), savEl = $('flFinSavings');
    if (savRow) savRow.style.display = savings > 0 ? '' : 'none';
    if (savEl) savEl.textContent = flFmt(savings);
    var resRow = $('flFinReserveRow'), resEl = $('flFinReserve');
    if (resRow) resRow.style.display = reserve > 0 ? '' : 'none';
    if (resEl) resEl.textContent = flFmt(reserve);
    var safeEl = $('flFinSafe');
    if (safeEl) {
      if (safe === null) {
        safeEl.textContent = 'To confirm';
        safeEl.classList.remove('neg');
      } else {
        safeEl.textContent = flFmt(safe);
        safeEl.classList.toggle('neg', safe < 0);
      }
    }
    var warn5 = $('flOverWarn5');
    if (warn5) warn5.classList.toggle('show', safe !== null && (safe < 0 || shortfall > 0));
    var note = $('flFinShortfallNote');
    if (note) note.style.display = (payNow < billsTotal - 0.005) ? '' : 'none';
    var unk = $('flUnknownNote');
    if (unk) unk.style.display = flAmountUnknown ? '' : 'none';
    var freq = $('flFreqNote');
    if (freq) freq.style.display = (flFreqDays() === 7) ? '' : 'none';
  }

  /* ---------- navigation ---------- */
  var flBackBtn = $('flBackBtn');
  if (flBackBtn) flBackBtn.addEventListener('click', function () { flShowScreen(Math.max(1, flCurrentScreen - 1)); });
  var flShowPlan = $('flShowPlan');
  if (flShowPlan) flShowPlan.addEventListener('click', function () { flShowScreen(2); });
  var flBuildMine = $('flBuildMine');
  if (flBuildMine) flBuildMine.addEventListener('click', function () { flShowScreen(3); });
  var flToBills = $('flToBills');
  if (flToBills) flToBills.addEventListener('click', function () {
    flSavePaycheckNow(false);
    flShowScreen(4);
    flRenderBills(); flSyncPreview4();
  });
  var flToPlan = $('flToPlan');
  if (flToPlan) flToPlan.addEventListener('click', function () { flShowScreen(5); });
  var flBackStart = $('flBackStart');
  if (flBackStart) flBackStart.addEventListener('click', function () { flShowScreen(1); });
  var flSeeApp = $('flSeeApp');
  if (flSeeApp) flSeeApp.addEventListener('click', function () {
    /* Hand off into the real app shell (Today tab), with the user's data.
       The plan is built, not approved: approval stays a deliberate tap
       in Payday Mode, guided by the Money Journey. */
    if (flOverlay.parentNode) flOverlay.parentNode.removeChild(flOverlay);
    try {
      if (typeof openFinancialLab === 'function') openFinancialLab('laboratory');
      else if (typeof show === 'function') show('laboratory');
    } catch (_) {}
  });

  /* ---------- Screen 1 secondary links: reuse the app's real buttons ---------- */
  function flExitToRealButton(buttonId, fallbackView) {
    return function () {
      flHideOverlay();
      var btn = $(buttonId);
      if (btn && typeof btn.click === 'function') { btn.click(); return; }
      try {
        if (typeof openFinancialLab === 'function') openFinancialLab(fallbackView);
        else if (typeof show === 'function') show(fallbackView);
      } catch (_) {}
    };
  }
  var flBusinessLink = $('flBusinessLink');
  if (flBusinessLink) flBusinessLink.addEventListener('click', flExitToRealButton('businessLabFrontBtn', 'business'));
  var flRestoreLink = $('flRestoreLink');
  if (flRestoreLink) flRestoreLink.addEventListener('click', flExitToRealButton('restoreLabBtn', 'more'));
  var flDetailedLink = $('flDetailedLink');
  if (flDetailedLink) flDetailedLink.addEventListener('click', function () {
    flHideOverlay();
    try {
      if (typeof openFinancialLab === 'function') openFinancialLab('start');
      else if (typeof show === 'function') show('start');
    } catch (_) {}
  });

  /* ---------- Front Door re-opens the flow while the user is first-run ----------
     The drawer "Front Door" button (and any other openFrontDoor caller) must
     show this flow, not the old Join/Enter door, until setup completes.
     After completion flIsFirstRun() is false and the original runs. */
  try {
    if (typeof window !== 'undefined' && typeof window.openFrontDoor === 'function') {
      var _flOpenFrontDoor = window.openFrontDoor;
      window.openFrontDoor = function () {
        if (flIsFirstRun() && flOverlay && flOverlay.parentNode) { flShowOverlay(1); return; }
        _flOpenFrontDoor();
      };
    }
  } catch (_) {}

  /* ---------- pre-fill from any partial run, then open on Screen 1 ---------- */
  try {
    if (flPayDateEl && data.payDate) flPayDateEl.value = data.payDate;
    if (flPayAmtEl && Number(data.paycheck) > 0) flPayAmtEl.value = String(Number(data.paycheck));
    /* A partial run that left the amount unknown re-enters that way. */
    if (data.setup && data.setup.paycheckUnknown === true) flSetAmountUnknown(true, false);
  } catch (_) {}
  flRenderBills();
  flSyncPaycheck();
  flSyncPreview4();
  flShowScreen(1);

  try { window.__flFirstRunLoaded = true; } catch (_) {}
})();
