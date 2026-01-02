import React, { useState, useMemo } from 'react';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import AddTransactionModal from '../Transactions/AddTransactionModal';

const AccountStatement = ({ 
  accounts, 
  transactions, 
  categories,
  groupedAccounts,
  selectedAccount,
  setSelectedAccount,
  onBack 
}) => {
  const userId = useUserId();
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'uncleared' | 'cleared' | 'reconciled'
  const [flowFilter, setFlowFilter] = useState('all'); // 'all' | 'outflow' | 'inflow'
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  
  // Reconcile modal
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileDisplay, setReconcileDisplay] = useState('');
  const [reconcileStep, setReconcileStep] = useState(1); // 1: enter amount, 2: confirm/difference

  // Warning modal for editing reconciled transaction
  const [warningModal, setWarningModal] = useState({ show: false, transaction: null, action: null });

  // Transaction modal state
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  // Loan notice modal state
  const [loanNoticeModal, setLoanNoticeModal] = useState({ show: false, loanName: '' });

  // Get current account data
  const currentAccount = useMemo(() => {
    return accounts.find(a => a.name === selectedAccount);
  }, [accounts, selectedAccount]);

  // Format currency
  const formatCurrency = (amount) => {
    return Math.abs(Number(amount) || 0).toLocaleString('en-US');
  };

  // Format balance (with negative sign if needed)
  const formatBalance = (amount) => {
    const num = Number(amount) || 0;
    if (num < 0) {
      return `-${Math.abs(num).toLocaleString('en-US')}`;
    }
    return num.toLocaleString('en-US');
  };

  // Format date as yyyy/mm/dd
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
  };

  // Get category icon
  const getCategoryIcon = (categoryName) => {
    const cat = categories.find(c => c.name === categoryName);
    return cat?.icon || '📁';
  };

  // Process transactions for selected account
  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    
    // Filter transactions related to this account
    const filtered = transactions.filter(t => {
      if (t.isFuture) return false;
      if (t.type === 'transfer') {
        return t.fromAccount === selectedAccount || t.toAccount === selectedAccount;
      }
      return t.account === selectedAccount;
    });

    // Map to display format
    return filtered.map(t => {
      const isTransfer = t.type === 'transfer';
      const isSplit = t.type === 'split';
      const isLoan = t.type === 'loan';
      const isOutgoing = isTransfer && t.fromAccount === selectedAccount;
      
      let payee, category, categoryIcon, outflow, inflow;
      
      if (isTransfer) {
        payee = `Transfer: ${isOutgoing ? t.toAccount : t.fromAccount}`;
        category = 'Transfer';
        categoryIcon = '↔️';
        if (isOutgoing) {
          outflow = Number(t.amount);
          inflow = 0;
        } else {
          outflow = 0;
          inflow = Number(t.amount);
        }
      } else if (isSplit) {
        payee = t.payee || 'Split Transaction';
        category = 'Split';
        categoryIcon = '📊';
        const totalAmount = Number(t.totalAmount) || 0;
        if (totalAmount < 0) {
          outflow = Math.abs(totalAmount);
          inflow = 0;
        } else {
          outflow = 0;
          inflow = totalAmount;
        }
      } else if (isLoan) {
        // Loan transaction: payee = memo, category = loan name
        payee = t.memo || t.loan || 'Loan';
        category = t.loan || 'Loan';
        categoryIcon = '🏦';
        const amount = Number(t.amount) || 0;
        if (amount < 0) {
          outflow = Math.abs(amount);
          inflow = 0;
        } else {
          outflow = 0;
          inflow = amount;
        }
      } else {
        payee = t.payee || 'No Payee';
        category = t.category || 'Uncategorized';
        categoryIcon = getCategoryIcon(t.category);
        const amount = Number(t.amount) || 0;
        if (amount < 0) {
          outflow = Math.abs(amount);
          inflow = 0;
        } else {
          outflow = 0;
          inflow = amount;
        }
      }

      return {
        id: t.id,
        date: t.date,
        payee,
        category,
        categoryIcon,
        memo: t.memo || '',
        outflow,
        inflow,
        clearStatus: t.clearStatus || 'uncleared',
        originalTransaction: t,
        isStartingBalance: false
      };
    });
  }, [selectedAccount, transactions, categories]);

  // Calculate running balance and add starting balance row
  const transactionsWithBalance = useMemo(() => {
    if (!currentAccount) return [];
    
    const startingBalance = currentAccount.startingBalance || 0;
    
    // Get starting balance date
    let sbDateStr;
    if (currentAccount.startingBalanceDate) {
      const sbDate = currentAccount.startingBalanceDate.seconds 
        ? new Date(currentAccount.startingBalanceDate.seconds * 1000)
        : new Date(currentAccount.startingBalanceDate);
      sbDateStr = sbDate.toISOString().split('T')[0];
    } else if (currentAccount.createdAt) {
      const createdDate = currentAccount.createdAt.seconds 
        ? new Date(currentAccount.createdAt.seconds * 1000)
        : new Date(currentAccount.createdAt);
      sbDateStr = createdDate.toISOString().split('T')[0];
    } else {
      sbDateStr = new Date().toISOString().split('T')[0];
    }

    // Add starting balance as a transaction
    const startingBalanceRow = {
      id: 'starting-balance',
      date: sbDateStr,
      payee: '💵 Starting Balance',
      category: '',
      categoryIcon: '',
      memo: '',
      outflow: startingBalance < 0 ? Math.abs(startingBalance) : 0,
      inflow: startingBalance >= 0 ? startingBalance : 0,
      balance: startingBalance,
      clearStatus: 'reconciled',
      isStartingBalance: true
    };

    // Combine and sort by date ascending for balance calculation
    const allTransactions = [...accountTransactions, startingBalanceRow];
    
    const sorted = allTransactions.sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      // Starting balance should be first on its date
      if (a.isStartingBalance) return -1;
      if (b.isStartingBalance) return 1;
      // Secondary sort by createdAt if same date
      const aTime = a.originalTransaction?.createdAt?.seconds || 0;
      const bTime = b.originalTransaction?.createdAt?.seconds || 0;
      return aTime - bTime;
    });

    // Calculate running balance
    let runningBalance = 0;
    const withBalance = sorted.map(t => {
      runningBalance = runningBalance - t.outflow + t.inflow;
      return { ...t, balance: runningBalance };
    });

    return withBalance;
  }, [accountTransactions, currentAccount]);

  // Apply filters and sorting
  const filteredTransactions = useMemo(() => {
    let result = [...transactionsWithBalance];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.payee.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query) ||
        t.memo.toLowerCase().includes(query) ||
        String(t.outflow).includes(query) ||
        String(t.inflow).includes(query) ||
        String(t.balance).includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(t => t.clearStatus === statusFilter);
    }

    // Flow filter
    if (flowFilter === 'outflow') {
      result = result.filter(t => t.outflow > 0);
    } else if (flowFilter === 'inflow') {
      result = result.filter(t => t.inflow > 0);
    }

    // Sort
    result.sort((a, b) => {
      // Starting balance always at the end when sorted by date desc
      if (sortConfig.key === 'date') {
        if (a.isStartingBalance && !b.isStartingBalance) return sortConfig.direction === 'desc' ? 1 : -1;
        if (b.isStartingBalance && !a.isStartingBalance) return sortConfig.direction === 'desc' ? -1 : 1;
      }

      let aVal, bVal;
      switch (sortConfig.key) {
        case 'date':
          aVal = a.date || '';
          bVal = b.date || '';
          break;
        case 'payee':
          aVal = a.payee.toLowerCase();
          bVal = b.payee.toLowerCase();
          break;
        case 'category':
          aVal = a.category.toLowerCase();
          bVal = b.category.toLowerCase();
          break;
        case 'memo':
          aVal = a.memo.toLowerCase();
          bVal = b.memo.toLowerCase();
          break;
        case 'outflow':
          aVal = a.outflow;
          bVal = b.outflow;
          break;
        case 'inflow':
          aVal = a.inflow;
          bVal = b.inflow;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [transactionsWithBalance, searchQuery, statusFilter, flowFilter, sortConfig]);

  // Calculate summary
  const summary = useMemo(() => {
    let reconciled = 0;
    let cleared = 0;
    let uncleared = 0;

    transactionsWithBalance.forEach(t => {
      const net = t.inflow - t.outflow;
      if (t.clearStatus === 'reconciled') {
        reconciled += net;
      } else if (t.clearStatus === 'cleared') {
        cleared += net;
      } else {
        uncleared += net;
      }
    });

    const working = reconciled + cleared + uncleared;
    const clearedBalance = reconciled + cleared;

    return { reconciled, cleared, uncleared, working, clearedBalance };
  }, [transactionsWithBalance]);

  // Toggle clear status
  const handleToggleClear = async (transaction) => {
    if (transaction.isStartingBalance) return;

    // If reconciled, show warning
    if (transaction.clearStatus === 'reconciled') {
      setWarningModal({
        show: true,
        transaction,
        action: 'unlock',
        message: 'This transaction is reconciled. Unlocking may affect your reconciliation balance.'
      });
      return;
    }

    // Toggle between uncleared and cleared
    const nextStatus = transaction.clearStatus === 'cleared' ? 'uncleared' : 'cleared';

    try {
      await updateDoc(doc(db, 'transactions', transaction.id), {
        clearStatus: nextStatus
      });
    } catch (err) {
      console.error('Error updating clear status:', err);
    }
  };

  // Confirm unlock reconciled transaction
  const handleConfirmUnlock = async () => {
    if (!warningModal.transaction) return;

    try {
      await updateDoc(doc(db, 'transactions', warningModal.transaction.id), {
        clearStatus: 'cleared'
      });
    } catch (err) {
      console.error('Error unlocking transaction:', err);
    }
    setWarningModal({ show: false, transaction: null, action: null });
  };

  // Handle column header click
  const handleHeaderClick = (key) => {
    if (key === 'status') {
      // Cycle through status filters
      const cycle = ['all', 'uncleared', 'cleared', 'reconciled'];
      const currentIndex = cycle.indexOf(statusFilter);
      setStatusFilter(cycle[(currentIndex + 1) % cycle.length]);
    } else if (key === 'outflow') {
      setFlowFilter(flowFilter === 'outflow' ? 'all' : 'outflow');
    } else if (key === 'inflow') {
      setFlowFilter(flowFilter === 'inflow' ? 'all' : 'inflow');
    } else {
      // Sort
      setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
    }
  };

  // Handle reconcile amount input
  const handleReconcileAmountChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setReconcileAmount(raw);
    setReconcileDisplay(raw ? Number(raw).toLocaleString('en-US') : '');
  };

  // Start reconcile process
  const handleStartReconcile = () => {
    setReconcileAmount('');
    setReconcileDisplay('');
    setReconcileStep(1);
    setShowReconcileModal(true);
  };

  // Quick Reconcile - when user confirms cleared balance is correct
  const handleQuickReconcile = async () => {
    try {
      const clearedTransactions = transactionsWithBalance.filter(
        t => t.clearStatus === 'cleared' && !t.isStartingBalance
      );
      
      if (clearedTransactions.length === 0) {
        setShowReconcileModal(false);
        return;
      }

      await Promise.all(clearedTransactions.map(t => 
        updateDoc(doc(db, 'transactions', t.id), {
          clearStatus: 'reconciled',
          reconciledAt: new Date()
        })
      ));

      setShowReconcileModal(false);
      setReconcileStep(1);
      // Reset filters after reconcile
      setStatusFilter('all');
      setFlowFilter('all');
    } catch (err) {
      console.error('Error reconciling:', err);
    }
  };

  // Get reconcile difference
  const reconcileDifference = useMemo(() => {
    const bankBalance = Number(reconcileAmount) || 0;
    return bankBalance - summary.clearedBalance;
  }, [reconcileAmount, summary.clearedBalance]);

  // Complete reconcile with adjustment
  const handleCompleteReconcile = async (createAdjustment = false) => {
    try {
      // If need adjustment, create transaction first
      if (createAdjustment && reconcileDifference !== 0) {
        const today = new Date().toISOString().split('T')[0];
        await addDoc(collection(db, 'transactions'), {
          userId,
          type: reconcileDifference > 0 ? 'income' : 'expense',
          amount: reconcileDifference,
          payee: 'Reconciliation Adjustment',
          category: 'Adjustment',
          account: selectedAccount,
          date: today,
          memo: 'Auto-created during reconciliation',
          clearStatus: 'cleared',
          createdAt: new Date()
        });
      }

      // Lock all cleared transactions as reconciled
      const clearedTransactions = transactionsWithBalance.filter(
        t => t.clearStatus === 'cleared' && !t.isStartingBalance
      );
      
      await Promise.all(clearedTransactions.map(t => 
        updateDoc(doc(db, 'transactions', t.id), {
          clearStatus: 'reconciled',
          reconciledAt: new Date()
        })
      ));

      setShowReconcileModal(false);
      setReconcileStep(1);
      // Reset filters after reconcile
      setStatusFilter('all');
      setFlowFilter('all');
    } catch (err) {
      console.error('Error reconciling:', err);
    }
  };

  // Undo last reconcile - revert reconciled transactions back to cleared
  const handleUndoReconcile = async () => {
    try {
      // Find reconciled transactions (not starting balance)
      const reconciledTransactions = transactionsWithBalance.filter(
        t => t.clearStatus === 'reconciled' && !t.isStartingBalance
      );
      
      if (reconciledTransactions.length === 0) {
        return;
      }

      // Sort by reconciledAt descending to find the most recent batch
      const sortedByReconcileTime = reconciledTransactions
        .filter(t => t.originalTransaction?.reconciledAt)
        .sort((a, b) => {
          const aTime = a.originalTransaction.reconciledAt?.seconds || 0;
          const bTime = b.originalTransaction.reconciledAt?.seconds || 0;
          return bTime - aTime;
        });

      if (sortedByReconcileTime.length === 0) {
        // No reconciledAt timestamp, undo all reconciled
        await Promise.all(reconciledTransactions.map(t => 
          updateDoc(doc(db, 'transactions', t.id), {
            clearStatus: 'cleared',
            reconciledAt: null
          })
        ));
      } else {
        // Find the most recent reconciledAt timestamp
        const mostRecentTime = sortedByReconcileTime[0].originalTransaction.reconciledAt;
        const mostRecentSeconds = mostRecentTime?.seconds || 0;
        
        // Undo all transactions reconciled within 5 seconds of the most recent (same batch)
        const batchToUndo = sortedByReconcileTime.filter(t => {
          const tSeconds = t.originalTransaction.reconciledAt?.seconds || 0;
          return Math.abs(tSeconds - mostRecentSeconds) <= 5;
        });

        await Promise.all(batchToUndo.map(t => 
          updateDoc(doc(db, 'transactions', t.id), {
            clearStatus: 'cleared',
            reconciledAt: null
          })
        ));
      }
    } catch (err) {
      console.error('Error undoing reconcile:', err);
    }
  };

  // Check if there are reconciled transactions to undo
  const hasReconciledTransactions = useMemo(() => {
    return transactionsWithBalance.some(t => t.clearStatus === 'reconciled' && !t.isStartingBalance);
  }, [transactionsWithBalance]);

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'cleared': return '✓';
      case 'reconciled': return '🔒';
      default: return '○';
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'cleared': return 'text-emerald-500';
      case 'reconciled': return 'text-amber-500';
      default: return 'text-gray-400';
    }
  };

  // Get sort indicator
  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  // Get filter indicator for status
  const getStatusFilterLabel = () => {
    switch (statusFilter) {
      case 'uncleared': return '○';
      case 'cleared': return '✓';
      case 'reconciled': return '🔒';
      default: return '⬤';
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 overflow-auto">
      <div className="p-4">
        {/* Header with Account Name */}
        <div className="bg-white rounded-xl shadow-sm mb-4">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    if (selectedAccount) {
                      // Clear account selection first - go back to account picker
                      setSelectedAccount('');
                      setSearchQuery('');
                      setStatusFilter('all');
                      setFlowFilter('all');
                    } else {
                      // No account selected - go back to Reports Tab
                      onBack();
                    }
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 font-medium"
                >
                  ← Back
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    {currentAccount?.icon} {selectedAccount || 'Account Ledger'}
                  </h1>
                  {currentAccount?.type && (
                    <span className="text-sm text-gray-500">
                      💳 {currentAccount.type}
                    </span>
                  )}
                </div>
              </div>
              
              {selectedAccount && (
                <div className="flex items-center gap-2">
                  {hasReconciledTransactions && (
                    <button
                      onClick={handleUndoReconcile}
                      className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200"
                    >
                      ↩️ Undo
                    </button>
                  )}
                  <button
                    onClick={handleStartReconcile}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
                  >
                    🔄 Reconcile
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Summary Bar */}
          {selectedAccount && (
            <div className="p-4 flex flex-wrap items-center gap-6 bg-gray-50">
              <div className="text-center">
                <div className="text-lg font-bold text-amber-600">{formatBalance(summary.reconciled)}</div>
                <div className="text-xs text-gray-500">🔒 Reconciled</div>
              </div>
              <div className="text-gray-300">+</div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-600">{formatBalance(summary.cleared)}</div>
                <div className="text-xs text-gray-500">✓ Cleared</div>
              </div>
              <div className="text-gray-300">+</div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-600">{formatBalance(summary.uncleared)}</div>
                <div className="text-xs text-gray-500">○ Uncleared</div>
              </div>
              <div className="text-gray-300">=</div>
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{formatBalance(summary.working)}</div>
                <div className="text-xs text-gray-500">Working Balance</div>
              </div>
            </div>
          )}

          {/* Account Selector & Search */}
          <div className="p-4 flex flex-wrap items-center gap-4">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none min-w-[200px]"
            >
              <option value="">-- Select Account --</option>
              {groupedAccounts && groupedAccounts.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.accounts.map(acc => (
                    <option key={acc.name} value={acc.name}>
                      {acc.icon} {acc.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="🔍 Search payee, category, memo, amount..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Add Transaction Button */}
            {selectedAccount && (
              <button
                onClick={() => {
                  setEditingTransaction(null);
                  setShowTransactionModal(true);
                }}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 flex items-center gap-1"
              >
                <span>➕</span> Add
              </button>
            )}

            {/* Active filters indicator */}
            {(statusFilter !== 'all' || flowFilter !== 'all') && (
              <div className="flex items-center gap-2">
                {statusFilter !== 'all' && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                    Status: {statusFilter}
                  </span>
                )}
                {flowFilter !== 'all' && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                    {flowFilter}
                  </span>
                )}
                <button
                  onClick={() => { setStatusFilter('all'); setFlowFilter('all'); }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Transaction Table */}
        {selectedAccount ? (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th 
                      className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleHeaderClick('date')}
                    >
                      DATE{getSortIndicator('date')}
                    </th>
                    <th 
                      className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleHeaderClick('payee')}
                    >
                      PAYEE{getSortIndicator('payee')}
                    </th>
                    <th 
                      className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleHeaderClick('category')}
                    >
                      CATEGORY{getSortIndicator('category')}
                    </th>
                    <th 
                      className="px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleHeaderClick('memo')}
                    >
                      MEMO{getSortIndicator('memo')}
                    </th>
                    <th 
                      className={`px-3 py-3 text-right font-semibold cursor-pointer hover:bg-gray-100 ${flowFilter === 'outflow' ? 'text-red-600 bg-red-50' : 'text-gray-600'}`}
                      onClick={() => handleHeaderClick('outflow')}
                    >
                      OUTFLOW{flowFilter === 'outflow' ? ' ✓' : ''}
                    </th>
                    <th 
                      className={`px-3 py-3 text-right font-semibold cursor-pointer hover:bg-gray-100 ${flowFilter === 'inflow' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-600'}`}
                      onClick={() => handleHeaderClick('inflow')}
                    >
                      INFLOW{flowFilter === 'inflow' ? ' ✓' : ''}
                    </th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-600">
                      BALANCE
                    </th>
                    <th 
                      className="px-3 py-3 text-center font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 w-16"
                      onClick={() => handleHeaderClick('status')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        {getStatusFilterLabel()}
                        <span className="text-xs text-gray-400">▼</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                        {searchQuery || statusFilter !== 'all' || flowFilter !== 'all' 
                          ? 'No transactions match your filters' 
                          : 'No transactions in this account'}
                      </td>
                    </tr>
                  ) : (
                    // Display transactions in current sort order
                    filteredTransactions.map((t) => (
                      <tr 
                        key={t.id} 
                        className={`hover:bg-gray-50 ${t.isStartingBalance ? 'bg-emerald-50/50' : 'cursor-pointer'}`}
                        onClick={() => {
                          if (!t.isStartingBalance && t.originalTransaction) {
                            // Check if it's a loan transaction
                            if (t.originalTransaction.type === 'loan') {
                              setLoanNoticeModal({ 
                                show: true, 
                                loanName: t.originalTransaction.loan || 'Loan'
                              });
                            } else {
                              setEditingTransaction(t.originalTransaction);
                              setShowTransactionModal(true);
                            }
                          }
                        }}
                      >
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {formatDate(t.date)}
                        </td>
                        <td className={`px-3 py-2 font-medium ${t.isStartingBalance ? 'text-emerald-700' : 'text-gray-800'}`}>
                          <span className="flex items-center gap-2">
                            {t.payee}
                            {t.originalTransaction?.type === 'loan' && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Loan</span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {t.categoryIcon && <span className="mr-1">{t.categoryIcon}</span>}
                          {t.category}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">
                          {t.memo}
                        </td>
                        <td className="px-3 py-2 text-right text-red-600 font-medium whitespace-nowrap">
                          {t.outflow > 0 ? `(${formatCurrency(t.outflow)})` : ''}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium whitespace-nowrap">
                          {t.isStartingBalance ? formatCurrency(t.inflow) : (t.inflow > 0 ? formatCurrency(t.inflow) : '')}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-gray-800 whitespace-nowrap">
                          {formatBalance(t.balance)}
                        </td>
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleClear(t)}
                            disabled={t.isStartingBalance}
                            className={`text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 mx-auto ${getStatusColor(t.clearStatus)} ${t.isStartingBalance ? 'cursor-not-allowed opacity-60' : ''}`}
                          >
                            {getStatusIcon(t.clearStatus)}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer with count */}
            <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
              Showing {filteredTransactions.length} of {transactionsWithBalance.length} transactions
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
            <div className="text-4xl mb-2">📊</div>
            <div>Select an account to view statement</div>
          </div>
        )}
      </div>

      {/* Reconcile Modal - Step 1: Yes/No confirmation */}
      {showReconcileModal && reconcileStep === 1 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="font-bold text-lg">Reconcile Account</div>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Balance Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Cleared Balance</span>
                  <span className="font-bold text-blue-600">{formatBalance(summary.clearedBalance)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">+ Uncleared Balance</span>
                  <span className={`font-bold ${summary.uncleared >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                    {summary.uncleared >= 0 ? '+' : ''}{formatBalance(summary.uncleared)}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-gray-700 font-medium">Working Balance</span>
                  <span className="font-bold text-lg">{formatBalance(summary.working)}</span>
                </div>
              </div>

              {/* Uncleared Warning with link */}
              {summary.uncleared !== 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500">⚠️</span>
                    <div className="text-sm text-amber-700">
                      <div>You have uncleared transactions. Clear them first or they will remain uncleared after reconciliation.</div>
                      <button 
                        onClick={() => {
                          setShowReconcileModal(false);
                          setStatusFilter('uncleared');
                        }}
                        className="text-amber-800 font-medium hover:underline mt-1"
                      >
                        👉 Click here to see uncleared transactions
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation Question */}
              <div className="text-center py-2">
                <div className="text-gray-600 text-sm">Is your current balance</div>
                <div className="text-3xl font-bold text-gray-800 my-2">{formatBalance(summary.clearedBalance)}?</div>
              </div>

              {/* Buttons - highlight based on whether cleared = working */}
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowReconcileModal(false)} 
                  className={`flex-1 py-3 rounded-lg font-medium ${
                    summary.clearedBalance !== summary.working 
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  No
                </button>
                <button 
                  onClick={handleQuickReconcile}
                  className={`flex-1 py-3 rounded-lg font-medium ${
                    summary.clearedBalance === summary.working 
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Yes
                </button>
              </div>

              {/* Enter Different Amount Link */}
              <button 
                onClick={() => setReconcileStep(2)}
                className="w-full text-emerald-500 text-sm hover:underline"
              >
                No, enter the correct balance →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reconcile Modal - Step 2: Enter different balance */}
      {showReconcileModal && reconcileStep === 2 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="font-bold text-lg">Enter Correct Balance</div>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="text-center">
                <div className="text-sm text-gray-500 mb-1">Current Cleared Balance</div>
                <div className="text-xl font-bold text-blue-600">{formatBalance(summary.clearedBalance)}</div>
              </div>

              <div>
                <label className="text-sm text-gray-500 block mb-1">Your bank statement balance:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={reconcileDisplay}
                  onChange={handleReconcileAmountChange}
                  placeholder="0"
                  className="w-full p-3 text-2xl font-bold text-center border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              {reconcileAmount && reconcileDifference !== 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <div className="text-amber-600 text-sm">Difference</div>
                  <div className={`text-xl font-bold ${reconcileDifference > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {reconcileDifference > 0 ? '+' : ''}{formatBalance(reconcileDifference)}
                  </div>
                  <div className="text-amber-700 text-xs mt-1">
                    An adjustment will be created
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button 
                  onClick={() => setReconcileStep(1)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Back
                </button>
                <button 
                  onClick={() => handleCompleteReconcile(true)}
                  disabled={!reconcileAmount}
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium disabled:opacity-50"
                >
                  Reconcile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal for Reconciled Transaction */}
      {warningModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-3xl mb-1">⚠️</div>
              <div className="font-bold">Warning</div>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-gray-700 text-center">
                {warningModal.message}
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setWarningModal({ show: false, transaction: null, action: null })}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmUnlock}
                  className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-medium"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Transaction Modal */}
      <AddTransactionModal
        isOpen={showTransactionModal}
        onClose={() => {
          setShowTransactionModal(false);
          setEditingTransaction(null);
        }}
        onSave={() => {
          setShowTransactionModal(false);
          setEditingTransaction(null);
        }}
        editTransaction={editingTransaction}
        prefilledAccount={selectedAccount}
      />

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
                    onBack();
                    // Navigate to Loans tab and open specific loan detail
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('openLoans'));
                      // After tab switch, open the specific loan
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('openLoanDetail', { detail: { loanName } }));
                      }, 150);
                    }, 100);
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

export default AccountStatement;
