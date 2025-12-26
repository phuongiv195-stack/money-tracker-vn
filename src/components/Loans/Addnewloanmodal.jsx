import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddNewLoanModal = ({ isOpen, onClose, onSave }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  
  // Helper to get today's date in local timezone
  const getLocalToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const formatDateForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  const [loanType, setLoanType] = useState('borrow');
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    loanName: '',
    amount: '',
    account: '',
    date: getLocalToday(),
    memo: ''
  });

  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
      setFormData({
        name: '',
        loanName: '',
        amount: '',
        account: '',
        date: getLocalToday(),
        memo: ''
      });
      setDisplayAmount('');
      setLoanType('borrow');
    }
  }, [isOpen]);

  // Auto-generate loan name
  useEffect(() => {
    if (formData.name.trim()) {
      const prefix = loanType === 'borrow' ? 'Borrow from' : 'Lend to';
      setFormData(prev => ({
        ...prev,
        loanName: `${prefix} ${formData.name}`
      }));
    } else {
      setFormData(prev => ({ ...prev, loanName: '' }));
    }
  }, [formData.name, loanType]);

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
      // Set default account
      if (accs.length > 0) {
        setFormData(prev => ({ ...prev, account: accs[0] }));
      }
    } catch (e) {
      console.error("Load accounts error:", e);
    }
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
    if (!formData.loanName.trim()) {
      toast.error("Please enter name!");
      return;
    }
    if (!formData.account) {
      toast.error("Please select account!");
      return;
    }

    setLoading(true);
    try {
      const amt = Number(formData.amount);

      // CORE LOGIC:
      // Borrow = money comes IN to my account = POSITIVE amount
      // Lend = money goes OUT from my account = NEGATIVE amount
      const finalAmount = loanType === 'borrow' ? amt : -amt;

      const transactionData = {
        userId: userId,
        type: 'loan',
        loanType: loanType,
        amount: finalAmount,
        loan: formData.loanName.trim(),
        account: formData.account,
        date: formData.date,
        memo: formData.memo || (loanType === 'borrow' ? 'Initial borrow' : 'Initial lend'),
        createdAt: new Date()
      };

      await addDoc(collection(db, 'transactions'), transactionData);

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving loan:", error);
      toast.error("Error: " + error.message);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-lg p-2">✕</button>
        <h2 className="font-semibold text-lg">Add New Loan</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Loan Type */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Loan Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setLoanType('borrow')}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  loanType === 'borrow'
                    ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-400'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}
              >
                💰 I Borrow
              </button>
              <button
                onClick={() => setLoanType('lend')}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  loanType === 'lend'
                    ? 'bg-red-100 text-red-700 border-2 border-red-400'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}
              >
                💸 I Lend
              </button>
            </div>
          </div>

          {/* Helper text */}
          <div className={`text-sm p-3 rounded-lg border ${
            loanType === 'borrow' 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {loanType === 'borrow' 
              ? '💰 Money comes IN → Account balance increases'
              : '💸 Money goes OUT → Account balance decreases'
            }
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Name</label>
            <input
              type="text"
              placeholder={loanType === 'borrow' ? "E.g. Mike, Bank..." : "E.g. John, Friend..."}
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 bg-gray-100 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none border border-gray-200"
              
            />
          </div>

          {/* Loan Name (Auto-generated) */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Loan Name</label>
            <input
              type="text"
              placeholder="Auto-generated..."
              value={formData.loanName}
              onChange={(e) => setFormData({...formData, loanName: e.target.value})}
              className="w-full p-3 bg-emerald-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none border border-emerald-200"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Amount</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayAmount}
              onChange={handleAmountChange}
              className={`w-full text-3xl font-bold text-center p-4 rounded-lg mt-1 focus:ring-2 outline-none border-2 ${
                loanType === 'borrow' 
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-300 focus:ring-emerald-500' 
                  : 'bg-red-50 text-red-600 border-red-300 focus:ring-red-500'
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
              {accounts.length === 0 ? (
                <option value="">No accounts available</option>
              ) : (
                accounts.map(acc => (
                  <option key={acc} value={acc}>{acc}</option>
                ))
              )}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <div className="relative mt-1">
              <input 
                type="date" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
              <div className="w-full p-3 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-between">
                <span className="text-gray-800">{formatDateForDisplay(formData.date)}</span>
                <span className="text-gray-400">📅</span>
              </div>
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Memo</label>
            <input
              type="text"
              placeholder="Notes (optional)"
              className="w-full p-3 bg-white rounded-lg mt-1 outline-none border border-gray-200"
              value={formData.memo}
              onChange={(e) => setFormData({...formData, memo: e.target.value})}
            />
          </div>
        </div>

        {/* Fixed Bottom Bar */}
        <div className="p-4 mb-20 border-t bg-white flex justify-end">
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="px-6 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'SAVE'}
          </button>
        </div>
    </div>
  );
};

export default AddNewLoanModal;