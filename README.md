# Money Tracker VN

Personal Finance Tracking App - Mobile-first PWA

## 📝 Changelog

### 12 July 2026
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
