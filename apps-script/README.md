# Bank email import (Google Apps Script)

`BankEmailImport.gs` runs in the Gmail account that receives bank emails and copies new
transaction emails into Firestore `bankInbox` every 5 minutes. The web app parses them
(`src/services/bankImport/parsers.js`, `source: 'email'`) together with the Android
notifications. If a transaction arrives both ways, it is recorded once.

| Bank | Email | Why |
|------|-------|-----|
| Timo | "Debit/Credit Transaction Notice" | Timo doesn't notify every debit on the phone |
| VCB  | "Biên lai chuyển tiền qua tài khoản" | Backup for the phone notification; has the beneficiary |
| BV   | "Thông báo giao dịch thành công" | Backup; date only, no time or balance |

OCB sends no transaction emails.

## Setup (once)

1. Sign in to the Gmail account that receives the bank emails and open https://script.google.com.
2. Create a **New project**, paste in `BankEmailImport.gs`, then save.
3. Open **Project Settings → Script Properties** and add:
   - `MT_EMAIL`: the Money Tracker login email
   - `MT_PASSWORD`: the Money Tracker password. `setup()` deletes it after signing in.
4. In the editor, select `setup` and click **Run**. Approve the permissions (Gmail read, external requests, triggers).
5. Done. `checkBankEmails` now runs every 5 minutes.

`setup()` sets `IMPORT_SINCE` to the setup time, so older emails, already entered by hand,
are skipped. To import from an earlier date, set `IMPORT_SINCE` (ISO date, e.g.
`2026-10-06T00:00:00+07:00`) before running `setup()`.

If the Money Tracker password changes, add `MT_PASSWORD` again and rerun `setup()`.
