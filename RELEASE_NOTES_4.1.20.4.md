# Financial Lab v4.1.20.4 — Smart Bill Calendar (Phase 2)

Built on v4.1.20.3. Implements roadmap Phase 2: bills and paydays work together.

## What changed

- **Bill status for every occurrence:** each bill now carries an explicit status —
  `OVERDUE` (past due, unpaid), `DUE THIS CHECK` (due before the next payday),
  `UPCOMING` (next 30 days), `PAID`. No more guessing what needs attention.
- **Must-cover list:** the Smart Bill Calendar card (Calendar Lab) totals exactly
  which bills must be covered by the next payday — overdue first, then due before
  the next check — with the remaining amount after already-protected reserves.
- **Carry forward without duplicates:** overdue obligations persist as the same
  occurrence (keyed `parentId|occurrenceDate`) and roll into the next paycheck's
  must-cover set. A de-duplication guard makes double-counting impossible.
- **One shared payment confirmation:** marking a bill paid/unpaid is now a single
  function used by every bill list, including the new status card. Paid toggles
  clear the related reserve and invalidate the stale plan, as before.
- **Upcoming pressure per payday:** a pressure strip shows the bill load for each
  of the next 4 paydays before it arrives, with headroom/shortfall vs. Dexx's
  learned income once 3+ confirmed checks exist.
- **Continuity-aware:** the "next payday" boundary uses the Phase 1 roll-forward,
  so the must-cover list stays correct even after missed weeks.

## Core rules preserved

> Every bill has a clear status and a reliable place in the user's paycheck plan.
> Unconfirmed income is never treated as received.

## Before updating

Export a JSON backup in the current installed app. Do not clear browser storage
or uninstall the existing app. Deploy files to the same site/origin to preserve
local data.

## Manual test checklist (Phase 2 completion)

1. Add a monthly bill due 10 days ago (unpaid) and one due in 3 days.
2. Open Calendar Lab: the overdue bill shows OVERDUE with days-overdue count;
   the other shows DUE THIS CHECK. The must-cover total includes both.
3. Tap the check on the overdue bill → it moves to Recently paid; the must-cover
   total drops. Tap again → it returns to OVERDUE (no duplicates appear).
4. Start a new paycheck cycle: the overdue bill is still there, listed once,
   carried into the next check's must-cover set.
5. The pressure strip shows bill totals for the next 4 paydays.
6. Confirm the completion requirement: every bill has a clear status and a
   reliable place in the paycheck plan.
