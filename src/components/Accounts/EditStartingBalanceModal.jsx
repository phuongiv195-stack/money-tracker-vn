import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useToast } from '../Toast/ToastProvider';

const EditStartingBalanceModal = ({ isOpen, onClose, account, onSave }) => {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (isOpen && account) {
      const bal = account.startingBalance || 0;
      setValue(String(bal));
      setDisplayValue(bal ? Number(bal).toLocaleString('en-US') : '');
      
      // Set date
      if (account.startingBalanceDate) {
        const d = account.startingBalanceDate.seconds 
          ? new Date(account.startingBalanceDate.seconds * 1000)
          : new Date(account.startingBalanceDate);
        setDate(d.toISOString().split('T')[0]);
      } else {
        setDate(new Date().toISOString().split('T')[0]);
      }
    }
  }, [isOpen, account]);

  const formatDateForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleValueChange = (e) => {
    const rawValue = e.target.value.replace(/,/g, '');
    if (rawValue === '' || /^\d*$/.test(rawValue)) {
      setValue(rawValue);
      setDisplayValue(rawValue ? Number(rawValue).toLocaleString('en-US') : '');
    }
  };

  const handleSave = async () => {
    try {
      const newBalance = parseFloat(value) || 0;
      await updateDoc(doc(db, 'accounts', account.id), { 
        startingBalance: newBalance,
        startingBalanceDate: new Date(date),
        updatedAt: new Date()
      });
      toast.success('Starting balance updated!');
      if (onSave) onSave();
      onClose();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  if (!isOpen || !account) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
        <div className="bg-emerald-500 p-4 text-white text-center">
          <div className="text-3xl mb-1">💵</div>
          <div className="font-bold text-lg">Edit Starting Balance</div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Amount</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayValue}
              onChange={handleValueChange}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none text-center text-xl font-bold"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <div className="relative mt-1">
              <div className="w-full p-3 bg-gray-50 rounded-lg flex items-center justify-between pointer-events-none">
                <span className="text-gray-800">{formatDateForDisplay(date)}</span>
                <span className="text-gray-400">📅</span>
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onClose} 
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave} 
              className="flex-1 bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditStartingBalanceModal;
