import React, { useMemo, useState } from 'react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AccountDetail = ({ account, transactions, onClose }) => {
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileBalance, setReconcileBalance] = useState('');

  if (!account) return null;

  // Filter transactions for this account
  const accountTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        if (t.type === 'transfer') {
          return t.fromAccount === account.name || t.toAccount === account.name;
        }
        return t.account === account.name;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [account, transactions]);

  // Group by date
  const groupedTransactions = useMemo(() => {
    const groups = {};
    accountTransactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [accountTransactions]);

  // Calculate balance
  const balance = useMemo(() => {
    let bal = 0;
    accountTransactions.forEach(t => {
      const amt = Number(t.amount);
      if (t.type === 'transfer') {
        if (t.fromAccount === account.name) bal -= amt;
        if (t.toAccount === account.name) bal += amt;
      } else {
        bal += amt;
      }
    });
    return bal;
  }, [accountTransactions, account]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${yyyy}/${mm}/${dd} ${day}`;
  };

  // Format number input with commas
  const formatNumberInput = (value) => {
    if (!value) return '';
    const num = value.replace(/,/g, '');
    return new Intl.NumberFormat('en-US').format(num);
  };

  const handleBalanceChange = (e) => {
    const value = e.target.value.replace(/,/g, '');
    if (!isNaN(value) || value === '') {
      setReconcileBalance(value);
    }
  };

  // Toggle clear status
  const handleToggleClear = async (transaction) => {
    if (transaction.clearStatus === 'reconciled') {
      alert('🔒 This transaction is reconciled and locked.\n\nTo edit it, you need to Unreconcile this account first.\n\nClick "Unreconcile Account" button to unlock all reconciled transactions.');
      return;
    }

    try {
      const newStatus = transaction.clearStatus === 'cleared' ? 'uncleared' : 'cleared';
      await updateDoc(doc(db, 'transactions', transaction.id), {
        clearStatus: newStatus
      });
    } catch (error) {
      alert('Error updating transaction: ' + error.message);
    }
  };

  // Start reconcile
  const handleStartReconcile = () => {
    setIsReconciling(true);
    setReconcileBalance('');
  };

  // Finish reconcile
  const handleFinishReconcile = async () => {
    const targetBalance = parseFloat(reconcileBalance.replace(/,/g, ''));
    if (isNaN(targetBalance)) {
      alert('Please enter a valid balance');
      return;
    }

    // Get all cleared transactions
    const clearedTransactions = accountTransactions.filter(t => t.clearStatus === 'cleared');
    
    if (clearedTransactions.length === 0) {
      alert('No cleared transactions to reconcile.\n\nPlease mark some transactions as cleared (✓) first.');
      return;
    }

    // Calculate cleared balance
    let clearedBalance = 0;
    clearedTransactions.forEach(t => {
      const amt = Number(t.amount);
      if (t.type === 'transfer') {
        if (t.fromAccount === account.name) clearedBalance -= amt;
        if (t.toAccount === account.name) clearedBalance += amt;
      } else {
        clearedBalance += amt;
      }
    });

    // Check if balance matches
    const difference = Math.abs(clearedBalance - targetBalance);
    if (difference > 0.01) {
      const proceed = window.confirm(
        `⚠️ Balance Mismatch!\n\nCleared Balance: ${formatCurrency(clearedBalance)}\nStatement Balance: ${formatCurrency(targetBalance)}\nDifference: ${formatCurrency(difference)}\n\nDo you want to proceed anyway?`
      );
      if (!proceed) return;
    }

    try {
      // Mark all cleared transactions as reconciled VÀ LƯU TIMESTAMP
      const batch = writeBatch(db);
      const reconcileTimestamp = new Date();
      
      clearedTransactions.forEach(t => {
        batch.update(doc(db, 'transactions', t.id), {
          clearStatus: 'reconciled',
          reconciledAt: reconcileTimestamp  // Lưu thời điểm reconcile
        });
      });

      // Update account with reconcile info
      batch.update(doc(db, 'accounts', account.id), {
        lastReconcileDate: reconcileTimestamp,
        lastReconcileBalance: targetBalance
      });

      await batch.commit();
      
      setIsReconciling(false);
      alert('✅ Account reconciled successfully!\n\n' + clearedTransactions.length + ' transactions locked.');
    } catch (error) {
      alert('Error reconciling account: ' + error.message);
    }
  };

  // Unreconcile account - CHỈ UNLOCK LẦN RECONCILE CUỐI CÙNG
  const handleUnreconcile = async () => {
    if (!account.lastReconcileDate) {
      alert('No reconcile to undo.');
      return;
    }

    // Lấy timestamp reconcile cuối cùng (milliseconds)
    const lastReconcileTime = account.lastReconcileDate.seconds * 1000;
    
    // Chỉ unlock transactions có reconciledAt BẰNG CHÍNH XÁC lastReconcileDate (trong vòng 5 giây)
    const lastReconciledTransactions = accountTransactions.filter(t => {
      if (t.clearStatus !== 'reconciled') return false;
      
      // Nếu transaction không có reconciledAt, skip
      if (!t.reconciledAt) return false;
      
      // So sánh timestamp (cho phép sai số 5 giây)
      const transReconcileTime = t.reconciledAt.seconds * 1000;
      const timeDiff = Math.abs(transReconcileTime - lastReconcileTime);
      
      return timeDiff < 5000; // Trong vòng 5 giây = cùng 1 lần reconcile
    });
    
    if (lastReconciledTransactions.length === 0) {
      alert('No transactions from last reconcile to unlock.');
      return;
    }

    const lastReconcileDate = new Date(lastReconcileTime);
    
    if (!window.confirm(`🔓 Unreconcile Last Reconcile?\n\nThis will unlock ${lastReconciledTransactions.length} transactions from your last reconcile on ${lastReconcileDate.toLocaleDateString()} ${lastReconcileDate.toLocaleTimeString()}.\n\nLocked transactions (🔒) from previous reconciles will stay locked.\n\nAre you sure?`)) {
      return;
    }

    try {
      const batch = writeBatch(db);
      
      lastReconciledTransactions.forEach(t => {
        batch.update(doc(db, 'transactions', t.id), {
          clearStatus: 'cleared',
          reconciledAt: null
        });
      });

      // Update account - xóa lastReconcileDate
      batch.update(doc(db, 'accounts', account.id), {
        lastReconcileDate: null,
        lastReconcileBalance: null
      });

      await batch.commit();
      alert(`✅ Unreconciled successfully!\n\n${lastReconciledTransactions.length} transactions unlocked.\n\nOlder reconciled transactions remain locked.`);
    } catch (error) {
      alert('Error unreconciling: ' + error.message);
    }
  };

  // Get clear status icon
  const getClearIcon = (status) => {
    if (status === 'reconciled') return '🔒';
    if (status === 'cleared') return '✓';
    return '○';
  };

  const getClearColor = (status) => {
    if (status === 'reconciled') return 'text-gray-400';
    if (status === 'cleared') return 'text-green-600';
    return 'text-gray-300';
  };

  // Check if account is market-value type
  const isMarketValue = ['investment', 'property', 'vehicle', 'asset'].includes(account.type);

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0">
        <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
        <div className="font-bold text-lg flex items-center gap-2">
          <span>{account.icon}</span>
          <span>{account.name}</span>
        </div>
        <div className="w-16"></div>
      </div>

      {/* Balance Card */}
      <div className="p-4 bg-emerald-600 text-white shadow-sm">
        <div className="text-sm opacity-90 text-center">
          {isMarketValue ? 'Current Value' : 'Balance'}
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="text-3xl font-bold">
            {formatCurrency(isMarketValue ? account.currentValue : balance)}
          </div>
          
          {/* Reconcile Button */}
          {!isMarketValue && (
            <button
              onClick={handleStartReconcile}
              className="bg-white bg-opacity-20 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-opacity-30 transition-colors ml-3"
            >
              Reconcile
            </button>
          )}
        </div>
        <div className="text-sm mt-2 opacity-80 text-center">
          {accountTransactions.length} transactions
        </div>
        {account.lastReconcileDate && (
          <div className="text-xs mt-2 opacity-75 text-center">
            Last reconciled: {new Date(account.lastReconcileDate.seconds * 1000).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Market Value Notice */}
      {isMarketValue && (
        <div className="mx-4 mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <div className="flex items-center gap-2 mb-1">
            <span>📊</span>
            <span className="font-semibold">Investment Account</span>
          </div>
          <div className="text-xs">
            Balance is manually set. Transactions below are for history tracking only.
          </div>
        </div>
      )}

      {/* Reconcile Mode */}
      {isReconciling && (
        <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <div className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
            <span>🔍</span>
            <span>Reconcile Mode</span>
          </div>
          
          <div className="text-sm text-yellow-700 mb-4 space-y-1">
            <div>1. Mark transactions as cleared ✓</div>
            <div>2. Enter your bank statement balance</div>
            <div>3. Click "Finish Reconcile" to lock them 🔒</div>
          </div>

          {/* Large Number Input */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-yellow-800 uppercase mb-2 block">
              Statement Balance
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatNumberInput(reconcileBalance)}
              onChange={handleBalanceChange}
              className="w-full text-4xl font-bold text-center p-4 border-2 border-yellow-300 rounded-lg focus:outline-none focus:border-yellow-500 bg-white"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleFinishReconcile}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              ✓ Finish Reconcile
            </button>
            <button
              onClick={() => setIsReconciling(false)}
              className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
          
          {account.lastReconcileDate && (
            <button
              onClick={handleUnreconcile}
              className="w-full mt-3 bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors border border-red-200"
            >
              🔓 Unreconcile Account
            </button>
          )}
        </div>
      )}

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-400 mt-10">No transactions yet</div>
        ) : (
          Object.entries(groupedTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">
                {formatDateLabel(date)}
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {items.map((t, index) => {
                  const isTransfer = t.type === 'transfer';
                  const isOutgoing = isTransfer && t.fromAccount === account.name;
                  const displayAmount = isTransfer && isOutgoing ? -Number(t.amount) : Number(t.amount);
                  
                  return (
                    <div 
                      key={t.id} 
                      className={`p-3 flex items-center gap-3 ${index !== items.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      {/* Clear Status Button */}
                      <button
                        onClick={() => handleToggleClear(t)}
                        className={`text-xl ${getClearColor(t.clearStatus)} transition-colors`}
                      >
                        {getClearIcon(t.clearStatus)}
                      </button>

                      {/* Transaction Info */}
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {t.type === 'loan' 
                            ? (t.memo || 'Loan Transaction')
                            : isTransfer 
                              ? `Transfer ${isOutgoing ? 'to' : 'from'} ${isOutgoing ? t.toAccount : t.fromAccount}`
                              : t.payee || 'No Payee'
                          }
                        </div>
                        <div className="text-xs text-gray-500">
                          {t.type === 'loan'
                            ? t.loan
                            : !isTransfer && t.category
                          }
                          {!isTransfer && t.type !== 'loan' && t.memo && ` • ${t.memo}`}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className={`font-bold ${displayAmount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(displayAmount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AccountDetail;