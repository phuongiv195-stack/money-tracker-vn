# Money Tracker VN - Complete Project Documentation

## Project Info
| Item | Details |
|------|---------|
| **App Name** | Money Tracker VN |
| **Author** | Phuong Nguyen |
| **Version** | 1.0.0 |
| **Completion Date** | December 24, 2025 |
| **Built with** | Claude AI (Anthropic) |

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Hosting & Data Storage (Important!)](#hosting--data-storage-important)
3. [Tech Stack](#tech-stack)
4. [Project Setup](#project-setup)
5. [Database Structure](#database-structure)
6. [App Features](#app-features)
7. [File Structure](#file-structure)
8. [UI/UX Design](#uiux-design)
9. [Deployment](#deployment)
10. [Future Improvements](#future-improvements)

---

## Project Overview

**Money Tracker VN** is a personal finance management mobile-first web application designed for Vietnamese users. It helps track income, expenses, transfers, loans, and provides detailed financial reports.

### Key Highlights
- Mobile-first Progressive Web App (PWA)
- Real-time data sync with Firebase
- Offline-capable (with service worker)
- Vietnamese Dong (VND) currency formatting
- Want/Need spending classification (50/30/20 budgeting rule support)

---

## Hosting & Data Storage (Important!)

### Where is data stored?

**Simple answer:** All data is stored on **Google's servers** through a service called **Firebase**.

### Storage Details:

| Component | Where it's stored | Explanation |
|-----------|-------------------|-------------|
| **Source Code** | Your computer | React/JavaScript files |
| **Database** (transactions, categories, accounts...) | Google Firebase Firestore | Google's cloud database |
| **Website** (when deployed) | Firebase Hosting / Vercel / Netlify | Web servers |

### Is it FREE?

**YES! Completely FREE** for personal use.

#### Firebase Spark Plan (FREE Forever):

| Service | Free Limit | Enough for |
|---------|------------|------------|
| **Firestore Database** | 1 GB storage | ~100,000+ transactions |
| | 50,000 reads/day | More than enough |
| | 20,000 writes/day | More than enough |
| **Firebase Hosting** | 10 GB storage | Lifetime usage |
| | 360 MB transfer/day | ~10,000 visits/day |
| **Authentication** | 50,000 users/month | Only need 1-2 users |

#### When do you have to pay?
- When you have **millions** of transactions
- When you have **thousands** of users per day
- **For personal/family use: You will NEVER have to pay**

### Is the data secure?

| Factor | Level |
|--------|-------|
| **Security** | ✅ Google Firebase has enterprise-grade security |
| **Backup** | ✅ Google automatically backs up data |
| **Reliability** | ✅ 99.95% uptime (almost never goes down) |
| **Privacy** | ⚠️ Data is on Google's servers (but only you can access it) |

### Where are the servers located?

When creating a Firebase project, you choose a **region**:
- `asia-southeast1` = **Singapore** (closest to Vietnam, fastest)
- `asia-east1` = Taiwan
- `us-central1` = USA

**Recommendation:** Choose `asia-southeast1` (Singapore) for best speed in Vietnam.

### How do you access the app?

```
Phone/Computer → Internet → Firebase Server (Singapore) → Your Data
```

- **Internet required** to sync data
- Can access from **any device** (phone, computer, tablet)
- Data **syncs in real-time** across all devices

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.x | UI library |
| **Vite** | 5.x | Build tool & dev server |
| **Tailwind CSS** | 3.x | Utility-first CSS framework |
| **React Router** | 6.x | Client-side routing |

### Backend & Database
| Technology | Purpose | Cost |
|------------|---------|------|
| **Firebase Firestore** | NoSQL database | **FREE** (Spark plan: 1GB storage, 50K reads/day, 20K writes/day) |
| **Firebase Auth** | User authentication | **FREE** (50K monthly active users) |
| **Firebase Hosting** | Web hosting | **FREE** (10GB storage, 360MB/day transfer) |

### Development Tools
| Tool | Purpose |
|------|---------|
| **VS Code** | Code editor |
| **Node.js** | JavaScript runtime (v18+) |
| **npm** | Package manager |
| **Git** | Version control |
| **Claude AI** | AI pair programming assistant |

---

## Project Setup

### Prerequisites
```bash
# Install Node.js (v18 or higher)
# Download from: https://nodejs.org/

# Verify installation
node --version  # Should be v18+
npm --version   # Should be v9+
```

### 1. Create New Project
```bash
# Create Vite React project
npm create vite@latest money-tracker-vn -- --template react

# Navigate to project
cd money-tracker-vn

# Install dependencies
npm install
```

### 2. Install Required Packages
```bash
# Core dependencies
npm install firebase
npm install react-router-dom
npm install tailwindcss postcss autoprefixer

# Initialize Tailwind
npx tailwindcss init -p
```

### 3. Firebase Setup

#### 3.1 Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `money-tracker-vn`
4. Disable Google Analytics (optional)
5. Click "Create project"

#### 3.2 Enable Firestore Database
1. In Firebase Console, go to "Build" → "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select nearest region (e.g., `asia-southeast1` for Vietnam)

#### 3.3 Enable Authentication (Optional)
1. Go to "Build" → "Authentication"
2. Click "Get started"
3. Enable "Email/Password" provider
4. (Optional) Enable "Google" provider

#### 3.4 Get Firebase Config
1. Go to Project Settings (gear icon)
2. Scroll to "Your apps" → Click web icon `</>`
3. Register app with nickname
4. Copy the `firebaseConfig` object

#### 3.5 Create Firebase Config File
Create `src/services/firebase.js`:
```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

### 4. Tailwind Configuration
Update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

### 5. Run Development Server
```bash
npm run dev
# App runs at http://localhost:5173
```

### 6. Build for Production
```bash
npm run build
# Output in /dist folder
```

---

## Database Structure

### Firestore Collections

#### `users` Collection
```javascript
{
  id: "auto-generated",
  email: "user@example.com",
  displayName: "User Name",
  createdAt: Timestamp,
  settings: {
    currency: "VND",
    language: "vi"
  }
}
```

#### `categories` Collection
```javascript
{
  id: "auto-generated",
  userId: "user-id",
  name: "Eating Out",
  icon: "🍔",
  type: "expense" | "income",
  group: "Food & Drinks",
  spendingType: "want" | "need" | null,  // Only for expense
  createdAt: Timestamp
}
```

#### `accounts` Collection
```javascript
{
  id: "auto-generated",
  userId: "user-id",
  name: "Vietcombank",
  type: "checking" | "savings" | "credit" | "cash" | "investment",
  group: "SPENDING" | "SAVINGS" | "INVESTMENTS",
  balance: 10000000,
  icon: "🏦",
  isActive: true,
  order: 0,  // For drag-drop sorting
  createdAt: Timestamp
}
```

#### `transactions` Collection
```javascript
// Regular transaction
{
  id: "auto-generated",
  userId: "user-id",
  type: "expense" | "income" | "transfer",
  amount: -500000,  // Negative for expense
  category: "Eating Out",
  account: "Vietcombank",
  payee: "Starbucks",
  date: "2024-12-21",
  memo: "Coffee with friends",
  spendingType: "want" | "need",  // Can override category default
  createdAt: Timestamp
}

// Transfer transaction
{
  id: "auto-generated",
  userId: "user-id",
  type: "transfer",
  amount: 1000000,
  fromAccount: "Vietcombank",
  toAccount: "Savings Account",
  date: "2024-12-21",
  memo: "Monthly savings",
  createdAt: Timestamp
}

// Split transaction
{
  id: "auto-generated",
  userId: "user-id",
  type: "split",
  splitType: "expense",
  totalAmount: -1000000,
  account: "Cash",
  payee: "Big C",
  date: "2024-12-21",
  splits: [
    { amount: 600000, category: "Groceries", spendingType: "need", memo: "Food" },
    { amount: 400000, category: "Household", spendingType: "need", memo: "Cleaning" }
  ],
  createdAt: Timestamp
}
```

#### `loans` Collection
```javascript
{
  id: "auto-generated",
  userId: "user-id",
  name: "Loan to John",
  type: "lend" | "borrow",
  principalAmount: 5000000,
  remainingAmount: 3000000,
  interestRate: 0,  // Percentage
  person: "John Doe",
  startDate: "2024-01-15",
  dueDate: "2024-06-15",
  status: "active" | "paid" | "overdue",
  notes: "For his car repair",
  createdAt: Timestamp
}
```

#### `loanTransactions` Collection
```javascript
{
  id: "auto-generated",
  loanId: "loan-id",
  userId: "user-id",
  type: "payment" | "interest" | "adjustment",
  amount: 1000000,
  date: "2024-03-15",
  note: "First payment",
  createdAt: Timestamp
}
```

### Firestore Security Rules (Production)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /categories/{categoryId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.userId;
    }
    
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.userId;
    }
    
    match /accounts/{accountId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.userId;
    }
    
    match /loans/{loanId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

---

## App Features

### 1. Categories Tab
| Feature | Description |
|---------|-------------|
| View categories | Grouped by custom groups (e.g., "Food & Drinks", "Transportation") |
| Add category | Name, icon, type (income/expense), group, want/need default |
| Edit category | Modify all fields |
| Delete category | With confirmation dialog |
| Custom emoji picker | Type/paste emoji or choose from presets |
| Group management | Rename, reorder groups |

### 2. Transactions Tab (Trans.)
| Feature | Description |
|---------|-------------|
| View transactions | Grouped by date, sorted newest first |
| Filter by date | Month picker |
| Add transaction | Expense, Income, or Transfer |
| Split transaction | Divide one payment into multiple categories |
| Want/Need toggle | Override category default per transaction |
| Payee autocomplete | Suggestions from previous transactions |
| Category autocomplete | Filtered by transaction type |
| Link to loan | Mark split as loan payment |

### 3. Accounts Tab
| Feature | Description |
|---------|-------------|
| View accounts | Grouped by SPENDING, SAVINGS, INVESTMENTS |
| Add account | Name, type, group, initial balance, icon |
| Account detail | View transactions for specific account |
| Update balance | Manual reconciliation |
| Reorder accounts | Drag-drop within groups |
| Hide/Show accounts | Toggle isActive |

### 4. Loans Tab
| Feature | Description |
|---------|-------------|
| View loans | Separate Lend vs Borrow sections |
| Add loan | Person, amount, interest, dates |
| Loan detail | Payment history, remaining balance |
| Record payment | Track partial payments |
| Link to transactions | Connect loan payments to expenses |

### 5. Reports Tab
| Feature | Description |
|---------|-------------|
| **Mobile View** | |
| Spending by Category | Donut chart + category breakdown |
| Income vs Expense | Bar chart comparison |
| Date selector | Navigate months |
| **Desktop View (≥1024px)** | |
| Spreadsheet layout | Full monthly breakdown |
| Date range filter | This Month, Last Quarter, This Year, Custom |
| Want/Need filter | Filter by spending type |
| Expandable groups | Collapse/expand category groups |
| Export CSV | Download report data |

---

## File Structure

```
money-tracker-vn/
├── public/
│   ├── icons/
│   │   ├── categories.png    # Pizza icon
│   │   ├── transactions.png  # Pacman icon
│   │   ├── accounts.png      # Piggy bank icon
│   │   ├── loans.png         # Winged money bag icon
│   │   └── reports.png       # Green ghost icon
│   ├── favicon.ico
│   └── manifest.json         # PWA manifest
│
├── src/
│   ├── components/
│   │   ├── Categories/
│   │   │   ├── CategoriesTab.jsx      # Main categories view
│   │   │   ├── CategoryDetail.jsx     # Single category transactions
│   │   │   ├── AddCategoryModal.jsx   # Add/Edit category form
│   │   │   └── EditGroupModal.jsx     # Rename group modal
│   │   │
│   │   ├── Transactions/
│   │   │   ├── TransactionsTab.jsx    # Transaction list view
│   │   │   └── AddTransactionModal.jsx # Add/Edit transaction form
│   │   │
│   │   ├── Accounts/
│   │   │   ├── AccountsTab.jsx        # Accounts list view
│   │   │   ├── AccountDetail.jsx      # Single account transactions
│   │   │   ├── AddAccountModal.jsx    # Add/Edit account form
│   │   │   ├── UpdateValueModal.jsx   # Reconcile balance
│   │   │   └── ReorderAccountsModal.jsx # Drag-drop reorder
│   │   │
│   │   ├── Loans/
│   │   │   ├── LoansTab.jsx           # Loans list view
│   │   │   ├── LoanDetail.jsx         # Single loan details
│   │   │   ├── AddNewLoanModal.jsx    # Add/Edit loan form
│   │   │   ├── AddLoanTransactionModal.jsx # Record payment
│   │   │   └── EditLoanTransactionModal.jsx
│   │   │
│   │   ├── Reports/
│   │   │   ├── ReportsTab.jsx         # Mobile reports view
│   │   │   └── DesktopReports.jsx     # Desktop spreadsheet view
│   │   │
│   │   ├── Settings/
│   │   │   └── SettingsTab.jsx        # App settings
│   │   │
│   │   └── Toast/
│   │       └── ToastProvider.jsx      # Toast notifications & confirm dialogs
│   │
│   ├── contexts/
│   │   ├── AuthContext.jsx            # Authentication state
│   │   ├── NavigationContext.jsx      # Back button handling
│   │   └── SettingsContext.jsx        # App settings state
│   │
│   ├── hooks/
│   │   └── useBackHandler.js          # Android back button hook
│   │
│   ├── services/
│   │   └── firebase.js                # Firebase configuration
│   │
│   ├── pages/
│   │   └── Login.jsx                  # Login page
│   │
│   ├── App.jsx                        # Main app component
│   ├── main.jsx                       # React entry point
│   └── index.css                      # Global styles + Tailwind
│
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## UI/UX Design

### Color Palette
| Color | Tailwind Class | Usage |
|-------|---------------|-------|
| Primary Green | `emerald-500/600` | Active states, positive numbers |
| Expense Red | `red-500/600` | Expenses, negative numbers |
| Income Green | `emerald-500` | Income amounts |
| Background | `gray-50/100` | Page backgrounds |
| Card | `white` | Card backgrounds |
| Text Primary | `gray-800/900` | Main text |
| Text Secondary | `gray-500` | Labels, hints |
| Want Purple | `purple-500` | Want spending type |
| Need Blue | `blue-500` | Need spending type |

### Typography
- Font Family: System fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`)
- Headings: `font-bold` or `font-semibold`
- Labels: `text-xs uppercase font-semibold text-gray-500`
- Body: `text-sm` or `text-base`

### Components Style Guide
- **Cards**: `bg-white rounded-xl shadow-sm p-4`
- **Buttons**: `py-2 px-4 rounded-lg font-medium`
- **Inputs**: `w-full p-3 bg-gray-50 rounded-lg focus:ring-2 focus:ring-emerald-500`
- **Modals**: Full screen on mobile, centered with max-width on desktop

### Bottom Navigation
- Height: ~70px
- Icons: 28x28px PNG images
- Active state: `bg-emerald-100` background on icon
- Labels: `text-[11px] uppercase font-semibold`

### Responsive Breakpoints
| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 640px | Single column, full-screen modals |
| Tablet | 640-1023px | Centered container (max-w-md) |
| Desktop | ≥ 1024px | Desktop Reports available |

---

## Deployment

### Option 1: Firebase Hosting (Recommended)
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize hosting
firebase init hosting
# Select your project
# Set public directory to: dist
# Configure as single-page app: Yes

# Build and deploy
npm run build
firebase deploy
```

### Option 2: Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Option 3: Netlify
1. Connect GitHub repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`

### Environment Variables (Production)
Create `.env.production`:
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## Future Improvements

### Planned Features
- [ ] Multi-currency support
- [ ] Budget planning & alerts
- [ ] Recurring transactions
- [ ] Data export (PDF reports)
- [ ] Dark mode
- [ ] Multiple users/family sharing
- [ ] Bank sync integration
- [ ] Receipt photo attachment
- [ ] Financial goals tracking

### Technical Improvements
- [ ] Migrate to TypeScript
- [ ] Add unit tests (Jest/Vitest)
- [ ] Implement offline-first with IndexedDB
- [ ] Add service worker for PWA
- [ ] Performance optimization (React.memo, useMemo)
- [ ] Implement proper error boundaries
- [ ] Add loading skeletons

---

## Troubleshooting

### Common Issues

#### Firebase Permission Denied
- Check Firestore security rules
- Verify user is authenticated
- Check `userId` field matches auth UID

#### Icons Not Loading
- Ensure icons are in `public/icons/` folder
- Check file paths start with `/icons/`
- Clear browser cache

#### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Tailwind Classes Not Working
- Verify `tailwind.config.js` content paths
- Restart dev server after config changes

---

## Resources

### Documentation
- [React Docs](https://react.dev/)
- [Vite Docs](https://vitejs.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Firestore Queries](https://firebase.google.com/docs/firestore/query-data/queries)

### Icons
- [Flaticon](https://www.flaticon.com/) - Free icons (with attribution)
- [Icons8](https://icons8.com/) - Free icons
- [Emoji](https://emojipedia.org/) - Emoji reference

### Design Inspiration
- [Dribbble Finance Apps](https://dribbble.com/search/finance-app)
- [Money Lover](https://moneylover.me/)
- [YNAB](https://www.ynab.com/)

---

## License

This project is for personal use. Feel free to modify and adapt for your own needs.

---

## Author & Contact

| Info | Details |
|------|---------|
| **Author** | Phuong Nguyen |
| **Completion Date** | December 24, 2025 |
| **Built with** | Claude AI (Anthropic) |
| **Version** | 1.0.0 |

For questions or issues with this codebase, refer to this documentation or recreate the project following the setup guide above.

---

## Quick Summary (For Non-Technical Users)

**For people who don't know coding:**

1. **What is this app?** 
   - A personal finance management app that runs in a web browser

2. **Where is data stored?** 
   - On Google's servers (Firebase) located in Singapore

3. **Does it cost money?** 
   - NO! Completely free for personal use

4. **Is it secure?** 
   - YES! Google provides enterprise-grade security

5. **What do you need to run the app?** 
   - Phone/Computer + Internet + Web browser

6. **How to rebuild this app?** 
   - Read the "Project Setup" section in this document
   - Or ask AI (Claude) to help following this guide

---

*Document created by Phuong Nguyen with Claude AI assistance*
*Last Updated: December 24, 2025*
