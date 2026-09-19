# Holy Spirit Catholic Church · IMCS Pax Romana UEW-Local — setup

The site is one file (`index.html`). Both logos are already built in. To collect registrations and dues from every phone into one admin dashboard, connect the free Google Sheet backend below (about 15 minutes).

## 1. Connect the backend (Google Sheet + Apps Script)
1. Create a new Google Sheet named "IMCS UEW Register".
2. Open **Extensions → Apps Script**, delete the default code and paste in everything from `Code.gs`.
3. At the top, change:
   - `ADMIN_PASSWORD` — your admin password (choose a strong one)
   - `FINANCE_EMAIL` — the Finance Secretary's email (every dues submission is emailed here too)
   - `ADMIN_EMAIL` — where help messages are emailed
4. Click **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Deploy and approve permissions (Sheets, Drive, Mail).
5. Copy the **Web app URL** and paste it into `API_URL: ""` at the top of the script in `index.html`.

The Sheet gets tabs for `Members`, `Dues`, `Help`, `Ledger` and `Debts`. Passport pictures and receipt images are saved in a Drive folder called "IMCS UEW Uploads".

If you change `Code.gs` later: **Deploy → Manage deployments → Edit → New version**.

## 2. Edit the settings in `index.html` (the `CFG` block)
- `FINANCE_NAME`, `FINANCE_MOMO_NUMBER`, `FINANCE_MOMO_NAME` — **these are sample details. Replace them with the real Finance Secretary's.**
- `ANNUAL_DUES` — the yearly amount in GH₵ (for example `30`). It is pre-filled on the dues form. `0` leaves it blank.
- `HERO_VIDEO_ID` — the YouTube ID of the home page background video. It is set to your video `_9D0DYwaojU`. Set `""` to turn the video off.

## 3. Deploy on Vercel
**CLI:** install Node.js, run `npm i -g vercel`, open a terminal in this folder, run `vercel` (framework: **Other**, output directory: `.`), then `vercel --prod`.
**GitHub:** push this folder to a repo, then in Vercel choose **Add New → Project → Import**. Framework preset: **Other**.
To change anything later, edit `index.html` and redeploy.

## How dues work
1. The member fills in name, MoMo number, date and amount, then taps **Send details & dial *170#**.
2. The details are saved to your admin dashboard (and emailed to the Finance Secretary), and the phone opens the *170# dialer. If the browser blocks the dialer, a **Dial *170#** button is shown.
3. The member downloads a PDF receipt (status "Pending confirmation").
4. The Finance Secretary checks MoMo, then opens **Admin → Dues → Confirm payment**. The member's status becomes Paid, the money is added to the church balance, and a confirmed receipt can be downloaded.
5. Members can check their status with their receipt number on the dues page. In **Admin → Members** you can filter by Paid / Reported / Not paid.

## Finances tab
Add expenses (with receipt image upload), other income, and debts. The balance is: confirmed annual dues + other income − expenses. "Balance after clearing debts" subtracts what is still owed. Recording a debt payment also records a Debt repayment expense. Everything exports to Excel.

## Demo mode
While `API_URL` is empty, everything works, but data stays in that one browser. Admin password in demo mode: `imcs2026`.

## Security notes
- In live mode the admin password is checked on the server. Do not share the Apps Script URL together with the password.
- The registration data includes personal details and photos, some possibly of students under 18. Keep the Sheet and Drive folder private to the executives.
- The USSD dialer button uses `tel:*170#`. It works on phones; on a computer members should dial on their phone.
