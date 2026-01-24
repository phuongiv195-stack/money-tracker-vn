import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, setDoc, getDoc, getDocs, startAfter } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUserId } from './AuthContext';

const DataContext = createContext(null);

// Configuration
const LOAD_MORE_BATCH = 300;   // Load more in batches
const MAX_TRANSACTIONS = 2000; // Maximum to keep in memory

export const DataProvider = ({ children }) => {
  const userId = useUserId();
  
  // Core data states
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [userTags, setUserTags] = useState([]); // Tags saved by user - now supports {name, parentTagId}
  
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
  const olderTransactionsRef = useRef([]); // Store older transactions (loaded via pagination)
  const realtimeTransactionsRef = useRef([]); // Store real-time transactions
  
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

  // Transactions listener - Real-time for recent 200
  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      realtimeTransactionsRef.current = [];
      olderTransactionsRef.current = [];
      setLoading(prev => ({ ...prev, transactions: false }));
      return;
    }

    setLoading(prev => ({ ...prev, transactions: true }));
    setErrors(prev => ({ ...prev, transactions: null }));

    // Real-time query for ALL transactions (no limit)
    // This ensures NEW transactions will always trigger the listener
    // Note: If you have >2000 transactions and performance issues, consider pagination
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Update real-time transactions
        const realtimeTrans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        realtimeTransactionsRef.current = realtimeTrans;
        
        // Merge with older transactions (removing duplicates)
        const realtimeIds = new Set(realtimeTrans.map(t => t.id));
        const olderFiltered = olderTransactionsRef.current.filter(t => !realtimeIds.has(t.id));
        
        // Combine and sort by date (desc), then by createdAt (desc) for same date
        const allTrans = [...realtimeTrans, ...olderFiltered]
          .sort((a, b) => {
            const dateCompare = (b.date || '').localeCompare(a.date || '');
            if (dateCompare !== 0) return dateCompare;
            // Same date - sort by createdAt (newer first)
            const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
            const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
            return bTime - aTime;
          });
        
        setTransactions(allTrans);
        // Since we're loading all transactions, no need for pagination
        setHasMoreTransactions(false);
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

  // Load more transactions function (one-time fetch for older data)
  const loadMoreTransactions = useCallback(async () => {
    if (!userId || !hasMoreTransactions || loadingMore) return false;
    
    // Don't load more if we've hit the max
    const currentTotal = realtimeTransactionsRef.current.length + olderTransactionsRef.current.length;
    if (currentTotal >= MAX_TRANSACTIONS) {
      setHasMoreTransactions(false);
      return false;
    }

    setLoadingMore(true);
    
    try {
      // Find the oldest transaction we have
      const allCurrent = [...realtimeTransactionsRef.current, ...olderTransactionsRef.current];
      const oldestDate = allCurrent.length > 0 
        ? allCurrent.sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0]?.date 
        : null;
      
      // Query for older transactions
      let q;
      if (oldestDate) {
        q = query(
          collection(db, 'transactions'),
          where('userId', '==', userId),
          where('date', '<', oldestDate),
          orderBy('date', 'desc'),
          limit(LOAD_MORE_BATCH)
        );
      } else {
        // Fallback - shouldn't happen but just in case
        q = query(
          collection(db, 'transactions'),
          where('userId', '==', userId),
          orderBy('date', 'desc'),
          limit(LOAD_MORE_BATCH)
        );
      }

      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        const newOlder = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Add to older transactions (avoid duplicates)
        const existingIds = new Set(olderTransactionsRef.current.map(t => t.id));
        const uniqueNew = newOlder.filter(t => !existingIds.has(t.id));
        olderTransactionsRef.current = [...olderTransactionsRef.current, ...uniqueNew];
        
        // Merge with realtime and update state
        const realtimeIds = new Set(realtimeTransactionsRef.current.map(t => t.id));
        const olderFiltered = olderTransactionsRef.current.filter(t => !realtimeIds.has(t.id));
        
        const allTrans = [...realtimeTransactionsRef.current, ...olderFiltered]
          .sort((a, b) => {
            const dateCompare = (b.date || '').localeCompare(a.date || '');
            if (dateCompare !== 0) return dateCompare;
            const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
            const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
            return bTime - aTime;
          });
        
        setTransactions(allTrans);
      }
      
      const hasMore = snapshot.docs.length >= LOAD_MORE_BATCH;
      setHasMoreTransactions(hasMore);
      setLoadingMore(false);
      return hasMore;
    } catch (error) {
      console.error('Load more error:', error);
      setLoadingMore(false);
      return false;
    }
  }, [userId, hasMoreTransactions, loadingMore]);

  // Load all transactions (for reports)
  const loadAllTransactions = useCallback(async () => {
    if (!userId) return;
    
    let canLoadMore = hasMoreTransactions;
    let iterations = 0;
    const maxIterations = 10; // Safety limit
    
    while (canLoadMore && iterations < maxIterations) {
      canLoadMore = await loadMoreTransactions();
      iterations++;
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
  const [archivedTags, setArchivedTags] = useState([]);
  const [archivedTagObjects, setArchivedTagObjects] = useState([]);
  
  useEffect(() => {
    if (!userId) {
      setUserTags([]);
      setArchivedTags([]);
      setArchivedTagObjects([]);
      return;
    }

    const docRef = doc(db, 'userTags', userId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setUserTags(docSnap.data().tags || []);
          setArchivedTags(docSnap.data().archivedTags || []);
          setArchivedTagObjects(docSnap.data().archivedTagObjects || []);
        } else {
          setUserTags([]);
          setArchivedTags([]);
          setArchivedTagObjects([]);
        }
      },
      (error) => {
        console.error('UserTags listener error:', error);
        setUserTags([]);
        setArchivedTags([]);
        setArchivedTagObjects([]);
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
    return categories.map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
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
  // Excludes archived tags from suggestions
  // Now supports both old string format and new object format {id, name, parentTagId}
  const tagSuggestions = useMemo(() => {
    const tags = new Set();
    
    // Add user-saved tags (excluding archived)
    // Support both old string format and new object format
    userTags.forEach(tag => {
      const tagName = typeof tag === 'string' ? tag : tag.name;
      if (tagName) tags.add(tagName);
    });
    
    // Add tags from transactions (supports both old 'tag' and new 'tags' fields)
    // But exclude archived tags
    transactions.forEach(t => {
      if (t.tag && !archivedTags.includes(t.tag)) tags.add(t.tag);
      if (t.tags && Array.isArray(t.tags)) {
        t.tags.forEach(tag => {
          if (!archivedTags.includes(tag)) tags.add(tag);
        });
      }
    });
    
    return Array.from(tags).sort();
  }, [transactions, userTags, archivedTags]);

  // Get parent tags (tags without parentTagId)
  const parentTags = useMemo(() => {
    return userTags
      .map(tag => typeof tag === 'string' ? { id: tag, name: tag } : tag)
      .filter(tag => !tag.parentTagId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [userTags]);

  // Get archived parent tags (for hierarchical display in archived section)
  const archivedParentTags = useMemo(() => {
    return archivedTagObjects
      .filter(tag => !tag.parentTagId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [archivedTagObjects]);

  // Get sub-tags for a parent tag
  const getSubTags = useCallback((parentTagId) => {
    return userTags
      .map(tag => typeof tag === 'string' ? null : tag)
      .filter(tag => tag && tag.parentTagId === parentTagId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [userTags]);

  // Get archived sub-tags for a parent tag
  const getArchivedSubTags = useCallback((parentTagId) => {
    return archivedTagObjects
      .filter(tag => tag.parentTagId === parentTagId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [archivedTagObjects]);

  // Function to add a new tag to userTags
  // Can be a parent tag (no parentTagId) or sub-tag (with parentTagId)
  const addUserTag = useCallback(async (newTag, parentTagId = null) => {
    if (!userId || !newTag) return;
    const trimmedTag = newTag.trim();
    if (!trimmedTag) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      
      // Normalize current tags to object format
      const normalizedTags = currentTags.map(tag => 
        typeof tag === 'string' ? { id: tag, name: tag } : tag
      );
      
      // Check if tag already exists (by name and parent)
      const exists = normalizedTags.some(t => 
        t.name === trimmedTag && (t.parentTagId || null) === parentTagId
      );
      
      if (exists) {
        return; // Already exists
      }
      
      // Create new tag object
      const newTagObj = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: trimmedTag,
        ...(parentTagId && { parentTagId })
      };
      
      const updatedTags = [...normalizedTags, newTagObj];
      await setDoc(docRef, { tags: updatedTags }, { merge: true });
      console.log('Tag saved successfully:', trimmedTag, parentTagId ? `(parent: ${parentTagId})` : '');
    } catch (error) {
      console.error('Error adding tag:', error);
    }
  }, [userId]);

  // Function to remove a tag from userTags (works with both name and id)
  // If removing a parent tag, also removes all its sub-tags
  const removeUserTag = useCallback(async (tagToRemove) => {
    if (!userId || !tagToRemove) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      
      // Normalize to object format
      const normalizedTags = currentTags.map(tag => 
        typeof tag === 'string' ? { id: tag, name: tag } : tag
      );
      
      // Find the tag to remove (by name or id)
      const tagObj = normalizedTags.find(t => 
        t.name === tagToRemove || t.id === tagToRemove
      );
      
      if (!tagObj) return;
      
      // Remove the tag and all its sub-tags if it's a parent
      const updatedTags = normalizedTags.filter(t => 
        t.id !== tagObj.id && t.parentTagId !== tagObj.id
      );
      
      await setDoc(docRef, { tags: updatedTags }, { merge: true });
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
      
      // Normalize to object format
      const normalizedTags = currentTags.map(tag => 
        typeof tag === 'string' ? { id: tag, name: tag } : tag
      );
      
      // Update the tag name
      const updatedTags = normalizedTags.map(t => 
        (t.name === oldTag || t.id === oldTag) ? { ...t, name: trimmedNew } : t
      );
      
      await setDoc(docRef, { tags: updatedTags }, { merge: true });
    } catch (error) {
      console.error('Error renaming tag:', error);
    }
  }, [userId]);

  // Function to archive a tag (move from tags to archivedTags)
  // If archiving a parent tag, also archives all its sub-tags
  const archiveUserTag = useCallback(async (tagToArchive) => {
    if (!userId || !tagToArchive) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      const currentArchived = docSnap.exists() ? (docSnap.data().archivedTags || []) : [];
      const currentArchivedObjects = docSnap.exists() ? (docSnap.data().archivedTagObjects || []) : [];
      
      // Normalize to object format
      const normalizedTags = currentTags.map(tag => 
        typeof tag === 'string' ? { id: tag, name: tag } : tag
      );
      
      // Find the tag to archive
      const tagObj = normalizedTags.find(t => 
        t.name === tagToArchive || t.id === tagToArchive
      );
      
      if (!tagObj) return;
      
      // Collect tags to archive (parent + all sub-tags) - preserve full objects
      const tagsToArchive = [tagObj];
      const namesToArchive = [tagObj.name];
      
      normalizedTags.forEach(t => {
        if (t.parentTagId === tagObj.id) {
          tagsToArchive.push(t);
          namesToArchive.push(t.name);
        }
      });
      
      // Remove from active tags
      const updatedTags = normalizedTags.filter(t => 
        t.id !== tagObj.id && t.parentTagId !== tagObj.id
      );
      
      // Add to archived tags (strings for backward compatibility)
      const updatedArchived = [...new Set([...currentArchived, ...namesToArchive])].sort();
      
      // Add to archived tag objects (preserve structure)
      const updatedArchivedObjects = [...currentArchivedObjects, ...tagsToArchive];
      
      await setDoc(docRef, { 
        tags: updatedTags, 
        archivedTags: updatedArchived,
        archivedTagObjects: updatedArchivedObjects
      }, { merge: true });
    } catch (error) {
      console.error('Error archiving tag:', error);
    }
  }, [userId]);

  // Function to restore an archived tag (move from archivedTags to tags)
  // Restores full tag structure including parentTagId
  // If restoring parent tag, also restores all its sub-tags
  const restoreUserTag = useCallback(async (tagToRestore) => {
    if (!userId || !tagToRestore) return;
    
    try {
      const docRef = doc(db, 'userTags', userId);
      const docSnap = await getDoc(docRef);
      const currentTags = docSnap.exists() ? (docSnap.data().tags || []) : [];
      const currentArchived = docSnap.exists() ? (docSnap.data().archivedTags || []) : [];
      const currentArchivedObjects = docSnap.exists() ? (docSnap.data().archivedTagObjects || []) : [];
      
      // Normalize to object format
      const normalizedTags = currentTags.map(tag => 
        typeof tag === 'string' ? { id: tag, name: tag } : tag
      );
      
      // Find the archived tag object to restore
      const archivedTagObj = currentArchivedObjects.find(t => t.name === tagToRestore);
      
      if (!archivedTagObj) {
        // Fallback for old archives without objects
        const updatedArchived = currentArchived.filter(t => t !== tagToRestore);
        const restoredTag = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: tagToRestore
        };
        normalizedTags.push(restoredTag);
        
        await setDoc(docRef, { 
          tags: normalizedTags, 
          archivedTags: updatedArchived
        }, { merge: true });
        return;
      }
      
      // Collect tags to restore (the tag + all its sub-tags if it's a parent)
      const tagsToRestore = [archivedTagObj];
      const namesToRestore = [archivedTagObj.name];
      
      // If restoring a parent tag, also restore all its sub-tags
      currentArchivedObjects.forEach(t => {
        if (t.parentTagId === archivedTagObj.id) {
          tagsToRestore.push(t);
          namesToRestore.push(t.name);
        }
      });
      
      // Remove from archived tags (string array)
      const updatedArchived = currentArchived.filter(t => !namesToRestore.includes(t));
      
      // Remove from archived tag objects
      const tagIdsToRemove = new Set(tagsToRestore.map(t => t.id));
      const updatedArchivedObjects = currentArchivedObjects.filter(t => !tagIdsToRemove.has(t.id));
      
      // Add to active tags (only if not already exists)
      tagsToRestore.forEach(tag => {
        const exists = normalizedTags.some(t => t.id === tag.id);
        if (!exists) {
          normalizedTags.push(tag);
        }
      });
      
      await setDoc(docRef, { 
        tags: normalizedTags, 
        archivedTags: updatedArchived,
        archivedTagObjects: updatedArchivedObjects
      }, { merge: true });
    } catch (error) {
      console.error('Error restoring tag:', error);
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
    archivedTags,
    archivedTagObjects,
    parentTags,
    archivedParentTags,
    getSubTags,
    getArchivedSubTags,
    addUserTag,
    removeUserTag,
    renameUserTag,
    archiveUserTag,
    restoreUserTag,
    
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
    tagSuggestions, userTags, archivedTags, archivedTagObjects, parentTags, archivedParentTags, getSubTags, getArchivedSubTags, addUserTag, removeUserTag, renameUserTag, archiveUserTag, restoreUserTag,
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