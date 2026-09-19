# Holy Spirit Catholic Church · IMCS Pax Romana UEW-Local — setup

The site is one file (`index.html`) with both logos built in. To collect registrations and dues from every phone into one admin dashboard, connect the free Google Sheet backend (about 15 minutes).

## 1. Connect the backend (Google Sheet + Apps Script)
1. Create a new Google Sheet named "IMCS UEW Register".
2. Open **Extensions → Apps Script**, delete the default code and paste in everything from `Code.gs`.
3. At the top, set:
   - `ADMIN_PASSWORD` — the first admin password (you can change it later in **Settings**)
   - `FINANCE_PASSWORD` — already `finance2026` (the admin can reset it later in **Settings**)
   - `FINANCE_EMAIL` — Finance Secretary's email (gets each dues submission)
   - `ADMIN_EMAIL` — gets help messages
4. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Deploy and approve permissions.
5. Copy the **Web app URL** into `API_URL: ""` at the top of the script in `index.html`.

Sheet tabs created automatically: `Members`, `Dues`, `Help`, `Ledger`, `Debts`, `Updates`. Photos and receipt images go to a Drive folder "IMCS UEW Uploads". Passwords are stored hashed, not in the Sheet.

**If you already deployed an earlier version:** paste the new `Code.gs`, then **Deploy → Manage deployments → Edit → New version**. The `Dues` sheet columns changed earlier, so delete any old `Dues` tab and let it be recreated.

## 2. Edit the settings in `index.html` (the `CFG` block)
- `FINANCE_NAME`, `FINANCE_MOMO_NUMBER`, `FINANCE_MOMO_NAME` — **sample details, replace with the real ones**
- `ANNUAL_DUES` — yearly amount in GH₵ (`0` leaves it blank)
- `HERO_VIDEO_ID` — YouTube ID of the background video (`""` turns it off)

## 3. Deploy on Vercel
**CLI:** `npm i -g vercel`, then in this folder run `vercel` (framework **Other**, output directory `.`), then `vercel --prod`.
**GitHub:** push this folder to a repo, then Vercel → **Add New → Project → Import** (preset **Other**).

## Who can do what
| | Admin | Finance Secretary |
|---|---|---|
| Members, register member, dues, help, updates, settings | Yes | No |
| Confirm payments and **issue receipts (PDF)** | Yes | No |
| Finances (expenses, income, debts, balance, Excel) | Yes | Yes |

Sign in at **Admin** on the home page. Choose **Admin** or **Finance Secretary**, then enter the password. The Finance Secretary sees only the Finances screen.

**Admin → Settings** lets you change your password, reset the Finance Secretary's password, suspend or reactivate them, choose whether they may delete entries, and see their last sign-in. Suspending blocks new sign-ins and signs them out within about 30 seconds.

## Dues and receipts
Members submit name, MoMo number, date and amount, and the phone opens `*170#`. Members **cannot** download receipts. The admin confirms the payment (Dues tab), then taps **Issue receipt** to download the PDF and send it to the member. Members can only check their status with their receipt number.

## Home page updates
**Admin → Updates**: write a message (optionally pinned). It appears on the home page for everyone within about 30 seconds, and a chip shows the latest one on the hero.

## Background video
The page shows the video's thumbnail instantly and starts the video only after the page has finished loading. On data saver or 2G the video is skipped. A YouTube embed is still heavy on slow networks; for the fastest result, use a short video file (MP4, under 3 MB) hosted with the site and I can switch the page to use it.

## Demo mode
While `API_URL` is empty, data stays in the browser. Demo passwords: admin `imcs2026`, finance `finance2026`.

## Security notes
- Change the admin password in **Settings** on first use.
- The dashboard holds personal details and photos, some possibly of students under 18. Keep the Sheet and Drive folder private to the executives.
- `tel:*170#` works on phones only.
