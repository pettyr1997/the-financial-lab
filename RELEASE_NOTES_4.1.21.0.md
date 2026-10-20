# Financial Lab v4.1.21.0 — Phases 3–6 Bundle

Built on v4.1.20.4. Implements roadmap Phases 3, 4, 5, and 6 together.

## Phase 3 — Intelligent Payday Plan

- **"Why this coverage" explainer:** under the allocation list, Dexx now names exactly
  which bills this check covers (in priority order) and which stay short, with the
  uncovered amount per bill. Shortfalls are never hidden.
- **Plan math validation:** `validatePaydayPlan` checks the invariants every plan must
  satisfy — allocations never exceed available money, no negative buckets, shortfall
  and reserve-shortfall reconcile with bills due minus bills covered. Covered by
  automated tests.

## Phase 4 — App Navigation & Design

- **Bigger touch targets:** bill paid-toggles grow from 20px to 28px; bottom-nav
  buttons get a 64px minimum touch height.
- **Keyboard accessibility:** visible `:focus-visible` outlines on all interactive
  elements.
- **Reduced motion:** `prefers-reduced-motion` now disables transitions/animations.

## Phase 5 — Debt & Savings Intelligence

- **Payoff outlook (Credit Lab):** per-debt payoff time at minimum payments, plus a
  Snowball vs Avalanche comparison using your per-check debt goal — with the
  interest difference named. All labeled as estimates, never guarantees.
- **Savings milestones (Savings Lab):** per-goal progress with projected finish
  dates from your per-check savings amount, plus an emergency-readiness readout
  (total saved vs one month of essential bills).

## Phase 6 — Security, Testing & Recovery

- **Load-time validation:** every app start sanitizes numeric fields, guarantees
  array shapes, and clamps profile values. It repairs types — it never deletes
  user records — and counts fixes in `data.validationFixes`.
- **Recovery process (documented):**
  1. The app keeps automatic recovery points before every destructive change
     (Safety & Recovery in the More tab) — restore any point in one tap.
  2. Export a JSON backup regularly (More tab); the file is named with the app
     version. To migrate devices: install the app on the new device, open it
     once, then import the JSON backup.
  3. Never clear browser storage or uninstall without an exported backup —
     installed-app data lives in the browser profile.
  4. After updating: reopen the app, confirm your data and bill calendar, then
     export a fresh backup.

## Core rules preserved

> Recommendations reconcile with confirmed money and outstanding obligations.
> Projections are estimates, clearly distinguished from guarantees.

## Before updating

Export a JSON backup in the current installed app. Do not clear browser storage
or uninstall the existing app. Deploy files to the same site/origin to preserve
local data.

## Manual test checklist

1. Build a payday plan where bills exceed the check: the coverage explainer names
   each covered bill ✓ and each short bill with its uncovered amount.
2. Credit Lab → Payoff Outlook: snowball vs avalanche shows months + interest;
   per-debt rows show payoff time at minimums.
3. Savings Lab → Milestones: goals show % and projected finish; emergency
   readiness compares saved vs one-month essential bills.
4. Toggle a bill paid in Calendar Lab (28px target), tab through with a keyboard
   (visible focus), and confirm no layout regressions on a small phone screen.
