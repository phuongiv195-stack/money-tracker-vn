import React, { useMemo, useState } from 'react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import useBackHandler from '../../hooks/useBackHandler';

const AccountDetail = ({ account, transactions, onClose }) => {
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileBalance, setReconcileBalance] = useState('');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useBackHandler(true, onClose);

  if (!account) return null;

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
    let bal = 0, cleared = 0, uncleared = 0;
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

  const handleToggleClear = async (t, e) => {
    e.stopPropagation();
    if (t.clearStatus === 'reconciled') { alert('🔒 Locked'); return; }
    try {
      await updateDoc(doc(db, 'transactions', t.id), { clearStatus: t.clearStatus === 'cleared' ? 'uncleared' : 'cleared' });
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleFinishReconcile = async () => {
    const targetBalance = parseFloat(reconcileBalance.replace(/,/g, ''));
    if (isNaN(targetBalance)) { alert('Enter valid balance'); return; }
    const clearedTrans = accountTransactions.filter(t => t.clearStatus === 'cleared');
    if (clearedTrans.length === 0) { alert('No cleared transactions'); return; }
    try {
      const batch = writeBatch(db);
      const timestamp = new Date();
      clearedTrans.forEach(t => batch.update(doc(db, 'transactions', t.id), { clearStatus: 'reconciled', reconciledAt: timestamp }));
      batch.update(doc(db, 'accounts', account.id), { lastReconcileDate: timestamp, lastReconcileBalance: targetBalance });
      await batch.commit();
      setIsReconciling(false);
      alert('✅ Reconciled!');
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleUnreconcile = async () => {
    if (!account.lastReconcileDate) { alert('Nothing to undo'); return; }
    const lastTime = account.lastReconcileDate.seconds * 1000;
    const toUnlock = accountTransactions.filter(t => t.clearStatus === 'reconciled' && t.reconciledAt && Math.abs(t.reconciledAt.seconds * 1000 - lastTime) < 5000);
    if (toUnlock.length === 0) { alert('Nothing to unlock'); return; }
    if (!window.confirm(`Unlock ${toUnlock.length} transactions?`)) return;
    try {
      const batch = writeBatch(db);
      toUnlock.forEach(t => batch.update(doc(db, 'transactions', t.id), { clearStatus: 'cleared', reconciledAt: null }));
      batch.update(doc(db, 'accounts', account.id), { lastReconcileDate: null, lastReconcileBalance: null });
      await batch.commit();
      alert('✅ Unlocked!');
    } catch (err) { alert('Error: ' + err.message); }
  };

  const getClearIcon = (s) => s === 'reconciled' ? '🔒' : s === 'cleared' ? '✓' : '○';
  const getClearColor = (s) => s === 'reconciled' ? 'text-gray-400' : s === 'cleared' ? 'text-emerald-600' : 'text-gray-300';
  const isMarketValue = ['investment','property','vehicle','asset'].includes(account.type);
  const SplitIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 inline-block mr-1"><path d="M16 3l-4 4-4-4"/><path d="M12 7v6"/><path d="M8 21l4-4 4 4"/><path d="M12 17v-4"/></svg>);

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
        <div className="font-bold text-lg flex items-center gap-2"><span>{account.icon}</span><span>{account.name}</span></div>
        <div className="w-16"></div>
      </div>

      <div className="p-4 bg-emerald-600 text-white shadow-sm">
        <div className="text-center">
          <div className="text-sm opacity-90">{isMarketValue ? 'Current Value' : 'Balance'}</div>
          <div className="text-3xl font-bold mt-1">{balance >= 0 ? '+' : '-'}{formatCurrency(isMarketValue ? account.currentValue : balance)}</div>
        </div>
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
        <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <div className="font-semibold text-yellow-800 mb-2">🔍 Reconcile Mode</div>
          <input type="text" inputMode="numeric" placeholder="Statement balance" value={formatNumberInput(reconcileBalance)} onChange={handleBalanceChange} className="w-full text-2xl font-bold text-center p-3 border-2 border-yellow-300 rounded-lg mb-3" autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setIsReconciling(false)} className="flex-1 bg-gray-200 py-2 rounded-lg font-medium">Cancel</button>
            <button onClick={handleFinishReconcile} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-medium">✓ Finish</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-400 mt-10">No transactions</div>
        ) : (
          Object.entries(groupedTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">{formatDateLabel(date)}</div>
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {items.map((t, index) => {
                  const isTransfer = t.type === 'transfer';
                  const isSplit = t.type === 'split';
                  const isLoan = t.type === 'loan';
                  const isOutgoing = isTransfer && t.fromAccount === account.name;
                  let displayAmount = isTransfer ? (isOutgoing ? -Number(t.amount) : Number(t.amount)) : isSplit ? Number(t.totalAmount) || 0 : Number(t.amount) || 0;
                  const isPositive = displayAmount > 0;
                  return (
                    <div key={t.id} onClick={() => { setEditingTransaction(t); setIsModalOpen(true); }} className={`p-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${index !== items.length - 1 ? 'border-b' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 truncate flex items-center">
                            {isSplit && <SplitIcon />}
                            {isLoan ? (t.memo || 'Loan') : isTransfer ? `Transfer ${isOutgoing ? 'to' : 'from'} ${isOutgoing ? t.toAccount : t.fromAccount}` : (t.payee || 'No Payee')}
                          </div>
                          {!isSplit && <div className="text-xs text-gray-500 truncate">{isLoan ? t.loan : isTransfer ? 'Transfer' : t.category}</div>}
                        </div>
                        <div className={`font-bold whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>{isPositive ? '+' : '-'}{formatCurrency(displayAmount)}</div>
                        <button onClick={(e) => handleToggleClear(t, e)} className={`text-xl w-8 h-8 flex items-center justify-center rounded-full ${getClearColor(t.clearStatus)}`}>{getClearIcon(t.clearStatus)}</button>
                      </div>
                      {isSplit && t.splits && (
                        <div className="mt-2 space-y-1 pl-4 border-l-2 border-sky-200 ml-1">
                          {t.splits.map((s, i) => (<div key={i} className="flex justify-between text-sm"><span className="text-gray-600">{s.isLoan ? s.loan : s.category}</span><span className="text-gray-700 font-medium">{formatCurrency(s.amount)}</span></div>))}
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

      <AddTransactionModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingTransaction(null); }} onSave={() => { setIsModalOpen(false); setEditingTransaction(null); }} editTransaction={editingTransaction} />
    </div>
  );
};

export default AccountDetail;