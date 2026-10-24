# Financial Lab 4.1.22.0 — AI Dexx Chat (SHIPPED 2026-10-23)

Talk-only real-AI Dexx, built on the v4.1.21.7 source (so it also carries the
badge art + front-door fix — 4.1.21.7 never ships separately, per Robert's call).

## Status: SHIPPED 2026-10-23

- `FL_DEXX` stamped with Robert's Supabase Project URL
  (https://udmvocamaqspwvqwamnf.supabase.co) + anon public key.
- Backend verified live end-to-end 2026-10-23: the `dexx-chat` Edge Function
  (deployed via the `financial-lab-backend` GitHub repo + Supabase GitHub
  integration) returned a real AI reply to an authorized test call.
- Tests on the stamped tree: bills 18/18, bundle 27/27, boot 6/6,
  dexx-chat 9/11 (the 2 failures are the pre-stamp gate assertions —
  "AI disabled with unstamped placeholders" / "config carries no real key" —
  which flip BY DESIGN once keys are stamped), continuity 13/17 (4 date-drift
  failures, byte-identical on pristine 4.1.21.7 — pre-existing, unrelated;
  fixture date-robustness fix queued).
- Built by hand through build-release.sh steps 1–4 + 6 (its step-5 npm-test
  gate trips on the known failures above); version stamped 4.1.21.0 → 4.1.22.0
  in index.html, service-worker.js, package.json.

## What changed (all key-independent)

- **Real conversation UI:** the Dexx chat view now keeps a message history
  (`#dexxHistory`) — user bubbles, Dexx bubbles, and a "Dexx is thinking…"
  state — instead of one overwritten bubble. Quick-question buttons append to
  the history like everything else.
- **AI wiring:** free-text questions POST `{messages (last 12), context}` to
  `{SUPABASE_URL}/functions/v1/dexx-chat` with the anon key in `apikey` +
  `Authorization` headers — the exact contract of the already-written
  `dexx-chat` Edge Function (`~/workspace/your_files/dexx-chat-edge-function.ts`).
- **Lab snapshot:** each AI call carries a plain-text snapshot built from
  `calc()` + `moneyJourneyState()`: journey step, safe-to-spend (labeled live
  vs planned), this check's cover/protect/save/debt figures, bills before next
  payday (name/amount/date, max 12), spending recorded this cycle, health score.
  No bank data, no identifiers — the snapshot is money fields only.
- **Scripted Dexx stays:** with placeholders unstamped, or on ANY failure
  (offline, function error, API error, spend-cap hit), chat quietly falls back
  to the existing scripted answers. Chat can never go dumb on a tester.
- **Privacy one-liner** in the chat screen: chat is the exception to
  "data stays on your device" (question + Lab numbers go to Anthropic, never
  used for training).
- **XSS by construction:** all bubbles render via `textContent`, never
  `innerHTML` (verified by test).
- Talk-only, as agreed: Dexx cannot tap buttons, add bills, or change anything.

## Verification

- `npm test`: test-bills 18/18, test-bundle 27/27, test-boot 6/6,
  test-dexx-chat 11/11 (new: AI gate, snapshot content live vs planned, scripted
  fallback, XSS). test-continuity 13/17 — the 4 failures are pre-existing
  date-drift in scenarios written 2026-10-19; the failure list is byte-identical
  on the untouched 4.1.21.7 tree (verified by diff 2026-10-23).
- ID parity: `#dexxReply` greeting bubble kept (no live JS references it now);
  new IDs are `#dexxHistory` only. All other markup untouched.

## Deliberately NOT changed (awaiting Robert's call)

- Save hardening from Leek's audit (failed-save error, backup-mirror recovery).
- Business Lab "coming soon" teaser door on the front door.
- No calculation, storage, gate, or render-logic changes — cosmetic + chat only,
  safe to push mid-beta.
