# Financial Lab 4.1.21.6 — Flow

Phase 1 of the reorganization Robert approved after dogfooding the app and
finding it "hopping around." Arrangement and emphasis only — **no logic,
calculation, or data changes.** Every element ID from 4.1.21.5 is preserved.

## What changed

- **Journey spine bar (new):** a slim bar fixed above the bottom nav on all
  main views showing `STEP n OF 7 · YOUR MONEY JOURNEY`, the current step's
  title, and a button that mirrors the Money Journey card's action (same
  label, same behavior — the bar proxies the real button, so gate logic lives
  in exactly one place). Hidden on the front door, Guided Setup, and Dexx chat.
- **Home (Today) reordered:** greeting hero first, then the Money Journey,
  then Your Money Today (briefing), the four stat tiles, Upcoming Bills, and
  Today's Mission. The occasional-check panels — Setup Progress, Health
  Score, Action Center, Confidence, Timeline, Dexx's Observation, Experiment
  Progress — now live under a collapsed **"Your progress & insights"**
  section, one tap away instead of competing on the main scroll.
- **Plain nav labels:** Laboratory → **Today**, Budget Lab → **Payday**,
  Credit Lab → **Debt**, Savings Lab → **Savings** (view ids unchanged).
- **Plain card names + no version noise:** Lab Briefing → *Your Money Today*,
  Dexx Money Journey → *Your Money Journey*, Lab Readiness → *Setup
  Progress*, Money Dates Bridge → *What's Coming Up*; the `4.1.x` version
  prefixes were stripped from all 19 remaining section heads.

## Deliberately NOT changed

- All calculations, storage, gates, and render logic (only call added:
  `renderJourneyBar(c)` after `renderMoneyJourney(c)`, plus `show()` now
  records `body[data-view]` for bar visibility).
- Budget/Payday view internal order — phase 2 candidate if Robert wants it.

## Verification

- ID parity vs 4.1.21.5: none lost; added journeyBar, journeyBarStep,
  journeyBarTitle, journeyBarAction.
- HTML tag balance: clean. `node --check app.js`: OK.
- `npm test`: 68/68 pass (17 continuity + 18 bills + 27 bundle + 6 boot).
