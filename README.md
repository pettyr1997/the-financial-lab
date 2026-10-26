# Financial Lab 4.4.0.0: changed files

## New in 4.4.0.0
| File | New or changed |
|---|---|
| `lab-plus.js` | **new**: Invoice Builder, 60-day Cash Forecast, Restore my Lab, Receipt photos |
| `invoice.html` | **new**: the clean client-facing invoice page (print or save as PDF) |
| `supabase/sql/receipts-storage.sql` | **new**: private cloud storage for receipt photos |
| `index.html`, `service-worker.js`, `lab-next.css`, `lab-pro.js`, `app.js`, `lab-next.js` | changed |

- **Invoice Builder:** each invoice now has a **Send invoice** button.
  - Add line items, a client email and a note. Each invoice gets an automatic number like INV-0001.
  - **SEND LINK** shares a link to a clean white invoice page with your business name, address, email, phone and "How to pay" details from Business Settings.
  - Paid invoices show a PAID stamp, so the link doubles as a receipt. Late ones show PAST DUE.
  - The invoice details travel inside the link itself, so nothing is stored on a server. Your client can print it or save it as a PDF.
- **60-day Cash Forecast** at the top of Business Lab:
  - Starts from today's business cash. Adds open invoices on their due dates and projected repeat invoices. Takes out your tax set-aside from each payment and your usual weekly costs (based on the last 90 days).
  - Shows a week-by-week chart and your lowest point. Business Dexx explains it in plain words and also knows it in chat.
  - Late invoices are not counted, to stay on the safe side.
- **Restore my Lab:** a new button on the welcome screen. Enter your email and the 6-digit code, and your whole Lab loads onto the new phone and opens straight up.
- **Business Lab button on the welcome screen:** it sits under Restore my Lab and opens the blue Business Lab directly.
- **Receipt photos:**
  - Attach a photo when adding a business expense, or tap **+ Receipt** on any expense later. View, download or remove it.
  - Photos are saved on the device. When you're signed in, they're also backed up privately to your cloud account, where only you can see them, and show on your other phones.
  - When Dexx reads a receipt photo in Business Lab, the card now asks "Keep this photo as the receipt?". Other paperwork photos are still never kept.
  - The tax packet CSV marks which expenses have a receipt on file.

**Extra Supabase step for 4.4:** run `supabase/sql/receipts-storage.sql` in the SQL Editor. Do this after `cloud-sync.sql`.

---
# 4.3.0.0 notes

Copy these into your GitHub repo (`the-financial-lab`), replacing the old ones, then push. Images, icons, the manifest and `styles.css` stay as they are.

| File | New or changed | What it does |
|---|---|---|
| `index.html` | changed | Version 4.3.0.0, new Business Lab Pro cards, Cloud Account card |
| `app.js` | changed (tiny) | Version header only (since 4.2) |
| `service-worker.js` | changed | New cache version, receives server push alerts |
| `lab-next.js` | changed | 4.2 modules + fix that kept new business data from being dropped |
| `lab-next.css` | changed | Styling for everything new |
| `lab-pro.js` | **new** | Mileage, follow-ups, P&L, repeat invoices, contractors/1099, tax packet, cloud accounts and sync |
| `dexx-character-business.jpg` | new in 4.2 | Business Dexx in a suit and shades |
| `supabase/functions/dexx-intake/index.ts` | new in 4.2 | Photo reading |
| `supabase/sql/cloud-sync.sql` | **new** | Cloud tables with privacy rules, plus the hourly alert job |
| `supabase/functions/send-daily-alerts/index.ts` | **new** | Sends the daily alert even when the Lab is closed |

## What's new in 4.3.0.0 (Business Lab)
- **Mileage log:** log drives by miles or by start/end odometer. Round trips are doubled. The deduction is worked out automatically at the IRS standard rate: 70¢ for 2025, 72.5¢ for Jan–Jun 2026, 76¢ from Jul 1 2026. You can also set your own rate. You can tell Dexx "drove 25 miles to Home Depot round trip" too.
- **Invoice follow-ups:** overdue clients are flagged by how late they are. WRITE REMINDER opens a message Dexx wrote. It's friendly when 1–7 days late, polite and firm at 8–30, and firm after 30. You can copy, share or email it, and mark it sent. Overdue invoices also show up in your daily alerts.
- **Profit & loss:** go month by month to see income, expenses by category, profit, mileage deduction, estimated taxable profit, tax set aside and owner pay. Business Dexx explains it in plain words.
- **Extras to make Business Lab more dependable:**
  - **Repeat monthly invoices:** tick "Repeat monthly" and next month's invoice creates itself 3 days before it's due.
  - **Contractors & 1099s:** track what you pay each helper. Dexx flags anyone at **$2,000+** this year, the 1099-NEC threshold for 2026 payments.
  - **Year tax packet (CSV):** one tap downloads all income, expenses, contractor payments, mileage, quarterly tax and owner pay for your accountant.
- **Cloud account (More → Cloud Account):** sign in with your email and a 6-digit code, no password. Your Lab saves to the cloud a few seconds after each change and loads on any device you sign into. If two devices disagree, Dexx asks which copy to keep.

## Setup (Supabase, about 15 minutes, one time)

**A. Cloud sync**
1. Supabase → SQL Editor → paste **only the top part** of `supabase/sql/cloud-sync.sql` (everything above the "Hourly job" line) → Run.
2. Supabase → Authentication → Providers → Email: make sure it's enabled.
3. Authentication → Email Templates → "Magic Link": put `{{ .Token }}` in the message, e.g. `Your Financial Lab code is {{ .Token }}`. Without this, people get a link instead of a code.
4. For real users, set up your own email sender (Authentication → SMTP). Supabase's built-in sender only allows a few emails an hour.

**B. Reliable alerts (server push)**
1. Generate VAPID keys once: `deno run https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts`
2. Set secrets: `supabase secrets set VAPID_KEYS='<the JSON it printed>' VAPID_SUBJECT='mailto:you@yourdomain.com' CRON_SECRET='<any long random text>'`
3. Deploy: `supabase functions deploy send-daily-alerts --no-verify-jwt`
4. Run the **bottom part** of `cloud-sync.sql` (the hourly job). First replace `PASTE-THE-SAME-CRON_SECRET...` with your CRON_SECRET.
5. Open `lab-pro.js`, find `FL_PUSH_VAPID_PUBLIC_KEY=''` near the cloud section, and paste the **public** key there in the application-server format: base64url, about 87 characters. Never paste the private key.
6. Once someone is signed in and turns on Dexx Alerts, their phone gets the daily alert at 9am their time, even with the app closed. It's still one a day and never shows dollar amounts. On iPhone they must use the Home Screen app.

**C. Photo reading (from 4.2):** `supabase functions deploy dexx-intake`. It uses your existing `ANTHROPIC_API_KEY`.

Until these steps are done, everything still works on the device. The Cloud card shows "Cloud tables are not set up yet", and alerts work the 4.2 way, only while the Lab is open.

Tax note: rates and thresholds came from IRS pages at the time of this update. Dexx is not a tax advisor, so confirm with a tax professional.
