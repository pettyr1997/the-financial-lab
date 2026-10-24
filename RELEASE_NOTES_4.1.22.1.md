# Financial Lab 4.1.22.1 — Ask Dexx Button (SHIPPED 2026-10-23)

Robert's idea, from dogfooding v4.1.22.0 the night it launched: he had to
scroll to find Dexx, so Dexx now floats on screen — a little round Dexx-face
button (his reference: the assistant avatar in his chat app), always one tap
from a question.

## What changed (UI only — no logic, data, or AI changes)

- **Floating Ask Dexx button** (`#dexxFab`): Dexx's face in a 56px circle
  with the Lab's green ring, fixed at bottom-right above the journey bar.
  Tapping it rides the app's existing `data-go="dexx"` navigation straight
  into the Dexx chat — no new JS.
- **Hidden where it would be wrong:** on the Dexx view itself
  (`body[data-view="dexx"]`), during setup (`body[data-view="start"]`), and
  on the front door (`body.front-door-active`) — the same hide rules the
  journey bar uses.
- Built on the stamped v4.1.22.0 tree, so the AI Dexx wiring (Supabase URL +
  anon key), badge art, and front-door fix all carry over unchanged.

## Tests

Same profile as 4.1.22.0: bills 18/18, bundle 27/27, boot 6/6, dexx-chat 9/11
(the 2 flips are the pre-stamp gate assertions, by design), continuity 13/17
(4 date-drift failures identical on pristine 4.1.21.7 — pre-existing).

## Build note

Version stamped 4.1.21.0 → 4.1.22.1 in index.html, service-worker.js,
package.json (the working tree keeps base strings per the usual quirk);
zipped with the standard build-release.sh exclusions.
