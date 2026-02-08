import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { doc, updateDoc, writeBatch, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useData } from '../../contexts/DataContext';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import AddAccountModal from './AddAccountModal';
import UpdateValueModal from './UpdateValueModal';
import EditStartingBalanceModal from './EditStartingBalanceModal';
import EditUnrealizedGainModal from './EditUnrealizedGainModal';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AccountDetail = ({ account, transactions, onClose, onAccountUpdated }) => {
  const toast = useToast();
  const { parentTags, getSubTags } = useData();
  
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
  
  const [isReconciling, setIsReconciling] = useState(false);
  const [showManualReconcile, setShowManualReconcile] = useState(false);
  const [reconcileBalance, setReconcileBalance] = useState('');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdateValueOpen, setIsUpdateValueOpen] = useState(false);
  const [reconcileWarning, setReconcileWarning] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [prefilledAccount, setPrefilledAccount] = useState(null);
  
  // Edit Starting Balance state
  const [isEditStartingBalanceOpen, setIsEditStartingBalanceOpen] = useState(false);
  
  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Account menu state (3 chấm)
  const [showMenu, setShowMenu] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  
  // Edit Unrealized Gain state
  const [editUnrealizedGain, setEditUnrealizedGain] = useState(null);
  
  // Manual Reference Amount state (user's own record from bank statement)
  const [showEditManualRef, setShowEditManualRef] = useState(false);
  const [manualRefAmount, setManualRefAmount] = useState('');
  const [manualRefDate, setManualRefDate] = useState('');
  
  // Loan notice modal state
  const [loanNoticeModal, setLoanNoticeModal] = useState({ show: false, loanName: '' });
  
  // Filter uncleared transactions during reconcile
  const [showUnclearedOnly, setShowUnclearedOnly] = useState(false);
  
  // Display limit for performance
  const [displayLimit, setDisplayLimit] = useState(100);

  // Smart back handler - close menu/modals first
  const handleBackPress = useCallback(() => {
    if (loanNoticeModal.show) {
      setLoanNoticeModal({ show: false, loanName: '' });
    } else if (showMenu) {
      setShowMenu(false);
    } else if (showEditAccountModal) {
      setShowEditAccountModal(false);
    } else if (showArchiveModal) {
      setShowArchiveModal(false);
    } else if (showDeleteAccountModal) {
      setShowDeleteAccountModal(false);
    } else if (showEditManualRef) {
      setShowEditManualRef(false);
    } else if (isReconciling) {
      setIsReconciling(false);
    } else if (showManualReconcile) {
      setShowManualReconcile(false);
    } else if (showDeleteConfirm) {
      setShowDeleteConfirm(false);
    } else if (isSelectMode) {
      setIsSelectMode(false);
      setSelectedItems(new Set());
    } else {
      onClose();
    }
  }, [loanNoticeModal.show, showMenu, showEditAccountModal, showArchiveModal, showDeleteAccountModal, showEditManualRef, isReconciling, showManualReconcile, showDeleteConfirm, isSelectMode, onClose]);

  useBackHandler(!!account, handleBackPress);

  if (!account) return null;

  // Handler để mở Add Transaction với account prefilled
  const handleAddTransaction = () => {
    setPrefilledAccount(account.name);
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const accountTransactions = useMemo(() => {
    const result = [];
    
    transactions.forEach(t => {
      // Normal filter logic
      if (t.type === 'transfer') {
        if (t.fromAccount === account.name || t.toAccount === account.name) {
          result.push(t);
        }
      } else if (t.type === 'split') {
        // Include if main account matches
        if (t.account === account.name) {
          result.push(t);
        }
        // Also check if any split has this account as transferAccount
        // Create virtual transactions for these
        if (t.splits && Array.isArray(t.splits)) {
          t.splits.forEach((s, idx) => {
            if (s.isTransfer && s.transferAccount === account.name) {
              // Create a virtual transaction entry for display
              result.push({
                ...t,
                id: `${t.id}-split-transfer-${idx}`,
                _isSplitTransfer: true,
                _splitIndex: idx,
                _splitAmount: s.amount,
                _splitMemo: s.memo,
                _splitCategory: s.category,
                _parentSplitType: t.splitType,
                _parentAccount: t.account,
                _realId: t.id
              });
            }
          });
        }
      } else {
        if (t.account === account.name) {
          result.push(t);
        }
      }
    });
    
    return result.sort((a, b) => {
      // Sort by date first (newest first)
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) return dateCompare;
      // Within same date, sort by createdAt (newest first)
      const aTime = a.createdAt?.seconds || a.createdAt?.getTime?.() / 1000 || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.getTime?.() / 1000 || 0;
      return bTime - aTime;
    });
  }, [account, transactions]);

  // Filtered transactions for display (when showUnclearedOnly is true)
  const displayTransactions = useMemo(() => {
    if (!showUnclearedOnly) return accountTransactions;
    return accountTransactions.filter(t => 
      t.clearStatus !== 'cleared' && t.clearStatus !== 'reconciled'
    );
  }, [accountTransactions, showUnclearedOnly]);

  // Apply display limit for performance
  const displayedTransactions = useMemo(() => {
    return displayTransactions.slice(0, displayLimit);
  }, [displayTransactions, displayLimit]);

  const groupedTransactions = useMemo(() => {
    const groups = {};
    displayedTransactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [displayedTransactions]);

  const { balance, clearedBalance, unclearedBalance, unclearedCount } = useMemo(() => {
    // Add starting balance for all accounts (except loan handled separately)
    const startingBalance = account.startingBalance || 0;
    let bal = startingBalance;
    let cleared = startingBalance; // Starting balance is considered cleared
    let uncleared = 0;
    let unclearedTxCount = 0;
    
    accountTransactions.forEach(t => {
      let amt = 0;
      
      // Handle virtual split transfer transactions
      if (t._isSplitTransfer) {
        const splitAmt = Math.abs(Number(t._splitAmount) || 0);
        // For income split: money comes FROM this account (negative)
        // For expense split: money goes TO this account (positive)
        amt = t._parentSplitType === 'income' ? -splitAmt : splitAmt;
      } else if (t.type === 'transfer') {
        amt = t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
      } else if (t.type === 'split') {
        amt = Number(t.totalAmount) || 0;
      } else {
        amt = Number(t.amount) || 0;
      }
      
      bal += amt;
      if (t.clearStatus === 'cleared' || t.clearStatus === 'reconciled') cleared += amt;
      else {
        uncleared += amt;
        unclearedTxCount++;
      }
    });
    return { balance: bal, clearedBalance: cleared, unclearedBalance: uncleared, unclearedCount: unclearedTxCount };
  }, [accountTransactions, account]);

  // Tính Current Value cho investment accounts - cộng tất cả transactions (bao gồm unrealized_gain)
  const calculatedCurrentValue = useMemo(() => {
    if (!['investment','property','vehicle','asset'].includes(account.type)) {
      return balance;
    }
    
    const startingBalance = account.startingBalance || 0;
    
    // Cộng tất cả transactions
    let currentVal = startingBalance;
    accountTransactions.forEach(t => {
      // Handle virtual split transfer transactions
      if (t._isSplitTransfer) {
        const splitAmt = Math.abs(Number(t._splitAmount) || 0);
        currentVal += t._parentSplitType === 'income' ? -splitAmt : splitAmt;
      } else if (t.type === 'transfer') {
        currentVal += t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
      } else if (t.type === 'split') {
        currentVal += Number(t.totalAmount) || 0;
      } else {
        // Bao gồm unrealized_gain, expense, income...
        currentVal += Number(t.amount) || 0;
      }
    });
    
    return currentVal;
  }, [accountTransactions, account, balance]);

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US').format(Math.abs(amount || 0));
  const formatBalance = (amount) => {
    const num = amount || 0;
    const formatted = new Intl.NumberFormat('en-US').format(Math.abs(num));
    return num < 0 ? `-${formatted}` : formatted;
  };
  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${date.toLocaleDateString('en-US',{weekday:'short'})}`;
  };
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
  const formatNumberInput = (value) => value ? new Intl.NumberFormat('en-US').format(value.replace(/,/g,'')) : '';

  // Reset display limit when filter changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [showUnclearedOnly]);

  const handleBalanceChange = (e) => {
    const value = e.target.value.replace(/,/g, '');
    if (!isNaN(value) || value === '') setReconcileBalance(value);
  };

  // Multi-select functions
  const handleLongPress = (itemId) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedItems(new Set([itemId]));
      if (navigator.vibrate) navigator.vibrate(50);
    }
  };

  const handleSelectItem = (itemId) => {
    if (!isSelectMode) return;
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set(accountTransactions.map(t => t.id));
    setSelectedItems(allIds);
  };

  const handleDeleteSelected = async () => {
  if (selectedItems.size === 0) return;
  try {
    const batch = writeBatch(db);
    selectedItems.forEach(id => {
      if (!id.includes('-split-')) {
        batch.delete(doc(db, 'transactions', id));
      }
    });
    await batch.commit();
    
    // Check nếu xóa hết transactions → close detail
    const remainingTransactions = loan.transactions.filter(t => !selectedItems.has(t.id));
    if (remainingTransactions.length === 0) {
      toast.success('All transactions deleted. Loan removed.');
      onClose(); // Đóng LoanDetail
    } else {
      setSuccessMessage(`Deleted ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
      setShowDeleteConfirm(false);
    }
  } catch (err) { 
    toast.error('Error: ' + err.message); 
  }
};

  const handleDuplicateSelected = async () => {
    if (selectedItems.size === 0) return;
    try {
      const selectedTransactions = accountTransactions.filter(t => selectedItems.has(t.id));
      
      for (const t of selectedTransactions) {
        const { id, ...transactionData } = t;
        await addDoc(collection(db, 'transactions'), {
          ...transactionData,
          createdAt: new Date()
        });
      }
      
      setSuccessMessage(`Duplicated ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
    } catch (err) { 
      toast.error('Error: ' + err.message); 
    }
  };

  const handleToggleClear = async (t, e) => {
    e.stopPropagation();
    if (t.clearStatus === 'reconciled') { toast.warning('🔒 Locked'); return; }
    try {
      const realId = t._realId || t.id;  // Use real ID for virtual transactions
      const newStatus = t.clearStatus === 'cleared' ? 'uncleared' : 'cleared';
      await updateDoc(doc(db, 'transactions', realId), { clearStatus: newStatus });
      
      // Auto turn off filter when all uncleared are cleared
      if (showUnclearedOnly && newStatus === 'cleared') {
        // Check if this was the last uncleared transaction
        const remainingUncleared = accountTransactions.filter(tx => 
          tx.id !== t.id && tx.clearStatus !== 'cleared' && tx.clearStatus !== 'reconciled'
        );
        if (remainingUncleared.length === 0) {
          setShowUnclearedOnly(false);
        }
      }
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleToggleValueClear = async (entryIndex, currentStatus, e) => {
    e.stopPropagation();
    if (currentStatus === 'reconciled') { toast.warning('🔒 Locked'); return; }
    if (entryIndex === -1 || !account.valueHistory) return;
    
    try {
      const newHistory = [...account.valueHistory];
      newHistory[entryIndex] = {
        ...newHistory[entryIndex],
        clearStatus: currentStatus === 'cleared' ? 'uncleared' : 'cleared'
      };
      await updateDoc(doc(db, 'accounts', account.id), { valueHistory: newHistory });
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  // Quick Reconcile - khi user confirm cleared balance đúng
  const handleQuickReconcile = async () => {
    const clearedTrans = accountTransactions.filter(t => t.clearStatus === 'cleared');
    const clearedValueUpdates = account.valueHistory?.filter(v => v.clearStatus === 'cleared') || [];
    
    if (clearedTrans.length === 0 && clearedValueUpdates.length === 0) { 
      setSuccessMessage('No cleared items to reconcile');
      setIsReconciling(false);
      return; 
    }
    
    try {
      const batch = writeBatch(db);
      const timestamp = new Date();
      clearedTrans.forEach(t => batch.update(doc(db, 'transactions', t.id), { clearStatus: 'reconciled', reconciledAt: timestamp }));
      
      if (clearedValueUpdates.length > 0 && account.valueHistory) {
        const newHistory = account.valueHistory.map(v => 
          v.clearStatus === 'cleared' 
            ? { ...v, clearStatus: 'reconciled', reconciledAt: timestamp.getTime() }
            : v
        );
        batch.update(doc(db, 'accounts', account.id), { 
          lastReconcileDate: timestamp, 
          lastReconcileBalance: clearedBalance,
          valueHistory: newHistory
        });
      } else {
        batch.update(doc(db, 'accounts', account.id), { lastReconcileDate: timestamp, lastReconcileBalance: clearedBalance });
      }
      
      await batch.commit();
      setIsReconciling(false);
      setSuccessMessage('Reconciled successfully!');
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleFinishReconcile = async (forceReconcile = false) => {
    const targetBalance = parseFloat(reconcileBalance.replace(/,/g, ''));
    if (isNaN(targetBalance)) { toast.error('Enter valid balance'); return; }
    const clearedTrans = accountTransactions.filter(t => t.clearStatus === 'cleared');
    const clearedValueUpdates = account.valueHistory?.filter(v => v.clearStatus === 'cleared') || [];
    if (clearedTrans.length === 0 && clearedValueUpdates.length === 0) { toast.warning('No cleared items'); return; }
    
    // Tính cleared balance
    let clearedTotal = 0;
    if (isMarketValue) {
      const clearedEvents = [];
      clearedTrans.forEach(t => {
        let amt = 0;
        if (t.type === 'transfer') {
          amt = t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
        } else {
          amt = Number(t.amount) || 0;
        }
        const ts = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : new Date(t.date).getTime();
        clearedEvents.push({ type: 'transaction', amount: amt, timestamp: ts });
      });
      clearedValueUpdates.forEach(v => {
        clearedEvents.push({ type: 'valueUpdate', value: v.value, timestamp: v.timestamp });
      });
      clearedEvents.sort((a, b) => a.timestamp - b.timestamp);
      clearedEvents.forEach(e => {
        if (e.type === 'valueUpdate') clearedTotal = e.value;
        else clearedTotal += e.amount;
      });
    } else {
      // Non-investment: tính tổng cleared transactions
      clearedTrans.forEach(t => {
        let amt = 0;
        if (t.type === 'transfer') {
          amt = t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
        } else {
          amt = Number(t.amount) || 0;
        }
        clearedTotal += amt;
      });
    }
    
    // Cảnh báo nếu không khớp
    const diff = targetBalance - clearedTotal;
    if (Math.abs(diff) > 0 && !forceReconcile) {
      setReconcileWarning({ clearedTotal, targetBalance, diff });
      return;
    }
    
    try {
      const batch = writeBatch(db);
      const timestamp = new Date();
      clearedTrans.forEach(t => batch.update(doc(db, 'transactions', t.id), { clearStatus: 'reconciled', reconciledAt: timestamp }));
      
      if (clearedValueUpdates.length > 0 && account.valueHistory) {
        const newHistory = account.valueHistory.map(v => 
          v.clearStatus === 'cleared' 
            ? { ...v, clearStatus: 'reconciled', reconciledAt: timestamp.getTime() }
            : v
        );
        batch.update(doc(db, 'accounts', account.id), { 
          lastReconcileDate: timestamp, 
          lastReconcileBalance: targetBalance,
          valueHistory: newHistory
        });
      } else {
        batch.update(doc(db, 'accounts', account.id), { lastReconcileDate: timestamp, lastReconcileBalance: targetBalance });
      }
      
      await batch.commit();
      setIsReconciling(false);
      setShowManualReconcile(false);
      setReconcileWarning(null);
      setReconcileBalance('');
      setSuccessMessage('Reconciled successfully!');
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleUnreconcile = async () => {
    if (!account.lastReconcileDate) { toast.warning('Nothing to undo'); return; }
    const lastTime = account.lastReconcileDate.seconds * 1000;
    const toUnlock = accountTransactions.filter(t => t.clearStatus === 'reconciled' && t.reconciledAt && Math.abs(t.reconciledAt.seconds * 1000 - lastTime) < 5000);
    if (toUnlock.length === 0) { toast.warning('Nothing to unlock'); return; }
    
    const confirmed = await toast.confirm({
      title: 'Undo Reconcile',
      message: `Unlock ${toUnlock.length} transaction(s)?`,
      confirmText: 'Unlock',
      type: 'warning'
    });
    
    if (!confirmed) return;
    
    try {
      const batch = writeBatch(db);
      toUnlock.forEach(t => batch.update(doc(db, 'transactions', t.id), { clearStatus: 'cleared', reconciledAt: null }));
      batch.update(doc(db, 'accounts', account.id), { lastReconcileDate: null, lastReconcileBalance: null });
      await batch.commit();
      toast.success('Unlocked successfully!');
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const getClearIcon = (s) => s === 'reconciled' ? '🔒' : s === 'cleared' ? '✓' : '○';
  const getClearColor = (s) => s === 'reconciled' ? 'text-gray-400' : s === 'cleared' ? 'text-emerald-600' : 'text-gray-300';

  // Save Manual Reference Amount (user's own record)
  const handleSaveManualRef = async () => {
    if (manualRefAmount === '' || manualRefAmount === null || manualRefAmount === undefined) return;
    
    try {
      const amount = parseFloat(manualRefAmount.replace(/,/g, '')) || 0;
      // Save full timestamp (date + time) for when statement was entered
      await updateDoc(doc(db, 'accounts', account.id), {
        manualReconcileAmount: amount,
        manualReconcileDate: new Date().toISOString()
      });
      
      toast.success('Manual reference saved!');
      setShowEditManualRef(false);
      setManualRefAmount('');
      setManualRefDate('');
      
      if (onAccountUpdated) onAccountUpdated();
    } catch (error) {
      toast.error('Error: ' + error.message);
    }
  };

  // Open edit manual ref with current values
  const openEditManualRef = () => {
    // Handle 0 value properly - convert to string even if 0
    const currentAmount = account.manualReconcileAmount;
    setManualRefAmount(currentAmount !== undefined && currentAmount !== null ? String(currentAmount) : '');
    setManualRefDate(account.manualReconcileDate || new Date().toISOString().split('T')[0]);
    setShowEditManualRef(true);
  };
  const isMarketValue = ['investment','property','vehicle','asset'].includes(account.type);
  const SplitIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 inline-block mr-1"><path d="M12 22v-10"/><path d="M12 12C12 8 8 5 4 3"/><path d="M12 12C12 8 16 5 20 3"/><polyline points="6 6 4 3 1 5"/><polyline points="18 6 20 3 23 5"/></svg>);

  // Long press handler
  let longPressTimer = null;
  const handleTouchStart = (itemId) => {
    longPressTimer = setTimeout(() => handleLongPress(itemId), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 overflow-y-auto no-pull-refresh">
      {/* Header - changes based on select mode */}
      {isSelectMode ? (
        <div className="bg-indigo-600 p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
          <button onClick={() => { setIsSelectMode(false); setSelectedItems(new Set()); }} className="text-white text-lg p-2 -ml-2">✕</button>
          <div className="font-bold text-lg text-white">{selectedItems.size} selected</div>
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="text-white text-sm px-3 py-1 bg-white/20 rounded-lg">All</button>
            <button onClick={handleDuplicateSelected} className="text-white text-sm px-3 py-1 bg-emerald-500 rounded-lg">📋</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="text-white text-sm px-3 py-1 bg-red-500 rounded-lg">🗑️</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 shadow-sm flex items-center justify-between">
          <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
          <div className="font-bold text-lg flex items-center gap-2"><span>{account.icon}</span><span>{account.name}</span></div>
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className="text-gray-600 text-xl p-2 hover:bg-gray-100 rounded-lg"
            >
              ⋮
            </button>
            {showMenu && (
              <>
                {/* Backdrop để đóng menu khi click outside */}
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 min-w-[140px] z-50">
                  <button 
                    onClick={() => { setShowMenu(false); setShowEditAccountModal(true); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    onClick={() => { setShowMenu(false); setShowArchiveModal(true); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    📦 Archive
                  </button>
                  <button 
                    onClick={() => { setShowMenu(false); setShowDeleteAccountModal(true); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="p-4 bg-emerald-600 text-white shadow-sm">
        <div className="text-center">
          <div className="text-sm opacity-90">{isMarketValue ? 'Current Value' : 'Balance'}</div>
          <div className="text-3xl font-bold mt-1">{(isMarketValue ? calculatedCurrentValue : balance) >= 0 ? '+' : '-'}{formatCurrency(isMarketValue ? calculatedCurrentValue : balance)}</div>
        </div>
        
        {/* Investment account: show Update button only */}
        {isMarketValue && (
          <>
            <div className="mt-3 flex justify-center gap-2">
              <button 
                onClick={() => setIsUpdateValueOpen(true)} 
                className="bg-white/20 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-white/30 transition-colors"
              >
                📊 Update Value
              </button>
              {!isReconciling && (
                <button onClick={() => { setShowUnclearedOnly(false); setIsReconciling(true); }} className="bg-white/20 px-4 py-2 rounded-lg text-sm font-medium">Reconcile</button>
              )}
              {account.lastReconcileDate && !isReconciling && (
                <button onClick={handleUnreconcile} className="bg-white/10 px-4 py-2 rounded-lg text-sm font-medium">🔓 Undo</button>
              )}
            </div>
          </>
        )}
        
        {!isMarketValue && (
          <>
            <div className="flex justify-center gap-6 mt-3 pt-3 border-t border-white/20 text-sm">
              <div className="text-center"><div className="opacity-70">Cleared</div><div className="font-medium">{clearedBalance >= 0 ? '+' : '-'}{formatCurrency(clearedBalance)}</div></div>
              <div className="text-center"><div className="opacity-70">Uncleared</div><div className="font-medium">{unclearedBalance >= 0 ? '+' : '-'}{formatCurrency(unclearedBalance)}</div></div>
            </div>
            <div className="text-xs opacity-70 mt-2 text-center">
              {displayTransactions.length} transactions{showUnclearedOnly && ' (uncleared only)'}
            </div>
          </>
        )}
        {!isMarketValue && !isReconciling && (
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => { setShowUnclearedOnly(false); setIsReconciling(true); }} className="bg-white/20 px-4 py-2 rounded-lg text-sm font-medium">Reconcile</button>
            {account.lastReconcileDate && <button onClick={handleUnreconcile} className="bg-white/10 px-4 py-2 rounded-lg text-sm font-medium">🔓 Undo Last</button>}
          </div>
        )}
      </div>

      {/* Memo Info Card - only show if memo exists */}
      {account.memo && (
        <div className="mx-4 mt-3 p-3 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-start gap-2">
            <span className="text-gray-400">📝</span>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{account.memo}</div>
          </div>
        </div>
      )}

      {/* Manual Reference Card - User's own record from bank statement */}
      <div className="mx-4 mt-3 p-3 bg-white rounded-lg shadow-sm border border-emerald-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">🏦</span>
            <span className="text-sm font-medium text-gray-700">My Bank Statement</span>
          </div>
          <button 
            onClick={openEditManualRef}
            className="text-emerald-500 text-sm font-medium hover:underline"
          >
            {account.manualReconcileAmount !== undefined && account.manualReconcileAmount !== null ? 'Edit' : '+ Add'}
          </button>
        </div>
        
        {account.manualReconcileAmount !== undefined && account.manualReconcileAmount !== null ? (
          <div className="mt-2 pl-6">
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-bold ${Number(account.manualReconcileAmount) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {Number(account.manualReconcileAmount) >= 0 ? '+' : ''}{formatCurrency(account.manualReconcileAmount)}
              </span>
              <span className="text-sm text-gray-400">
                {formatDateTimeForDisplay(account.manualReconcileDate)}
              </span>
            </div>
            
            {/* Compare with system balance */}
            {(() => {
              const diff = clearedBalance - Number(account.manualReconcileAmount);
              if (Math.abs(diff) < 1) return (
                <div className="text-xs text-emerald-600 mt-1">✅ Matches system cleared balance</div>
              );
              return (
                <div className="text-xs text-amber-600 mt-1">
                  ⚠️ Difference: {diff >= 0 ? '+' : ''}{formatCurrency(diff)} from system
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="mt-2 pl-6 text-xs text-gray-400">
            Add your bank statement balance for reference
          </div>
        )}
      </div>

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
              
              {/* Amount Input - FIRST */}
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
                  <span className="font-medium">{clearedBalance >= 0 ? '+' : ''}{formatCurrency(clearedBalance)}</span>
                </div>
                {manualRefAmount && (
                  <div className="flex justify-between mt-1 pt-1 border-t">
                    <span className="text-gray-500">Difference:</span>
                    <span className={`font-medium ${Math.abs(clearedBalance - parseFloat(manualRefAmount.replace(/,/g, '') || 0)) < 1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {(() => {
                        const diff = clearedBalance - parseFloat(manualRefAmount.replace(/,/g, '') || 0);
                        return `${diff >= 0 ? '+' : ''}${formatCurrency(diff)}`;
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
                  disabled={manualRefAmount === '' || manualRefAmount === null || manualRefAmount === undefined}
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReconciling && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="font-bold text-lg">Reconcile Account</div>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Balance Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Cleared Balance</span>
                  <span className={`font-bold ${clearedBalance >= 0 ? 'text-emerald-600' : 'text-gray-800'}`}>{clearedBalance < 0 ? '-' : ''}{formatCurrency(clearedBalance)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">+ Uncleared Balance</span>
                  <span className={`font-bold ${unclearedBalance >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                    {unclearedBalance < 0 ? '-' : '+'}{formatCurrency(unclearedBalance)}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-gray-700 font-medium">Working Balance</span>
                  <span className="font-bold text-lg">{balance < 0 ? '-' : ''}{formatCurrency(balance)}</span>
                </div>
              </div>

              {/* Uncleared Warning */}
              {unclearedBalance !== 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500">⚠️</span>
                    <div className="text-sm text-amber-700">
                      You have {unclearedCount} uncleared transaction{unclearedCount > 1 ? 's' : ''}. Clear them first or they will remain uncleared after reconciliation.
                      <button 
                        onClick={() => { setShowUnclearedOnly(true); setIsReconciling(false); }}
                        className="block mt-2 text-emerald-600 font-bold hover:underline"
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
                <div className="text-3xl font-bold text-gray-800 my-2">{clearedBalance < 0 ? '-' : ''}{formatCurrency(clearedBalance)}?</div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsReconciling(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  No
                </button>
                <button 
                  onClick={() => handleQuickReconcile()} 
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
                >
                  Yes
                </button>
              </div>

              {/* Enter Different Amount Link */}
              <button 
                onClick={() => { setIsReconciling(false); setShowManualReconcile(true); }}
                className="w-full text-emerald-500 text-sm hover:underline"
              >
                No, enter the correct balance →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Reconcile Modal */}
      {showManualReconcile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="font-bold text-lg">Enter Statement Balance</div>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="text-center text-gray-600 text-sm">
                What is your actual account balance according to your bank statement?
              </div>
              
              <input 
                type="text" 
                inputMode="numeric" 
                placeholder="Enter balance..." 
                value={formatNumberInput(reconcileBalance)} 
                onChange={handleBalanceChange} 
                className="w-full text-2xl font-bold text-center p-4 border-2 border-emerald-200 rounded-lg focus:border-emerald-500 outline-none" 
                 
              />
              
              <div className="flex gap-2">
                <button 
                  onClick={() => { setShowManualReconcile(false); setReconcileBalance(''); }} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleFinishReconcile()} 
                  disabled={!reconcileBalance}
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  Reconcile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4 pb-20">
        {/* Uncleared Filter Banner */}
        {showUnclearedOnly && (
          <div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
            <div className="text-sm text-amber-800 text-center">
              <span className="font-medium">Showing {unclearedCount} uncleared transaction{unclearedCount > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
        {(() => {
          // Gộp transactions thành 1 list (bỏ valueHistory vì đã có unrealized_gain transactions)
          const allItems = [];
          
          // Check if all transactions are loaded (no more remaining)
          const allTransactionsLoaded = displayLimit >= displayTransactions.length;
          
          // Thêm transactions (use displayedTransactions for limited view)
          displayedTransactions.forEach(t => {
            // Lấy timestamp từ createdAt nếu có, fallback về date
            let ts;
            if (t.createdAt?.seconds) {
              ts = t.createdAt.seconds * 1000;
            } else if (t.createdAt) {
              ts = new Date(t.createdAt).getTime();
            } else {
              ts = new Date(t.date).getTime();
            }
            
            allItems.push({
              type: 'transaction',
              data: t,
              timestamp: ts,
              date: t.date
            });
          });
          
          // Thêm Starting Balance CHỈ KHI tất cả transactions đã được load
          // (để Starting Balance hiển thị đúng vị trí cuối cùng - là transaction cũ nhất)
          if (allTransactionsLoaded && !showUnclearedOnly && account.type !== 'loan' && (account.startingBalance || 0) !== 0) {
            // Ưu tiên startingBalanceDate, fallback về createdAt
            let sbDate;
            if (account.startingBalanceDate) {
              sbDate = account.startingBalanceDate.seconds 
                ? new Date(account.startingBalanceDate.seconds * 1000) 
                : new Date(account.startingBalanceDate);
            } else if (account.createdAt) {
              sbDate = account.createdAt.seconds 
                ? new Date(account.createdAt.seconds * 1000) 
                : new Date(account.createdAt);
            } else {
              sbDate = new Date();
            }
            const dateStr = sbDate.toISOString().split('T')[0];
            allItems.push({
              type: 'startingBalance',
              data: { 
                amount: account.startingBalance,
                date: dateStr
              },
              timestamp: sbDate.getTime(),
              date: dateStr
            });
          }
          
          // Sắp xếp theo timestamp mới nhất trước
          allItems.sort((a, b) => b.timestamp - a.timestamp);
          
          // Tính running balance cho investment accounts (từ cũ đến mới)
          let runningBalances = {};
          if (isMarketValue) {
            const sortedAsc = [...allItems].sort((a, b) => a.timestamp - b.timestamp);
            let balance = 0;
            sortedAsc.forEach(item => {
              if (item.type === 'startingBalance') {
                balance = item.data.amount || 0;
              } else if (item.type === 'transaction') {
                const t = item.data;
                if (t._isSplitTransfer) {
                  const splitAmt = Math.abs(Number(t._splitAmount) || 0);
                  balance += t._parentSplitType === 'income' ? -splitAmt : splitAmt;
                } else if (t.type === 'unrealized_gain') {
                  balance += Number(t.amount) || 0;
                } else if (t.type === 'transfer') {
                  balance += t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
                } else {
                  balance += Number(t.amount) || 0;
                }
              }
              runningBalances[item.timestamp] = balance;
            });
          }
          
          if (allItems.length === 0) {
            return <div className="text-center text-gray-400 mt-10">No transactions</div>;
          }
          
          // Group by date
          const grouped = {};
          allItems.forEach(item => {
            if (!grouped[item.date]) grouped[item.date] = [];
            grouped[item.date].push(item);
          });
          
          // Sort items within each group by timestamp (newest first)
          Object.keys(grouped).forEach(date => {
            grouped[date].sort((a, b) => b.timestamp - a.timestamp);
          });
          
          return Object.entries(grouped)
            .sort(([dateA], [dateB]) => (dateB || '').localeCompare(dateA || ''))
            .map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">{formatDateLabel(date)}</div>
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden divide-y divide-gray-50">
                {items.map((item, index) => {
                  if (item.type === 'startingBalance') {
                    const balanceAtTime = isMarketValue ? runningBalances[item.timestamp] : null;
                    return (
                      <div 
                        key="starting-balance" 
                        className="p-3 flex justify-between items-center bg-emerald-50/50 cursor-pointer hover:bg-emerald-100/50 active:bg-emerald-100"
                        onClick={() => {
                          const currentValue = account.startingBalance || 0;
                          setEditStartingBalanceValue(String(currentValue));
                          setEditStartingBalanceDisplay(currentValue ? Number(currentValue).toLocaleString('en-US') : '');
                          // Set date từ account.startingBalanceDate hoặc createdAt
                          const sbDate = account.startingBalanceDate 
                            ? (account.startingBalanceDate.seconds 
                                ? new Date(account.startingBalanceDate.seconds * 1000) 
                                : new Date(account.startingBalanceDate))
                            : (account.createdAt?.seconds 
                                ? new Date(account.createdAt.seconds * 1000) 
                                : new Date(account.createdAt));
                          setEditStartingBalanceDate(sbDate.toISOString().split('T')[0]);
                          setIsEditStartingBalanceOpen(true);
                        }}
                      >
                        <div className="font-medium text-emerald-700">💵 Starting Balance</div>
                        <div className="text-right">
                          <div className="font-bold text-emerald-600">+{formatCurrency(item.data.amount)}</div>
                          {isMarketValue && balanceAtTime !== null && (
                            <div className="text-xs text-gray-400">{formatBalance(balanceAtTime)}</div>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    const t = item.data;
                    const isTransfer = t.type === 'transfer';
                    const isSplit = t.type === 'split';
                    const isLoan = t.type === 'loan';
                    const isUnrealizedGain = t.type === 'unrealized_gain';
                    const isSplitTransfer = t._isSplitTransfer;
                    const isOutgoing = isTransfer && t.fromAccount === account.name;
                    
                    // Calculate display amount
                    let displayAmount;
                    if (isSplitTransfer) {
                      const splitAmt = Math.abs(Number(t._splitAmount) || 0);
                      displayAmount = t._parentSplitType === 'income' ? -splitAmt : splitAmt;
                    } else if (isTransfer) {
                      displayAmount = isOutgoing ? -Number(t.amount) : Number(t.amount);
                    } else if (isSplit) {
                      displayAmount = Number(t.totalAmount) || 0;
                    } else {
                      displayAmount = Number(t.amount) || 0;
                    }
                    
                    const isPositive = displayAmount > 0;
                    const isSelected = selectedItems.has(t._realId || t.id);
                    const balanceAtTime = isMarketValue ? runningBalances[item.timestamp] : null;
                    
                    // Get time string from createdAt
                    const getTimeStr = () => {
                      if (t.createdAt?.seconds) {
                        const d = new Date(t.createdAt.seconds * 1000);
                        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                      } else if (t.createdAt) {
                        const d = new Date(t.createdAt);
                        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                      }
                      return '';
                    };
                    
                    // Special rendering for Unrealized Gain
                    if (isUnrealizedGain) {
                      const timeStr = getTimeStr();
                      return (
                        <div 
                          key={t.id} 
                          onClick={(e) => {
                            // Ignore if clicking on clear button
                            if (e.target.closest('.clear-btn')) return;
                            if (isSelectMode) {
                              handleSelectItem(t.id);
                            } else {
                              setEditUnrealizedGain(t);
                            }
                          }} 
                          onTouchStart={() => handleTouchStart(t.id)}
                          onTouchEnd={handleTouchEnd}
                          onTouchMove={handleTouchEnd}
                          onContextMenu={(e) => { e.preventDefault(); handleLongPress(t.id); }}
                          className={`p-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${isSelected ? 'bg-indigo-50' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            {isSelectMode && (
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                                {isSelected && <span className="text-white text-sm">✓</span>}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-800 truncate flex items-center">
                                📈 Unrealized {isPositive ? 'Gain' : 'Loss'}
                              </div>
                              <div className="text-xs text-gray-400">{timeStr}</div>
                            </div>
                            <div className="text-right">
                              <div className={`font-bold whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                {isPositive ? '+' : '-'}{formatCurrency(displayAmount)}
                              </div>
                              {balanceAtTime !== null && (
                                <div className="text-xs text-gray-400">{formatBalance(balanceAtTime)}</div>
                              )}
                            </div>
                            {!isSelectMode && (
                              <button 
                                onClick={(e) => handleToggleClear(t, e)} 
                                className={`clear-btn text-xl w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-200 ${getClearColor(t.clearStatus)}`}
                              >
                                {getClearIcon(t.clearStatus)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        key={t.id} 
                        onClick={(e) => {
                          // Ignore if clicking on clear button
                          if (e.target.closest('.clear-btn')) return;
                          
                          if (isSelectMode) {
                            handleSelectItem(t._realId || t.id);
                          } else {
                            // Show notice for loan transactions
                            if (t.type === 'loan') {
                              setLoanNoticeModal({ show: true, loanName: t.loan || 'Loan' });
                              return;
                            }
                            setEditingTransaction(t);
                            setIsModalOpen(true);
                          }
                        }} 
                        onTouchStart={() => handleTouchStart(t._realId || t.id)}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                        onContextMenu={(e) => { e.preventDefault(); handleLongPress(t._realId || t.id); }}
                        className={`p-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${isSelected ? 'bg-indigo-50' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelectMode && (
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                              {isSelected && <span className="text-white text-sm">✓</span>}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-800 truncate flex items-center gap-1.5">
                              {isSplit && !isSplitTransfer && <SplitIcon />}
                              {isSplitTransfer && <span>🔀</span>}
                              {isLoan && <span className="text-amber-500">💰</span>}
                              {isSplitTransfer 
                                ? `Transfer ${t._parentSplitType === 'income' ? 'to' : 'from'} ${t._parentAccount}`
                                : isLoan ? (t.memo || 'Loan transaction') 
                                : isTransfer ? `Transfer ${isOutgoing ? 'to' : 'from'} ${isOutgoing ? (t.toAccount || 'Unknown') : (t.fromAccount || 'Unknown')}` 
                                : (t.payee || 'No Payee')}
                              {isLoan && <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded ml-1">Loan</span>}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {isSplit && !isSplitTransfer
                                ? (t.memo || '')
                                : isSplitTransfer
                                  ? '' 
                                  : isLoan ? t.loan 
                                  : isTransfer ? 'Transfer' 
                                  : t.category}
                              {t.memo && !isLoan && !isSplitTransfer && !isSplit && <span className="text-gray-400"> • {t.memo}</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bold whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>{isPositive ? '+' : '-'}{formatCurrency(displayAmount)}</div>
                            {isMarketValue && balanceAtTime !== null && (
                              <div className="text-xs text-gray-400">{formatBalance(balanceAtTime)}</div>
                            )}
                            {/* Tags display */}
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
                          {!isSelectMode && (
                            <button 
                              onClick={(e) => handleToggleClear(t, e)} 
                              className={`clear-btn text-xl w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-200 ${getClearColor(t.clearStatus)}`}
                            >
                              {getClearIcon(t.clearStatus)}
                            </button>
                          )}
                        </div>
                        {isSplit && t.splits && (
                          <div className="mt-2 space-y-1 pl-4 border-l-2 border-sky-200 ml-1">
                            {t.splits.map((s, i) => {
                              // Check if this split is related to current account
                              // For split transfers, only the split going to/from current account is related
                              // For regular splits, check if this split item involves current account
                              const isRelatedToAccount = s.isTransfer 
                                ? (t.account === account.name || s.transferAccount === account.name)
                                : true; // Non-transfer splits are always related
                              
                              return (
                                <div key={i} className="flex justify-between text-sm">
                                  <span className="text-gray-600">
                                    {!isRelatedToAccount && <span className="text-gray-400 mr-1">⊗</span>}
                                    {s.isTransfer 
                                      ? (t.splitType === 'income' || t.type === 'income')
                                        ? `Transfer: ${s.transferAccount} → ${t.account}`
                                        : `Transfer: ${t.account} → ${s.transferAccount}`
                                      : s.isLoan 
                                        ? s.loan 
                                        : s.category}
                                    {s.memo && <span className="text-gray-400"> • {s.memo}</span>}
                                  </span>
                                  <span className="text-gray-700 font-medium">{formatCurrency(s.amount)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Show More Button (for already loaded transactions) */}
      {displayLimit < displayTransactions.length && (
        <div className="p-4 text-center">
          <button
            onClick={() => setDisplayLimit(prev => prev + 100)}
            className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-lg font-medium hover:bg-emerald-200"
          >
            Show More ({displayTransactions.length - displayLimit} remaining)
          </button>
        </div>
      )}

      {/* FAB Add Transaction Button */}
      {!isSelectMode && (
        <button
          onClick={handleAddTransaction}
          className="fixed bottom-24 right-4 bg-emerald-500 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-4xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
        >
          +
        </button>
      )}

      <AddTransactionModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingTransaction(null); setPrefilledAccount(null); }} 
        onSave={() => { setIsModalOpen(false); setEditingTransaction(null); setPrefilledAccount(null); }} 
        editTransaction={editingTransaction}
        prefilledAccount={prefilledAccount}
      />
      
      <UpdateValueModal 
        isOpen={isUpdateValueOpen} 
        onClose={() => setIsUpdateValueOpen(false)} 
        onSave={() => {
          setIsUpdateValueOpen(false);
          if (onAccountUpdated) onAccountUpdated();
        }} 
        account={account}
        currentValue={calculatedCurrentValue}
      />

      {/* Reconcile Warning Modal */}
      {reconcileWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-3xl mb-1">⚠️</div>
              <div className="font-bold text-lg">Balance Mismatch</div>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cleared Balance:</span>
                  <span className="font-bold">{formatCurrency(reconcileWarning.clearedTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Statement Balance:</span>
                  <span className="font-bold">{formatCurrency(reconcileWarning.targetBalance)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-gray-500">Difference:</span>
                  <span className={`font-bold ${reconcileWarning.diff > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {reconcileWarning.diff > 0 ? '+' : ''}{formatCurrency(reconcileWarning.diff)}
                  </span>
                </div>
              </div>
              
              <p className="text-gray-600 text-sm text-center">
                {reconcileWarning.diff > 0 
                  ? 'Statement shows more than cleared items.' 
                  : 'Cleared items exceed statement balance.'}
              </p>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setReconcileWarning(null)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleFinishReconcile(true)} 
                  className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-medium hover:bg-amber-600 transition-colors"
                >
                  Reconcile Anyway
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

      {/* Edit Starting Balance Modal */}
      <EditStartingBalanceModal
        isOpen={isEditStartingBalanceOpen}
        onClose={() => setIsEditStartingBalanceOpen(false)}
        account={account}
        onSave={onAccountUpdated}
      />

      {/* Edit Account Modal */}
      <AddAccountModal
        isOpen={showEditAccountModal}
        onClose={() => setShowEditAccountModal(false)}
        onSave={() => {
          setShowEditAccountModal(false);
          if (onAccountUpdated) onAccountUpdated();
        }}
        editAccount={account}
      />

      {/* Archive Account Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">📦</div>
              <div className="font-bold text-lg">Archive Account</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Archive <span className="font-bold">{account.name}</span>?
                <br/><span className="text-gray-500 text-sm">It will be hidden but can be restored later.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowArchiveModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'accounts', account.id), { isActive: false });
                      setShowArchiveModal(false);
                      toast.success('Account archived!');
                      onClose();
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-medium"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-red-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">🗑️</div>
              <div className="font-bold text-lg">Delete Account</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Delete <span className="font-bold">{account.name}</span>?
                <br/><span className="text-red-500 text-sm">This cannot be undone!</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowDeleteAccountModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await deleteDoc(doc(db, 'accounts', account.id));
                      setShowDeleteAccountModal(false);
                      toast.success('Account deleted!');
                      onClose();
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Unrealized Gain Modal */}
      <EditUnrealizedGainModal
        isOpen={!!editUnrealizedGain}
        onClose={() => setEditUnrealizedGain(null)}
        transaction={editUnrealizedGain}
        account={account}
        onSave={onAccountUpdated}
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

export default AccountDetail;