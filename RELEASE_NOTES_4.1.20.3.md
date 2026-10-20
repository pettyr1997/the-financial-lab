# Financial Lab v4.1.20.3 — Payday Continuity (Phase 1)

Built on v4.1.20.2. Implements roadmap Phase 1: the app keeps working when one or more paycheck check-ins are missed.

## What changed

- **Missed check-in detection:** on every render, the app compares the scheduled payday series (from the earliest known payday, bounded to the last 12 pay cycles) against confirmed check-ins. Past paydays with no confirmation and no skip are surfaced — never silently dropped, never invented as income.
- **Payday Catch-Up card** (Payday Command Center): lists each missed payday with two actions:
  - **Enter actual** — confirm what really landed, late. The amount is recorded as a `late-confirmed` check: it counts toward Dexx's income learning (real deposits teach), but nothing is funded retroactively — no reserves, savings, or spending runway are created for a past cycle.
  - **Skip** — mark the payday as skipped. Skipped paydays are never counted as income, learned, or forecast. A "Mark all skipped" button handles bulk dismissal with confirmation.
- **Roll-forward planning:** the next-paycheck launchpad no longer suggests a cycle anchored on a payday that already passed. After missed weeks it rolls the schedule forward to the correct current payday.
- **History honesty:** late-confirmed check-ins appear in plan history labeled as such ("$X confirmed late · counts toward Dexx income learning · nothing funded retroactively").
- **Active cycle untouched:** the currently open payday (planned or awaiting check-in) keeps using the existing payday check-in UI; it is never listed as missed.

## Core rules preserved

> Time unlocks the next action. Time never confirms that the action happened.
> Unconfirmed income is never treated as received. Missing weeks cannot freeze the app, erase records, or create imaginary income.

## Before updating

Export a JSON backup in the current installed app. Do not clear browser storage or uninstall the existing app. Deploy files to the same site/origin to preserve local data.

## Manual test checklist (Phase 1 completion)

1. Set up a weekly Friday payday with an approved plan for payday N. Close the app for 3 weeks.
2. Reopen: the Payday Catch-Up card lists the 2 fully-missed paydays (the approved one stays in the normal check-in flow).
3. Enter an actual amount for one missed payday → it appears in history as late-confirmed; income learning count increases by 1; no reserves funded.
4. Skip the other missed payday → it disappears from the card and never affects learning or forecasts.
5. Start the next cycle from the launchpad → it proposes the correct current payday, not a past date.
6. Confirm the full completion requirement: missing several weeks must not freeze the app, erase records, or create imaginary income.
