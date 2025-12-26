import React, { useMemo, useState } from 'react';
import { doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import UpdateValueModal from './UpdateValueModal';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AccountDetail = ({ account, transactions, onClose, onAccountUpdated }) => {
  const toast = useToast();
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
  const [editStartingBalanceValue, setEditStartingBalanceValue] = useState('');
  const [editStartingBalanceDisplay, setEditStartingBalanceDisplay] = useState('');
  
  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useBackHandler(isSelectMode ? () => { setIsSelectMode(false); setSelectedItems(new Set()); } : true, isSelectMode ? () => { setIsSelectMode(false); setSelectedItems(new Set()); } : onClose);

  if (!account) return null;

  // Handler để mở Add Transaction với account prefilled
  const handleAddTransaction = () => {
    setPrefilledAccount(account.name);
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const accountTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        if (t.type === 'transfer') return t.fromAccount === account.name || t.toAccount === account.name;
        if (t.type === 'split') return t.account === account.name;
        return t.account === account.name;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [account, transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = {};
    accountTransactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [accountTransactions]);

  const { balance, clearedBalance, unclearedBalance } = useMemo(() => {
    // Add starting balance for all accounts (except loan handled separately)
    const startingBalance = account.startingBalance || 0;
    let bal = startingBalance;
    let cleared = startingBalance; // Starting balance is considered cleared
    let uncleared = 0;
    
    accountTransactions.forEach(t => {
      let amt = 0;
      if (t.type === 'transfer') {
        amt = t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
      } else if (t.type === 'split') {
        amt = Number(t.totalAmount) || 0;
      } else {
        amt = Number(t.amount) || 0;
      }
      bal += amt;
      if (t.clearStatus === 'cleared' || t.clearStatus === 'reconciled') cleared += amt;
      else uncleared += amt;
    });
    return { balance: bal, clearedBalance: cleared, unclearedBalance: uncleared };
  }, [accountTransactions, account]);

  // Tính Current Value cho investment accounts theo thứ tự thời gian
  const calculatedCurrentValue = useMemo(() => {
    if (!['investment','property','vehicle','asset'].includes(account.type)) {
      return balance;
    }
    
    // Gộp tất cả events (transactions + value updates) và sắp xếp theo thời gian
    const allEvents = [];
    const startingBalance = account.startingBalance || 0;
    
    // Thêm transactions - dùng createdAt để có timestamp chính xác
    accountTransactions.forEach(t => {
      let amt = 0;
      if (t.type === 'transfer') {
        amt = t.fromAccount === account.name ? -Number(t.amount) : Number(t.amount);
      } else if (t.type === 'split') {
        amt = Number(t.totalAmount) || 0;
      } else {
        amt = Number(t.amount) || 0;
      }
      // Ưu tiên createdAt, fallback về date
      const ts = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : new Date(t.date).getTime();
      allEvents.push({
        type: 'transaction',
        amount: amt,
        timestamp: ts
      });
    });
    
    // Thêm value updates
    if (account.valueHistory) {
      account.valueHistory.forEach(entry => {
        allEvents.push({
          type: 'valueUpdate',
          value: entry.value,
          timestamp: entry.timestamp
        });
      });
    }
    
    // Sắp xếp theo thời gian (cũ nhất trước)
    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    // Tính current value - bắt đầu từ startingBalance
    let currentVal = startingBalance;
    allEvents.forEach(event => {
      if (event.type === 'valueUpdate') {
        currentVal = event.value; // Set value mới
      } else {
        currentVal += event.amount; // Cộng/trừ transaction
      }
    });
    
    return currentVal;
  }, [accountTransactions, account]);

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US').format(Math.abs(amount || 0));
  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${date.toLocaleDateString('en-US',{weekday:'short'})}`;
  };
  const formatNumberInput = (value) => value ? new Intl.NumberFormat('en-US').format(value.replace(/,/g,'')) : '';

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
        batch.delete(doc(db, 'transactions', id));
      });
      await batch.commit();
      setSelectedItems(new Set());
      setIsSelectMode(false);
      setShowDeleteConfirm(false);
      setSuccessMessage(`Deleted ${selectedItems.size} transaction(s)`);
    } catch (err) { 
      toast.error('Error: ' + err.message); 
    }
  };

  const handleToggleClear = async (t, e) => {
    e.stopPropagation();
    if (t.clearStatus === 'reconciled') { toast.warning('🔒 Locked'); return; }
    try {
      await updateDoc(doc(db, 'transactions', t.id), { clearStatus: t.clearStatus === 'cleared' ? 'uncleared' : 'cleared' });
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
  const isMarketValue = ['investment','property','vehicle','asset'].includes(account.type);
  const SplitIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 inline-block mr-1"><path d="M16 3l-4 4-4-4"/><path d="M12 7v6"/><path d="M8 21l4-4 4 4"/><path d="M12 17v-4"/></svg>);

  // Long press handler
  let longPressTimer = null;
  const handleTouchStart = (itemId) => {
    longPressTimer = setTimeout(() => handleLongPress(itemId), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header - changes based on select mode */}
      {isSelectMode ? (
        <div className="bg-indigo-600 p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
          <button onClick={() => { setIsSelectMode(false); setSelectedItems(new Set()); }} className="text-white text-lg p-2 -ml-2">✕</button>
          <div className="font-bold text-lg text-white">{selectedItems.size} selected</div>
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="text-white text-sm px-3 py-1 bg-white/20 rounded-lg">All</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="text-white text-sm px-3 py-1 bg-red-500 rounded-lg">🗑️</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
          <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
          <div className="font-bold text-lg flex items-center gap-2"><span>{account.icon}</span><span>{account.name}</span></div>
          <div className="w-16"></div>
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
                <button onClick={() => setIsReconciling(true)} className="bg-white/20 px-4 py-2 rounded-lg text-sm font-medium">Reconcile</button>
              )}
              {account.lastReconcileDate && !isReconciling && (
                <button onClick={handleUnreconcile} className="bg-white/10 px-4 py-2 rounded-lg text-sm font-medium">🔓 Undo</button>
              )}
            </div>
          </>
        )}
        
        {!isMarketValue && (
          <div className="flex justify-center gap-6 mt-3 pt-3 border-t border-white/20 text-sm">
            <div className="text-center"><div className="opacity-70">Cleared</div><div className="font-medium">{clearedBalance >= 0 ? '+' : '-'}{formatCurrency(clearedBalance)}</div></div>
            <div className="text-center"><div className="opacity-70">Uncleared</div><div className="font-medium">{unclearedBalance >= 0 ? '+' : '-'}{formatCurrency(unclearedBalance)}</div></div>
          </div>
        )}
        {!isMarketValue && !isReconciling && (
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => setIsReconciling(true)} className="bg-white/20 px-4 py-2 rounded-lg text-sm font-medium">Reconcile</button>
            {account.lastReconcileDate && <button onClick={handleUnreconcile} className="bg-white/10 px-4 py-2 rounded-lg text-sm font-medium">🔓 Undo Last</button>}
          </div>
        )}
      </div>

      {isReconciling && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-500 p-4 text-white text-center">
              <div className="font-bold text-lg">Reconcile Account</div>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Balance Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Cleared Balance</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(clearedBalance)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">+ Uncleared Balance</span>
                  <span className={`font-bold ${unclearedBalance >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                    {unclearedBalance >= 0 ? '+' : ''}{formatCurrency(unclearedBalance)}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-gray-700 font-medium">Working Balance</span>
                  <span className="font-bold text-lg">{formatCurrency(balance)}</span>
                </div>
              </div>

              {/* Uncleared Warning */}
              {unclearedBalance !== 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500">⚠️</span>
                    <div className="text-sm text-amber-700">
                      You have uncleared transactions. Clear them first or they will remain uncleared after reconciliation.
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation Question */}
              <div className="text-center py-2">
                <div className="text-gray-600 text-sm">Is your current balance</div>
                <div className="text-3xl font-bold text-gray-800 my-2">{formatCurrency(clearedBalance)}?</div>
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
                  className="flex-1 bg-indigo-500 text-white py-3 rounded-lg font-medium hover:bg-indigo-600 transition-colors"
                >
                  Yes
                </button>
              </div>

              {/* Enter Different Amount Link */}
              <button 
                onClick={() => { setIsReconciling(false); setShowManualReconcile(true); }}
                className="w-full text-indigo-500 text-sm hover:underline"
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
            <div className="bg-indigo-500 p-4 text-white text-center">
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
                className="w-full text-2xl font-bold text-center p-4 border-2 border-indigo-200 rounded-lg focus:border-indigo-500 outline-none" 
                 
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
                  className="flex-1 bg-indigo-500 text-white py-3 rounded-lg font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50"
                >
                  Reconcile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {(() => {
          // Gộp transactions và value updates thành 1 list
          const allItems = [];
          
          // Thêm transactions
          accountTransactions.forEach(t => {
            allItems.push({
              type: 'transaction',
              data: t,
              timestamp: new Date(t.date).getTime(),
              date: t.date
            });
          });
          
          // Thêm value updates nếu là investment account
          if (isMarketValue && account.valueHistory) {
            account.valueHistory.forEach(entry => {
              allItems.push({
                type: 'valueUpdate',
                data: entry,
                timestamp: entry.timestamp,
                date: entry.date.split('T')[0]
              });
            });
          }
          
          // Thêm Starting Balance cho tất cả accounts trừ loan
          if (account.type !== 'loan' && (account.startingBalance || 0) !== 0 && account.createdAt) {
            const createdDate = account.createdAt.seconds 
              ? new Date(account.createdAt.seconds * 1000) 
              : new Date(account.createdAt);
            const dateStr = createdDate.toISOString().split('T')[0];
            allItems.push({
              type: 'startingBalance',
              data: { 
                amount: account.startingBalance,
                date: dateStr
              },
              timestamp: 0, // Always oldest - always at bottom
              date: dateStr
            });
          }
          
          // Sắp xếp theo timestamp mới nhất trước
          allItems.sort((a, b) => b.timestamp - a.timestamp);
          
          if (allItems.length === 0) {
            return <div className="text-center text-gray-400 mt-10">No transactions</div>;
          }
          
          // Group by date
          const grouped = {};
          allItems.forEach(item => {
            if (!grouped[item.date]) grouped[item.date] = [];
            grouped[item.date].push(item);
          });
          
          return Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs text-gray-400 mb-2 ml-1">{formatDateLabel(date)}</div>
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden divide-y divide-gray-50">
                {items.map((item, index) => {
                  if (item.type === 'startingBalance') {
                    return (
                      <div 
                        key="starting-balance" 
                        className="p-3 flex justify-between items-center bg-emerald-50/50 cursor-pointer hover:bg-emerald-100/50 active:bg-emerald-100"
                        onClick={() => {
                          const currentValue = account.startingBalance || 0;
                          setEditStartingBalanceValue(String(currentValue));
                          setEditStartingBalanceDisplay(currentValue ? Number(currentValue).toLocaleString('en-US') : '');
                          setIsEditStartingBalanceOpen(true);
                        }}
                      >
                        <div>
                          <div className="font-medium text-emerald-700">💵 Starting Balance</div>
                          <div className="text-xs text-emerald-500">Tap to edit</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-emerald-600">
                            +{formatCurrency(item.data.amount)}
                          </div>
                          <span className="text-emerald-400">✏️</span>
                        </div>
                      </div>
                    );
                  } else if (item.type === 'valueUpdate') {
                    const entry = item.data;
                    const entryIndex = account.valueHistory?.findIndex(v => v.timestamp === entry.timestamp);
                    const d = new Date(entry.date);
                    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    const clearStatus = entry.clearStatus || 'uncleared';
                    return (
                      <div key={`value-${index}`} className="p-3 flex justify-between items-center bg-blue-50/50">
                        <div>
                          <div className="font-medium text-blue-700">Update Value</div>
                          <div className="text-xs text-blue-400">{timeStr}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-blue-600">{formatCurrency(entry.value)}</div>
                          <button 
                            onClick={(e) => handleToggleValueClear(entryIndex, clearStatus, e)} 
                            className={`text-xl w-8 h-8 flex items-center justify-center rounded-full ${getClearColor(clearStatus)}`}
                          >
                            {getClearIcon(clearStatus)}
                          </button>
                        </div>
                      </div>
                    );
                  } else {
                    const t = item.data;
                    const isTransfer = t.type === 'transfer';
                    const isSplit = t.type === 'split';
                    const isLoan = t.type === 'loan';
                    const isOutgoing = isTransfer && t.fromAccount === account.name;
                    let displayAmount = isTransfer ? (isOutgoing ? -Number(t.amount) : Number(t.amount)) : isSplit ? Number(t.totalAmount) || 0 : Number(t.amount) || 0;
                    const isPositive = displayAmount > 0;
                    const isSelected = selectedItems.has(t.id);
                    return (
                      <div 
                        key={t.id} 
                        onClick={() => isSelectMode ? handleSelectItem(t.id) : (() => { setEditingTransaction(t); setIsModalOpen(true); })()} 
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
                              {isSplit && <SplitIcon />}
                              {isLoan ? (t.memo || 'Loan') : isTransfer ? `Transfer ${isOutgoing ? 'to' : 'from'} ${isOutgoing ? t.toAccount : t.fromAccount}` : (t.payee || 'No Payee')}
                            </div>
                            {!isSplit && <div className="text-xs text-gray-500 truncate">{isLoan ? t.loan : isTransfer ? 'Transfer' : t.category}</div>}
                          </div>
                          <div className={`font-bold whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>{isPositive ? '+' : '-'}{formatCurrency(displayAmount)}</div>
                          {!isSelectMode && <button onClick={(e) => handleToggleClear(t, e)} className={`text-xl w-8 h-8 flex items-center justify-center rounded-full ${getClearColor(t.clearStatus)}`}>{getClearIcon(t.clearStatus)}</button>}
                        </div>
                        {isSplit && t.splits && (
                          <div className="mt-2 space-y-1 pl-4 border-l-2 border-sky-200 ml-1">
                            {t.splits.map((s, i) => (<div key={i} className="flex justify-between text-sm"><span className="text-gray-600">{s.isLoan ? s.loan : s.category}</span><span className="text-gray-700 font-medium">{formatCurrency(s.amount)}</span></div>))}
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

      {/* FAB Add Transaction Button */}
      {!isSelectMode && (
        <button
          onClick={handleAddTransaction}
          className="fixed bottom-24 right-4 bg-emerald-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
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
      {isEditStartingBalanceOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="text-3xl mb-1">💵</div>
              <div className="font-bold text-lg">Edit Starting Balance</div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">New Starting Balance</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={editStartingBalanceDisplay}
                  onChange={(e) => {
                    const rawValue = e.target.value.replace(/,/g, '');
                    if (rawValue === '' || /^\d*$/.test(rawValue)) {
                      setEditStartingBalanceValue(rawValue);
                      setEditStartingBalanceDisplay(rawValue ? Number(rawValue).toLocaleString('en-US') : '');
                    }
                  }}
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none text-right text-xl font-bold"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsEditStartingBalanceOpen(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const newBalance = parseFloat(editStartingBalanceValue) || 0;
                      await updateDoc(doc(db, 'accounts', account.id), { 
                        startingBalance: newBalance,
                        updatedAt: new Date()
                      });
                      setIsEditStartingBalanceOpen(false);
                      toast.success('Starting balance updated!');
                      if (onAccountUpdated) onAccountUpdated();
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }} 
                  className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
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

export default AccountDetail;