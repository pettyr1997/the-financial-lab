# Financial Lab 4.1.21.5 — New Dexx

Artwork-only release on top of 4.1.21.4. No code or logic changes.

## What changed

- **New Dexx character art** (`dexx-character-clean.jpg`): Robert asked for
  Dexx to look older — mid-20s instead of a teenager — and for the background
  to be Financial Lab themed rather than a science laboratory. The new art
  keeps the same character (glasses, waves haircut, white lab coat, DEXX
  chain, LAB logo, cartoon style) with an adult face and build, against a
  dark green financial backdrop of rising charts and coin stacks.
- Robert approved this as the Dexx going forward (poster + app).

## Verification

- Full suite via `npm test`: 68/68 pass (continuity, bills, bundle, boot).
- Release built with `tools/build-release.sh`; service worker cache stamped
  `financial-lab-v4.1.21.5`.
