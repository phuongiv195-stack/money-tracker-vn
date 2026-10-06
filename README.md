# Money Tracker VN

Personal Finance Tracking App - Mobile-first PWA

## 📝 Changelog

### 6 October 2026
- **Fix:** an Android back swipe that starts on a category no longer opens Edit category. It also no longer starts multi-select or the edit form in other lists. Long presses ignore touches at the screen edge, are cancelled when the system takes the swipe (`touchcancel`), and on the Categories tab also by the back itself (`src/utils/touch.js`).
- **Quick add by voice (new):** in the Add Transaction form, tap 🎤 (right under the Split button, within thumb reach) and say or type one line, e.g. "25 ngàn rau Street Grocer" → −25,000 · Street Grocer · memo "vegetables". The fields fill in as you speak; check them and tap **Save**.
  - Rule-based, no AI (`src/services/quickAdd/parseQuickAdd.js`).
  - **Amounts:** "25k", "25 ngàn", "1tr2", "1 triệu rưỡi", "25 thousand".
  - **Direction:** "chi/trả/tiêu" for an expense, "nhận/tiền về/thu/lương" for income. Expense is the default.
  - **Account:** an account or bank name ("OCB"), or "tiền mặt"/"cash". Otherwise the per-device default.
  - **Category:** used if said. Otherwise the payee's last category, else Uncategorized.
  - **Date:** "hôm qua"/"yesterday".
  - Vietnamese words that differ only by accents are told apart (trả/trà, tiền về/tiền vé, chợ/cho).
  - The mic uses the browser's speech recognition (VI/EN toggle). It needs the HTTPS site; the keyboard mic works anywhere.
  - A quick-added bank payment is matched with its bank notification later instead of being imported twice.
  - **Several amounts in one go:** "rau 15k thịt 50k cá 30k" is saved as one transaction of 95,000. The preview shows 15,000 + 50,000 + 30,000 and the memo keeps the breakdown. When an amount has a unit, a bare small number counts as a quantity ("mua 3 ổ bánh mì 45k" is 45,000).
  - **Learns without AI:**
    - Memo words map to the category they usually end up in, learned from categorized transactions ("rau" → Groceries).
    - When the payee is changed before saving, the words speech recognition heard are remembered for that payee, e.g. "trít gờ rô sơ" → Street Grocer. This applies only to phrases of 2+ words that aren't item words. The aliases are stored in `userSettings/{uid}.quickAddAliases`.
  - **✕ button** clears what was said.
  - As you speak, the fields fill in: "50k BL Stadium" sets amount, payee and the payee's category; "Vietcombank" sets the account; "memo Dinner with Hien" puts everything after "memo" (or "ghi chú"/"note") into Memo.
    - Only what was said changes. The tab stays unless a direction word is said, and so does the account unless one is named.
    - Tapping 🎤 again **adds** to what was already said.
    - Shared hooks: `useSpeech`, `useQuickAddLearning`.
  - **Better category guess:** words learned from payees as well as memos ("gas" → Bike Gas via the gas stations). Every said word votes, including the ones after "memo", and a category whose name contains a said word gets an extra vote ("gas … black bike" → Bike Gas, "gas car" → Car Gas). A tie picks nothing.
  - With "memo …" said, the leftover words before it become the payee ("50000 gas memo black bike" → payee Gas, memo "black bike").
  - Only Spending/Savings accounts are matched by voice, so an asset account named "Car" doesn't take the word "car".
  - **Memos in English** so both partners can read them: a built-in Vietnamese→English word list (`src/services/quickAdd/viEnDictionary.js`), no translation service. "30,000 rau, 15,000 thịt, 80k cá" → memo "vegetables 30k, meat 15k, fish 80k". Words not in the list stay as said.
  - **Payee when none is said** (rather blank than a wrong guess):
    1. **Remembered:** a saved transaction whose memo is like what was said (more than half of the words in common, compared in English) gives its payee and category; the latest save wins. Save "40k xăng" once with Ha Giang Gas Station, and "60k xăng xe" picks it next time.
    2. **Market food** ("rau", "rau thịt", several amounts): the category's usual payee, e.g. Street Grocer for Grocery. A payee is "usual" when it was used 3+ times in the last 120 days and twice as often as any other.
    3. Otherwise only a payee that these words were saved with before, in the same category ("cá" → Fish Stand). If nothing fits, Payee stays blank.
  - A name after "với"/"with" is a companion, not the payee ("ăn tối với Hiền" → memo "dinner with Hiền").
  - The first version's Quick add box on the Categories tab, and its app shortcut, were removed: the form's mic does the same.
