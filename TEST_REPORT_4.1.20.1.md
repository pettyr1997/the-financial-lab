# Financial Lab v4.1.20.1 — Test Report

## Oct 2 live-payday regression test

Use the existing approved $700 Oct 2 → Oct 9 plan. Do not enter an expense before reconciliation.

1. **Laboratory before actual check confirmation** — Expected: `Payday check-in`, not `Live paycheck cycle`; Available Today uses confirmed current balance; $700/$170/$530 remain planned.
2. **Weekly Runway** — Expected: `LOCKED`; no Ahead of Pace, daily runway, pace gap, or spend-now guidance is active.
3. **Payday Check-In** — Planned Check = $700.00; Actual Received starts blank / $0.00 and does not copy $700. Enter the real deposit and recalculate.
4. **Reconciliation** — Dexx shows variance, updated protection, and updated TRUE Safe-to-Spend. Nothing funds until `ACTIVATE RECONCILED PAYDAY`.
5. **After activation** — Laboratory becomes live; Runway/Pace Coach unlocks; reserve/savings funding becomes real; confirmed actual deposit becomes Cash Flow Learning check #1.
6. **Forecast / Calendar** — Expected after first confirmed check: `LEARNING 1/3`; future Fridays remain visible as payday dates but do not show the first check amount as predicted income; savings/after-bills forecast stays waiting until 3 confirmed checks.

## Pass condition

No planned paycheck amount becomes available, funded, live spending guidance, or learned income without explicit actual-paycheck reconciliation.
