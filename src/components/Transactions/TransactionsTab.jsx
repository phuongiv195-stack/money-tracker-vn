import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { writeBatch, doc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import AddTransactionModal from './AddTransactionModal';

const TransactionsTab = () => {
  const userId = useUserId();
  const { 
    transactions, 
    accountNames,
    groupedAccounts,
    categoryNames,
    categories,
    expenseCategories,
    incomeCategories,
    tagSuggestions,
    parentTags,
    getSubTags,
    isLoading,
    hasMoreTransactions,
    loadingMore,
    loadMoreTransactions,
    transactionCount
  } = useData();
  
  // Create tag display map for showing "Parent > Sub" format
  const tagDisplayMap = useMemo(() => {
    const map = {};
    
    parentTags.forEach(parent => {
      const subs = getSubTags(parent.id);
      
      if (subs.length > 0) {
        // Parent has sub-tags - map each sub to "Parent > Sub"
        subs.forEach(sub => {
          map[sub.name] = `${parent.name} > ${sub.name}`;
        });
      } else {
        // Parent has no sub-tags - map to itself
        map[parent.name] = parent.name;
      }
    });
    
    return map;
  }, [parentTags, getSubTags]);

  // Create selectable tags for filter dropdown
  const selectableTagsForFilter = useMemo(() => {
    const tags = [];
    
    parentTags.forEach(parent => {
      const subs = getSubTags(parent.id);
      
      if (subs.length > 0) {
        // Parent has sub-tags - add each sub-tag
        subs.forEach(sub => {
          tags.push({
            value: sub.name,
            display: `${parent.name} > ${sub.name}`
          });
        });
      } else {
        // Parent has no sub-tags - add parent itself
        tags.push({
          value: parent.name,
          display: parent.name
        });
      }
    });
    
    return tags.sort((a, b) => a.display.localeCompare(b.display));
  }, [parentTags, getSubTags]);

  // Group categories by type and group for filter dropdown
  const groupedCategoriesForFilter = useMemo(() => {
    // Group expense categories by group
    const expenseByGroup = {};
    expenseCategories.forEach(cat => {
      const group = cat.group || 'Other';
      if (!expenseByGroup[group]) expenseByGroup[group] = [];
      expenseByGroup[group].push(cat);
    });

    // Group income categories by group
    const incomeByGroup = {};
    incomeCategories.forEach(cat => {
      const group = cat.group || 'Other';
      if (!incomeByGroup[group]) incomeByGroup[group] = [];
      incomeByGroup[group].push(cat);
    });

    // Sort groups and categories within each group
    const sortedExpenseGroups = Object.keys(expenseByGroup).sort();
    const sortedIncomeGroups = Object.keys(incomeByGroup).sort();

    return {
      expense: sortedExpenseGroups.map(group => ({
        group,
        categories: expenseByGroup[group].sort((a, b) => a.name.localeCompare(b.name))
      })),
      income: sortedIncomeGroups.map(group => ({
        group,
        categories: incomeByGroup[group].sort((a, b) => a.name.localeCompare(b.name))
      }))
    };
  }, [expenseCategories, incomeCategories]);
  
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Loan notice modal state
  const [loanNoticeModal, setLoanNoticeModal] = useState({ show: false, loanName: '' });

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterTime, setFilterTime] = useState('month');
  const [filterTag, setFilterTag] = useState('all');
  const [filterSpendingType, setFilterSpendingType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search query (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Long press state for duplicate
  const [longPressTimer, setLongPressTimer] = useState(null);
  
  // Display limit for performance
  const [displayLimit, setDisplayLimit] = useState(100);

  const filteredTransactions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return transactions.filter(t => {
      // Exclude future transactions from normal list
      if (t.isFuture) return false;

      // Time filter
      if (filterTime !== 'all') {
        const tDate = t.date;
        if (filterTime === 'today' && tDate !== today) return false;
        if (filterTime === 'week' && tDate < startOfWeek.toISOString().split('T')[0]) return false;
        if (filterTime === 'month' && tDate < startOfMonth.toISOString().split('T')[0]) return false;
      }

      if (filterType !== 'all') {
        if (filterType === 'split' && t.type !== 'split') return false;
        if (filterType !== 'split' && t.type === 'split' && t.splitType !== filterType) return false;
        if (filterType !== 'split' && t.type !== 'split' && t.type !== filterType) return false;
      }

      if (filterAccount !== 'all') {
        if (t.type === 'transfer') {
          if (t.fromAccount !== filterAccount && t.toAccount !== filterAccount) return false;
        } else {
          if (t.account !== filterAccount) return false;
        }
      }

      if (filterCategory !== 'all') {
        if (t.type === 'split') {
          const hasCategory = t.splits?.some(s => s.category === filterCategory);
          if (!hasCategory) return false;
        } else {
          if (t.category !== filterCategory) return false;
        }
      }

      // Tag filter - supports both old 'tag' and new 'tags' fields
      if (filterTag !== 'all') {
        const transactionTags = t.tags || (t.tag ? [t.tag] : []);
        if (!transactionTags.includes(filterTag)) return false;
      }

      // Spending type filter (want/need)
      if (filterSpendingType !== 'all') {
        if (t.type === 'split') {
          // For split transactions, check if any split has the spending type
          const hasSpendingType = t.splits?.some(s => s.spendingType === filterSpendingType);
          if (!hasSpendingType) return false;
        } else {
          if (t.spendingType !== filterSpendingType) return false;
        }
      }

      if (debouncedSearch.trim()) {
        const lowerQuery = debouncedSearch.toLowerCase();
        const tagsString = (t.tags || (t.tag ? [t.tag] : [])).join(' ');
        const searchFields = [t.payee, t.category, t.memo, t.loan, t.account, tagsString].filter(Boolean).join(' ').toLowerCase();
        
        let splitMatch = false;
        if (t.type === 'split' && t.splits) {
          splitMatch = t.splits.some(s => 
            [s.category, s.loan, s.memo].filter(Boolean).join(' ').toLowerCase().includes(lowerQuery)
          );
        }

        if (!searchFields.includes(lowerQuery) && !splitMatch) return false;
      }

      return true;
    });
  }, [transactions, filterType, filterAccount, filterCategory, filterTime, filterTag, filterSpendingType, debouncedSearch]);

  // Apply display limit for performance
  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, displayLimit);
  }, [filteredTransactions, displayLimit]);

  const totals = useMemo(() => {
    let income = 0, expense = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'split') {
        const amt = Number(t.totalAmount) || 0;
        if (amt > 0) income += amt;
        else expense += Math.abs(amt);
      } else if (t.type === 'income') {
        income += Math.abs(Number(t.amount));
      } else if (t.type === 'expense') {
        expense += Math.abs(Number(t.amount));
      }
    });

    return { income, expense, net: income - expense };
  }, [filteredTransactions]);

  const groupedTransactions = useMemo(() => {
    const groups = {};
    displayedTransactions.forEach(t => {
      const dateKey = t.date || 'Unknown';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });
    
    // Sort transactions within each day by createdAt (newest first)
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => {
        const getTimestamp = (t) => {
          if (t.createdAt?.seconds) return t.createdAt.seconds * 1000;
          if (t.createdAt) return new Date(t.createdAt).getTime();
          return 0;
        };
        return getTimestamp(b) - getTimestamp(a);
      });
    });
    
    return groups;
  }, [displayedTransactions]);

  const hasActiveFilters = filterType !== 'all' || filterAccount !== 'all' || filterCategory !== 'all' || filterTime !== 'all' || filterTag !== 'all' || filterSpendingType !== 'all';

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [filterType, filterAccount, filterCategory, filterTime, filterTag, filterSpendingType, debouncedSearch]);

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '0';
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
  };

  const formatDateLabel = (dateStr) => {
    if (dateStr === 'Unknown') return 'Unknown Date';
    const date = new Date(dateStr + 'T00:00:00');
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${yyyy}/${mm}/${dd} ${day}`;
  };

  // Toggle select mode
  const handleLongPress = useCallback((id) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedItems(new Set([id]));
      if (navigator.vibrate) navigator.vibrate(50);
    }
  }, [isSelectMode]);

  // Touch handlers for long press
  const handleTouchStart = useCallback((id) => {
    const timer = setTimeout(() => handleLongPress(id), 500);
    setLongPressTimer(timer);
  }, [handleLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  // Handle transaction click
  const handleTransactionClick = useCallback((t) => {
    if (isSelectMode) {
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(t.id)) {
          newSet.delete(t.id);
        } else {
          newSet.add(t.id);
        }
        if (newSet.size === 0) setIsSelectMode(false);
        return newSet;
      });
    } else {
      // Show notice for loan transactions
      if (t.type === 'loan') {
        setLoanNoticeModal({ show: true, loanName: t.loan || 'Loan' });
        return;
      }
      // Don't open edit modal for unrealized_gain transactions
      if (t.type === 'unrealized_gain') {
        return; // Frozen - no action
      }
      setEditingTransaction(t);
      setIsModalOpen(true);
    }
  }, [isSelectMode]);

  // Delete selected transactions
  const handleDeleteSelected = async () => {
    try {
      const batch = writeBatch(db);
      selectedItems.forEach(id => {
        batch.delete(doc(db, 'transactions', id));
      });
      await batch.commit();
      setSuccessMessage(`Deleted ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Duplicate selected transactions
  const handleDuplicateSelected = async () => {
    try {
      const toDuplicate = transactions.filter(t => selectedItems.has(t.id));
      
      for (const t of toDuplicate) {
        const { id, ...data } = t;
        await addDoc(collection(db, 'transactions'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      
      setSuccessMessage(`Duplicated ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
    } catch (err) {
      console.error('Duplicate error:', err);
    }
  };

  // Cancel select mode
  const cancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedItems(new Set());
  };

  // Select all visible
  const selectAll = () => {
    const allIds = new Set(filteredTransactions.map(t => t.id));
    setSelectedItems(allIds);
  };

  if (isLoading) return <div className="p-4 text-center">Loading transactions...</div>;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10">
        {/* Select Mode Header */}
        {isSelectMode ? (
          <div className="flex items-center justify-between">
            <button onClick={cancelSelectMode} className="text-gray-500 text-lg">✕</button>
            <span className="font-bold text-lg">{selectedItems.size} selected</span>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-emerald-600 text-sm font-medium">All</button>
              <button 
                onClick={handleDuplicateSelected}
                className="bg-sky-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                📋
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                🗑️
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="🔍 Search transactions..."
                className="flex-1 p-2 pl-3 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:border-emerald-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-2 bg-gray-50 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ⚙️
              </button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="space-y-2 mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value)}
                    className="p-2 rounded border border-gray-200 text-sm"
                  >
                    <option value="all">All Types</option>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                    <option value="split">Split</option>
                  </select>
                  <select 
                    value={filterTime} 
                    onChange={(e) => setFilterTime(e.target.value)}
                    className="p-2 rounded border border-gray-200 text-sm"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                  <select 
                    value={filterAccount} 
                    onChange={(e) => setFilterAccount(e.target.value)}
                    className="p-2 rounded border border-gray-200 text-sm"
                  >
                    <option value="all">All Accounts</option>
                    {groupedAccounts.map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {group.accounts.map(acc => (
                          <option key={acc.name} value={acc.name}>{acc.icon} {acc.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select 
                    value={filterCategory} 
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="p-2 rounded border border-gray-200 text-sm"
                  >
                    <option value="all">All Categories</option>
                    
                    {/* Show based on type filter */}
                    {(filterType === 'all' || filterType === 'expense' || filterType === 'split') && groupedCategoriesForFilter.expense.length > 0 && (
                      <optgroup label="── EXPENSE ──">
                        {groupedCategoriesForFilter.expense.map(({ group, categories: cats }) => (
                          <React.Fragment key={`expense-${group}`}>
                            <option disabled className="font-bold text-gray-500">📁 {group}</option>
                            {cats.map(cat => (
                              <option key={cat.id} value={cat.name}>
                                &nbsp;&nbsp;&nbsp;{cat.icon || '📦'} {cat.name}
                              </option>
                            ))}
                          </React.Fragment>
                        ))}
                      </optgroup>
                    )}
                    
                    {(filterType === 'all' || filterType === 'income' || filterType === 'split') && groupedCategoriesForFilter.income.length > 0 && (
                      <optgroup label="── INCOME ──">
                        {groupedCategoriesForFilter.income.map(({ group, categories: cats }) => (
                          <React.Fragment key={`income-${group}`}>
                            <option disabled className="font-bold text-gray-500">📁 {group}</option>
                            {cats.map(cat => (
                              <option key={cat.id} value={cat.name}>
                                &nbsp;&nbsp;&nbsp;{cat.icon || '💰'} {cat.name}
                              </option>
                            ))}
                          </React.Fragment>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                {/* Tag & Wants/Needs Filter - Same Row */}
                <div className="flex gap-2">
                  <select 
                    value={filterTag} 
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="flex-1 p-2 rounded border border-gray-200 text-sm min-w-0"
                  >
                    <option value="all">🏷️ All Tags</option>
                    {selectableTagsForFilter.map(tag => (
                      <option key={tag.value} value={tag.value}>🏷️ {tag.display}</option>
                    ))}
                  </select>
                  <select 
                    value={filterSpendingType} 
                    onChange={(e) => setFilterSpendingType(e.target.value)}
                    className="flex-1 p-2 rounded border border-gray-200 text-sm min-w-0"
                  >
                    <option value="all">All Needs/Wants</option>
                    <option value="need">🔵 Needs</option>
                    <option value="want">🟣 Wants</option>
                  </select>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setFilterType('all');
                      setFilterAccount('all');
                      setFilterCategory('all');
                      setFilterTime('all');
                      setFilterTag('all');
                      setFilterSpendingType('all');
                    }}
                    className="text-xs text-red-500 font-medium"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            )}

            <div className="text-xs text-gray-400 text-center">
              Hold to select • Tap to edit
            </div>
          </>
        )}
      </div>

      {/* Totals */}
      {!isSelectMode && (
        <div className="bg-emerald-600 text-white px-4 py-3">
          <div className="flex justify-between text-sm">
            <div><span className="opacity-70">Income: </span><span className="font-medium">+{formatCurrency(totals.income)}</span></div>
            <div><span className="opacity-70">Expense: </span><span className="font-medium">-{formatCurrency(totals.expense)}</span></div>
            <div><span className="opacity-70">Net: </span><span className={`font-bold ${totals.net >= 0 ? 'text-green-200' : 'text-red-200'}`}>{totals.net >= 0 ? '+' : '-'}{formatCurrency(totals.net)}</span></div>
          </div>
          <div className="text-xs opacity-70 mt-1 text-center">
            {filteredTransactions.length} transactions{hasActiveFilters && ' (filtered)'}
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="px-4 mt-4 space-y-4">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            {searchQuery || hasActiveFilters ? 'No matches.' : 'No transactions.'}
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">
                {formatDateLabel(date)}
              </div>
              
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {items.map((t, index) => {
                  const isSplit = t.type === 'split';
                  const isTransfer = t.type === 'transfer';
                  const isUnrealizedGain = t.type === 'unrealized_gain';
                  const amount = isSplit ? Number(t.totalAmount) : Number(t.amount);
                  const isPositive = amount > 0;
                  const isSelected = selectedItems.has(t.id);
                  
                  const accountDisplay = isTransfer 
                    ? `${t.fromAccount || '?'} → ${t.toAccount || '?'}`
                    : t.account;
                  
                  const isLoan = t.type === 'loan';
                  const isFrozen = isLoan || isUnrealizedGain; // Both loan and unrealized_gain are frozen
                  
                  return (
                    <div 
                      key={t.id || index}
                      onClick={() => handleTransactionClick(t)}
                      onTouchStart={() => !isFrozen && handleTouchStart(t.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onContextMenu={(e) => { e.preventDefault(); handleLongPress(t.id); }}
                      className={`p-3 ${isFrozen ? 'cursor-default bg-gray-50' : 'cursor-pointer hover:bg-gray-50'} ${index !== items.length - 1 ? 'border-b' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
                    >
                      {/* Main row */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isSelectMode && (
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                              {isSelected && <span className="text-white text-sm">✓</span>}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-800 flex items-center gap-1.5">
                              {isSplit && <SplitIcon />}
                              {isLoan && <span className="text-amber-500">💰</span>}
                              {t.type === 'loan' 
                                ? (t.memo || 'Loan transaction')
                                : isTransfer
                                  ? `Transfer: ${t.fromAccount || '?'} → ${t.toAccount || '?'}`
                                  : isUnrealizedGain
                                    ? `Unrealized ${isPositive ? 'Gain' : 'Loss'}`
                                    : (t.payee || 'No Payee')
                              }
                              {isLoan && <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded ml-1">Loan</span>}
                              {isUnrealizedGain && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ml-1 ${isPositive ? 'text-emerald-600 bg-emerald-100' : 'text-red-600 bg-red-100'}`}>
                                  {isPositive ? '📈 Gain' : '📉 Loss'}
                                </span>
                              )}
                            </div>
                            
                            {!isSplit && (
                              <div className="text-xs text-gray-500 truncate">
                                {t.type === 'loan' ? t.loan : isTransfer ? '' : isUnrealizedGain ? t.account : t.category}
                                {t.memo && <span className="text-gray-400"> • {t.memo}</span>}
                              </div>
                            )}
                            
                            {isSplit && t.memo && (
                              <div className="text-xs text-gray-400 truncate">
                                {t.memo}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`font-bold ${isUnrealizedGain ? (isPositive ? 'text-emerald-600' : 'text-red-600') : (isPositive ? 'text-emerald-600' : 'text-gray-900')}`}>
                            {isPositive ? '+' : '-'}{formatCurrency(amount)}
                          </div>
                          <div className="text-xs text-gray-400">{accountDisplay}</div>
                          {/* Support both old 'tag' and new 'tags' fields */}
                          {(t.tags?.length > 0 || t.tag) && (
                            <div className="flex flex-wrap gap-1 justify-end mt-0.5">
                              {(t.tags || (t.tag ? [t.tag] : [])).map(tag => (
                                <span key={tag} className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded inline-block">
                                  🏷️ {tagDisplayMap[tag] || tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Split details */}
                      {isSplit && t.splits && (
                        <div className="mt-1.5 space-y-0.5 pl-3 border-l-2 border-sky-200 ml-1">
                          {t.splits.map((s, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-gray-600">
                                {s.isTransfer 
                                  ? `Transfer: ${t.account} → ${s.transferAccount}`
                                  : s.isLoan 
                                    ? s.loan 
                                    : s.category}
                                {s.memo && <span className="text-gray-400 ml-1">• {s.memo}</span>}
                              </span>
                              <span className="text-gray-700 font-medium">
                                {formatCurrency(s.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Show More Button (for already loaded transactions) */}
        {displayLimit < filteredTransactions.length && (
          <div className="p-4 text-center">
            <button
              onClick={() => setDisplayLimit(prev => prev + 100)}
              className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-lg font-medium hover:bg-emerald-200"
            >
              Show More ({filteredTransactions.length - displayLimit} remaining)
            </button>
          </div>
        )}

        {/* Load More Button */}
        {hasMoreTransactions && !isLoading && transactionCount > 0 && (
          <div className="p-4 text-center">
            <button
              onClick={loadMoreTransactions}
              disabled={loadingMore}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="animate-spin">⏳</span> Loading...
                </span>
              ) : (
                `Load More (${transactionCount} loaded)`
              )}
            </button>
          </div>
        )}

        {/* All loaded indicator */}
        {!hasMoreTransactions && transactionCount > 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">
            ✓ All {transactionCount} transactions loaded
          </div>
        )}
      </div>

      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingTransaction(null); }}
        onSave={() => { setIsModalOpen(false); setEditingTransaction(null); }}
        editTransaction={editingTransaction}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-red-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">🗑️</div>
              <div className="font-bold text-lg">Delete Transactions</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Are you sure you want to delete <span className="font-bold">{selectedItems.size}</span> transaction(s)?
                <br/><span className="text-red-500 text-sm">This cannot be undone.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowDeleteConfirm(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteSelected} 
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">✓</div>
              <div className="font-bold text-lg">Success</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">{successMessage}</p>
              <button 
                onClick={() => setSuccessMessage(null)} 
                className="w-full bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loan Notice Modal */}
      {loanNoticeModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="text-3xl mb-1">🏦</div>
              <div className="font-bold">Loan Transaction</div>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-gray-700 text-center">
                This is a loan transaction. To edit it, please go to the Loans tab.
              </p>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <div className="text-sm text-emerald-600">Loan</div>
                <div className="font-bold text-emerald-700">{loanNoticeModal.loanName}</div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setLoanNoticeModal({ show: false, loanName: '' })}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    const loanName = loanNoticeModal.loanName;
                    setLoanNoticeModal({ show: false, loanName: '' });
                    // Navigate to Loans tab and open specific loan detail
                    window.dispatchEvent(new CustomEvent('openLoans'));
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('openLoanDetail', { detail: { loanName } }));
                    }, 150);
                  }}
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600"
                >
                  Go to Loans →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Split icon component
const SplitIcon = () => (
  <svg className="w-4 h-4 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v6m0 0l-3-3m3 3l3-3M6 12h12M6 12l3-3M6 12l3 3M18 12l-3-3M18 12l-3 3M12 15v6m0 0l-3-3m3 3l3-3" />
  </svg>
);

export default TransactionsTab;