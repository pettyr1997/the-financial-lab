# Financial Lab v4.1.21.4 — First-Run Front Door

See `RELEASE_NOTES_4.1.21.4.md` for what's new. Earlier patch notes are preserved below.

---

## v4.1.21.4 — First-Run Front Door (this release)

- Fixed: the "JOIN THE LAB" welcome screen never appeared on load. First-run visitors now land on the front door; returning users skip it.
- Fresh installs greet "RESEARCHER" instead of "ROB" until a name is set.
- 6 new boot-behavior tests (68 total via `npm test`). No payday-math or schema changes.

---

# Financial Lab v4.1.21.3 — Dexx Cartoon Mascot

See `RELEASE_NOTES_4.1.21.3.md` for what's new. Earlier patch notes are preserved below.

---

## v4.1.21.3 — Dexx Cartoon Mascot (this release)

- Dexx redrawn as a stylized cartoon mascot (same character: glasses, waves, lab coat, DEXX chain, LAB logo). Replaces the photorealistic portrait.
- 800×800 (~105KB). No code or logic changes.

---

# Financial Lab v4.1.21.2 — Dexx Artwork

See `RELEASE_NOTES_4.1.21.2.md` for what's new. Earlier patch notes are preserved below.

---

## v4.1.21.2 — Dexx Artwork (this release)

- Dexx character rebuilt from Robert's original reference (glasses, waves, lab coat, DEXX chain, LAB logo). Replaces the v4.1.21.1 stand-in.
- Artwork sized to 800×800 (~70KB) for fast loading. No code or logic changes.

---

# Financial Lab v4.1.21.1 — Polish Release

See `RELEASE_NOTES_4.1.21.1.md` for what's new. Earlier patch notes are preserved below.

---

## v4.1.21.1 — Polish (this release)

- Dexx character artwork shipped (`dexx-character-clean.jpg`) — Launchpad, Brain Lab, and About views now show the character.
- `npm test` runs all 62 logic tests from `tests/` (continuity, bills, bundle).
- New `tools/build-release.sh`: refuses to build when a required ship file is missing, stamps versions, fails on stale version strings, runs tests, writes the zip. No more manual-zip mistakes.
- No changes to payday math, Dexx logic, or the data schema.

---

# Financial Lab v4.1.21.0 — Phases 3–6 Bundle

See `RELEASE_NOTES_4.1.21.0.md` for what's new. Earlier patch notes are preserved below.

---

Built directly on v4.1.20 Money Dates Bridge after the first real payday-date transition exposed places where the UI treated the arrival of a date like the arrival of money. This patch preserves the current financial-data schema and payday math while making confirmation state the source of truth.

## What changed

- **Date ≠ deposit:** payday arriving unlocks check-in; it never auto-activates a paycheck.
- Laboratory stays in **Payday check-in** state until the actual deposit is reconciled and activated.
- Weekly Runway / Pace Coach remains visibly **LOCKED** while the approved plan is still unfunded.
- Payday Command Center labels planned values as **PLANNED PAYCHECK**, **PLANNED PROTECTED**, and **PLANNED TRUE SAFE-TO-SPEND**.
- Actual Received no longer visually copies the planned amount; each plan starts with a blank `$0.00` input.
- Same-day plan approval no longer funds reserves/savings automatically. Every new approved plan waits for actual-paycheck reconciliation.
- Laboratory Cash Available no longer exposes planned TRUE Safe-to-Spend as available cash.
- Financial Timeline distinguishes a **Planned paycheck** from a confirmed paycheck.
- **Cash Flow Learning Guard:** future payday dates can be shown immediately, but future paycheck amounts stay locked until Dexx has at least **3 confirmed, reconciled paychecks**.
- Forecast displays **LEARNING 0/3 → 1/3 → 2/3**, then unlocks an early income estimate at 3 confirmed checks.
- Confirmed-check learning is derived from reconciled funded paycheck history, so planned checks never teach Dexx an income amount.
- Upcoming Money Dates shows payday dates without invented dollar amounts while income is still learning.

## Core rules

> Time unlocks the next action. Time never confirms that the action happened.

> Dexx learns first, then predicts.

## Preserved

Money Dates Bridge, Bill Calendar, recurring bills, Reserve Memory, Guided Setup, Lab Readiness, Health Score clarity, Money Journey, actual-paycheck reconciliation, expense cycle guard, Reports, recovery tools, and PWA update reliability remain in place.
