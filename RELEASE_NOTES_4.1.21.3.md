# Financial Lab v4.1.21.3 — Dexx Cartoon Mascot

Built on v4.1.21.2. No changes to payday math, Dexx logic, or the data schema.

## What changed

- **Dexx is now a cartoon mascot.** The photorealistic portrait looked like a
  real person's photo; this release redraws the same character (glasses,
  waves, lab coat, DEXX chain, LAB logo, dark lab with green accents) in a
  stylized animated-film look. Better branding, no likeness concerns.
- Sized 800×800 (~105KB) for fast loading.

## Files changed

- `dexx-character-clean.jpg` — replaced (same filename, no code changes)

## Test report

- `npm test` (via build-release.sh): 62/62 pass — unchanged.
- Visual check: cartoon mascot matches the original Dexx character.

## Manual checklist (on device)

- [ ] Launchpad shows the cartoon Dexx mascot.
- [ ] Brain Lab and About views render the mascot.
