import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { writeBatch, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useData } from '../../contexts/DataContext';
import AddLoanTransactionModal from './AddLoanTransactionModal';
import EditLoanTransactionModal from './EditLoanTransactionModal';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const LoanDetail = ({ loan, onClose, onLoanRenamed }) => {
  const toast = useToast();
  const { splitTransactions, parentTags, getSubTags } = useData();
  
  // Create tag display map for showing "Parent > Sub" format
  const tagDisplayMap = useMemo(() => {
    const map = {};
    
    parentTags.forEach(parent => {
      const subs = getSubTags(parent.id);
      
      if (subs.length > 0) {
        subs.forEach(sub => {
          map[sub.name] = `${parent.name} > ${sub.name}`;
        });
      } else {
        map[parent.name] = parent.name;
      }
    });
    
    return map;
  }, [parentTags, getSubTags]);
  
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  
  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Loan actions state
  const [showMenu, setShowMenu] = useState(false);
  const [showEditLoan, setShowEditLoan] = useState(false);
  const [showDeleteLoan, setShowDeleteLoan] = useState(false);
  const [showArchiveLoan, setShowArchiveLoan] = useState(false);
  const [editLoanName, setEditLoanName] = useState('');
  
  // Reconcile state
  const [isReconciling, setIsReconciling] = useState(false);
  
  // Filter uncleared transactions during reconcile
  const [showUnclearedOnly, setShowUnclearedOnly] = useState(false);

  // Smart back handler - close menu/modals first, then select mode, then close detail
  const handleBackPress = useCallback(() => {
    if (showMenu) {
      setShowMenu(false);
    } else if (showEditLoan) {
      setShowEditLoan(false);
    } else if (showDeleteLoan) {
      setShowDeleteLoan(false);
    } else if (showArchiveLoan) {
      setShowArchiveLoan(false);
    } else if (isReconciling) {
      setIsReconciling(false);
    } else if (showDeleteConfirm) {
      setShowDeleteConfirm(false);
    } else if (isSelectMode) {
      setIsSelectMode(false);
      setSelectedItems(new Set());
    } else {
      onClose();
    }
  }, [showMenu, showEditLoan, showDeleteLoan, showArchiveLoan, isReconciling, showDeleteConfirm, isSelectMode, onClose]);

  useBackHandler(!!loan, handleBackPress);
  
  if (!loan) return null;

  // Loan-specific clear status (independent from the bank account's clearStatus).
  // Falls back to the legacy shared clearStatus for transactions not yet migrated.
  const getLoanStatus = (t) =>
    t.loanClearStatus !== undefined ? t.loanClearStatus : (t.clearStatus || 'uncleared');
  const getLoanReconciledAt = (t) =>
    t.loanReconciledAt !== undefined ? t.loanReconciledAt : t.reconciledAt;

  // Calculate cleared and uncleared balance
  const { clearedBalance, unclearedBalance, unclearedCount } = useMemo(() => {
    let cleared = 0;
    let uncleared = 0;
    let unclearedTxCount = 0;

    loan.transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      const status = getLoanStatus(t);
      if (status === 'cleared' || status === 'reconciled') {
        cleared += amt;
      } else {
        uncleared += amt;
        unclearedTxCount++;
      }
    });

    return { clearedBalance: cleared, unclearedBalance: uncleared, unclearedCount: unclearedTxCount };
  }, [loan.transactions]);

  // One-time migration: seed loanClearStatus from the current (shared) clearStatus
  // so existing reconcile marks are preserved, then bank/loan diverge going forward.
  // Runs lazily per loan when opened; only writes docs that haven't been migrated.
  useEffect(() => {
    const toMigrate = loan.transactions.filter(
      t => !t.isSplitPart && t.loanClearStatus === undefined
    );
    if (toMigrate.length === 0) return;

    const batch = writeBatch(db);
    toMigrate.forEach(t => {
      batch.update(doc(db, 'transactions', t.id), {
        loanClearStatus: t.clearStatus || 'uncleared',
        loanReconciledAt: t.reconciledAt || null
      });
    });
    batch.commit().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan.name, loan.transactions]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups = {};
    loan.transactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [loan.transactions]);

  // Filtered transactions for display (when showUnclearedOnly is true)
  const displayTransactions = useMemo(() => {
    if (!showUnclearedOnly) return loan.transactions;
    return loan.transactions.filter(t => {
      const status = getLoanStatus(t);
      return status !== 'cleared' && status !== 'reconciled';
    });
  }, [loan.transactions, showUnclearedOnly]);

  // Grouped display transactions
  const groupedDisplayTransactions = useMemo(() => {
    const groups = {};
    displayTransactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [displayTransactions]);

  // Running balance for each transaction.
  // Follows the exact display order (top = newest = full balance),
  // then subtracts each row going down so the numbers read correctly top-to-bottom.
  const runningBalanceMap = useMemo(() => {
    const map = {};
    let running = loan.transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    // groupedTransactions preserves the on-screen order (newest date first)
    Object.values(groupedTransactions).forEach(items => {
      items.forEach(t => {
        map[t.id] = running;
        running -= Number(t.amount) || 0;
      });
    });
    return map;
  }, [groupedTransactions, loan.transactions]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
  };

  // Clear status helpers
  const getClearIcon = (s) => s === 'reconciled' ? '🔒' : s === 'cleared' ? '✓' : '○';
  const getClearColor = (s) => s === 'reconciled' ? 'text-gray-400' : s === 'cleared' ? 'text-emerald-600' : 'text-gray-300';

  const handleToggleClear = async (t, e) => {
    e.stopPropagation();

    if (getLoanStatus(t) === 'reconciled') {
      toast.warning('🔒 Locked - reconciled transaction');
      return;
    }

    const newStatus = getLoanStatus(t) === 'cleared' ? 'uncleared' : 'cleared';

    try {
      // Write to the loan-specific field so the bank account is not affected.
      // For split parts, the field lives on the parent split transaction.
      const targetId = (t.isSplitPart && t.parentSplitId) ? t.parentSplitId : t.id;
      await updateDoc(doc(db, 'transactions', targetId), {
        loanClearStatus: newStatus
      });

      // Auto turn off filter when all uncleared are cleared
      if (showUnclearedOnly && newStatus === 'cleared') {
        const remainingUncleared = loan.transactions.filter(tx =>
          tx.id !== t.id && getLoanStatus(tx) !== 'cleared' && getLoanStatus(tx) !== 'reconciled'
        );
        if (remainingUncleared.length === 0) {
          setShowUnclearedOnly(false);
        }
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  // Quick Reconcile - mark all cleared items as reconciled (loan-specific)
  const handleQuickReconcile = async () => {
    const clearedTrans = loan.transactions.filter(t => getLoanStatus(t) === 'cleared');

    if (clearedTrans.length === 0) {
      setSuccessMessage('No cleared items to reconcile');
      setIsReconciling(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      const timestamp = new Date();

      // Track which parent split IDs we've already updated
      const updatedParentIds = new Set();

      clearedTrans.forEach(t => {
        if (t.isSplitPart && t.parentSplitId) {
          // For split parts, update the parent only once
          if (!updatedParentIds.has(t.parentSplitId)) {
            batch.update(doc(db, 'transactions', t.parentSplitId), {
              loanClearStatus: 'reconciled',
              loanReconciledAt: timestamp
            });
            updatedParentIds.add(t.parentSplitId);
          }
        } else {
          batch.update(doc(db, 'transactions', t.id), {
            loanClearStatus: 'reconciled',
            loanReconciledAt: timestamp
          });
        }
      });

      await batch.commit();
      setIsReconciling(false);
      setSuccessMessage('Reconciled successfully!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  // Undo last reconcile - unlock transactions reconciled in the last batch
  const handleUnreconcile = async () => {
    // Find the most recent reconciled transaction (loan-specific)
    const reconciledTrans = loan.transactions.filter(t => getLoanStatus(t) === 'reconciled' && getLoanReconciledAt(t));
    if (reconciledTrans.length === 0) {
      toast.warning('Nothing to undo');
      return;
    }

    // Find the latest reconciledAt time
    let latestTime = 0;
    reconciledTrans.forEach(t => {
      const ra = getLoanReconciledAt(t);
      const time = ra?.seconds ? ra.seconds * 1000 : 0;
      if (time > latestTime) latestTime = time;
    });

    // Find all transactions reconciled within 5 seconds of the latest
    const toUnlock = reconciledTrans.filter(t => {
      const ra = getLoanReconciledAt(t);
      const time = ra?.seconds ? ra.seconds * 1000 : 0;
      return Math.abs(time - latestTime) < 5000;
    });
    
    if (toUnlock.length === 0) { 
      toast.warning('Nothing to unlock'); 
      return; 
    }
    
    const confirmed = await toast.confirm({
      title: 'Undo Reconcile',
      message: `Unlock ${toUnlock.length} transaction(s)?`,
      confirmText: 'Unlock',
      type: 'warning'
    });
    
    if (!confirmed) return;
    
    try {
      const batch = writeBatch(db);
      const updatedParentIds = new Set();
      
      toUnlock.forEach(t => {
        if (t.isSplitPart && t.parentSplitId) {
          // For split parts, update the parent only once
          if (!updatedParentIds.has(t.parentSplitId)) {
            batch.update(doc(db, 'transactions', t.parentSplitId), { loanClearStatus: 'cleared', loanReconciledAt: null });
            updatedParentIds.add(t.parentSplitId);
          }
        } else {
          batch.update(doc(db, 'transactions', t.id), { loanClearStatus: 'cleared', loanReconciledAt: null });
        }
      });
      
      await batch.commit();
      toast.success('Unlocked successfully!');
    } catch (err) { 
      toast.error('Error: ' + err.message); 
    }
  };

  // Check if there are any reconciled transactions (for showing Undo button)
  const hasReconciledTrans = loan.transactions.some(t => getLoanStatus(t) === 'reconciled');

  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${yyyy}/${mm}/${dd} ${day}`;
  };

  // Loan action handlers
  const handleEditLoan = async () => {
    if (!editLoanName.trim()) return;
    const oldName = loan.name;
    const newName = editLoanName.trim();
    
    if (oldName === newName) {
      setShowEditLoan(false);
      return;
    }
    
    try {
      const batch = writeBatch(db);
      
      // Update regular loan transactions
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { loan: newName });
        }
      });
      
      // Update split transactions that contain this loan
      const splitParentIds = new Set();
      loan.transactions.forEach(t => {
        if (t.isSplitPart && t.parentSplitId) {
          splitParentIds.add(t.parentSplitId);
        }
      });
      
      // Get parent split transactions and update their splits array
      splitParentIds.forEach(parentId => {
        const parentTx = splitTransactions.find(st => st.id === parentId);
        if (parentTx && parentTx.splits) {
          const updatedSplits = parentTx.splits.map(split => {
            if (split.loan === oldName) {
              return { ...split, loan: newName };
            }
            return split;
          });
          batch.update(doc(db, 'transactions', parentId), { splits: updatedSplits });
        }
      });
      
      await batch.commit();
      
      // Notify parent to update selectedLoan
      if (onLoanRenamed) {
        onLoanRenamed(newName);
      }
      
      setShowEditLoan(false);
      setSuccessMessage('Loan renamed successfully!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeleteLoan = async () => {
    // Check if loan has split parts - cannot delete directly
    const splitParts = loan.transactions.filter(t => t.isSplitPart);
    const regularParts = loan.transactions.filter(t => !t.isSplitPart);
    
    if (splitParts.length > 0 && regularParts.length === 0) {
      // All transactions are from splits - cannot delete
      toast.error('Cannot delete: All transactions are from split transactions. Delete the original split transactions first.');
      setShowDeleteLoan(false);
      return;
    }
    
    try {
      const batch = writeBatch(db);
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.delete(doc(db, 'transactions', t.id));
        }
      });
      await batch.commit();
      setShowDeleteLoan(false);
      
      if (splitParts.length > 0) {
        toast.info(`Deleted ${regularParts.length} transaction(s). ${splitParts.length} split transaction(s) remain - delete them from the original split.`);
      }
      
      onClose();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleArchiveLoan = async () => {
    try {
      const batch = writeBatch(db);
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { archived: true });
        }
      });
      await batch.commit();
      setShowArchiveLoan(false);
      setSuccessMessage('Loan archived!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
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
    const allIds = new Set(loan.transactions.filter(t => !t.isSplitPart).map(t => t.id));
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

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedItems(new Set());
  };

  // Long press handler
  let longPressTimer = null;
  const handleTouchStart = (itemId) => {
    longPressTimer = setTimeout(() => handleLongPress(itemId), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  };

  const handleTransactionClick = (t) => {
    if (isSelectMode) {
      handleSelectItem(t.id);
    } else if (t.isSplitPart) {
      // Show toast with instruction to edit from Transactions tab
      toast.info('This is from a split transaction. Go to Transactions tab to edit the original split.');
    } else {
      setEditingTransaction(t);
    }
  };

  const isBorrow = loan.loanType === 'borrow';

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col no-pull-refresh">
      {/* Header - changes based on select mode */}
      {isSelectMode ? (
        <div className="bg-indigo-600 p-4 shadow-sm flex items-center justify-between sticky top-0">
          <button onClick={exitSelectMode} className="text-white text-lg p-2 -ml-2">✕</button>
          <div className="font-bold text-lg text-white">{selectedItems.size} selected</div>
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="text-white text-sm px-3 py-1 bg-white/20 rounded-lg">All</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="text-white text-sm px-3 py-1 bg-red-500 rounded-lg">🗑️</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-3 shadow-sm flex items-center justify-between sticky top-0">
          <button onClick={onClose} className="text-gray-600 p-2 -ml-2">←</button>
          <div className="flex items-center gap-2 flex-1 min-w-0 mx-2">
            <span className="text-lg">{isBorrow ? '💰' : '💸'}</span>
            <span className="font-semibold text-gray-800 truncate">{loan.name}</span>
          </div>
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className={`text-gray-600 text-xl p-2 hover:bg-gray-100 rounded-lg ${showMenu ? 'pointer-events-none' : ''}`}
            >
              ⋮
            </button>
            {showMenu && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 bg-transparent"
                  style={{ zIndex: 55 }}
                  onTouchStart={() => setShowMenu(false)}
                  onClick={() => setShowMenu(false)} 
                />
                {/* Menu dropdown */}
                <div 
                  className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border py-1 min-w-[150px]"
                  style={{ zIndex: 100, touchAction: 'manipulation' }}
                >
                  <button
                    type="button"
                    onTouchStart={(e) => { 
                      e.stopPropagation(); 
                      setShowMenu(false); 
                      setEditLoanName(loan.name); 
                      setShowEditLoan(true); 
                    }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setShowMenu(false); 
                      setEditLoanName(loan.name); 
                      setShowEditLoan(true); 
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 active:bg-gray-100 cursor-pointer flex items-center gap-2"
                  >
                    <span>✏️</span> <span>Rename</span>
                  </button>
                  <button
                    type="button"
                    onTouchStart={(e) => { 
                      e.stopPropagation(); 
                      setShowMenu(false); 
                      setShowArchiveLoan(true); 
                    }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setShowMenu(false); 
                      setShowArchiveLoan(true); 
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-gray-700 active:bg-gray-100 cursor-pointer flex items-center gap-2"
                  >
                    <span>📦</span> <span>Archive</span>
                  </button>
                  <button
                    type="button"
                    onTouchStart={(e) => { 
                      e.stopPropagation(); 
                      setShowMenu(false); 
                      setShowDeleteLoan(true); 
                    }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setShowMenu(false); 
                      setShowDeleteLoan(true); 
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-red-600 active:bg-red-50 cursor-pointer flex items-center gap-2"
                  >
                    <span>🗑️</span> <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Loan Summary Card - Compact */}
      <div className="p-3 bg-emerald-600 text-white shadow-sm">
        <div className="text-center">
          <div className="text-xs opacity-90">Outstanding Balance</div>
          <div className="text-2xl font-bold mt-0.5">
            {loan.balance < 0 ? '-' : ''}{formatCurrency(loan.balance)}
          </div>
        </div>
        
        {/* Cleared / Uncleared row */}
        <div className="flex justify-center gap-6 mt-2 pt-2 border-t border-white/20 text-xs">
          <div className="text-center">
            <div className="opacity-70">Cleared</div>
            <div className="font-medium">{clearedBalance >= 0 ? '+' : '-'}{formatCurrency(clearedBalance)}</div>
          </div>
          <div className="text-center">
            <div className="opacity-70">Uncleared</div>
            <div className="font-medium">{unclearedBalance >= 0 ? '+' : '-'}{formatCurrency(unclearedBalance)}</div>
          </div>
        </div>
        
        {/* Reconcile button */}
        {!isSelectMode && !isReconciling && (
          <div className="mt-2 flex justify-center gap-2">
            <button onClick={() => { setShowUnclearedOnly(false); setIsReconciling(true); }} className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium">Reconcile</button>
            {hasReconciledTrans && <button onClick={handleUnreconcile} className="bg-white/10 px-3 py-1.5 rounded-lg text-xs font-medium">🔓 Undo Last</button>}
          </div>
        )}
        
        {/* Paid Back / Received info */}
        <div className="mt-2 pt-2 border-t border-white/20 text-center text-xs">
          {isBorrow ? (
            <span>Paid back: {formatCurrency(loan.paidBack)}</span>
          ) : (
            <span>Received: {formatCurrency(loan.received)}</span>
          )}
        </div>
      </div>

      {/* Reconcile Modal */}
      {isReconciling && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="font-bold text-lg">Reconcile Loan</div>
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
                  <span className="text-gray-700 font-medium">Outstanding Balance</span>
                  <span className="font-bold text-lg">{loan.balance < 0 ? '-' : ''}{formatCurrency(loan.balance)}</span>
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
                <div className="text-gray-600 text-sm">Is your cleared balance</div>
                <div className="text-3xl font-bold text-gray-800 my-2">{clearedBalance < 0 ? '-' : ''}{formatCurrency(clearedBalance)}?</div>
                <div className="text-sm text-gray-500">
                  {loan.transactions.filter(t => getLoanStatus(t) === 'cleared').length} cleared transactions will be locked
                </div>
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
            </div>
          </div>
        </div>
      )}

      {/* FAB Add Transaction Button */}
      {!isSelectMode && (
        <button
          onClick={() => setIsAddTransactionOpen(true)}
          className="fixed bottom-24 right-4 md:right-[calc(50%-200px)] bg-emerald-500 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-4xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
        >
          +
        </button>
      )}

      {/* Transaction History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
        {/* Uncleared Filter Banner */}
        {showUnclearedOnly && (
          <div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
            <div className="text-sm text-amber-800 text-center">
              <span className="font-medium">Showing {unclearedCount} uncleared transaction{unclearedCount > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
        
        <div className="text-xs font-bold text-gray-500 uppercase ml-1">
          Transaction History ({showUnclearedOnly ? displayTransactions.length : loan.transactions.length})
        </div>

        {Object.keys(groupedDisplayTransactions).length === 0 ? (
          <div className="text-center text-gray-400 mt-10">No transactions yet</div>
        ) : (
          Object.entries(groupedDisplayTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">
                {formatDateLabel(date)}
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {items.map((t, index) => {
                  const amt = Number(t.amount);
                  const isPositive = amt > 0;
                  const isSelected = selectedItems.has(t.id);
                  
                  return (
                    <div 
                      key={t.id} 
                      onClick={(e) => {
                        // Ignore if clicking on clear button
                        if (e.target.closest('.clear-btn')) return;
                        handleTransactionClick(t);
                      }}
                      onTouchStart={() => !t.isSplitPart && handleTouchStart(t.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onContextMenu={(e) => { e.preventDefault(); !t.isSplitPart && handleLongPress(t.id); }}
                      className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors ${index !== items.length - 1 ? 'border-b border-gray-50' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
                    >
                      {/* Checkbox in select mode */}
                      {isSelectMode && (
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                          {isSelected && <span className="text-white text-sm">✓</span>}
                        </div>
                      )}

                      {/* Transaction Info */}
                      <div className="flex-1 min-w-0">
                        {/* For split parts: show payee first, then loan name + memo */}
                        {t.isSplitPart ? (
                          <>
                            <div className="font-medium text-gray-800 truncate">
                              {t.payee || 'Split transaction'}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {t.loan}{t.memo ? ` • ${t.memo}` : ''}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-gray-800 truncate">
                              {t.payee || t.memo || 'Loan transaction'}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {t.account}{t.payee && t.memo ? ` • ${t.memo}` : ''}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Amount and Tags */}
                      <div className="text-right">
                        <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>
                          {isPositive ? '+' : '-'}{formatCurrency(amt)}
                        </div>
                        {/* Running balance */}
                        <div className="text-xs text-gray-400 mt-0.5">
                          {runningBalanceMap[t.id] < 0 ? '-' : ''}{formatCurrency(runningBalanceMap[t.id] || 0)}
                        </div>
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
                      
                      {/* Clear Status Button */}
                      {!isSelectMode && (
                        <button 
                          onClick={(e) => handleToggleClear(t, e)} 
                          className={`clear-btn text-xl w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-200 ${getClearColor(getLoanStatus(t))}`}
                        >
                          {getClearIcon(getLoanStatus(t))}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Transaction Modal */}
      <AddLoanTransactionModal
        isOpen={isAddTransactionOpen}
        onClose={() => setIsAddTransactionOpen(false)}
        onSave={() => {
          setIsAddTransactionOpen(false);
          // Data will auto-refresh via Firebase listener, stay in LoanDetail
        }}
        loan={loan}
      />

      {/* Edit Transaction Modal */}
      <EditLoanTransactionModal
        isOpen={editingTransaction !== null}
        onClose={() => setEditingTransaction(null)}
        onSave={() => {
          setEditingTransaction(null);
          // Data will auto-refresh via Firebase listener, stay in LoanDetail
        }}
        transaction={editingTransaction}
        loan={loan}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
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

      {/* Edit Loan Modal */}
      {showEditLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-indigo-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">✏️</div>
              <div className="font-bold text-lg">Rename Loan</div>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={editLoanName}
                onChange={(e) => setEditLoanName(e.target.value)}
                className="w-full p-3 border-2 border-gray-200 rounded-lg text-center text-lg font-medium focus:border-indigo-500 outline-none"
                placeholder="Loan name"
                autoFocus
              />
              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => setShowEditLoan(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditLoan} 
                  disabled={!editLoanName.trim()}
                  className="flex-1 bg-indigo-500 text-white py-3 rounded-lg font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Loan Modal */}
      {showDeleteLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-red-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">🗑️</div>
              <div className="font-bold text-lg">Delete Loan</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Delete <span className="font-bold">{loan.name}</span> and all its transactions?
                <br/><span className="text-red-500 text-sm">This cannot be undone.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowDeleteLoan(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteLoan} 
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Loan Modal */}
      {showArchiveLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">📦</div>
              <div className="font-bold text-lg">Archive Loan</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Archive <span className="font-bold">{loan.name}</span>?
                <br/><span className="text-gray-500 text-sm">It will be hidden from the loan list.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowArchiveLoan(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleArchiveLoan} 
                  className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-medium"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanDetail;