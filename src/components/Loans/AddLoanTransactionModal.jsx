import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AddLoanTransactionModal = ({ isOpen, onClose, onSave, loanName = '', transactions = [] }) => {
  const [direction, setDirection] = useState('out'); // 'out' = borrow, 'in' = pay back
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [dateInputType, setDateInputType] = useState('text');
  
  const [formData, setFormData] = useState({
    amount: '',
    payee: '',
    loan: loanName,
    account: 'Cash',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });

  const [existingLoans, setExistingLoans] = useState([]);
  const [showLoanList, setShowLoanList] = useState(false);
  const [showNewLoanInput, setShowNewLoanInput] = useState(false);
  const [accounts, setAccounts] = useState([]);

  // Load existing loans when modal opens
  useEffect(() => {
    if (isOpen) {
      loadExistingLoans();
      loadAccounts();
      // Reset form
      setFormData({
        amount: '',
        payee: '',
        loan: loanName || '', // Pre-fill if provided
        account: 'Cash',
        date: new Date().toISOString().split('T')[0],
        memo: ''
      });
      setDisplayAmount('');
      setDirection('out');
      setDateInputType('text');
      setShowNewLoanInput(false);
    }
  }, [isOpen, loanName]);

  const loadExistingLoans = async () => {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', 'test-user'),
        where('type', '==', 'loan')
      );
      const snapshot = await getDocs(q);
      
      // Get unique loan names
      const loanNames = [...new Set(snapshot.docs.map(d => d.data().loan))].filter(Boolean);
      setExistingLoans(loanNames);
    } catch (e) {
      console.error("Load loans error:", e);
    }
  };

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
    if (!formData.loan.trim()) {
      alert("Please select or create a loan name!");
      return;
    }
    if (!formData.payee.trim()) {
      alert("Please enter payee name!");
      return;
    }

    setLoading(true);
    try {
      const amt = Number(formData.amount);

      const transactionData = {
        userId: 'test-user',
        type: 'loan',
        loanType: transactions.find(t => t.loan === formData.loan)?.loanType || 'borrow',
        direction: direction,
        amount: direction === 'in' ? amt : -amt, // IN = positive, OUT = negative
        payee: formData.payee.trim(),
        loan: formData.loan.trim(),
        account: formData.account,
        date: formData.date,
        memo: formData.memo,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'transactions'), transactionData);

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving loan transaction:", error);
      alert("Error saving: " + error.message);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[450px] h-[90vh] sm:h-auto sm:rounded-xl flex flex-col animate-slide-up">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">Record Loan Transaction</h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="text-purple-600 font-bold disabled:opacity-50"
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
                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                : 'bg-white text-gray-500 border'
            }`}
          >
            🔴 OUT
          </button>
          <button
            onClick={() => setDirection('in')}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              direction === 'in'
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'bg-white text-gray-500 border'
            }`}
          >
            🟢 IN
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          
          {/* Amount Input (Large) */}
          <div className="text-center py-4">
            <label className="text-xs text-gray-500 uppercase font-semibold block mb-2">Amount</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayAmount}
              onChange={handleAmountChange}
              className={`text-4xl font-bold text-center w-full focus:outline-none bg-transparent ${
                direction === 'out' ? 'text-red-500' : 'text-green-500'
              }`}
              autoFocus
            />
          </div>

          {/* Helper Text */}
          <div className={`text-center text-sm p-3 rounded-lg ${
            direction === 'out' 
              ? 'bg-red-50 text-red-700 border border-red-200' 
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {direction === 'out' 
              ? '🔴 Money goes OUT (you pay or lend money)'
              : '🟢 Money comes IN (you borrow or receive repayment)'
            }
          </div>

          {/* Payee */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">
              Payee
            </label>
            <input
              type="text"
              placeholder="Name..."
              value={formData.payee}
              onChange={(e) => setFormData({...formData, payee: e.target.value})}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>

          {/* Loan Name - Dropdown + Create New */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Loan Name</label>
            
            {!showNewLoanInput ? (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Select or create new loan..."
                  value={formData.loan}
                  onChange={(e) => {
                    setFormData({...formData, loan: e.target.value});
                    setShowLoanList(true);
                  }}
                  onFocus={() => setShowLoanList(true)}
                  onBlur={() => setTimeout(() => setShowLoanList(false), 200)}
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-purple-500 outline-none"
                />
                
                {/* Dropdown List */}
                {showLoanList && (
                  <div className="absolute z-20 w-full bg-white shadow-xl max-h-48 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                    {existingLoans.length > 0 && (
                      <>
                        {existingLoans
                          .filter(loan => loan.toLowerCase().includes(formData.loan.toLowerCase()))
                          .map(loan => (
                            <div
                              key={loan}
                              onClick={() => {
                                setFormData({...formData, loan});
                                setShowLoanList(false);
                              }}
                              className="p-3 hover:bg-purple-50 cursor-pointer border-b border-gray-50"
                            >
                              {loan}
                            </div>
                          ))}
                      </>
                    )}
                    
                    {/* Create New Option */}
                    <div
                      onClick={() => {
                        setShowNewLoanInput(true);
                        setShowLoanList(false);
                      }}
                      className="p-3 text-purple-600 hover:bg-purple-50 cursor-pointer flex items-center gap-2 border-t border-purple-100"
                    >
                      <span>➕</span>
                      <span className="font-medium">Create New Loan</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Create New Loan Input
              <div className="bg-purple-50 p-3 rounded-lg mt-1 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-700">CREATE NEW LOAN</span>
                  <button
                    onClick={() => setShowNewLoanInput(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="E.g. Loan from Tej, Bank Loan 2024..."
                  value={formData.loan}
                  onChange={(e) => setFormData({...formData, loan: e.target.value})}
                  className="w-full p-3 bg-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                  autoFocus
                />
              </div>
            )}
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
            <div className="text-xs text-gray-500 mt-1">
              {direction === 'out' 
                ? 'Where the money goes'
                : 'Where you pay from'
              }
            </div>
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

          {/* Important Note */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-blue-700 text-sm">
              <span>ℹ️</span>
              <div>
                <div className="font-semibold mb-1">Important:</div>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>Your <strong>Account balance</strong> will change (real money)</li>
                  <li>Loan transactions <strong>won't</strong> affect Income/Expense reports</li>
                  <li>Track repayments by using "Pay Back" direction</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddLoanTransactionModal;