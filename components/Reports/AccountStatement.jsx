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
  const [dateSearch, setDateSearch] = useState(''); // Search by specific date for end balance
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

  // Reorder modal state - for fixing transaction order within same day
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderDate, setReorderDate] = useState(null);
  const [reorderItems, setReorderItems] = useState([]);

  // Manual Reference state (user's own record from bank statement)
  const [showEditManualRef, setShowEditManualRef] = useState(false);
  const [manualRefAmount, setManualRefAmount] = useState('');
  const [manualRefDate, setManualRefDate] = useState('');

  // Helper to clear date filter
  const clearDateFilter = () => {
    setDateSearch('');
  };

  // Helper to clear all filters
  const clearAllFilters = () => {
    setDateSearch('');
    setStatusFilter('all');
    setFlowFilter('all');
  };

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
      const isUnrealizedGain = t.type === 'unrealized_gain';
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
      } else if (isUnrealizedGain) {
        // Unrealized Gain/Loss transaction (for investments)
        const amount = Number(t.amount) || 0;
        payee = amount >= 0 ? 'Unrealized Gain' : 'Unrealized Loss';
        category = 'Value Update';
        categoryIcon = amount >= 0 ? '📈' : '📉';
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
      
      // For same date: use orderIndex if available (for precise ordering)
      // orderIndex is set when user wants specific transaction order within a day
      const aOrderIndex = a.originalTransaction?.orderIndex;
      const bOrderIndex = b.originalTransaction?.orderIndex;
      
      // If both have orderIndex, use it
      if (aOrderIndex !== undefined && bOrderIndex !== undefined) {
        return aOrderIndex - bOrderIndex;
      }
      // If only one has orderIndex, put it first (explicit order takes priority)
      if (aOrderIndex !== undefined) return -1;
      if (bOrderIndex !== undefined) return 1;
      
      // Fallback: sort by createdAt if same date
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

    // Date filter - show transactions up to and including the selected date
    if (dateSearch) {
      result = result.filter(t => t.date <= dateSearch);
    }

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

    // Recalculate display balance based on sort direction
    // When DESC: start from working balance and subtract/add backwards
    // When ASC: use original calculated balance
    if (sortConfig.key === 'date' && sortConfig.direction === 'desc' && result.length > 0) {
      // Get working balance (final balance after all transactions)
      const workingBalance = transactionsWithBalance.length > 0 
        ? transactionsWithBalance[transactionsWithBalance.length - 1].balance 
        : 0;
      
      let runningBalance = workingBalance;
      result = result.map((t, index) => {
        const displayBalance = runningBalance;
        // For next row: subtract inflow, add outflow (going backwards in time)
        runningBalance = runningBalance - t.inflow + t.outflow;
        return { ...t, displayBalance };
      });
    } else {
      // ASC or other sort: use original balance
      result = result.map(t => ({ ...t, displayBalance: t.balance }));
    }

    return result;
  }, [transactionsWithBalance, dateSearch, searchQuery, statusFilter, flowFilter, sortConfig]);

  // Calculate balance at specific date (for dateSearch)
  const balanceAtDate = useMemo(() => {
    if (!dateSearch || !transactionsWithBalance.length) return null;
    
    // Find all transactions up to and including the date
    const transactionsUpToDate = transactionsWithBalance.filter(t => t.date <= dateSearch);
    
    if (transactionsUpToDate.length === 0) return null;
    
    // Get the last transaction's balance (which is the running balance at that date)
    // Since transactions are sorted chronologically with running balance, 
    // we need the last one on or before the date
    const sortedByDate = [...transactionsUpToDate].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.originalTransaction?.createdAt?.seconds || 0) - (b.originalTransaction?.createdAt?.seconds || 0);
    });
    
    return sortedByDate[sortedByDate.length - 1]?.balance || 0;
  }, [dateSearch, transactionsWithBalance]);

  // Calculate summary
  const summary = useMemo(() => {
    let reconciled = 0;
    let cleared = 0;
    let uncleared = 0;
    let unclearedCount = 0;

    transactionsWithBalance.forEach(t => {
      const net = t.inflow - t.outflow;
      if (t.clearStatus === 'reconciled') {
        reconciled += net;
      } else if (t.clearStatus === 'cleared') {
        cleared += net;
      } else {
        uncleared += net;
        unclearedCount++;
      }
    });

    const working = reconciled + cleared + uncleared;
    const clearedBalance = reconciled + cleared;

    return { reconciled, cleared, uncleared, working, clearedBalance, unclearedCount };
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
      
      // Auto turn off uncleared filter when all uncleared are cleared
      if (statusFilter === 'uncleared' && nextStatus === 'cleared') {
        // Check if this was the last uncleared transaction
        const remainingUncleared = transactionsWithBalance.filter(t => 
          t.id !== transaction.id && t.clearStatus !== 'cleared' && t.clearStatus !== 'reconciled'
        );
        if (remainingUncleared.length === 0) {
          setStatusFilter('all');
        }
      }
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

  // Get transactions grouped by date for reorder
  const getTransactionsForDate = (date) => {
    return transactionsWithBalance
      .filter(t => t.date === date && !t.isStartingBalance)
      .sort((a, b) => {
        // Sort by current order (as displayed)
        const aIdx = a.originalTransaction?.orderIndex;
        const bIdx = b.originalTransaction?.orderIndex;
        if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
        if (aIdx !== undefined) return -1;
        if (bIdx !== undefined) return 1;
        const aTime = a.originalTransaction?.createdAt?.seconds || 0;
        const bTime = b.originalTransaction?.createdAt?.seconds || 0;
        return aTime - bTime;
      });
  };

  // Open reorder modal for a specific date
  const handleOpenReorder = (date) => {
    const items = getTransactionsForDate(date);
    if (items.length < 2) return; // Need at least 2 items to reorder
    setReorderDate(date);
    setReorderItems(items.map((t, idx) => ({ ...t, newIndex: idx })));
    setShowReorderModal(true);
  };

  // Move item up in reorder list
  const handleMoveUp = (index) => {
    if (index === 0) return;
    setReorderItems(prev => {
      const newItems = [...prev];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      return newItems.map((item, idx) => ({ ...item, newIndex: idx }));
    });
  };

  // Move item down in reorder list
  const handleMoveDown = (index) => {
    if (index === reorderItems.length - 1) return;
    setReorderItems(prev => {
      const newItems = [...prev];
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      return newItems.map((item, idx) => ({ ...item, newIndex: idx }));
    });
  };

  // Save reorder to Firebase
  const handleSaveReorder = async () => {
    try {
      await Promise.all(reorderItems.map((item, idx) => 
        updateDoc(doc(db, 'transactions', item.id), {
          orderIndex: idx
        })
      ));
      setShowReorderModal(false);
      setReorderDate(null);
      setReorderItems([]);
    } catch (err) {
      console.error('Error saving reorder:', err);
    }
  };

  // Check if date has multiple transactions (can be reordered)
  const canReorderDate = (date) => {
    const count = transactionsWithBalance.filter(t => t.date === date && !t.isStartingBalance).length;
    return count > 1;
  };

  // Export to CSV function
  const handleExportCSV = () => {
    if (!selectedAccount || transactionsWithBalance.length === 0) return;

    // Sort by date ascending for export
    const sortedForExport = [...transactionsWithBalance].sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      if (a.isStartingBalance) return -1;
      if (b.isStartingBalance) return 1;
      return 0;
    });

    // Create CSV content
    const headers = ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow', 'Balance', 'Status'];
    const rows = sortedForExport.map(t => [
      t.date || '',
      `"${(t.payee || '').replace(/"/g, '""')}"`,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      `"${(t.memo || '').replace(/"/g, '""')}"`,
      t.outflow || 0,
      t.inflow || 0,
      t.balance || 0,
      t.clearStatus || 'uncleared'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Add BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedAccount}_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Format date for display
  const formatDateForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Format date with time for My Statement display
  const formatDateTimeForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${timeStr} ${dateStr}`;
  };

  // Format number input with commas
  const formatNumberInput = (value) => {
    if (!value) return '';
    return new Intl.NumberFormat('en-US').format(value.toString().replace(/,/g, ''));
  };

  // Save Manual Reference Amount (user's own record)
  const handleSaveManualRef = async () => {
    if (!manualRefAmount || !currentAccount) return;
    
    try {
      const amount = parseFloat(manualRefAmount.replace(/,/g, ''));
      // Save full timestamp (date + time) for when statement was entered
      await updateDoc(doc(db, 'accounts', currentAccount.id), {
        manualReconcileAmount: amount,
        manualReconcileDate: new Date().toISOString()
      });
      
      setShowEditManualRef(false);
      setManualRefAmount('');
      setManualRefDate('');
    } catch (error) {
      console.error('Error saving manual reference:', error);
    }
  };

  // Open edit manual ref with current values
  const openEditManualRef = () => {
    if (!currentAccount) return;
    setManualRefAmount(currentAccount.manualReconcileAmount ? String(currentAccount.manualReconcileAmount) : '');
    setManualRefDate(currentAccount.manualReconcileDate || new Date().toISOString().split('T')[0]);
    setShowEditManualRef(true);
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
                  type="button"
                  onClick={() => {
                    if (selectedAccount) {
                      // Clear account selection first - go back to account picker
                      setSelectedAccount('');
                      setSearchQuery('');
                      setDateSearch('');
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
              
              {/* Manual Reference - User's bank statement */}
              <div className="ml-auto flex items-center gap-3 bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-200">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">🏦</span>
                  <span className="text-sm text-gray-600">My Statement:</span>
                </div>
                {currentAccount?.manualReconcileAmount ? (
                  <>
                    <span className={`font-bold ${currentAccount.manualReconcileAmount >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatBalance(currentAccount.manualReconcileAmount)}
                    </span>
                    <span className="text-sm text-gray-400">
                      {formatDateTimeForDisplay(currentAccount.manualReconcileDate)}
                    </span>
                    {(() => {
                      const diff = summary.clearedBalance - currentAccount.manualReconcileAmount;
                      if (Math.abs(diff) < 1) return <span className="text-emerald-600 text-sm">✅</span>;
                      return <span className="text-amber-600 text-sm">⚠️ Diff: {diff >= 0 ? '+' : ''}{formatBalance(diff)}</span>;
                    })()}
                  </>
                ) : (
                  <span className="text-gray-400 text-sm">Not set</span>
                )}
                <button 
                  onClick={openEditManualRef}
                  className="text-emerald-600 text-sm font-medium hover:underline ml-2"
                >
                  {currentAccount?.manualReconcileAmount ? 'Edit' : '+ Add'}
                </button>
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

            {selectedAccount && (
              <>
                <div className="flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="🔍 Search payee, category, memo, amount..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                {/* Date Search - for checking balance at specific date */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="📅 YYYY-MM-DD"
                    value={dateSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Allow typing digits and dashes only
                      const cleaned = val.replace(/[^0-9-]/g, '');
                      setDateSearch(cleaned);
                    }}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-[160px]"
                    title="Enter date (YYYY-MM-DD) to see balance at that date"
                  />
                  {dateSearch && (
                    <button
                      type="button"
                      onClick={() => setDateSearch('')}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded"
                      title="Clear date filter"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Balance at Date Display */}
                {dateSearch && /^\d{4}-\d{2}-\d{2}$/.test(dateSearch) && balanceAtDate !== null && (
                  <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-xs text-amber-600">Balance at {dateSearch}</div>
                    <div className={`font-bold ${balanceAtDate >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {balanceAtDate >= 0 ? '+' : ''}{formatCurrency(balanceAtDate)}
                    </div>
                  </div>
                )}

                {/* Add Transaction Button */}
                <button
                  onClick={() => {
                    setEditingTransaction(null);
                    setShowTransactionModal(true);
                  }}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 flex items-center gap-1"
                >
                  <span>➕</span> Add
                </button>

                {/* Export CSV Button */}
                {transactionsWithBalance.length > 0 && (
                  <button
                    onClick={handleExportCSV}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center gap-1"
                  >
                    <span>📥</span> Export CSV
                  </button>
                )}

                {/* Active filters indicator */}
                {(dateSearch || statusFilter !== 'all' || flowFilter !== 'all') && (
                  <div className="flex items-center gap-2">
                    {dateSearch && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                        Date: ≤{dateSearch}
                      </span>
                    )}
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
                      type="button"
                      onClick={clearAllFilters}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </>
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
                        {searchQuery || dateSearch || statusFilter !== 'all' || flowFilter !== 'all' 
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
                          <div className="flex items-center gap-1">
                            <span>{formatDate(t.date)}</span>
                            {!t.isStartingBalance && canReorderDate(t.date) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenReorder(t.date);
                                }}
                                className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded p-0.5 text-xs"
                                title="Reorder transactions for this date"
                              >
                                ↕️
                              </button>
                            )}
                          </div>
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
                          {formatBalance(t.displayBalance)}
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
                      <div>You have {summary.unclearedCount} uncleared transaction{summary.unclearedCount > 1 ? 's' : ''}. Clear them first or they will remain uncleared after reconciliation.</div>
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

      {/* Reorder Transactions Modal */}
      {showReorderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="bg-blue-500 p-4 text-white text-center shrink-0">
              <div className="text-3xl mb-1">↕️</div>
              <div className="font-bold">Reorder Transactions</div>
              <div className="text-sm text-blue-100">{formatDate(reorderDate)}</div>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-600 mb-4">
                Drag to reorder transactions so balance matches your bank statement. 
                First transaction in the list will be processed first.
              </p>
              <div className="space-y-2">
                {reorderItems.map((item, index) => (
                  <div 
                    key={item.id}
                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className={`text-xs px-2 py-1 rounded ${index === 0 ? 'text-gray-300' : 'text-blue-500 hover:bg-blue-100'}`}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === reorderItems.length - 1}
                        className={`text-xs px-2 py-1 rounded ${index === reorderItems.length - 1 ? 'text-gray-300' : 'text-blue-500 hover:bg-blue-100'}`}
                      >
                        ▼
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{item.payee}</div>
                      <div className="text-xs text-gray-500 flex gap-2">
                        {item.outflow > 0 && <span className="text-red-600">-{formatCurrency(item.outflow)}</span>}
                        {item.inflow > 0 && <span className="text-emerald-600">+{formatCurrency(item.inflow)}</span>}
                        {item.category && <span>• {item.category}</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-400">
                      #{index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 shrink-0">
              <button 
                onClick={() => {
                  setShowReorderModal(false);
                  setReorderDate(null);
                  setReorderItems([]);
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveReorder}
                className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600"
              >
                💾 Save Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Manual Reference Modal */}
      {showEditManualRef && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="font-bold text-lg">🏦 My Bank Statement</div>
              <div className="text-sm opacity-90">Record your actual bank balance</div>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="text-center text-gray-600 text-sm">
                Enter the balance from your actual bank statement. This is your reference to compare with system.
              </div>
              
              {/* Amount Input */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Balance Amount</label>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  placeholder="Enter amount..." 
                  value={manualRefAmount ? formatNumberInput(manualRefAmount) : ''} 
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '');
                    if (!isNaN(value) || value === '' || value === '-') setManualRefAmount(value);
                  }}
                  autoFocus
                  className="w-full text-xl font-bold text-center p-3 border-2 border-emerald-200 rounded-lg focus:border-emerald-500 outline-none" 
                />
              </div>
              
              {/* Info about timestamp */}
              <div className="text-xs text-gray-400 text-center">
                📅 Timestamp will be recorded when you save
              </div>

              {/* System comparison */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">System Cleared Balance:</span>
                  <span className="font-medium">{summary.clearedBalance >= 0 ? '+' : ''}{formatBalance(summary.clearedBalance)}</span>
                </div>
                {manualRefAmount && (
                  <div className="flex justify-between mt-1 pt-1 border-t">
                    <span className="text-gray-500">Difference:</span>
                    <span className={`font-medium ${Math.abs(summary.clearedBalance - parseFloat(manualRefAmount.replace(/,/g, '') || 0)) < 1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {(() => {
                        const diff = summary.clearedBalance - parseFloat(manualRefAmount.replace(/,/g, '') || 0);
                        return `${diff >= 0 ? '+' : ''}${formatBalance(diff)}`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => { setShowEditManualRef(false); setManualRefAmount(''); setManualRefDate(''); }} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveManualRef}
                  disabled={!manualRefAmount}
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  Save
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
