import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUserId } from './AuthContext';

const DataContext = createContext(null);

// Configuration - reduced for faster loading
const TRANSACTIONS_LIMIT = 200;

export const DataProvider = ({ children }) => {
  const userId = useUserId();
  
  // Core data states
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Loading states
  const [loading, setLoading] = useState({
    transactions: true,
    accounts: true,
    categories: true
  });
  
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

  // Transactions listener - simplified query for speed
  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setLoading(prev => ({ ...prev, transactions: false }));
      return;
    }

    setLoading(prev => ({ ...prev, transactions: true }));
    setErrors(prev => ({ ...prev, transactions: null }));

    // Simple query without orderBy (faster, no index needed)
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      limit(TRANSACTIONS_LIMIT)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const trans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort by date (desc), then by createdAt (desc) for same-day transactions
        trans.sort((a, b) => {
          const dateCompare = (b.date || '').localeCompare(a.date || '');
          if (dateCompare !== 0) return dateCompare;
          // Same date - sort by createdAt (newest first)
          const aTime = a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || 0;
          return bTime - aTime;
        });
        setTransactions(trans);
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
    const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'INVESTMENTS': 2 };
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
    return transactions.filter(t => t.type !== 'loan');
  }, [transactions]);

  // Unique loan names
  const loanNames = useMemo(() => {
    const names = new Set();
    loanTransactions.forEach(t => {
      if (t.loan) names.add(t.loan);
    });
    return Array.from(names);
  }, [loanTransactions]);

  // Payee suggestions with category mapping
  const { payeeSuggestions, payeeToCategoryMap } = useMemo(() => {
    const payeeMap = {};
    const categoryMap = {};
    
    // Sort by date desc to get most recent category for each payee
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
      }
    });
    
    return {
      payeeSuggestions: Object.keys(payeeMap),
      payeeToCategoryMap: categoryMap
    };
  }, [transactions]);

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
        // Regular transactions (expense, income, loan, unrealized_gain)
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
    
    // Errors
    errors,
    hasError: Boolean(errors.transactions || errors.accounts || errors.categories),
    
    // Derived data - Accounts
    activeAccounts,
    archivedAccounts,
    accountNames,
    accountBalances,
    
    // Derived data - Categories
    categoryNames,
    expenseCategories,
    incomeCategories,
    
    // Derived data - Transactions
    loanTransactions,
    splitTransactions,
    nonLoanTransactions,
    loanNames,
    
    // Derived data - Payees
    payeeSuggestions,
    payeeToCategoryMap,
    
    // Helper functions
    getTransactionsByMonth,
    getTransactionsByAccount,
    getTransactionsByCategory,
    getAccountByName,
    getCategoryByName,
  }), [
    transactions, accounts, categories,
    loading, initialLoadComplete, errors,
    activeAccounts, archivedAccounts, accountNames, accountBalances,
    categoryNames, expenseCategories, incomeCategories,
    loanTransactions, splitTransactions, nonLoanTransactions, loanNames,
    payeeSuggestions, payeeToCategoryMap,
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
