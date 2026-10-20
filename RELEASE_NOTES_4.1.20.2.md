# Financial Lab v4.1.20.2 — Packaging and safety patch

- Added missing PWA manifest and 192/512 app icons.
- Added branded SVG fallback logo; original JPG brand art was not in supplied ZIP. Existing optional Dexx JPG remains absent and will hide gracefully.
- Fixed service worker installation failure from required but missing JPGs.
- Cache version bumped, app shell cached for offline navigation.
- Escaped several user-supplied labels when rendered into HTML (bills, debts, savings, expenses, timeline). Further security review required before public launch.
- Preserved financial data keys, reconciliation and forecast logic.

## Before updating
Export a JSON backup in the current installed app. Do not clear browser storage or uninstall the existing app. Deploy files to the same site/origin to preserve local data. Verify backup can be downloaded and saved outside the app.

## Manual regression checklist
1. Open in Safari and add to Home Screen; verify icons and no install errors.
2. Disconnect internet and relaunch after one successful online load.
3. Verify existing data and bill calendar.
4. Confirm a planned payday does not fund any reserve or unlock spending until actual deposit is reconciled and activated.
5. Export a JSON backup. Do not test restore against your only copy of real data.
6. Add a bill named `<test & bill>` and verify it displays as literal text.

Note: Static checks are not equivalent to full browser/device tests.
