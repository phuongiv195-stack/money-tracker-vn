# Money Tracker VN

Personal Finance Tracking App - Mobile-first PWA

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
