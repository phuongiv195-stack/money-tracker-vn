// Firebase Configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getPerformance } from 'firebase/performance';

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

// Initialize Performance Monitoring (safe - only monitoring, never breaks app)
let perf = null;
try {
  perf = getPerformance(app);
  console.log('✅ Performance Monitoring enabled');
} catch (error) {
  console.warn('⚠️ Performance Monitoring failed to initialize (non-critical):', error);
}
export { perf };

// NOTE: Offline persistence is disabled for faster app startup
// and to prevent data loss when users clear browser cache.
// All data is fetched fresh from Firestore on each session.

// CRITICAL: Clear old IndexedDB from previous persistence setup
// This runs once per version to ensure no stale cached data
(async function clearOldFirestoreCache() {
  const CACHE_VERSION = 'v2_no_persistence'; // Update this to force cleanup
  const CACHE_KEY = 'firestoreCacheCleared';
  
  try {
    // Check if we've already cleared cache for this version
    const clearedVersion = localStorage.getItem(CACHE_KEY);
    if (clearedVersion === CACHE_VERSION) {
      console.log('✅ Cache already cleared for', CACHE_VERSION);
      return;
    }
    
    // Check if IndexedDB exists
    const databases = await window.indexedDB.databases();
    const firestoreDBs = databases.filter(db => 
      db.name && (
        db.name.includes('firestore') || 
        db.name.includes('firebase') ||
        db.name.includes('leveldb')
      )
    );
    
    if (firestoreDBs.length > 0) {
      console.log('🧹 Clearing old Firestore cache from previous version...');
      
      for (const dbInfo of firestoreDBs) {
        await new Promise((resolve) => {
          const deleteRequest = window.indexedDB.deleteDatabase(dbInfo.name);
          deleteRequest.onsuccess = () => {
            console.log(`✅ Cleared: ${dbInfo.name}`);
            resolve();
          };
          deleteRequest.onerror = () => {
            console.warn(`⚠️ Could not clear: ${dbInfo.name}`);
            resolve(); // Don't block app if cleanup fails
          };
          deleteRequest.onblocked = () => {
            console.warn(`⚠️ Blocked: ${dbInfo.name} (will retry on next load)`);
            resolve();
          };
        });
      }
      
      console.log('✅ Cache cleanup complete');
    }
    
    // Mark this version as cleaned
    localStorage.setItem(CACHE_KEY, CACHE_VERSION);
    
  } catch (error) {
    console.warn('⚠️ IndexedDB cleanup failed (non-critical):', error);
  }
})();

export default app;
