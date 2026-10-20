# Financial Lab v4.1.21.1 — Polish Release

Built on v4.1.21.0. No changes to payday math, Dexx logic, or the data schema.
This release is fit-and-finish: the missing Dexx artwork, the test suites moved
into the repo, and a release script so bad zips can't ship again.

## What changed

- **Dexx character art is back.** `dexx-character-clean.jpg` was referenced in
  four places but never shipped, so those images hid silently. The character
  now appears on the Launchpad, Brain Lab, and About views.
- **`npm test` now works from the repo.** The three logic harnesses
  (Payday Continuity, Smart Bill Calendar, Phases 3–6 bundle — 62 tests total)
  live in `tests/` and load `app.js` relative to the repo instead of an
  absolute workspace path. Run: `npm test`.
- **`tools/build-release.sh` — validated release builder.** Usage:
  `./tools/build-release.sh <source-dir> <old-version> <new-version> <release-name>`
  It refuses to build when a required ship file is missing (the v4.1.20.1
  missing-icons failure), stamps the new version, fails if any stale version
  string survives, runs `npm test`, and writes the zip to `releases/`.
  Nothing is uploaded — you review the zip, then deploy it.

## Files added

- `dexx-character-clean.jpg` — Dexx character artwork
- `package.json` — `npm test` runs all 62 logic tests
- `tests/test-continuity.mjs`, `tests/test-bills.mjs`, `tests/test-bundle.mjs`
- `tools/build-release.sh` — validated release builder

## Test report

- `npm test`: 17/17 continuity + 18/18 bills + 27/27 bundle = **62/62 pass**.
- `build-release.sh` validation gates (missing-file abort, stale-version abort)
  exercised during this release.

## Manual checklist (on device)

- [ ] Fresh install: Dexx character image visible on Launchpad (no broken image).
- [ ] About view: character image renders.
- [ ] Add to Home Screen still installs cleanly (manifest/icons untouched).
- [ ] Run one payday check-in end to end to confirm no behavior change.
