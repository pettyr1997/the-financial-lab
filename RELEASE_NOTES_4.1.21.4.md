# Financial Lab v4.1.21.4 — First-Run Front Door

Built on v4.1.21.3. No changes to payday math, Dexx logic, or the data schema.

## What changed

- **Fixed: the welcome screen never appeared.** The "JOIN THE LAB" front door
  existed in the HTML, but the boot code called `show()` unconditionally,
  which removed the front-door class on every load — new visitors never saw
  it. Now:
  - **First-run visitors** (guided setup not started) land on the front door
    with ENTER THE LAB (returning) and JOIN THE LAB (new → guided setup).
    Deep links (#savings etc.) are overridden — there's no data to show yet.
  - **Returning users** (setup completed) skip the door and go straight to
    the Laboratory, with deep links honored as before.
  - Existing saved data is unaffected: your `currentMoneyConfirmed` setup
    flag means you boot straight into the app, same as before.
- **Neutral default greeting for fresh installs.** The fallback greeting was
  hardcoded to "ROB" — testers on new devices would have been greeted as Rob.
  Fresh installs now greet "RESEARCHER" until a name is set in the profile.
  Stored names are untouched.

## Files changed

- `app.js` — boot routing (first-run → front door), `openFrontDoor` scroll
  guard, neutral researcher-name defaults
- `tests/test-boot.mjs` — 6 new boot-behavior tests (now 68 total via
  `npm test`)

## Test report

- `npm test`: 17/17 continuity + 18/18 bills + 27/27 bundle + 6/6 boot =
  **68/68 pass**.

## Manual checklist (on device)

- [ ] Fresh install (or cleared site data): link opens on the front door
      with ENTER THE LAB / JOIN THE LAB.
- [ ] JOIN THE LAB → guided setup starts.
- [ ] ENTER THE LAB → Laboratory view.
- [ ] Your existing install: opens straight to the Laboratory (no door).
- [ ] Greeting on a fresh install says RESEARCHER, not ROB.