- **Bank import (new):** bank transactions now arrive by themselves, so they don't have to be typed. Free: no paid APIs, and no server code.
  - The Android companion app **PD Rich Sync** ([`android-bank-capture/`](android-bank-capture/README.md)) forwards notifications from the bank apps (VCB, Timo, OCB, BV). It also forwards bank emails shown by Gmail, and nothing else from Gmail. Everything goes to the new Firestore collection `bankInbox`.
  - Money Tracker reads `bankInbox` whenever it is open (`src/services/bankImport/`).
  - New transactions start **uncleared** and become cleared once checked. Without a remembered category they go to the new **Uncategorized** / **Uncategorized Income** categories.
  - **Not checked yet** is shown everywhere: an amber **!** instead of ○/✓ in the account's transaction list, and the same **!** next to the payee on the Transactions tab. In the account list, tapping **!** checks and clears the transaction. If it has no category yet, the form opens instead.
  - **Bank review** is on the **Accounts** tab: an amber banner, and a red count on the Accounts tab button. It lists every transaction the app entered, shown like the transaction list (no bank text):
    - tap one to fix it in the normal form; saving it marks it checked and cleared;
    - **✓** when it's right, or **✓ All correct** for all of them (checked and cleared). Transactions still without a category stay until one is chosen.
    - Checked transactions are flagged `bankImport.reviewed`. Typed-in transactions the bank details were attached to count as checked.
    - Bank messages that couldn't be read are folded away under "not read as a transaction".
  - **Count outside the app:** on desktop Chrome/Edge the app icon shows the count. On a phone, switch on 🔔 in Bank review (per device). While the app is in the background, each transaction to review is then a silent notification, with amount, payee, account, date and category, and nothing else. The phone shows the number on the app icon. Opening the app removes them, and tapping one opens Bank review (`public/sw-review-notifications.js`, `src/hooks/useReviewBadge.js`).
  - The first time a bank account shows up, To review asks which Money Tracker account it is. The link is saved in `accounts.bankAccountKeys`.
  - **Remembered categories:** a later transaction with the same sender or recipient gets the category or loan chosen last time. The same name counts even from another account number or bank; the account holders' own names don't (those are transfers).
  - **Transfers between own accounts** are recognised automatically. The signals are:
    - a shared bank reference;
    - the other account's number appearing in the text;
    - the other bank's name, with the account holder as the sender or recipient.

    This works even when only one side notifies. OCB sends nothing for money going out, so payments from OCB to other people still have to be entered by hand.
  - **No duplicates:** a transaction that arrives as a notification and an email, or is also typed in by hand, is recorded once.
  - **Balance check:** the balance in each bank message is compared with Money Tracker's balance at that moment. A difference shows in To review, for example an OCB payment that wasn't entered.
- **Add Transaction – waiting bank transactions:** a new transaction lists the bank transactions still waiting for a category. Tap one instead of typing it again.
- **Add Transaction – Pay Loan / Received Loan:** an expense or income can go straight to a loan. It is saved as a loan transaction, the same as from the Loans tab.
- **Edit transaction → Transfer:** switching to Transfer now clears the old category and account. Before, the transaction kept counting toward its old category.
- **Firestore rules:** new `bankInbox` collection, owner-only. It is already added in the Firebase Console and recorded in `firestore.rules`.
- **Optional:** [`apps-script/`](apps-script/README.md) is a Gmail Apps Script that sends bank emails without a phone. It is not needed when PD Rich Sync reads Gmail.

### 10 August 2026
- **Account & Loan detail – narrower list:** transaction lists in bank account detail and loan detail are now centered at `max-w-4xl`, same as category detail.
- **Profit & Loss – period no longer resets:** the selected date range (e.g. Last month, including custom from/to) now survives the report unmounting when the window width crosses the 1080px desktop breakpoint (e.g. dragging between monitors); it no longer snaps back to This year.
- **Category detail – sort toggle:** new button in the header (right side) that flips the transaction list between "Newest ↓" (default, newest → oldest) and "Oldest ↑" (oldest → newest) within the selected month. Category detail only.
- **Category detail – duplicate split rows:** a transaction converted from regular to split kept its old top-level `category` field, so the category detail list counted it twice. The list now treats split and regular matching as mutually exclusive, and saving an edit clears leftover fields from the old shape (both directions regular ↔ split).
- **Edit split with a 0 line:** opening Edit on a split whose line is 0 loaded that amount as blank, so Save was blocked with "Invalid amount" until the user retyped it. Zero amounts now load as "0".
- **Category detail – narrower list:** the transaction list is now centered with the same `max-w-4xl` width as Balance Sheet / Payee Report instead of stretching full-screen.

### 20 July 2026
- **Split transactions – allow 0 amounts:** split lines can now have a 0 value (previously "Invalid amount" blocked saving). Blank amounts and negative values are still rejected, and a 0 remaining amount on the last (auto-filled) line is now valid.

### 12 July 2026
- **Balance Sheet – USD reconciliation:** applied the same bottom-up USD rule as Profit & Loss. Each account/loan row is rounded to whole cents, each group = sum of its item cents, and Total Assets / Total Liabilities / Net Worth = sum of the group rows. Previously the totals converted the aggregate VND, so they could differ by a cent from adding up the rows on screen (e.g. Total Assets showing $214,357.88 where the groups summed to $214,357.89).
- **Profit & Loss – Total USD reconciliation:** made USD strictly bottom-up so every level equals the sum of the rows shown beneath it. Each category is rounded to whole cents, each group = sum of its categories' cents, and section/net totals = sum of the groups. Previously category rows, group rows, and totals each converted VND with different rounding, so section totals could be off by a cent (e.g. Health group). Applied to the on-screen table and the CSV export.
- **Dev tooling:** moved Vite's dependency cache outside Dropbox (`cacheDir: C:/tmp/money-tracker-vite-cache`) to stop `EBUSY: resource busy or locked` errors when starting the dev server from the synced project folder.

