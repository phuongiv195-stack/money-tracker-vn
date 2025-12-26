import React, { useState, useMemo, useCallback } from 'react';
import { writeBatch, doc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import AddTransactionModal from './AddTransactionModal';

const TransactionsTab = () => {
  const userId = useUserId();
  const { transactions, accountNames, categoryNames, isLoading } = useData();
  
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Long press state for duplicate
  const [longPressTimer, setLongPressTimer] = useState(null);

  const filteredTransactions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return transactions.filter(t => {
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

      if (searchQuery.trim()) {
        const lowerQuery = searchQuery.toLowerCase();
        const searchFields = [t.payee, t.category, t.memo, t.loan, t.account].filter(Boolean).join(' ').toLowerCase();
        
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
  }, [transactions, filterType, filterAccount, filterCategory, filterTime, searchQuery]);

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
    filteredTransactions.forEach(t => {
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
  }, [filteredTransactions]);

  const hasActiveFilters = filterType !== 'all' || filterAccount !== 'all' || filterCategory !== 'all' || filterTime !== 'all';

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '0';
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
  };

  const formatDateLabel = (dateStr) => {
    if (dateStr === 'Unknown') return 'Unknown Date';
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
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
                className={`p-2 rounded-lg border transition-colors ${
                  hasActiveFilters 
                    ? 'bg-emerald-500 text-white border-emerald-500' 
                    : 'bg-gray-50 text-gray-600 border-gray-300'
                }`}
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
                    {accountNames.map(acc => (
                      <option key={acc} value={acc}>{acc}</option>
                    ))}
                  </select>
                  <select 
                    value={filterCategory} 
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="p-2 rounded border border-gray-200 text-sm"
                  >
                    <option value="all">All Categories</option>
                    {categoryNames.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setFilterType('all');
                      setFilterAccount('all');
                      setFilterCategory('all');
                      setFilterTime('all');
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
                  
                  return (
                    <div 
                      key={t.id || index}
                      onClick={() => handleTransactionClick(t)}
                      onTouchStart={() => handleTouchStart(t.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onContextMenu={(e) => { e.preventDefault(); handleLongPress(t.id); }}
                      className={`p-3 cursor-pointer hover:bg-gray-50 ${index !== items.length - 1 ? 'border-b' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
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
                              {t.type === 'loan' 
                                ? (t.memo || 'Loan transaction')
                                : isTransfer
                                  ? `Transfer: ${t.fromAccount || '?'} → ${t.toAccount || '?'}`
                                  : isUnrealizedGain
                                    ? `📈 Unrealized ${isPositive ? 'Gain' : 'Loss'}`
                                    : (t.payee || 'No Payee')
                              }
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
                        </div>
                      </div>

                      {/* Split details */}
                      {isSplit && t.splits && (
                        <div className="mt-2 space-y-1 pl-4 border-l-2 border-sky-200 ml-1">
                          {t.splits.map((s, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                {s.isLoan ? s.loan : s.category}
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
