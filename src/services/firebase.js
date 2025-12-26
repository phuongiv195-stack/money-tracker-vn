// Firebase Configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA3e4bfmZev-pBM1FFb_mhh8YWe6ObboXk",
  authDomain: "money-tracker-vn.firebaseapp.com",
  projectId: "money-tracker-vn",
  storageBucket: "money-tracker-vn.firebasestorage.app",
  messagingSenderId: "1006261928334",
  appId: "1:1006261928334:web:032baf4547e1519d92a4df",
  measurementId: "G-TGHBC80021"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// NOTE: Disabled offline persistence for faster app startup
// enableIndexedDbPersistence was causing 30s delay on app open

export default app;