### 10 July 2026
- **Reports:** raised the desktop breakpoint from 1024px → 1080px so vertical/portrait screens get the full desktop reports instead of the "Desktop Only" prompt.
- **Profit & Loss** (renamed from "Detailed Reports"):
  - Fixed the Total USD column so section totals equal the sum of the displayed rows (per-row rounding is reconciled).
  - Added section-level check/uncheck and collapse toggles for the whole Income and Expenses sections.
  - CSV export now respects the checkbox selection (unchecked categories/groups are excluded).
- **Balance Sheet:**
  - Added per-category and per-account checkboxes, Check All / Uncheck All, and totals (Assets, Liabilities, Net Worth) that reflect the current selection.
  - Enlarged the Expand/Collapse and Check/Uncheck toolbar buttons to match Profit & Loss.
- **Categories:**
  - Added a Need-only / Want-only / Both spending-type setup per category; locked categories fix the want/need value on transactions.
  - Added a guard preventing duplicate category names within a type (transactions match by name, so duplicates collided across groups).
- **Transactions:**
  - Locked categories show a fixed want/need badge instead of an editable toggle.
  - The Add/Edit Transaction modal now closes on the Escape key.
- **Reports layout:** moved Balance Sheet below Payee Report.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```

App will run at: `http://localhost:5173`

### 3. Build for Production
```bash
npm run build
```

## 📁 Project Structure

```
money-tracker/
├── src/
│   ├── components/
│   │   ├── Categories/    # Home tab components
│   │   ├── Transactions/  # Transaction list & forms
│   │   ├── Accounts/      # Account management
│   │   └── Reports/       # Reports & charts
│   ├── contexts/          # React contexts (Auth, etc.)
│   ├── hooks/             # Custom React hooks
│   ├── services/          # Firebase & API services
│   │   └── firebase.js    # Firebase config ✅
│   ├── utils/             # Helper functions
│   ├── App.jsx            # Main app component
│   ├── main.jsx           # Entry point
│   └── index.css          # Global styles + Tailwind
├── public/                # Static assets
├── index.html             # HTML template
├── package.json           # Dependencies ✅
├── tailwind.config.js     # Tailwind configuration ✅
├── vite.config.js         # Vite + PWA config ✅
└── postcss.config.js      # PostCSS config ✅
```

## 🔥 Firebase Setup

✅ **Already configured!**

- Project: `money-tracker-vn`
- Region: Singapore (asia-southeast1)
- Firestore: Enabled
- Authentication: Email/Password enabled

Config file: `src/services/firebase.js`

## 🎨 Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Styling (green theme)
- **Firebase** - Backend (Firestore + Auth)
- **PWA** - Installable app
- **React Router** - Navigation

## 📱 Design Principles

- Mobile-first responsive design
- Speed-first (minimal clicks)
- Clean & simple UI
- Green emerald theme (#10b981)
- Progressive disclosure

## 🛠️ Development Workflow

1. Start dev server: `npm run dev`
2. Edit components in `src/components/`
3. Hot reload automatically updates
4. Build production: `npm run build`
5. Preview build: `npm run preview`

## 📋 Next Steps

### Phase 1: Basic Structure (Week 1)
- [ ] Setup Auth context
- [ ] Create login/signup flow
- [ ] Setup Firestore collections
- [ ] Create basic layout

### Phase 2: Categories Tab (Week 1)
- [ ] Period selector component
- [ ] Category list with groups
- [ ] Search functionality
- [ ] Show/hide toggle

### Phase 3: Add Transaction (Week 2)
- [ ] 3-tab form (Expense/Income/Transfer)
- [ ] Payee selector with memory
- [ ] Category selector (grouped)
- [ ] Account selector
- [ ] Date picker

### Phase 4: Transactions Tab (Week 2)
- [ ] Transaction list
- [ ] Search & filters
- [ ] Edit/delete functionality

### Phase 5: Accounts Tab (Week 3)
- [ ] Account list by type
- [ ] Net worth calculation
- [ ] Clear/Reconcile feature
- [ ] Transfer functionality

### Phase 6: Reports Tab (Week 3)
- [ ] Period selector popup
- [ ] Income vs Spending table
- [ ] Pie chart (Top 5)
- [ ] Category list

### Phase 7: Settings & Polish (Week 4)
- [ ] Settings page
- [ ] Dark mode (optional)
- [ ] Export data
- [ ] PWA optimization
- [ ] Testing & bug fixes

## 🎉 Ready to Code!

Design document: See `MONEY_TRACKER_DESIGN_COMPLETE.md`

---

Built with ❤️ by Phuong  
Design by: Phuong + Claude Sonnet 4  
Date: 12 December 2025
