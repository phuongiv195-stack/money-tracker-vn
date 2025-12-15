import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AddNewLoanModal = ({ isOpen, onClose, onSave }) => {
  const [loanType, setLoanType] = useState('borrow'); // 'borrow' or 'lend'
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [dateInputType, setDateInputType] = useState('text');
  
  const [formData, setFormData] = useState({
    name: '',
    loanName: '',
    amount: '',
    account: 'Cash',
    date: new Date().toISOString().split('T')[0],
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
        account: 'Cash',
        date: new Date().toISOString().split('T')[0],
        memo: ''
      });
      setDisplayAmount('');
      setLoanType('borrow');
      setDateInputType('text');
    }
  }, [isOpen]);

  // Auto-generate loan name when name changes
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
      const q = query(collection(db, 'accounts'), where('userId', '==', 'test-user'));
      const snapshot = await getDocs(q);
      const accountNames = snapshot.docs.map(d => d.data().name);
      setAccounts(accountNames);
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
      alert("Please enter amount!");
      return;
    }
    if (!formData.loanName.trim()) {
      alert("Please enter name!");
      return;
    }

    setLoading(true);
    try {
      const amt = Number(formData.amount);

      // Create initial loan transaction
      const transactionData = {
        userId: 'test-user',
        type: 'loan',
        loanType: loanType, // 'borrow' or 'lend'
        direction: 'in', // First transaction is always IN (money comes in)
        amount: amt, // Positive (money in)
        payee: formData.name.trim(),
        loan: formData.loanName.trim(),
        account: formData.account,
        date: formData.date,
        memo: formData.memo,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'transactions'), transactionData);

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving loan:", error);
      alert("Error: " + error.message);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[450px] sm:rounded-xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">Add New Loan</h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="text-purple-600 font-bold disabled:opacity-50"
          >
            {loading ? 'SAVING...' : 'SAVE'}
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          
          {/* Loan Type */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Loan Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setLoanType('borrow')}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  loanType === 'borrow'
                    ? 'bg-green-100 text-green-700 border-2 border-green-300'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}
              >
                💰 I Borrow Money
              </button>
              <button
                onClick={() => setLoanType('lend')}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  loanType === 'lend'
                    ? 'bg-red-100 text-red-700 border-2 border-red-300'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}
              >
                💸 I Lend Money
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Name</label>
            <input
              type="text"
              placeholder={loanType === 'borrow' ? "E.g. Tej, Bank..." : "E.g. Minh, Friend..."}
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-purple-500 outline-none"
              autoFocus
            />
          </div>

          {/* Loan Name (Auto-generated, editable) */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Loan Name</label>
            <input
              type="text"
              placeholder="Auto-generated..."
              value={formData.loanName}
              onChange={(e) => setFormData({...formData, loanName: e.target.value})}
              className="w-full p-3 bg-blue-50 rounded-lg mt-1 focus:ring-2 focus:ring-purple-500 outline-none border border-blue-200"
            />
            <div className="text-xs text-gray-500 mt-1">
              💡 Auto-generated, but you can edit freely
            </div>
          </div>

          {/* Initial Amount */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Initial Amount</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayAmount}
              onChange={handleAmountChange}
              className={`w-full text-3xl font-bold text-center p-4 rounded-lg mt-1 focus:ring-2 focus:ring-purple-500 outline-none ${
                loanType === 'borrow' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
              }`}
            />
          </div>

          {/* Account */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
            <select 
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
              value={formData.account}
              onChange={(e) => setFormData({...formData, account: e.target.value})}
            >
              {accounts.map(acc => (
                <option key={acc}>{acc}</option>
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
        </div>
      </div>
    </div>
  );
};

export default AddNewLoanModal;