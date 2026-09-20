# Holy Spirit Catholic Church · IMCS Pax Romana UEW-Local — setup

The site is one file (`index.html`) with both logos built in. To collect registrations, dues and attendance from every phone into one dashboard, connect the free Google Sheet backend (about 15 minutes).

## 1. Connect the backend (Google Sheet + Apps Script)
1. Create a new Google Sheet named "IMCS UEW Register".
2. Open **Extensions → Apps Script**, delete the default code and paste in everything from `Code.gs`.
3. At the top, set:
   - `ADMIN_PASSWORD` — first admin password (change it later in **Settings**)
   - `FINANCE_PASSWORD` — `finance2026`
   - `USHER_PASSWORD` — `usher2026`
   - `FINANCE_EMAIL` — Finance Secretary's email (gets each dues submission)
   - `ADMIN_EMAIL` — gets help messages
4. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Deploy and approve permissions.
5. Paste the **Web app URL** into `API_URL: ""` at the top of the script in `index.html`.

**Upgrading an earlier deployment:** paste the new `Code.gs`, then **Deploy → Manage deployments → Edit → New version**. Delete any old empty tabs (`Dues`, `Attendance`) so they are recreated with the right columns. Phone numbers, dates and IDs are now stored as plain text, so a phone such as 0244000111 keeps its leading 0.

## 2. Edit the settings in `index.html` (the `CFG` block)
- `FINANCE_NAME`, `FINANCE_MOMO_NUMBER`, `FINANCE_MOMO_NAME` — **sample details, replace with the real ones**
- `ANNUAL_DUES` — yearly amount in GH₵ (`0` leaves it blank)
- `HERO_VIDEO_ID` — YouTube ID of the background video (`""` turns it off)

## 3. Deploy on Vercel
**CLI:** `npm i -g vercel`, then in this folder run `vercel` (framework **Other**, output directory `.`), then `vercel --prod`.
**GitHub:** push this folder to a repo, then Vercel → **Add New → Project → Import** (preset **Other**).
The camera needs HTTPS, which Vercel provides.

## Sign-in roles (Admin page → choose the tab)
| | Admin | Finance | Usher |
|---|---|---|---|
| Members, register member, dues, updates, help, reports, settings | Yes | No | No |
| Confirm payments and issue receipts | Yes | No | No |
| Finances (expenses, income, debts, balance) | Yes | Yes | No |
| Sunday attendance | Yes | No | **Yes (only this)** |

Default passwords: admin (the one you set), Finance `finance2026`, Usher `usher2026`. **Admin → Settings** lets you change your password, reset the Finance and Usher passwords, suspend or reactivate either one, choose whether finance may delete entries and whether ushers may mark past Sundays, and see their last sign-in.

## Membership card
After registering, each member sees their card (photo, name, programme, level, society, member ID) and can download it as an image or PDF. The card is also kept on their device, so they can download it again later from the registration page or the dues page. In **Admin → Members → View**, the admin can create a member's card too.

## Passport picture
**Take a photo** opens a live camera with a face guide, a front/back switch and a Take photo button. If the browser blocks the camera, the dialog offers the phone's own camera app instead. **Choose from gallery** always works.

## Sunday attendance
Admin → **Attendance** (or the Usher login): pick the Sunday (it defaults to the latest), tap a member to mark them present, search by name or ID, filter present/absent, and add visitors by name. Every tap is saved immediately. The admin also sees a history of past Sundays and can export attendance to Excel.

## Monthly report
Admin → **Reports**: choose a month to see new members, dues, income and expenses, opening and closing balance, Sunday attendance (with the most regular members), help messages and updates. Download it as a PDF or Excel.

## Dues and receipts
Members submit name, MoMo number, date and amount, and the phone opens `*170#`. Members cannot download receipts. The admin confirms the payment (Dues tab) and taps **Issue receipt**.

## Home page updates
Admin → **Updates**: posts appear on the home page for everyone within about 30 seconds.

## Demo mode
While `API_URL` is empty, data stays in the browser. Demo passwords: admin `imcs2026`, finance `finance2026`, usher `usher2026`.

## Security notes
- Change the admin password in **Settings** on first use.
- The dashboard holds personal details and photos, some possibly of students under 18. Keep the Sheet and Drive folder private to the executives. Ushers only see names, member IDs, level and society.
- `tel:*170#` works on phones only.
