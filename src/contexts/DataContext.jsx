import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, setDoc, getDoc, getDocs, startAfter } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUserId } from './AuthContext';

const DataContext = createContext(null);

// Configuration - Optimized for speed
const INITIAL_LOAD = 200;      // Fast initial load (< 1 second)
const BATCH_SIZE = 300;        // Load more in batches
const MAX_TRANSACTIONS = 2000; // Maximum to keep in memory

export const DataProvider = ({ children }) => {
  const userId = useUserId();
  
  // Core data states
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [userTags, setUserTags] = useState([]); // Tags saved by user
  
  // Quick Select Accounts - stored in localStorage (per device)
  const [hiddenAccounts, setHiddenAccounts] = useState(() => {
    const saved = localStorage.getItem('hiddenAccounts');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Save hiddenAccounts to localStorage
  useEffect(() => {
    localStorage.setItem('hiddenAccounts', JSON.stringify(hiddenAccounts));
  }, [hiddenAccounts]);
  
  // Loading states
  const [loading, setLoading] = useState({
    transactions: true,
    accounts: true,
    categories: true
  });
  
  // Pagination state
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef(null);
  const allTransactionsRef = useRef(new Map()); // Store all loaded transactions by ID
  
  // Error states
  const [errors, setErrors] = useState({
    transactions: null,
    accounts: null,
    categories: null
  });

  // Track if initial load is complete
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // ============================================
  // FIREBASE LISTENERS - Single source of truth
  // ============================================

  // Transactions listener - Initial fast load
  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      allTransactionsRef.current.clear();
      setLoading(prev => ({ ...prev, transactions: false }));
      return;
    }

    setLoading(prev => ({ ...prev, transactions: true }));
    setErrors(prev => ({ ...prev, transactions: null }));
    allTransactionsRef.current.clear();

    // Initial query - load recent transactions quickly
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      limit(INITIAL_LOAD)
    );

    const unsubscribe = onSnapshot(
  q,
  (snapshot) => {
    // CLEAR và rebuild lại từ snapshot (không append)
    const newMap = new Map();
    
    snapshot.docs.forEach(doc => {
      newMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
    
    // Nếu đã load more trước đó, giữ lại những transactions cũ hơn
    if (lastDocRef.current) {
      // Merge với transactions cũ (những cái nằm ngoài query hiện tại)
      allTransactionsRef.current.forEach((trans, id) => {
        if (!newMap.has(id)) {
          // Chỉ giữ lại nếu date cũ hơn snapshot cuối cùng
          const lastDate = snapshot.docs[snapshot.docs.length - 1]?.data().date || '';
          if (trans.date < lastDate) {
            newMap.set(id, trans);
          }
        }
      });
    }
    
    allTransactionsRef.current = newMap;
    
    // Update last doc for pagination
    if (snapshot.docs.length > 0) {
      lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
    }
    
    // Check if there might be more
    setHasMoreTransactions(snapshot.docs.length >= INITIAL_LOAD);
    
    // Convert map to array, sorted by date desc
    const transArray = Array.from(allTransactionsRef.current.values())
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    setTransactions(transArray);
    setLoading(prev => ({ ...prev, transactions: false }));
  },
  (error) => {
    console.error('Transactions listener error:', error);
    setErrors(prev => ({ ...prev, transactions: error.message }));
    setLoading(prev => ({ ...prev, transactions: false }));
  }
);

    return () => unsubscribe();
  }, [userId]);

  // Load more transactions function
  const loadMoreTransactions = useCallback(async () => {
    if (!userId || !hasMoreTransactions || loadingMore || !lastDocRef.current) return false;
    
    // Don't load more if we've hit the max
    if (allTransactionsRef.current.size >= MAX_TRANSACTIONS) {
      setHasMoreTransactions(false);
      return false;
    }

    setLoadingMore(true);
    
    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', userId),
        orderBy('date', 'desc'),
        startAfter(lastDocRef.current),
        limit(BATCH_SIZE)
      );

      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        snapshot.docs.forEach(doc => {
          allTransactionsRef.current.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        
        // Convert map to array, sorted by date desc
        const transArray = Array.from(allTransactionsRef.current.values())
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        
        setTransactions(transArray);
      }
      
      const hasMore = snapshot.docs.length >= BATCH_SIZE;
      setHasMoreTransactions(hasMore);
      setLoadingMore(false);
      return hasMore;
    } catch (error) {
      console.error('Load more error:', error);
      setLoadingMore(false);
      return false;
    }
  }, [userId, hasMoreTransactions, loadingMore]);

  // Auto-load more for reports (load all data needed)
  const loadAllTransactions = useCallback(async () => {
    if (!userId) return;
    
    let canLoadMore = hasMoreTransactions;
    while (canLoadMore && allTransactionsRef.current.size < MAX_TRANSACTIONS) {
      canLoadMore = await loadMoreTransactions();
      // Small delay to prevent UI freeze
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }, [userId, hasMoreTransactions, loadMoreTransactions]);

  // Accounts listener
  useEffect(() => {
    if (!userId) {
      setAccounts([]);
      setLoading(prev => ({ ...prev, accounts: false }));
      return;
    }

    setLoading(prev => ({ ...prev, accounts: true }));
    setErrors(prev => ({ ...prev, accounts: null }));

    const q = query(
      collection(db, 'accounts'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const accs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAccounts(accs);
        setLoading(prev => ({ ...prev, accounts: false }));
      },
      (error) => {
        console.error('Accounts listener error:', error);
        setErrors(prev => ({ ...prev, accounts: error.message }));
        setLoading(prev => ({ ...prev, accounts: false }));
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Categories listener
  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setLoading(prev => ({ ...prev, categories: false }));
      return;
    }

    setLoading(prev => ({ ...prev, categories: true }));
    setErrors(prev => ({ ...prev, categories: null }));

    const q = query(
      collection(db, 'categories'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const cats = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCategories(cats);
        setLoading(prev => ({ ...prev, categories: false }));
      },
      (error) => {
        console.error('Categories listener error:', error);
        setErrors(prev => ({ ...prev, categories: error.message }));
        setLoading(prev => ({ ...prev, categories: false }));
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // User Tags listener - tags saved independently (not just from transactions)
  useEffect(() => {
    if (!userId) {
      setUserTags([]);
      return;
    }

    const docRef = doc(db, 'userTags', userId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setUserTags(docSnap.data().tags || []);
        } else {
          setUserTags([]);
        }
      },
      (error) => {
        console.error('UserTags listener error:', error);
        setUserTags([]);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Track initial load completion
  useEffect(() => {
    const allLoaded = !loading.transactions && !loading.accounts && !loading.categories;
    if (allLoaded && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [loading, initialLoadComplete]);

  // ============================================
  // DERIVED DATA - Computed from cached data
  // ============================================

  // Active accounts (non-archived)
  const activeAccounts = useMemo(() => {
    return accounts.filter(acc => acc.isActive !== false);
  }, [accounts]);

  // Archived accounts
  const archivedAccounts = useMemo(() => {
    return accounts.filter(acc => acc.isActive === false);
  }, [accounts]);

  // Account names for dropdowns (sorted by group and order)
  const accountNames = useMemo(() => {
    const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'INVESTMENTS': 2, 'ASSETS': 3 };
    return activeAccounts
      .filter(a => a.group !== 'LOANS')
      .sort((a, b) => {
        const groupA = groupOrder[a.group] ?? 99;
        const groupB = groupOrder[b.group] ?? 99;
        if (groupA !== groupB) return groupA - groupB;
        return (a.order ?? 999) - (b.order ?? 999);
      })
      .map(a => a.name);
  }, [activeAccounts]);

  // Grouped accounts for dropdowns with optgroup
  const groupedAccounts = useMemo(() => {
    const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'INVESTMENTS': 2, 'ASSETS': 3 };
    const groupLabels = { 'SPENDING': '💳 Spending', 'SAVINGS': '🏦 Savings', 'INVESTMENTS': '📈 Investments', 'ASSETS': '🏠 Assets' };
    
    const sorted = activeAccounts
      .filter(a => a.group !== 'LOANS')
      .sort((a, b) => {
        const groupA = groupOrder[a.group] ?? 99;
        const groupB = groupOrder[b.group] ?? 99;
        if (groupA !== groupB) return groupA - groupB;
        return (a.order ?? 999) - (b.order ?? 999);
      });
    
    const groups = {};
    sorted.forEach(a => {
      const groupKey = a.group || 'OTHER';
      if (!groups[groupKey]) {
        groups[groupKey] = {
          label: groupLabels[groupKey] || groupKey,
          accounts: []
        };
      }
      groups[groupKey].accounts.push({ name: a.name, icon: a.icon });
    });
    
    // Return in order
    return ['SPENDING', 'SAVINGS', 'INVESTMENTS', 'ASSETS']
      .filter(g => groups[g])
      .map(g => groups[g]);
  }, [activeAccounts]);

  // Quick Select Grouped accounts (excludes hidden accounts) - for From dropdown
  const quickSelectGroupedAccounts = useMemo(() => {
    const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'INVESTMENTS': 2, 'ASSETS': 3 };
    const groupLabels = { 'SPENDING': '💳 Spending', 'SAVINGS': '🏦 Savings', 'INVESTMENTS': '📈 Investments', 'ASSETS': '🏠 Assets' };
    
    const sorted = activeAccounts
      .filter(a => a.group !== 'LOANS' && !hiddenAccounts.includes(a.name))
      .sort((a, b) => {
        const groupA = groupOrder[a.group] ?? 99;
        const groupB = groupOrder[b.group] ?? 99;
        if (groupA !== groupB) return groupA - groupB;
        return (a.order ?? 999) - (b.order ?? 999);
      });
    
    const groups = {};
    sorted.forEach(a => {
      const groupKey = a.group || 'OTHER';
      if (!groups[groupKey]) {
        groups[groupKey] = {
          label: groupLabels[groupKey] || groupKey,
          accounts: []
        };
      }
      groups[groupKey].accounts.push({ name: a.name, icon: a.icon });
    });
    
    // Return in order
    return ['SPENDING', 'SAVINGS', 'INVESTMENTS', 'ASSETS']
      .filter(g => groups[g])
      .map(g => groups[g]);
  }, [activeAccounts, hiddenAccounts]);

  // Category names for dropdowns
  const categoryNames = useMemo(() => {
    return categories.map(c => c.name).filter(Boolean);
  }, [categories]);

  // Expense categories
  const expenseCategories = useMemo(() => {
    return categories.filter(c => c.type === 'expense');
  }, [categories]);

  // Income categories
  const incomeCategories = useMemo(() => {
    return categories.filter(c => c.type === 'income');
  }, [categories]);

  // Loan transactions only
  const loanTransactions = useMemo(() => {
    return transactions.filter(t => t.type === 'loan');
  }, [transactions]);

  // Split transactions only
  const splitTransactions = useMemo(() => {
    return transactions.filter(t => t.type === 'split');
  }, [transactions]);

  // Non-loan transactions (for reports)
  const nonLoanTransactions = useMemo(() => {
    return transactions.filter(t => t.type !== 'loan' && !t.isFuture);
  }, [transactions]);

  // Future transactions (scheduled for future dates)
  const futureTransactions = useMemo(() => {
    return transactions
      .filter(t => t.isFuture === true)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [transactions]);

  // Unique loan names
  const loanNames = useMemo(() => {
    const names = new Set();
    // From regular loan transactions
    loanTransactions.forEach(t => {
      if (t.loan) names.add(t.loan);
    });
    // From split transactions with loan splits
    splitTransactions.forEach(t => {
      if (t.splits) {
        t.splits.forEach(split => {
          if (split.isLoan && split.loan) {
            names.add(split.loan);
          }
        });
      }
    });
    return Array.from(names);
  }, [loanTransactions, splitTransactions]);

  // Payee suggestions with category and account mapping
  const { payeeSuggestions, payeeToCategoryMap, payeeToAccountMap } = useMemo(() => {
    const payeeMap = {};
    const categoryMap = {};
    const accountMap = {};
    
    // Sort by date desc to get most recent category/account for each payee
    const sortedTrans = [...transactions].sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateB.localeCompare(dateA);
    });
    
    sortedTrans.forEach(t => {
      if (t.payee && !payeeMap[t.payee]) {
        payeeMap[t.payee] = true;
        if (t.category) {
          categoryMap[t.payee] = t.category;
        }
        if (t.account) {
          accountMap[t.payee] = t.account;
        }
      }
    });
    
    return {
      payeeSuggestions: Object.keys(payeeMap),
      payeeToCategoryMap: categoryMap,
      payeeToAccountMap: accountMap
    };
  }, [transactions]);

  // Tag suggestions - combine userTags (saved separately) and tags from transactions
  const tagSuggestions = useMemo(() => {
    const tags = new Set();
    
    // Add user-saved tags
    userTags.forEach(tag => tags.add(tag));
    
    // Add tags from transactions (supports both old 'tag' and new 'tags' fields)
    transactions.forEach(t => {
      if (t.tag) tags.add(t.tag);
      if (t.tags && Array.isArray(t.tags)) {
        t.tags.forEach(tag => tags.add(tag));
      }
    });
    
    return Array.from(tags).sort();
  }, [transactions, userTags]);

  // Function to add a new tag to userTags
  const addUserTag = useCallback(async (newTag) => {
    if (!userId || !newTag) return;
    const trimmedTag = newTag.trim();
    if (!trimmedTag) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      
      // Check if tag already exists
      if (currentTags.includes(trimmedTag)) {
        return; // Already exists, no need to save
      }
      
      const updatedTags = [...currentTags, trimmedTag].sort();
      await setDoc(docRef, { tags: updatedTags }, { merge: true });
      console.log('Tag saved successfully:', trimmedTag);
    } catch (error) {
      console.error('Error adding tag:', error);
    }
  }, [userId]);

  // Function to remove a tag from userTags
  const removeUserTag = useCallback(async (tagToRemove) => {
    if (!userId || !tagToRemove) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      const updatedTags = currentTags.filter(t => t !== tagToRemove);
      await setDoc(docRef, { tags: updatedTags });
    } catch (error) {
      console.error('Error removing tag:', error);
    }
  }, [userId]);

  // Function to rename a tag in userTags
  const renameUserTag = useCallback(async (oldTag, newTag) => {
    if (!userId || !oldTag || !newTag) return;
    const trimmedNew = newTag.trim();
    if (!trimmedNew || oldTag === trimmedNew) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      const updatedTags = currentTags.map(t => t === oldTag ? trimmedNew : t);
      const uniqueTags = [...new Set(updatedTags)].sort();
      await setDoc(docRef, { tags: uniqueTags });
    } catch (error) {
      console.error('Error renaming tag:', error);
    }
  }, [userId]);

  // Account balances computed from transactions
  const accountBalances = useMemo(() => {
    const balances = {};
    
    transactions.forEach(t => {
      if (t.type === 'transfer') {
        const amt = Math.abs(Number(t.amount) || 0);
        if (t.fromAccount) {
          balances[t.fromAccount] = (balances[t.fromAccount] || 0) - amt;
        }
        if (t.toAccount) {
          balances[t.toAccount] = (balances[t.toAccount] || 0) + amt;
        }
      } else if (t.type === 'split') {
        // Split transactions use totalAmount
        const amt = Number(t.totalAmount) || 0;
        if (t.account) {
          balances[t.account] = (balances[t.account] || 0) + amt;
        }
      } else if (t.account) {
        const amt = Number(t.amount) || 0;
        balances[t.account] = (balances[t.account] || 0) + amt;
      }
    });
    
    return balances;
  }, [transactions]);

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  // Get transactions for a specific month
  const getTransactionsByMonth = useCallback((year, month) => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    return transactions.filter(t => t.date && t.date.startsWith(monthStr));
  }, [transactions]);

  // Get transactions for a specific account
  const getTransactionsByAccount = useCallback((accountName) => {
    return transactions.filter(t => {
      if (t.type === 'transfer') {
        return t.fromAccount === accountName || t.toAccount === accountName;
      }
      return t.account === accountName;
    });
  }, [transactions]);

  // Get transactions for a specific category
  const getTransactionsByCategory = useCallback((categoryName) => {
    return transactions.filter(t => {
      if (t.type === 'split' && t.splits) {
        return t.splits.some(s => s.category === categoryName);
      }
      return t.category === categoryName;
    });
  }, [transactions]);

  // Get account by name
  const getAccountByName = useCallback((name) => {
    return accounts.find(a => a.name === name);
  }, [accounts]);

  // Get category by name
  const getCategoryByName = useCallback((name) => {
    return categories.find(c => c.name === name);
  }, [categories]);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const value = useMemo(() => ({
    // Raw data
    transactions,
    accounts,
    categories,
    
    // Loading states
    loading,
    isLoading: loading.transactions || loading.accounts || loading.categories,
    initialLoadComplete,
    
    // Pagination
    hasMoreTransactions,
    loadingMore,
    loadMoreTransactions,
    loadAllTransactions,
    transactionCount: transactions.length,
    
    // Errors
    errors,
    hasError: Boolean(errors.transactions || errors.accounts || errors.categories),
    
    // Derived data - Accounts
    activeAccounts,
    archivedAccounts,
    accountNames,
    groupedAccounts,
    quickSelectGroupedAccounts,
    hiddenAccounts,
    setHiddenAccounts,
    accountBalances,
    
    // Derived data - Categories
    categoryNames,
    expenseCategories,
    incomeCategories,
    
    // Derived data - Transactions
    loanTransactions,
    splitTransactions,
    nonLoanTransactions,
    futureTransactions,
    loanNames,
    
    // Derived data - Payees
    payeeSuggestions,
    payeeToCategoryMap,
    payeeToAccountMap,
    
    // Derived data - Tags
    tagSuggestions,
    userTags,
    addUserTag,
    removeUserTag,
    renameUserTag,
    
    // Helper functions
    getTransactionsByMonth,
    getTransactionsByAccount,
    getTransactionsByCategory,
    getAccountByName,
    getCategoryByName,
  }), [
    transactions, accounts, categories,
    loading, initialLoadComplete, errors,
    hasMoreTransactions, loadingMore, loadMoreTransactions, loadAllTransactions,
    activeAccounts, archivedAccounts, accountNames, groupedAccounts, quickSelectGroupedAccounts, hiddenAccounts, accountBalances,
    categoryNames, expenseCategories, incomeCategories,
    loanTransactions, splitTransactions, nonLoanTransactions, futureTransactions, loanNames,
    payeeSuggestions, payeeToCategoryMap, payeeToAccountMap, 
    tagSuggestions, userTags, addUserTag, removeUserTag, renameUserTag,
    getTransactionsByMonth, getTransactionsByAccount, getTransactionsByCategory,
    getAccountByName, getCategoryByName
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

// Custom hook to use the data context
export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

// Convenience hooks for specific data
export const useTransactions = () => {
  const { transactions, loading, errors } = useData();
  return { transactions, loading: loading.transactions, error: errors.transactions };
};

export const useAccounts = () => {
  const { accounts, activeAccounts, archivedAccounts, accountNames, accountBalances, loading, errors } = useData();
  return { 
    accounts, 
    activeAccounts, 
    archivedAccounts, 
    accountNames, 
    accountBalances,
    loading: loading.accounts, 
    error: errors.accounts 
  };
};

export const useCategories = () => {
  const { categories, categoryNames, expenseCategories, incomeCategories, loading, errors } = useData();
  return { 
    categories, 
    categoryNames, 
    expenseCategories, 
    incomeCategories,
    loading: loading.categories, 
    error: errors.categories 
  };
};

export const useLoans = () => {
  const { loanTransactions, splitTransactions, loanNames, loading } = useData();
  return { 
    loanTransactions, 
    splitTransactions, 
    loanNames,
    loading: loading.transactions 
  };
};

export const usePayees = () => {
  const { payeeSuggestions, payeeToCategoryMap } = useData();
  return { payeeSuggestions, payeeToCategoryMap };
};

export default DataContext;