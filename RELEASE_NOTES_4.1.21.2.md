# Financial Lab v4.1.21.2 — Dexx Artwork

Built on v4.1.21.1. No changes to payday math, Dexx logic, or the data schema.

## What changed

- **Dexx character rebuilt from the original.** The v4.1.21.1 stand-in artwork
  didn't match the brand. This release replaces it with a clean portrait built
  from Robert's original Dexx reference: glasses, waves, white lab coat, DEXX
  chain, LAB coat logo, dark lab with green accents. No stickers, no overlays.
- **Sized for the app.** Artwork is 800×800 (~70KB) instead of 1600×1600 —
  the app displays it at ~200px, so this loads faster with no visible loss.

## Files changed

- `dexx-character-clean.jpg` — replaced (same filename, same four references
  in index.html; no code changes needed)

## Test report

- `npm test` (via build-release.sh): 62/62 pass — unchanged from v4.1.21.1.
- Visual check: portrait matches the original Dexx reference.

## Manual checklist (on device)

- [ ] Launchpad shows the new Dexx portrait (no broken image).
- [ ] Brain Lab and About views render the portrait.
