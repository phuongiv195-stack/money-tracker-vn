# Investment Portfolio App

A modern investment portfolio management application built with React, Vite, and Firebase.

## 🚀 Features (Phase 1 - Foundation)

- ✅ User Authentication (Login/Register)
- ✅ Dashboard Layout
- ✅ Toast Notifications
- ✅ Tailwind CSS Styling
- 🔄 Portfolio Management (Coming soon)
- 🔄 Transaction Tracking (Coming soon)
- 🔄 Reports & Analytics (Coming soon)

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase account

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing one)
3. Enable Authentication (Email/Password)
4. Create Firestore Database
5. Copy your Firebase config

### 3. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then fill in your Firebase credentials in `.env`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📁 Project Structure

```
src/
├── components/
│   ├── Auth/           # Login & Register components
│   ├── Common/         # Reusable components (Loading, etc)
│   ├── Portfolio/      # Portfolio management (coming soon)
│   ├── Transactions/   # Transaction tracking (coming soon)
│   └── Dashboard.jsx   # Main dashboard layout
├── contexts/
│   ├── AuthContext.jsx # Authentication state
│   └── ToastContext.jsx # Toast notifications
├── hooks/              # Custom React hooks (coming soon)
├── lib/
│   └── firebase.js     # Firebase configuration
├── utils/
│   └── formatters.js   # Utility functions (currency, dates, etc)
└── App.jsx             # Main app component
```

## 🔐 Firebase Security Rules

Add these rules to your Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 📝 Next Steps

### Phase 2: Portfolio Management
- [ ] Add investment CRUD operations
- [ ] Investment cards display
- [ ] Category grouping (Mutual Funds, ETFs, Stocks)

### Phase 3: Transactions
- [ ] Add transaction modal
- [ ] Transaction list with filters
- [ ] Export to CSV

### Phase 4: Reports
- [ ] Charts with ApexCharts
- [ ] P&L calculations
- [ ] Asset allocation

## 🎨 Tech Stack

- **Frontend:** React 18 + Vite
- **Styling:** Tailwind CSS
- **Backend:** Firebase (Auth + Firestore)
- **Icons:** Lucide React
- **Date Utils:** date-fns

## 📦 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🤝 Contributing

This is a personal project. Feel free to fork and customize!

## 📄 License

MIT

---

**Note:** This is Phase 1 (Foundation). More features coming soon!
