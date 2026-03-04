/**
 * EXAMPLE: How to add Performance Monitoring to your code (OPTIONAL)
 * 
 * These examples show how you CAN use performance tracking,
 * but you DON'T HAVE TO - your app works perfectly without it!
 * 
 * The traceOperation utility is 100% safe:
 * - If Performance Monitoring fails → your code continues normally
 * - If Performance Monitoring is disabled → your code continues normally
 * - No errors are thrown, no app crashes
 */

import { traceOperation, createTrace } from '../services/performanceUtils';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';

// ============================================================================
// EXAMPLE 1: Simple function - wrap the entire operation
// ============================================================================

// BEFORE (original code - still works):
async function loadTransactions(userId) {
  const q = query(
    collection(db, 'transactions'),
    where('userId', '==', userId),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// AFTER (with optional tracking):
async function loadTransactionsWithTracking(userId) {
  return traceOperation('load_transactions', async () => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }, { user_id: userId });
}

// ============================================================================
// EXAMPLE 2: Track multiple operations separately
// ============================================================================

async function loadAllData(userId) {
  // Track each load separately (optional)
  const [transactions, accounts, categories] = await Promise.all([
    traceOperation('load_transactions', () => loadTransactions(userId)),
    traceOperation('load_accounts', () => loadAccounts(userId)),
    traceOperation('load_categories', () => loadCategories(userId))
  ]);
  
  return { transactions, accounts, categories };
}

// ============================================================================
// EXAMPLE 3: Manual control with createTrace
// ============================================================================

async function processTransactions(transactions) {
  const trace = createTrace('process_transactions');
  trace.start();
  
  try {
    // Your processing logic
    const processed = transactions.filter(t => t.amount > 0);
    trace.setAttribute('input_count', transactions.length);
    trace.setAttribute('output_count', processed.length);
    
    // More processing...
    const total = processed.reduce((sum, t) => sum + t.amount, 0);
    trace.setMetric('total_amount', total);
    
    return processed;
  } finally {
    trace.stop();
  }
}

// ============================================================================
// EXAMPLE 4: Track user interactions
// ============================================================================

function handleTabSwitch(tabName) {
  const trace = createTrace('tab_switch');
  trace.setAttribute('tab_name', tabName);
  trace.start();
  
  // Your tab switching logic here
  // ... render new tab ...
  
  trace.stop();
}

// ============================================================================
// EXAMPLE 5: In React useEffect
// ============================================================================

import { useEffect } from 'react';

function TransactionsList({ userId }) {
  useEffect(() => {
    // Option 1: Track the entire load
    traceOperation('mount_transactions_list', async () => {
      const data = await loadTransactions(userId);
      // ... update state ...
    });
    
    // Option 2: Manual control
    const trace = createTrace('mount_transactions_list');
    trace.start();
    
    loadTransactions(userId)
      .then(data => {
        trace.setAttribute('count', data.length);
        // ... update state ...
      })
      .finally(() => trace.stop());
  }, [userId]);
  
  return <div>...</div>;
}

// ============================================================================
// IMPORTANT NOTES:
// ============================================================================

/**
 * 1. ALL of these examples are OPTIONAL
 *    - Your original code works perfectly without any of this
 *    - Add tracking only where you want insights
 * 
 * 2. SAFE to add anywhere
 *    - Never throws errors
 *    - Never breaks your app
 *    - If Performance Monitoring fails, your code continues
 * 
 * 3. WHEN to add tracking?
 *    - Functions you suspect might be slow
 *    - User-facing operations (load data, save data)
 *    - Tab switches, navigation
 *    - Heavy computations
 * 
 * 4. WHEN NOT to add tracking?
 *    - Tiny utility functions
 *    - Pure computations (no I/O)
 *    - Already-fast operations
 * 
 * 5. START SMALL
 *    - Just enabling Performance Monitoring gives you automatic metrics
 *    - Add custom traces only if you need more detail
 *    - You can always add more later
 */

export {
  loadTransactionsWithTracking,
  loadAllData,
  processTransactions,
  handleTabSwitch
};
