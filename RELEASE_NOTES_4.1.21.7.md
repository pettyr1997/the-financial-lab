# Financial Lab 4.1.21.7 — Dexx Badge + Front-Door Photo Fix

Art-and-polish release on 4.1.21.6. **No logic, calculation, or data changes.**
Built 2026-10-22 from the queued items in `financial-lab-next-build-brief.md`.

## What changed

- **New Dexx badge art (approved v2):** Dexx's coat emblem is now the dark
  name-badge matching the app's top logo — "FINANCIAL LAB / PAYDAY PLANNING"
  in the original bold blocky LAB lettering (Robert approved this version
  2026-10-21). Straight file swap into the existing Dexx image slot, so the
  front door, hero, observation card, and Dexx chat header all pick it up.
- **Front-door Dexx-card paint fix:** on slow iOS loads the photo occasionally
  painted as a thin strip over the dark card instead of filling it. The
  suspect was the percentage-height sizing of the absolutely-positioned img
  inside `.front-dexx` (percentage heights against a min-height-only container
  can resolve mid-load). The img is now pinned with `inset:0` plus explicit
  width/height — all four edges anchored, no percentage-resolution race.

## Deliberately NOT changed

- All calculations, storage, gates, and render logic.
- Save hardening (try/catch on save, backup-mirror recovery) — still awaiting
  Robert's call; ships separately if approved.
- PWA manifest icons (suggestion only, not approved).

## Verification

- Art file verified: 800x800 JPEG, byte-identical to approved
  `dexx-character-clean-badge-800.jpg`.
- `npm test`: 68/68 pass (17 continuity + 18 bills + 27 bundle + 6 boot).
- ID parity vs 4.1.21.6: unchanged (no markup touched).
