// seedAccounts.js
// Run this file ONCE to initialize accounts in Firebase
// You can run this in browser console or create a temporary page

import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

const initialAccounts = [
  // SPENDING GROUP
  {
    name: 'Cash',
    icon: '💵',
    type: 'cash',
    group: 'SPENDING',
    order: 1
  },
  {
    name: 'BV Checking',
    icon: '🏦',
    type: 'bank',
    group: 'SPENDING',
    order: 2
  },
  {
    name: 'Vietcombank',
    icon: '🏦',
    type: 'bank',
    group: 'SPENDING',
    order: 3
  },
  {
    name: 'Techcombank',
    icon: '🏦',
    type: 'bank',
    group: 'SPENDING',
    order: 4
  },
  
  // SAVINGS GROUP
  {
    name: 'VCB Savings 6M',
    icon: '💰',
    type: 'savings',
    group: 'SAVINGS',
    order: 1
  },
  {
    name: 'Heo đất',
    icon: '🐷',
    type: 'savings',
    group: 'SAVINGS',
    order: 2
  },
  
  // INVESTMENTS GROUP (Market-value accounts)
  {
    name: 'D-Cash SSI',
    icon: '📈',
    type: 'investment',
    group: 'INVESTMENTS',
    order: 1,
    currentValue: 300000000,
    costBasis: 250000000,
    lastValueUpdate: new Date()
  },
  {
    name: 'Coin',
    icon: '💎',
    type: 'investment',
    group: 'INVESTMENTS',
    order: 2,
    currentValue: 0,
    costBasis: 0,
    lastValueUpdate: new Date()
  },
  {
    name: 'Chứng khoán',
    icon: '📊',
    type: 'investment',
    group: 'INVESTMENTS',
    order: 3,
    currentValue: 0,
    costBasis: 0,
    lastValueUpdate: new Date()
  },
  
  // LOANS GROUP
  {
    name: 'Loan to Minh',
    icon: '💸',
    type: 'loan',
    group: 'LOANS',
    order: 1
  },
  {
    name: 'Bố gửi tiền',
    icon: '💳',
    type: 'loan',
    group: 'LOANS',
    order: 2
  }
];

export const seedAccounts = async () => {
  const userId = 'test-user'; // Replace with actual user ID from auth
  
  console.log('🌱 Starting account seeding...');
  
  try {
    for (const acc of initialAccounts) {
      const accountData = {
        userId,
        ...acc,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await addDoc(collection(db, 'accounts'), accountData);
      console.log(`✅ Created: ${acc.name}`);
    }
    
    console.log('🎉 All accounts seeded successfully!');
    console.log(`Total: ${initialAccounts.length} accounts created`);
    
  } catch (error) {
    console.error('❌ Error seeding accounts:', error);
  }
};

// ============================================
// HOW TO USE:
// ============================================

// METHOD 1: Run in Browser Console
// 1. Open your app in browser
// 2. Open Console (F12)
// 3. Copy-paste this entire file
// 4. Run: seedAccounts()

// METHOD 2: Create temporary button in App.jsx
// Add this to your App.jsx temporarily:
/*
import { seedAccounts } from './seedAccounts';

// Inside your component:
<button onClick={seedAccounts}>
  🌱 Seed Accounts (Run Once)
</button>
*/

// METHOD 3: Create a separate seed page
// Create src/pages/SeedData.jsx and call seedAccounts() on mount

// ============================================
// FIRESTORE SECURITY RULES
// ============================================
// Make sure your Firestore rules allow write access:
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /accounts/{accountId} {
      allow read, write: if request.auth != null;
    }
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null;
    }
    match /categories/{categoryId} {
      allow read, write: if request.auth != null;
    }
  }
}
*/

export default seedAccounts;