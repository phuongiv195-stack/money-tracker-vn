import React, { useState, useEffect } from 'react';
import { updateDoc, deleteDoc, doc, query, where, getDocs, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const EditLoanTransactionModal = ({ isOpen, onClose, onSave, transaction, loan }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [dateInputType, setDateInputType] = useState('text');
  const [direction, setDirection] = useState('out');
  
  const [formData, setFormData] = useState({
    amount: '',
    account: '',
    date: '',
    memo: ''
  });

  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (isOpen && transaction) {
      loadAccounts();
      
      const amt = Number(transaction.amount);
      const isPositive = amt > 0;
      
      setDirection(isPositive ? 'in' : 'out');
      setFormData({
        amount: Math.abs(amt).toString(),
        account: transaction.account || '',
        date: transaction.date || new Date().toISOString().split('T')[0],
        memo: transaction.memo || ''
      });
      setDisplayAmount(Math.abs(amt).toLocaleString('en-US'));
      setDateInputType('text');
    }
  }, [isOpen, transaction]);

  const loadAccounts = async () => {
    try {
      const q = query(
        collection(db, 'accounts'), 
        where('userId', '==', userId),
        where('isActive', '==', true)
      );
      const snapshot = await getDocs(q);
      
      // Define group order priority
      const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'INVESTMENTS': 2 };
      
      const accs = snapshot.docs
        .map(d => ({ 
          name: d.data().name, 
          group: d.data().group,
          order: d.data().order ?? 999 
        }))
        .filter(a => a.name)
        .sort((a, b) => {
          const groupA = groupOrder[a.group] ?? 99;
          const groupB = groupOrder[b.group] ?? 99;
          if (groupA !== groupB) return groupA - groupB;
          return a.order - b.order;
        })
        .map(a => a.name);
        
      setAccounts(accs);
    } catch (e) {
      console.error("Load accounts error:", e);
    }
  };

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

  const handleSubmit = async () => {
    if (!formData.amount) {
      toast.error("Please enter amount!");
      return;
    }

    setLoading(true);
    try {
      const amt = Number(formData.amount);
      const finalAmount = direction === 'in' ? amt : -amt;

      await updateDoc(doc(db, 'transactions', transaction.id), {
        amount: finalAmount,
        account: formData.account,
        date: formData.date,
        memo: formData.memo
      });

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Error: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    const confirmed = await toast.confirm({
      title: 'Delete Transaction',
      message: 'Delete this transaction?',
      confirmText: 'Delete',
      type: 'danger'
    });
    
    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'transactions', transaction.id));
      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Error: " + error.message);
    }
    setLoading(false);
  };

  if (!isOpen || !transaction) return null;

  const isBorrow = loan?.loanType === 'borrow';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[450px] sm:rounded-xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">Edit Transaction</h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="text-emerald-600 font-bold disabled:opacity-50"
          >
            {loading ? 'SAVING...' : 'SAVE'}
          </button>
        </div>

        {/* Direction Tabs */}
        <div className="flex p-2 gap-2 bg-gray-50">
          <button
            onClick={() => setDirection('out')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              direction === 'out'
                ? 'bg-gray-200 text-gray-800 border-2 border-gray-400'
                : 'bg-white text-gray-500 border'
            }`}
          >
            💸 OUT
          </button>
          <button
            onClick={() => setDirection('in')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              direction === 'in'
                ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-400'
                : 'bg-white text-gray-500 border'
            }`}
          >
            💰 IN
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          
          {/* Amount */}
          <div className="text-center py-2">
            <label className="text-xs text-gray-500 uppercase font-semibold block mb-2">Amount</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayAmount}
              onChange={handleAmountChange}
              className={`text-4xl font-bold text-center w-full focus:outline-none bg-transparent ${
                direction === 'out' ? 'text-gray-800' : 'text-emerald-600'
              }`}
              
            />
          </div>

          {/* Account */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
            <select 
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none border border-gray-200"
              value={formData.account}
              onChange={(e) => setFormData({...formData, account: e.target.value})}
            >
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <input 
              type={dateInputType} 
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
              value={dateInputType === 'text' ? formatDateForDisplay(formData.date) : formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              onFocus={() => setDateInputType('date')} 
              onBlur={() => setDateInputType('text')}  
            />
          </div>

          {/* Memo */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Memo</label>
            <input
              type="text"
              placeholder="Notes (optional)"
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
              value={formData.memo}
              onChange={(e) => setFormData({...formData, memo: e.target.value})}
            />
          </div>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={loading}
            className="w-full py-3 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
          >
            🗑️ Delete Transaction
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditLoanTransactionModal;