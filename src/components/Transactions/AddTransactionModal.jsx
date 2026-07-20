import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddTransactionModal = ({ isOpen, onClose, onSave, editTransaction = null, prefilledAccount = null, prefilledCategory = null, forceFuture = false }) => {
  const toast = useToast();
  const userId = useUserId();
  const { 
    accountNames, 
    groupedAccounts,
    quickSelectGroupedAccounts,
    categories, 
    loanNames,
    loanTransactions,
    tagSuggestions,
    parentTags,
    getSubTags,
    addUserTag,
    payeeSuggestions: cachedPayeeSuggestions, 
    payeeToCategoryMap: cachedPayeeToCategoryMap,
    payeeToAccountMap: cachedPayeeToAccountMap
  } = useData();
  
  // Duplicate mode - when true, Save creates new transaction instead of updating
  const [isDuplicating, setIsDuplicating] = useState(false);
  
  // Create loan type map (loan name -> 'lend' or 'borrow')
  const initialLoanTypeMap = useMemo(() => {
    const map = {};
    loanTransactions.forEach(t => {
      if (t.loan && !map[t.loan]) {
        if (t.loanType) {
          map[t.loan] = t.loanType;
        } else if (t.loan.toLowerCase().startsWith('lend to')) {
          map[t.loan] = 'lend';
        } else if (t.loan.toLowerCase().startsWith('borrow from')) {
          map[t.loan] = 'borrow';
        }
      }
    });
    return map;
  }, [loanTransactions]);
  
  const [loanTypeMap, setLoanTypeMap] = useState({});
  
  // Sync initialLoanTypeMap to loanTypeMap when it changes
  useEffect(() => {
    setLoanTypeMap(prev => ({...initialLoanTypeMap, ...prev}));
  }, [initialLoanTypeMap]);
  
  // Create selectable tags list
  // - If a parent has sub-tags, only show the sub-tags (not the parent)
  // - Display format: "ParentName > SubName" for sub-tags, "TagName" for parent without subs
  const selectableTags = useMemo(() => {
    const tags = [];
    
    parentTags.forEach(parent => {
      const subs = getSubTags(parent.id);
      
      if (subs.length > 0) {
        // Parent has sub-tags - only show sub-tags
        subs.forEach(sub => {
          tags.push({
            value: sub.name,  // The actual tag name saved to DB
            display: `${parent.name} > ${sub.name}`,  // Display format
            parentName: parent.name
          });
        });
      } else {
        // Parent has no sub-tags - show the parent itself
        tags.push({
          value: parent.name,
          display: parent.name,
          parentName: null
        });
      }
    });
    
    return tags.sort((a, b) => a.display.localeCompare(b.display));
  }, [parentTags, getSubTags]);

  // Create lookup map for tag display names
  const tagDisplayMap = useMemo(() => {
    const map = {};
    selectableTags.forEach(tag => {
      map[tag.value] = tag.display;
    });
    return map;
  }, [selectableTags]);

  const [activeTab, setActiveTab] = useState('expense');
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [isSplitMode, setIsSplitMode] = useState(false);
  
  // Picker states
  const [showPayeeList, setShowPayeeList] = useState(false);
  const [showCategoryList, setShowCategoryList] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false); // Full screen category picker
  const [showLoanPicker, setShowLoanPicker] = useState(false); // Full screen loan picker for non-split
  const [showTagList, setShowTagList] = useState(false);
  const [activeSplitIndex, setActiveSplitIndex] = useState(null);
  const [activeSplitCategoryIndex, setActiveSplitCategoryIndex] = useState(null); // Full screen category for split
  const [activeSplitLoanIndex, setActiveSplitLoanIndex] = useState(null); // Full screen loan picker for split
  const [splitCategorySearch, setSplitCategorySearch] = useState(''); // Search in split category picker
  const [newLoanName, setNewLoanName] = useState(''); // For creating new loan in split
  const [newLoanType, setNewLoanType] = useState(null); // lend or borrow, null = not selected

  // Check if any picker is open
  const isAnyPickerOpen = showCategoryPicker || showLoanPicker || activeSplitCategoryIndex !== null || activeSplitLoanIndex !== null;

  // Smart back handler - close picker first, then modal
  const handleBackPress = useCallback(() => {
    if (showCategoryPicker) {
      setShowCategoryPicker(false);
    } else if (showLoanPicker) {
      setShowLoanPicker(false);
      setNewLoanName('');
      setNewLoanType(null);
    } else if (activeSplitCategoryIndex !== null) {
      setActiveSplitCategoryIndex(null);
      setSplitCategorySearch('');
    } else if (activeSplitLoanIndex !== null) {
      setActiveSplitLoanIndex(null);
      setNewLoanName('');
      setNewLoanType(null);
    } else {
      onClose();
    }
  }, [showCategoryPicker, showLoanPicker, activeSplitCategoryIndex, activeSplitLoanIndex, onClose]);

  // Register back handler for hardware back button
  useBackHandler(isOpen, handleBackPress);

  // Close on Escape key (same as clicking the ✕)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Helper to get today's date in local timezone (YYYY-MM-DD format)
  const getLocalToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if selected date is in the future
  const isFutureDate = (dateStr) => {
    if (!dateStr) return false;
    return dateStr > getLocalToday();
  };
  
  const [formData, setFormData] = useState({
    amount: '',
    payee: '',
    category: '',
    account: '',
    fromAccount: '',
    toAccount: '',
    date: getLocalToday(),
    memo: '',
    tag: '',  // For input field
    tags: [], // Array of selected tags
    spendingType: 'need',
    isLoan: false,  // For future transactions - loan instead of category
    loan: ''        // Selected loan name
  });

  const [splits, setSplits] = useState([
    { amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '', spendingType: '' }
  ]);

  // Use cached data from DataContext
  const accounts = accountNames;
  const loans = loanNames;
  const payeeSuggestions = cachedPayeeSuggestions;
  const payeeToCategoryMap = cachedPayeeToCategoryMap;
  const payeeToAccountMap = cachedPayeeToAccountMap;
  const categorySuggestions = categories;

  // Spending-mode helpers: a category may allow both, need-only, or want-only
  const getCategoryMode = (name) => categorySuggestions.find(c => c.name === name)?.spendingMode || 'both';
  const getCategoryDefaultSpending = (name) => categorySuggestions.find(c => c.name === name)?.spendingType || 'need';
  // Effective spending type given the category's lock + a current choice
  const resolveSpendingType = (name, current) => {
    const mode = getCategoryMode(name);
    if (mode === 'need') return 'need';
    if (mode === 'want') return 'want';
    return current || getCategoryDefaultSpending(name);
  };
  // Value to use when a category is freshly selected (adopt its default / lock)
  const spendingForNewCategory = (name) => {
    const mode = getCategoryMode(name);
    if (mode === 'need') return 'need';
    if (mode === 'want') return 'want';
    return getCategoryDefaultSpending(name);
  };

  // Default account logic is now handled in the main useEffect below

  // Reset picker states when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset loading state
      setLoading(false);
      
      // Reset all picker states
      setShowCategoryPicker(false);
      setShowLoanPicker(false);
      setActiveSplitCategoryIndex(null);
      setActiveSplitLoanIndex(null);
      setSplitCategorySearch('');
      setNewLoanName('');
      setNewLoanType(null);
      setShowPayeeList(false);
      setShowCategoryList(false);
      setShowTagList(false);
      setActiveSplitIndex(null);
      setIsDuplicating(false); // Reset duplicate mode
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (editTransaction) {
        if (editTransaction.type === 'split') {
          setIsSplitMode(true);
          setActiveTab(editTransaction.splitType || 'expense');
          // Ensure all splits have required fields
          const loadedSplits = (editTransaction.splits || []).map(s => ({
            amount: s.amount || '',
            category: s.category || '',
            loan: s.loan || '',
            memo: s.memo || '',
            isLoan: s.isLoan || false,
            isTransfer: s.isTransfer || false,
            transferAccount: s.transferAccount || '',
            spendingType: s.spendingType || ''
          }));
          setSplits(loadedSplits.length > 0 ? loadedSplits : [{ amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '', spendingType: '' }]);
          setFormData({
            amount: Math.abs(editTransaction.totalAmount).toString(),
            payee: editTransaction.payee || '',
            category: '',
            account: editTransaction.account || accounts[0] || '',
            fromAccount: '',
            toAccount: '',
            date: editTransaction.date || getLocalToday(),
            memo: '',
            tag: '',
            tags: editTransaction.tags || (editTransaction.tag ? [editTransaction.tag] : []),
            spendingType: 'need'
          });
          setDisplayAmount(Math.abs(editTransaction.totalAmount).toLocaleString('en-US'));
        } else {
          setIsSplitMode(false);
          setActiveTab(editTransaction.type);
          setFormData({
            amount: Math.abs(editTransaction.amount).toString(),
            payee: editTransaction.payee || '',
            category: editTransaction.category || '',
            account: editTransaction.account || accounts[0] || '',
            fromAccount: editTransaction.fromAccount || accounts[0] || '',
            toAccount: editTransaction.toAccount || accounts[1] || accounts[0] || '',
            date: editTransaction.date || getLocalToday(),
            memo: editTransaction.memo || '',
            tag: '',
            tags: editTransaction.tags || (editTransaction.tag ? [editTransaction.tag] : []),
            spendingType: editTransaction.spendingType || 'need',
            isLoan: editTransaction.isLoan || false,
            loan: editTransaction.loan || ''
          });
          setDisplayAmount(Math.abs(editTransaction.amount).toLocaleString('en-US'));
        }
      } else {
        setIsSplitMode(false);
        setSplits([{ amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '' }]);
        
        if (prefilledCategory?.type) {
          setActiveTab(prefilledCategory.type);
        } else {
          setActiveTab('expense');
        }
        
        // Set default account - use prefilledAccount or first account from quick select list
        const firstQuickAccount = quickSelectGroupedAccounts[0]?.accounts[0]?.name || accounts[0] || '';
        const defaultAccount = prefilledAccount || firstQuickAccount;
        const otherAccounts = accounts.filter(a => a !== defaultAccount);
        
        setFormData({
          amount: '',
          payee: '',
          category: prefilledCategory?.name || '',
          account: defaultAccount,
          fromAccount: defaultAccount,
          toAccount: otherAccounts[0] || accounts[0] || '',
          date: getLocalToday(),
          memo: '',
          tag: '',
          tags: [],
          spendingType: prefilledCategory?.spendingType || 'need',
          isLoan: false,
          loan: ''
        });
        setDisplayAmount('');
      }
    }
  }, [isOpen, editTransaction, prefilledAccount, prefilledCategory, accounts, quickSelectGroupedAccounts]);

  const formatDateForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleAmountChange = (e) => {
    const rawValue = e.target.value.replace(/,/g, '');
    if (!isNaN(rawValue) && rawValue !== '') {
      const formatted = Number(rawValue).toLocaleString('en-US');
      setDisplayAmount(formatted);
      setFormData({ ...formData, amount: rawValue });
    } else if (rawValue === '') {
      setDisplayAmount('');
      setFormData({ ...formData, amount: '' });
    }
  };

  const handleSplitAmountChange = (index, value) => {
    const rawValue = value.replace(/,/g, '');
    if (!isNaN(rawValue) || rawValue === '') {
      const newSplits = [...splits];
      newSplits[index].amount = rawValue;
      setSplits(newSplits);
    }
  };

  const toggleSplitType = (index, type) => {
    // type: 'category' | 'loan' | 'transfer'
    const newSplits = [...splits];
    newSplits[index].isLoan = type === 'loan';
    newSplits[index].isTransfer = type === 'transfer';
    newSplits[index].category = '';
    newSplits[index].loan = '';
    newSplits[index].transferAccount = '';
    setSplits(newSplits);
  };

  const handleSplitTransferAccountChange = (index, account) => {
    const newSplits = [...splits];
    newSplits[index].transferAccount = account;
    setSplits(newSplits);
  };

  const handleSplitCategoryChange = (index, category) => {
    const newSplits = [...splits];
    newSplits[index].category = category;
    const mode = getCategoryMode(category);
    if (mode === 'need' || mode === 'want') {
      // Locked category — force its only allowed value
      newSplits[index].spendingType = mode;
    } else if (!newSplits[index].spendingType) {
      // Set default spendingType from category if not already set
      newSplits[index].spendingType = getCategoryDefaultSpending(category);
    }
    setSplits(newSplits);
    setActiveSplitIndex(null);
  };

  const handleSplitLoanChange = (index, loan, newLoanType = null) => {
    const newSplits = [...splits];
    newSplits[index].loan = loan;
    // If creating new loan, store the loan type
    if (newLoanType) {
      newSplits[index].newLoanType = newLoanType;
    }
    setSplits(newSplits);
  };

  const handleSplitMemoChange = (index, memo) => {
    const newSplits = [...splits];
    newSplits[index].memo = memo;
    setSplits(newSplits);
  };

  const handleSplitSpendingTypeChange = (index, spendingType) => {
    const newSplits = [...splits];
    newSplits[index].spendingType = spendingType;
    setSplits(newSplits);
  };

  const addSplitLine = () => {
    setSplits([...splits, { amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '', spendingType: '' }]);
  };

  const removeSplitLine = (index) => {
    if (splits.length > 1) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  // Handle category selection - also sets default spendingType from category
  const handleCategorySelect = (categoryName) => {
    setFormData({
      ...formData,
      category: categoryName,
      spendingType: spendingForNewCategory(categoryName)
    });
    setShowCategoryList(false);
  };

  const enableSplitMode = () => {
    setIsSplitMode(true);
    setSplits([
      { amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '' },
      { amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '' }
    ]);
  };

  const disableSplitMode = () => {
    setIsSplitMode(false);
    setSplits([{ amount: '', category: '', loan: '', memo: '', isLoan: false, isTransfer: false, transferAccount: '' }]);
  };

  const getUsedAmount = () => {
    return splits.slice(0, -1).reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  };

  const getRemainingAmount = () => {
    const total = Number(formData.amount) || 0;
    return total - getUsedAmount();
  };

  const handleSubmit = async () => {
    if (!formData.amount) {
      toast.error("Please enter amount!");
      return;
    }

    const isFuture = forceFuture || isFutureDate(formData.date);

    // Validate transfer accounts
    if (activeTab === 'transfer') {
      // Transfer không cho phép future
      if (isFuture) {
        toast.error("Transfer cannot be scheduled as future transaction!");
        return;
      }
      if (!formData.fromAccount) {
        toast.error("Please select From account!");
        return;
      }
      if (!formData.toAccount) {
        toast.error("Please select To account!");
        return;
      }
      if (formData.fromAccount === formData.toAccount) {
        toast.error("From and To accounts must be different!");
        return;
      }
    } else {
      // Validate account for non-transfer transactions (skip for future)
      if (!isFuture && !formData.account) {
        toast.error("Please select account!");
        return;
      }
    }

    if (isSplitMode) {
      const newSplits = [...splits];
      newSplits[newSplits.length - 1].amount = getRemainingAmount().toString();
      
      for (let i = 0; i < newSplits.length; i++) {
        const s = newSplits[i];
        if (s.amount === '' || Number(s.amount) < 0) {
          toast.error(`Split #${i + 1}: Invalid amount`);
          return;
        }
        if (s.isLoan && !s.loan) {
          toast.error(`Split #${i + 1}: Please select loan`);
          return;
        }
        if (s.isTransfer && !s.transferAccount) {
          toast.error(`Split #${i + 1}: Please select transfer account`);
          return;
        }
        if (s.isTransfer && s.transferAccount === formData.account) {
          toast.error(`Split #${i + 1}: Transfer account must be different from main account`);
          return;
        }
        if (!s.isLoan && !s.isTransfer && !s.category) {
          toast.error(`Split #${i + 1}: Please select category`);
          return;
        }
        // Check if category exists in system
        if (!s.isLoan && !s.isTransfer && s.category) {
          const categoryExists = categorySuggestions.some(c => c.name === s.category);
          if (!categoryExists) {
            toast.error(`Split #${i + 1}: Category "${s.category}" doesn't exist. Please create it first in Categories tab.`);
            return;
          }
        }
      }
      setSplits(newSplits);
    } else {
      // For future transactions with loan
      if (forceFuture && formData.isLoan) {
        if (!formData.loan) {
          toast.error("Please select loan!");
          return;
        }
      } else {
        // Normal category validation
        if (activeTab !== 'transfer' && !formData.category) {
          toast.error("Please select category!");
          return;
        }
        // Check if category exists in system (for non-transfer, non-split transactions)
        if (activeTab !== 'transfer' && formData.category) {
          const categoryExists = categorySuggestions.some(c => c.name === formData.category);
          if (!categoryExists) {
            toast.error(`Category "${formData.category}" doesn't exist. Please create it first in Categories tab.`);
            return;
          }
        }
      }
    }

    setLoading(true);
    try {
      const isFuture = forceFuture || isFutureDate(formData.date);
      
      if (isSplitMode) {
        const totalAmount = Number(formData.amount);
        const finalSplits = splits.map((s, i) => {
          const splitData = {
            amount: i === splits.length - 1 ? getRemainingAmount() : Number(s.amount),
            category: s.category || null,
            loan: s.loan || null,
            isLoan: s.isLoan,
            isTransfer: s.isTransfer || false,
            transferAccount: s.transferAccount || null,
            memo: s.memo || null
          };
          // Add spendingType for expense splits with category (not loan, not transfer)
          if (activeTab === 'expense' && s.category && !s.isLoan && !s.isTransfer) {
            // Respect the category's lock (need/want-only) or use its default
            splitData.spendingType = resolveSpendingType(s.category, s.spendingType);
          }
          // Only include loanType if it's a loan split and we have a type
          if (s.isLoan && s.loan) {
            const determinedLoanType = s.newLoanType || loanTypeMap[s.loan] || null;
            if (determinedLoanType) {
              splitData.loanType = determinedLoanType;
            }
          }
          return splitData;
        });
        
        const transactionData = {
          userId: userId,
          type: 'split',
          splitType: activeTab,
          totalAmount: activeTab === 'expense' ? -Math.abs(totalAmount) : Math.abs(totalAmount),
          account: isFuture ? null : formData.account,
          payee: formData.payee,
          date: formData.date,
          splits: finalSplits,
          tag: formData.tags.length > 0 ? formData.tags[0] : null,  // Keep single tag for backwards compatibility
          tags: formData.tags.length > 0 ? formData.tags : null,
          isFuture: isFuture
        };

        // Always set createdAt for new or duplicated transactions
        if (!editTransaction || isDuplicating) {
          transactionData.createdAt = new Date();
        } else {
          // When updating existing transaction, set updatedAt
          transactionData.updatedAt = serverTimestamp();
        }

        // If duplicating, always create new (addDoc), otherwise update or add based on editTransaction
        if (editTransaction && !isDuplicating) {
          await updateDoc(doc(db, 'transactions', editTransaction.id), transactionData);
        } else {
          await addDoc(collection(db, 'transactions'), transactionData);
        }
      } else {
        let finalAmount = Number(formData.amount);

        const transactionData = {
          userId: userId,
          type: activeTab,
          amount: finalAmount,
          date: formData.date,
          memo: formData.memo,
          tag: formData.tags.length > 0 ? formData.tags[0] : null,  // Keep single tag for backwards compatibility
          tags: formData.tags.length > 0 ? formData.tags : null,
          isFuture: isFuture
        };

        // Always set createdAt for new or duplicated transactions
        if (!editTransaction || isDuplicating) {
          transactionData.createdAt = new Date();
        } else {
          // When updating existing transaction, set updatedAt
          transactionData.updatedAt = serverTimestamp();
        }

        if (activeTab === 'transfer') {
          transactionData.fromAccount = formData.fromAccount;
          transactionData.toAccount = formData.toAccount;
        } else {
          if (activeTab === 'expense') transactionData.amount = -Math.abs(finalAmount);
          else transactionData.amount = Math.abs(finalAmount);

          transactionData.payee = formData.payee;
          transactionData.account = isFuture ? null : formData.account;
          
          // For future transactions with loan
          if (isFuture && formData.isLoan && formData.loan) {
            transactionData.isLoan = true;
            transactionData.loan = formData.loan;
            transactionData.category = null;
            // Determine loan type
            const determinedLoanType = loanTypeMap[formData.loan] || 
              (formData.loan.toLowerCase().startsWith('lend to') ? 'lend' : 
               formData.loan.toLowerCase().startsWith('borrow from') ? 'borrow' : null);
            if (determinedLoanType) {
              transactionData.loanType = determinedLoanType;
            }
          } else {
            transactionData.category = formData.category;
            transactionData.isLoan = false;
          }
          
          // Save spendingType only for expense transactions (not loan)
          if (activeTab === 'expense' && !formData.isLoan) {
            transactionData.spendingType = resolveSpendingType(formData.category, formData.spendingType);
          }
        }

        // If duplicating, always create new (addDoc), otherwise update or add based on editTransaction
        if (editTransaction && !isDuplicating) {
          await updateDoc(doc(db, 'transactions', editTransaction.id), transactionData);
        } else {
          await addDoc(collection(db, 'transactions'), transactionData);
        }
      }

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error("Error: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editTransaction) return;
    
    const confirmed = await toast.confirm({
      title: 'Delete Transaction',
      message: 'Delete this transaction?',
      confirmText: 'Delete',
      type: 'danger'
    });
    
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'transactions', editTransaction.id));
        if (onSave) onSave();
        onClose();
      } catch (error) {
        toast.error("Error: " + error.message);
      }
    }
  };

  if (!isOpen) return null;

  const filteredCategories = categorySuggestions.filter(cat => {
    if (activeTab === 'income') return cat.type === 'income';
    if (activeTab === 'expense') return cat.type === 'expense';
    return true;
  });

  // Split icon SVG
  const SplitIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-10" />
      <path d="M12 12C12 8 8 5 4 3" />
      <path d="M12 12C12 8 16 5 20 3" />
      <polyline points="6 6 4 3 1 5" />
      <polyline points="18 6 20 3 23 5" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 sm:flex sm:items-center sm:justify-center">
      {/* Full screen on mobile, centered card on desktop */}
      <div className="bg-white w-full h-full sm:w-[450px] sm:h-auto sm:max-h-[90vh] sm:rounded-xl flex flex-col">
        
        {/* Header with Duplicate and Save button */}
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-gray-500 text-lg p-2 -ml-2">✕</button>
            {/* Duplicate button - only show when editing and not already duplicating */}
            {editTransaction && !isDuplicating && (
              <button 
                onClick={() => {
                  setIsDuplicating(true);
                  // Update date to today when duplicating
                  setFormData(prev => ({ ...prev, date: getLocalToday() }));
                  toast.success('Duplicating - edit and save as new');
                }}
                className="px-4 py-1.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Copy
              </button>
            )}
          </div>
          <h2 className="font-semibold text-lg">
            {isDuplicating ? 'Duplicate Transaction' : editTransaction ? 'Edit Transaction' : forceFuture ? '📅 Schedule Future' : 'Add Transaction'}
          </h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : 'Save'}
          </button>
        </div>

        {/* Type Tabs */}
        <div className="flex p-2 gap-2 bg-gray-50 shrink-0">
          {['expense', 'income', 'transfer'].map(tab => {
            const isDisabled = forceFuture && tab === 'transfer';
            return (
              <button
                key={tab}
                onClick={() => {
                  if (isDisabled) return;
                  setActiveTab(tab);
                  if (tab === 'transfer') disableSplitMode();
                }}
                disabled={isDisabled}
                className={`flex-1 py-2 rounded-lg capitalize font-medium transition-colors ${
                  isDisabled 
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                    : activeTab === tab 
                      ? (tab === 'expense' ? 'bg-red-100 text-red-700 border border-red-300' 
                        : tab === 'income' ? 'bg-emerald-100 text-emerald-700 border border-emerald-400' 
                        : 'bg-blue-100 text-blue-700 border border-blue-400')
                      : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          
          {/* Amount + Split Button */}
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center py-2 relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={displayAmount}
                onChange={handleAmountChange}
                className={`text-4xl font-bold text-center w-full focus:outline-none bg-transparent ${
                  activeTab === 'expense' ? 'text-red-500' : activeTab === 'income' ? 'text-emerald-600' : 'text-blue-600'
                } ${isDuplicating && displayAmount ? 'pr-10' : ''}`}
                
              />
              {/* Clear amount button - only show when duplicating and has value */}
              {isDuplicating && displayAmount && (
                <button
                  type="button"
                  onClick={() => setDisplayAmount('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="Clear amount"
                >
                  ✕
                </button>
              )}
            </div>
            
            {activeTab !== 'transfer' && (
              <button
                onClick={isSplitMode ? disableSplitMode : enableSplitMode}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                  isSplitMode 
                    ? 'bg-sky-500 text-white'
                    : 'bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100'
                }`}
                title={isSplitMode ? 'Cancel Split' : 'Split Transaction'}
              >
                <SplitIcon />
              </button>
            )}
          </div>

          {/* Payee */}
          {activeTab !== 'transfer' && (
            <div className="relative">
              <label className="text-xs text-gray-500 uppercase font-semibold">Payee</label>
              <input
                type="text"
                placeholder="Who?"
                value={formData.payee}
                onChange={(e) => setFormData({...formData, payee: e.target.value})}
                onFocus={() => setShowPayeeList(true)}
                onBlur={() => setTimeout(() => setShowPayeeList(false), 200)}
                className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none text-base"
              />
              {showPayeeList && payeeSuggestions.filter(p => p.toLowerCase().includes(formData.payee.toLowerCase())).length > 0 && (
                <div className="absolute z-20 w-full bg-white shadow-xl rounded-lg mt-1 border border-gray-200">
                  {payeeSuggestions
                    .filter(p => p.toLowerCase().includes(formData.payee.toLowerCase()))
                    .slice(0, 8)
                    .map((payee, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 hover:bg-gray-100 cursor-pointer text-base border-b border-gray-100 last:border-b-0"
                        onClick={() => {
                          // Auto-fill category and account if payee has been used before
                          const autoCategory = payeeToCategoryMap[payee];
                          const autoAccount = payeeToAccountMap[payee];
                          
                          const newData = { ...formData, payee };
                          
                          // Auto-fill category if empty
                          if (autoCategory && !formData.category) {
                            newData.category = autoCategory;
                          }

                          // Auto-fill account if exists in current accounts list
                          if (autoAccount && accounts.includes(autoAccount)) {
                            newData.account = autoAccount;
                          }

                          // Auto-fill first split's category if in split mode and empty
                          if (autoCategory && isSplitMode && splits.length > 0 && !splits[0].category) {
                            const newSplits = [...splits];
                            newSplits[0] = { ...newSplits[0], category: autoCategory };
                            setSplits(newSplits);
                          }

                          setFormData(newData);
                          setShowPayeeList(false);
                        }}
                      >
                        {payee}
                        {payeeToCategoryMap[payee] && (
                          <span className="text-sm text-gray-400 ml-2">→ {payeeToCategoryMap[payee]}</span>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* SPLIT MODE */}
          {isSplitMode && (
            <div className="space-y-3">
              {splits.map((split, index) => {
                const isLastSplit = index === splits.length - 1;
                const splitAmount = isLastSplit ? getRemainingAmount() : Number(split.amount) || 0;
                
                return (
                  <div 
                    key={index} 
                    className="p-3 rounded-xl bg-sky-50 border border-sky-200"
                  >
                    {/* Split Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-sky-700">
                        SPLIT #{index + 1}
                      </span>
                      {splits.length > 2 && (
                        <button
                          onClick={() => removeSplitLine(index)}
                          className="text-gray-400 hover:text-red-500 text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="mb-2">
                      {isLastSplit ? (
                        <div className="text-2xl font-bold text-center p-3 rounded-lg bg-sky-100 text-sky-700">
                          {splitAmount.toLocaleString()}
                          <span className="text-xs ml-1 opacity-70">(auto)</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Amount"
                          value={split.amount ? Number(split.amount).toLocaleString() : ''}
                          onChange={(e) => handleSplitAmountChange(index, e.target.value)}
                          className="w-full p-3 text-xl font-bold text-center bg-white rounded-lg border border-sky-200 text-base"
                        />
                      )}
                    </div>

                    {/* Category, Loan, or Transfer Toggle */}
                    <div className="flex gap-1 mb-2">
                      <button
                        onClick={() => toggleSplitType(index, 'category')}
                        className={`flex-1 py-2 text-sm rounded-lg font-medium ${
                          !split.isLoan && !split.isTransfer
                            ? 'bg-sky-500 text-white'
                            : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        Category
                      </button>
                      <button
                        onClick={() => toggleSplitType(index, 'loan')}
                        className={`flex-1 py-2 text-sm rounded-lg font-medium ${
                          split.isLoan 
                            ? 'bg-sky-500 text-white'
                            : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        Loan
                      </button>
                      <button
                        onClick={() => toggleSplitType(index, 'transfer')}
                        className={`flex-1 py-2 text-sm rounded-lg font-medium ${
                          split.isTransfer 
                            ? 'bg-sky-500 text-white'
                            : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        Transfer
                      </button>
                    </div>

                    {/* Category, Loan, or Transfer Selector */}
                    {split.isTransfer ? (
                      <div>
                        <select
                          value={split.transferAccount}
                          onChange={(e) => handleSplitTransferAccountChange(index, e.target.value)}
                          className="w-full p-3 bg-white rounded-lg border border-sky-200 text-base"
                        >
                          <option value="">
                            {activeTab === 'income' ? 'Transfer FROM account...' : 'Transfer TO account...'}
                          </option>
                          {quickSelectGroupedAccounts.map(group => (
                            <optgroup key={group.label} label={group.label}>
                              {group.accounts
                                .filter(acc => acc.name !== formData.account)
                                .map(acc => (
                                  <option key={acc.name} value={acc.name}>
                                    {acc.icon} {acc.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                        {split.transferAccount && (
                          <div className="mt-2 text-xs text-sky-600 bg-sky-50 p-2 rounded-lg">
                            💡 {activeTab === 'income' ? `Money from ${split.transferAccount} → ${formData.account}` : `Money from ${formData.account} → ${split.transferAccount}`}
                          </div>
                        )}
                      </div>
                    ) : split.isLoan ? (
                      <div>
                        <div
                          onClick={() => setActiveSplitLoanIndex(index)}
                          className="w-full p-3 bg-white rounded-lg border border-sky-200 text-base cursor-pointer flex items-center justify-between"
                        >
                          <span className={split.loan ? 'text-gray-900' : 'text-gray-400'}>
                            {split.loan || 'Select or create loan...'}
                          </span>
                          <span className="text-gray-400">▼</span>
                        </div>
                        
                        {/* Full Screen Loan Picker */}
                        {activeSplitLoanIndex === index && (
                          <div className="fixed inset-0 z-50 bg-white flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b bg-white">
                              <button onClick={() => { setActiveSplitLoanIndex(null); setNewLoanName(''); setNewLoanType(null); }} className="text-gray-500 text-xl">✕</button>
                              <h3 className="font-semibold text-lg">Select Loan</h3>
                              <div className="w-8"></div>
                            </div>
                            
                            {/* Scrollable Content */}
                            <div 
                              className="flex-1 overflow-y-auto"
                              onScroll={() => document.activeElement?.blur()}
                            >
                              {/* Existing Loans List */}
                              {loans.length > 0 && (
                                <>
                                  <div className="p-3 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0">Existing Loans</div>
                                  {loans.map(loan => (
                                    <div 
                                      key={loan} 
                                      className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-100 active:bg-gray-200"
                                      onClick={() => {
                                        handleSplitLoanChange(index, loan);
                                        setActiveSplitLoanIndex(null);
                                        setNewLoanName('');
                                        setNewLoanType(null);
                                      }}
                                    >
                                      <span className="text-2xl">{loanTypeMap[loan] === 'lend' || loan.toLowerCase().startsWith('lend to') ? '💸' : '💰'}</span>
                                      <span className="flex-1 text-base">{loan}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                              
                              {/* + New Loan Section */}
                              <div className="p-3 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0 mt-2 border-t">+ New Loan</div>
                              <div className="p-4">
                                {/* Loan Type Selection */}
                                <div className="flex gap-2 mb-3">
                                  <button
                                    onClick={() => setNewLoanType('lend')}
                                    className={`flex-1 py-3 rounded-lg font-medium text-base ${
                                      newLoanType === 'lend' 
                                        ? 'bg-emerald-500 text-white' 
                                        : 'bg-white text-gray-600 border border-gray-200'
                                    }`}
                                  >
                                    💸 I Lend
                                  </button>
                                  <button
                                    onClick={() => setNewLoanType('borrow')}
                                    className={`flex-1 py-3 rounded-lg font-medium text-base ${
                                      newLoanType === 'borrow' 
                                        ? 'bg-amber-500 text-white' 
                                        : 'bg-white text-gray-600 border border-gray-200'
                                    }`}
                                  >
                                    💰 I Borrow
                                  </button>
                                </div>
                                
                                {/* Name Input - Only show after selecting type */}
                                {newLoanType && (
                                  <div className="space-y-3">
                                    <input
                                      type="text"
                                      placeholder={newLoanType === 'lend' ? "Who are you lending to?" : "Who are you borrowing from?"}
                                      value={newLoanName}
                                      onChange={(e) => setNewLoanName(e.target.value)}
                                      className="w-full p-3 bg-white rounded-lg border border-gray-200 text-base"
                                      autoFocus
                                    />
                                    {newLoanName.trim() && (
                                      <>
                                        <div className="text-sm text-gray-500 text-center">
                                          Will create: <span className="font-medium text-gray-700">
                                            {newLoanType === 'lend' ? `Lend to ${newLoanName.trim()}` : `Borrow from ${newLoanName.trim()}`}
                                          </span>
                                        </div>
                                        <button
                                          onClick={() => {
                                            if (newLoanName.trim()) {
                                              const fullLoanName = newLoanType === 'lend' 
                                                ? `Lend to ${newLoanName.trim()}` 
                                                : `Borrow from ${newLoanName.trim()}`;
                                              handleSplitLoanChange(index, fullLoanName, newLoanType);
                                              setLoanTypeMap(prev => ({...prev, [fullLoanName]: newLoanType}));
                                              setNewLoanName('');
                                              setNewLoanType(null);
                                              setActiveSplitLoanIndex(null);
                                            }
                                          }}
                                          className="w-full py-3 bg-emerald-500 text-white rounded-lg font-medium text-base"
                                        >
                                          Create Loan
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div
                          onClick={() => setActiveSplitCategoryIndex(index)}
                          className="w-full p-3 bg-white rounded-lg border border-sky-200 text-base cursor-pointer flex items-center justify-between"
                        >
                          <span className={split.category ? 'text-gray-900' : 'text-gray-400'}>
                            {split.category || 'Select category...'}
                          </span>
                          <span className="text-gray-400">▼</span>
                        </div>
                        
                        {/* Full Screen Category Picker for Split */}
                        {activeSplitCategoryIndex === index && (() => {
                          const searchTerm = (splitCategorySearch || '').toLowerCase();
                          const groupedCats = {};
                          filteredCategories
                            .filter(cat => cat.name.toLowerCase().includes(searchTerm))
                            .forEach(cat => {
                              const groupName = cat.group || 'Other';
                              if (!groupedCats[groupName]) groupedCats[groupName] = [];
                              groupedCats[groupName].push(cat);
                            });
                          
                          Object.keys(groupedCats).forEach(groupName => {
                            groupedCats[groupName].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                          });
                          
                          const sortedGroups = Object.keys(groupedCats).sort((a, b) => {
                            const catsA = groupedCats[a];
                            const catsB = groupedCats[b];
                            const orderA = catsA[0]?.groupOrder ?? 999;
                            const orderB = catsB[0]?.groupOrder ?? 999;
                            return orderA - orderB;
                          });
                          
                          return (
                            <div className="fixed inset-0 z-50 bg-white flex flex-col">
                              {/* Header */}
                              <div className="flex items-center justify-between p-4 border-b bg-white">
                                <button onClick={() => { setActiveSplitCategoryIndex(null); setSplitCategorySearch(''); }} className="text-gray-500 text-xl">✕</button>
                                <h3 className="font-semibold text-lg">Select Category</h3>
                                <div className="w-8"></div>
                              </div>
                              
                              {/* Search */}
                              <div className="p-3 border-b">
                                <input
                                  type="text"
                                  placeholder="Search category..."
                                  value={splitCategorySearch}
                                  onChange={(e) => setSplitCategorySearch(e.target.value)}
                                  className="w-full p-3 bg-gray-100 rounded-lg outline-none text-base"
                                  autoFocus
                                />
                              </div>
                              
                              {/* Category List grouped */}
                              <div 
                                className="flex-1 overflow-y-auto"
                                onScroll={() => document.activeElement?.blur()}
                              >
                                {sortedGroups.map(groupName => (
                                  <div key={groupName}>
                                    {/* Group Header */}
                                    <div className="px-4 py-2 bg-gray-100 text-sm font-semibold text-gray-600 sticky top-0">
                                      {groupName}
                                    </div>
                                    {/* Categories in group */}
                                    {groupedCats[groupName].map(cat => (
                                      <div 
                                        key={cat.id} 
                                        className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-100 active:bg-gray-200"
                                        onClick={() => {
                                          handleSplitCategoryChange(index, cat.name);
                                          setActiveSplitCategoryIndex(null);
                                          setSplitCategorySearch('');
                                        }}
                                      >
                                        <span className="text-2xl">{cat.icon}</span>
                                        <span className="flex-1 text-base">{cat.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Want/Need Toggle - Only for Expense split with category selected */}
                    {activeTab === 'expense' && split.category && !split.isLoan && !split.isTransfer && (() => {
                      const mode = getCategoryMode(split.category);
                      // Locked category — show a read-only badge, no toggle
                      if (mode === 'need' || mode === 'want') {
                        return (
                          <div className="mt-2">
                            <div className={`py-2 rounded-lg font-medium text-sm text-center border-2 ${
                              mode === 'need' ? 'bg-blue-100 text-blue-700 border-blue-400' : 'bg-purple-100 text-purple-700 border-purple-400'
                            }`}>
                              {mode === 'need' ? '🎯 Need' : '✨ Want'}
                              <span className="text-xs opacity-60 ml-1">(fixed)</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                      <div className="mt-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSplitSpendingTypeChange(index, 'need')}
                            className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
                              (split.spendingType || 'need') === 'need'
                                ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                                : 'bg-white text-gray-500 border border-gray-200'
                            }`}
                          >
                            🎯 Need
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSplitSpendingTypeChange(index, 'want')}
                            className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
                              split.spendingType === 'want'
                                ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                                : 'bg-white text-gray-500 border border-gray-200'
                            }`}
                          >
                            ✨ Want
                          </button>
                        </div>
                        {/* Show category default hint */}
                        {(() => {
                          const defaultType = getCategoryDefaultSpending(split.category);
                          const currentType = split.spendingType || defaultType;
                          const isOverridden = currentType !== defaultType;
                          return (
                            <div className="text-xs text-gray-400 mt-1 text-center">
                              {isOverridden ? (
                                <><span className={currentType === 'want' ? 'text-purple-600' : 'text-blue-600'}>Overridden</span> • Default: {defaultType === 'need' ? '🎯' : '✨'}</>
                              ) : (
                                <>Default from category</>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      );
                    })()}

                    {/* Memo */}
                    <input
                      type="text"
                      placeholder="Memo (optional)"
                      value={split.memo}
                      onChange={(e) => handleSplitMemoChange(index, e.target.value)}
                      className="w-full p-3 bg-white rounded-lg border border-sky-200 text-base mt-2"
                    />
                  </div>
                );
              })}

              {/* Add Split Button */}
              <button
                onClick={addSplitLine}
                className="w-full py-3 border-2 border-dashed border-sky-300 rounded-xl font-medium text-sky-600 hover:bg-sky-50 text-base"
              >
                + Add Split
              </button>
            </div>
          )}

          {/* Normal Mode - Category/Loan */}
          {!isSplitMode && activeTab !== 'transfer' && (
            <div className="relative">
              {/* Category/Loan Toggle - Only show for Future transactions (forceFuture) */}
              {forceFuture && (
                <div className="flex gap-1 mb-3">
                  <button
                    onClick={() => setFormData({...formData, isLoan: false, loan: ''})}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium ${
                      !formData.isLoan
                        ? 'bg-sky-500 text-white'
                        : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                  >
                    Category
                  </button>
                  <button
                    onClick={() => setFormData({...formData, isLoan: true, category: ''})}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium ${
                      formData.isLoan 
                        ? 'bg-sky-500 text-white'
                        : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                  >
                    Loan
                  </button>
                </div>
              )}

              {/* Category Selector - show when not isLoan OR when not forceFuture */}
              {(!forceFuture || !formData.isLoan) && (
                <>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Category</label>
                  <div
                    onClick={() => setShowCategoryPicker(true)}
                    className="w-full p-3 bg-gray-50 rounded-lg mt-1 cursor-pointer flex items-center justify-between text-base"
                  >
                    <span className={formData.category ? 'text-gray-900' : 'text-gray-400'}>
                      {formData.category || 'Select category...'}
                    </span>
                    <span className="text-gray-400">▼</span>
                  </div>
                  
                  {/* Full Screen Category Picker */}
                  {showCategoryPicker && (() => {
                    // Group categories
                    const searchTerm = formData.category.toLowerCase();
                    const groupedCats = {};
                    filteredCategories
                      .filter(cat => cat.name.toLowerCase().includes(searchTerm))
                      .forEach(cat => {
                        const groupName = cat.group || 'Other';
                        if (!groupedCats[groupName]) groupedCats[groupName] = [];
                        groupedCats[groupName].push(cat);
                      });
                    
                    // Sort categories within each group by order
                    Object.keys(groupedCats).forEach(groupName => {
                      groupedCats[groupName].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                    });
                    
                    // Sort groups by groupOrder
                    const sortedGroups = Object.keys(groupedCats).sort((a, b) => {
                      const catsA = groupedCats[a];
                      const catsB = groupedCats[b];
                      const orderA = catsA[0]?.groupOrder ?? 999;
                      const orderB = catsB[0]?.groupOrder ?? 999;
                      return orderA - orderB;
                    });
                    
                    return (
                      <div className="fixed inset-0 z-50 bg-white flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b bg-white">
                          <button onClick={() => setShowCategoryPicker(false)} className="text-gray-500 text-xl">✕</button>
                          <h3 className="font-semibold text-lg">Select Category</h3>
                          <div className="w-8"></div>
                        </div>
                        
                        {/* Search */}
                        <div className="p-3 border-b">
                          <input
                            type="text"
                            placeholder="Search category..."
                            value={formData.category}
                            onChange={(e) => setFormData({...formData, category: e.target.value})}
                            className="w-full p-3 bg-gray-100 rounded-lg outline-none text-base"
                            autoFocus
                          />
                        </div>
                        
                        {/* Category List grouped */}
                        <div 
                          className="flex-1 overflow-y-auto"
                          onScroll={() => document.activeElement?.blur()}
                        >
                          {sortedGroups.map(groupName => (
                            <div key={groupName}>
                              {/* Group Header */}
                              <div className="px-4 py-2 bg-gray-100 text-sm font-semibold text-gray-600 sticky top-0">
                                {groupName}
                              </div>
                              {/* Categories in group */}
                              {groupedCats[groupName].map(cat => (
                                <div 
                                  key={cat.id} 
                                  className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-100 active:bg-gray-200"
                                  onClick={() => {
                                    handleCategorySelect(cat.name);
                                    setShowCategoryPicker(false);
                                  }}
                                >
                                  <span className="text-2xl">{cat.icon}</span>
                                  <span className="flex-1 text-base">{cat.name}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Loan Selector - show when isLoan AND forceFuture */}
              {forceFuture && formData.isLoan && (
                <>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Loan</label>
                  <div
                    onClick={() => setShowLoanPicker(true)}
                    className="w-full p-3 bg-gray-50 rounded-lg mt-1 cursor-pointer flex items-center justify-between text-base"
                  >
                    <span className={formData.loan ? 'text-gray-900' : 'text-gray-400'}>
                      {formData.loan || 'Select or create loan...'}
                    </span>
                    <span className="text-gray-400">▼</span>
                  </div>
                  
                  {/* Full Screen Loan Picker */}
                  {showLoanPicker && (
                    <div className="fixed inset-0 z-50 bg-white flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between p-4 border-b bg-white">
                        <button onClick={() => { setShowLoanPicker(false); setNewLoanName(''); setNewLoanType(null); }} className="text-gray-500 text-xl">✕</button>
                        <h3 className="font-semibold text-lg">Select Loan</h3>
                        <div className="w-8"></div>
                      </div>
                      
                      {/* Scrollable Content */}
                      <div 
                        className="flex-1 overflow-y-auto"
                        onScroll={() => document.activeElement?.blur()}
                      >
                        {/* Existing Loans List */}
                        {loans.length > 0 && (
                          <>
                            <div className="p-3 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0">Existing Loans</div>
                            {loans.map(loan => (
                              <div 
                                key={loan} 
                                className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-100 active:bg-gray-200"
                                onClick={() => {
                                  setFormData({...formData, loan: loan});
                                  setShowLoanPicker(false);
                                  setNewLoanName('');
                                  setNewLoanType(null);
                                }}
                              >
                                <span className="text-2xl">{loanTypeMap[loan] === 'lend' || loan.toLowerCase().startsWith('lend to') ? '💸' : '💰'}</span>
                                <span className="flex-1 text-base">{loan}</span>
                              </div>
                            ))}
                          </>
                        )}
                        
                        {/* + New Loan Section */}
                        <div className="p-3 text-xs font-bold text-gray-500 uppercase bg-gray-50 sticky top-0 mt-2 border-t">+ New Loan</div>
                        <div className="p-4">
                          {/* Loan Type Selection */}
                          <div className="flex gap-2 mb-3">
                            <button
                              onClick={() => setNewLoanType('lend')}
                              className={`flex-1 py-3 rounded-lg font-medium text-base ${
                                newLoanType === 'lend' 
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-white text-gray-600 border border-gray-200'
                              }`}
                            >
                              💸 I Lend
                            </button>
                            <button
                              onClick={() => setNewLoanType('borrow')}
                              className={`flex-1 py-3 rounded-lg font-medium text-base ${
                                newLoanType === 'borrow' 
                                  ? 'bg-amber-500 text-white' 
                                  : 'bg-white text-gray-600 border border-gray-200'
                              }`}
                            >
                              💰 I Borrow
                            </button>
                          </div>
                          
                          {/* Name Input - Only show after selecting type */}
                          {newLoanType && (
                            <div className="space-y-3">
                              <input
                                type="text"
                                placeholder={newLoanType === 'lend' ? "Who are you lending to?" : "Who are you borrowing from?"}
                                value={newLoanName}
                                onChange={(e) => setNewLoanName(e.target.value)}
                                className="w-full p-3 bg-white rounded-lg border border-gray-200 text-base"
                                autoFocus
                              />
                              {newLoanName.trim() && (
                                <>
                                  <div className="text-sm text-gray-500 text-center">
                                    Will create: <span className="font-medium text-gray-700">
                                      {newLoanType === 'lend' ? `Lend to ${newLoanName.trim()}` : `Borrow from ${newLoanName.trim()}`}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (newLoanName.trim()) {
                                        const fullLoanName = newLoanType === 'lend' 
                                          ? `Lend to ${newLoanName.trim()}` 
                                          : `Borrow from ${newLoanName.trim()}`;
                                        setFormData({...formData, loan: fullLoanName});
                                        setLoanTypeMap(prev => ({...prev, [fullLoanName]: newLoanType}));
                                        setNewLoanName('');
                                        setNewLoanType(null);
                                        setShowLoanPicker(false);
                                      }
                                    }}
                                    className="w-full py-3 bg-emerald-500 text-white rounded-lg font-medium text-base"
                                  >
                                    Create Loan
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Want/Need Toggle - Only for Expense in non-split mode */}
          {!isSplitMode && activeTab === 'expense' && formData.category && (() => {
            const mode = getCategoryMode(formData.category);
            // Locked category — show a read-only badge, no toggle
            if (mode === 'need' || mode === 'want') {
              return (
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Spending Type</label>
                  <div className={`py-2.5 rounded-lg font-medium text-center border-2 ${
                    mode === 'need' ? 'bg-blue-100 text-blue-700 border-blue-400' : 'bg-purple-100 text-purple-700 border-purple-400'
                  }`}>
                    <span className="mr-1">{mode === 'need' ? '🎯' : '✨'}</span>
                    {mode === 'need' ? 'Need' : 'Want'}
                    <span className="text-xs opacity-60 ml-1">(fixed for this category)</span>
                  </div>
                </div>
              );
            }
            return (
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Spending Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, spendingType: 'need'})}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
                    formData.spendingType === 'need'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  <span className="mr-1">🎯</span> Need
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, spendingType: 'want'})}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
                    formData.spendingType === 'want'
                      ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  <span className="mr-1">✨</span> Want
                </button>
              </div>
              {/* Show default from category hint */}
              {(() => {
                const defaultType = getCategoryDefaultSpending(formData.category);
                const isOverridden = formData.spendingType !== defaultType;
                return (
                  <div className="text-xs text-gray-400 mt-1.5 text-center">
                    {isOverridden ? (
                      <><span className={formData.spendingType === 'want' ? 'text-purple-600' : 'text-blue-600'}>Overridden</span> • Category default: {defaultType === 'need' ? '🎯 Need' : '✨ Want'}</>
                    ) : (
                      <>Default from category: <span className={defaultType === 'need' ? 'text-blue-600' : 'text-purple-600'}>{defaultType === 'need' ? '🎯 Need' : '✨ Want'}</span></>
                    )}
                  </div>
                );
              })()}
            </div>
            );
          })()}

          {/* Transfer Fields */}
          {activeTab === 'transfer' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">From</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none text-base"
                  value={formData.fromAccount}
                  onChange={(e) => setFormData({...formData, fromAccount: e.target.value})}
                >
                  {/* When editing: show original account if it's hidden from quick select */}
                  {editTransaction && editTransaction.fromAccount && 
                   !quickSelectGroupedAccounts.some(g => g.accounts.some(a => a.name === editTransaction.fromAccount)) && (
                    <optgroup label="📌 Current">
                      <option value={editTransaction.fromAccount}>
                        {groupedAccounts.flatMap(g => g.accounts).find(a => a.name === editTransaction.fromAccount)?.icon || '💳'} {editTransaction.fromAccount}
                      </option>
                    </optgroup>
                  )}
                  {quickSelectGroupedAccounts.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.accounts.map(acc => (
                        <option key={acc.name} value={acc.name}>
                          {acc.icon} {acc.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">To</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none text-base"
                  value={formData.toAccount}
                  onChange={(e) => setFormData({...formData, toAccount: e.target.value})}
                >
                  {groupedAccounts.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.accounts.map(acc => (
                        <option key={acc.name} value={acc.name}>
                          {acc.icon} {acc.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Account */}
          {activeTab !== 'transfer' && (
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
              {(forceFuture || isFutureDate(formData.date)) ? (
                <div className="w-full p-3 bg-amber-50 rounded-lg mt-1 border border-amber-200">
                  <div className="flex items-center gap-2 text-amber-700">
                    <span>📅</span>
                    <span className="text-base">Future transaction - Select account when activated</span>
                  </div>
                </div>
              ) : (
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none text-base"
                  value={formData.account}
                  onChange={(e) => setFormData({...formData, account: e.target.value})}
                >
                  {accounts.length === 0 ? (
                    <option value="">Loading...</option>
                  ) : (
                    <>
                      {/* When editing: show original account if it's hidden from quick select */}
                      {editTransaction && editTransaction.account && 
                       !quickSelectGroupedAccounts.some(g => g.accounts.some(a => a.name === editTransaction.account)) && (
                        <optgroup label="📌 Current">
                          <option value={editTransaction.account}>
                            {groupedAccounts.flatMap(g => g.accounts).find(a => a.name === editTransaction.account)?.icon || '💳'} {editTransaction.account}
                          </option>
                        </optgroup>
                      )}
                      {quickSelectGroupedAccounts.map(group => (
                        <optgroup key={group.label} label={group.label}>
                          {group.accounts.map(acc => (
                            <option key={acc.name} value={acc.name}>
                              {acc.icon} {acc.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </>
                  )}
                </select>
              )}
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <div className="relative mt-1">
              <div className="w-full p-3 bg-gray-50 rounded-lg flex items-center justify-between text-base pointer-events-none">
                <span className="text-gray-800">{formatDateForDisplay(formData.date)}</span>
                <span className="text-gray-400">📅</span>
              </div>
              <input 
                type="date" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          {/* Memo - Only for normal mode */}
          {!isSplitMode && (
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Memo</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  className="w-full p-3 bg-gray-50 rounded-lg outline-none text-base pr-10"
                  value={formData.memo}
                  onChange={(e) => setFormData({...formData, memo: e.target.value})}
                />
                {/* Clear memo button - only show when memo has value */}
                {formData.memo && (
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, memo: ''})}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="Clear memo"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tags - For all modes (multi-select) */}
          <div className="relative">
            <label className="text-xs text-gray-500 uppercase font-semibold">Tags</label>

            {/* Available tags - above input */}
            {selectableTags.filter(tag => !formData.tags.includes(tag.value)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                {selectableTags
                  .filter(tag => !formData.tags.includes(tag.value))
                  .map(tag => (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        tags: [...formData.tags, tag.value]
                      })}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm hover:bg-emerald-200 transition-colors"
                    >
                      🏷️ {tag.display}
                    </button>
                  ))}
              </div>
            )}
            
            {/* Input box with selected tags inside */}
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-emerald-400 min-h-[44px]">
              {/* Selected tags */}
              {formData.tags.map(tagValue => (
                <span 
                  key={tagValue}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-sm"
                >
                  🏷️ {tagDisplayMap[tagValue] || tagValue}
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData, 
                      tags: formData.tags.filter(t => t !== tagValue)
                    })}
                    className="text-emerald-500 hover:text-emerald-700"
                  >
                    ×
                  </button>
                </span>
              ))}
              
              {/* Text input */}
              <input
                type="text"
                placeholder={formData.tags.length > 0 ? "" : "Type new tag + Enter"}
                className="flex-1 min-w-[100px] bg-transparent outline-none text-sm py-1"
                value={formData.tag}
                onChange={(e) => {
                  setFormData({...formData, tag: e.target.value});
                  setShowTagList(true);
                }}
                onFocus={() => setShowTagList(true)}
                onBlur={() => setTimeout(() => setShowTagList(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && formData.tag.trim()) {
                    e.preventDefault();
                    const newTag = formData.tag.trim();
                    if (!formData.tags.includes(newTag)) {
                      setFormData({
                        ...formData,
                        tags: [...formData.tags, newTag],
                        tag: ''
                      });
                      // Save new tag to userTags collection
                      addUserTag(newTag).then(() => {
                        console.log('Tag added to userTags:', newTag);
                      }).catch(err => {
                        console.error('Failed to save tag:', err);
                        toast.error('Failed to save tag: ' + err.message);
                      });
                    }
                    setShowTagList(false);
                  }
                  // Backspace to remove last tag when input is empty
                  if (e.key === 'Backspace' && !formData.tag && formData.tags.length > 0) {
                    setFormData({
                      ...formData,
                      tags: formData.tags.slice(0, -1)
                    });
                  }
                }}
              />
            </div>
            
            {/* Autocomplete dropdown - only show when typing */}
            {showTagList && formData.tag && tagSuggestions.length > 0 && (
              <div className="absolute z-20 w-full bg-white shadow-xl max-h-36 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                {tagSuggestions
                  .filter(tag => 
                    tag.toLowerCase().includes((formData.tag || '').toLowerCase()) &&
                    !formData.tags.includes(tag)
                  )
                  .map(tag => (
                    <div 
                      key={tag} 
                      className="p-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                      onClick={() => {
                        setFormData({
                          ...formData, 
                          tags: [...formData.tags, tag],
                          tag: ''
                        });
                        setShowTagList(false);
                      }}
                    >
                      <span className="text-emerald-500">🏷️</span>
                      <span>{tag}</span>
                    </div>
                  ))}
              </div>
            )}
            
            {/* Helper text - Always visible */}
            <div className="mt-1 text-xs text-amber-600 flex items-center gap-1">
              <span className="font-bold">💡 Tip:</span>
              <span>Type tag name and press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">Enter</kbd> to save</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar - Only show Delete when editing and NOT duplicating */}
        {editTransaction && !isDuplicating && (
          <div className="p-4 border-t bg-white">
            <button 
              onClick={handleDelete}
              className="w-full py-3 bg-red-50 text-red-600 font-medium hover:bg-red-100 rounded-lg transition-colors"
            >
              🗑️ Delete Transaction
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddTransactionModal;