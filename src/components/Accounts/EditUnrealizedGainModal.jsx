import React, { useState, useEffect } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useToast } from '../Toast/ToastProvider';

const EditUnrealizedGainModal = ({ isOpen, onClose, transaction, account, onSave }) => {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [displayAmount, setDisplayAmount] = useState('');
  const [date, setDate] = useState('');

  const formatCurrency = (val) => new Intl.NumberFormat('en-US').format(Math.abs(val) || 0);

  const formatDateForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    if (isOpen && transaction) {
      const amt = transaction.amount || 0;
      setAmount(String(amt));
      setDisplayAmount((amt < 0 ? '-' : '') + formatCurrency(Math.abs(amt)));
      setDate(transaction.date || '');
    }
  }, [isOpen, transaction]);

  const handleAmountChange = (e) => {
    let raw = e.target.value.replace(/,/g, '');
    if (raw === '-') {
      setAmount('-');
      setDisplayAmount('-');
      return;
    }
    if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
      setAmount(raw);
      if (raw === '' || raw === '-') {
        setDisplayAmount(raw);
      } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          const isNegative = raw.startsWith('-');
          setDisplayAmount((isNegative ? '-' : '') + formatCurrency(Math.abs(num)));
        }
      }
    }
  };

  const handleSave = async () => {
    const oldAmount = Number(transaction.amount) || 0;
    const newAmount = parseFloat(amount);
    if (isNaN(newAmount)) {
      toast.error('Invalid amount');
      return;
    }
    
    try {
      // Update transaction with date
      await updateDoc(doc(db, 'transactions', transaction.id), {
        amount: newAmount,
        date: date,
        updatedAt: new Date()
      });
      
      // Update currentValue on account
      const diff = newAmount - oldAmount;
      const newCurrentValue = (account.currentValue || 0) + diff;
      await updateDoc(doc(db, 'accounts', account.id), {
        currentValue: newCurrentValue,
        updatedAt: new Date()
      });
      
      toast.success('Updated!');
      if (onSave) onSave();
      onClose();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDelete = async () => {
    try {
      const oldAmount = Number(transaction.amount) || 0;
      
      // Delete transaction
      await deleteDoc(doc(db, 'transactions', transaction.id));
      
      // Update currentValue on account (subtract the deleted amount)
      const newCurrentValue = (account.currentValue || 0) - oldAmount;
      await updateDoc(doc(db, 'accounts', account.id), {
        currentValue: newCurrentValue,
        updatedAt: new Date()
      });
      
      toast.success('Deleted!');
      if (onSave) onSave();
      onClose();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  if (!isOpen || !transaction) return null;

  const isGain = Number(transaction.amount) >= 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
        <div className="bg-emerald-500 p-4 text-white text-center">
          <div className="text-3xl mb-1">📈</div>
          <div className="font-bold text-lg">Edit Unrealized {isGain ? 'Gain' : 'Loss'}</div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Amount</label>
            <input
              type="text"
              inputMode="text"
              value={displayAmount}
              onChange={handleAmountChange}
              className="w-full p-3 bg-gray-200 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none text-center text-xl font-bold"
              autoFocus
            />
          </div>
          
          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <div className="relative mt-1">
              <div className="w-full p-3 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-between pointer-events-none">
                <span className="text-gray-800">{formatDateForDisplay(date)}</span>
                <span className="text-gray-400">📅</span>
              </div>
              <input 
                type="date" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium"
            >
              Save
            </button>
          </div>
          <button 
            onClick={handleDelete}
            className="w-full bg-red-100 text-red-600 py-3 rounded-lg font-medium"
          >
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditUnrealizedGainModal;
