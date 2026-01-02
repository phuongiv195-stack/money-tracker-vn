import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddLoanTransactionModal = ({ isOpen, onClose, onSave, loan }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  const { tagSuggestions } = useData();
  
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
  
  // For I Lend: 'lend_more' (money out) or 'receive' (money in)
  // For I Borrow: 'borrow_more' (money in) or 'pay' (money out)
  const [transactionType, setTransactionType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [showTagList, setShowTagList] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    account: '',
    date: getLocalToday(),
    note: '',
    tag: ''
  });

  const [accounts, setAccounts] = useState([]);

  const isBorrow = loan?.loanType === 'borrow';

  useEffect(() => {
    if (isOpen && loan) {
      loadAccounts();
      setFormData({
        amount: '',
        account: '',
        date: getLocalToday(),
        note: '',
        tag: ''
      });
      setDisplayAmount('');
      setTransactionType(null);
      setShowTagList(false);
    }
  }, [isOpen, loan]);

  const loadAccounts = async () => {
    try {
      const q = query(
        collection(db, 'accounts'), 
        where('userId', '==', userId),
        where('isActive', '==', true)
      );
      const snapshot = await getDocs(q);
      
      const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'ASSETS': 2, 'INVESTMENTS': 3 };
      
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
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error("Please enter amount!");
      return;
    }
    if (!formData.account) {
      toast.error("Please select account!");
      return;
    }
    if (!transactionType) {
      toast.error("Please select transaction type!");
      return;
    }

    setLoading(true);
    try {
      const amt = Number(formData.amount);
      
      // Determine the sign based on transaction type
      // For BORROW loan:
      //   - borrow_more: money IN = positive (increases what I owe)
      //   - pay: money OUT = negative (decreases what I owe)
      // For LEND loan:
      //   - lend_more: money OUT = negative (increases what they owe me)
      //   - receive: money IN = positive (decreases what they owe me)
      
      let finalAmount;
      let memo;
      
      if (isBorrow) {
        if (transactionType === 'borrow_more') {
          finalAmount = amt; // positive = money in
          memo = formData.note || 'Borrowed more';
        } else { // pay
          finalAmount = -amt; // negative = money out
          memo = formData.note || 'Payment';
        }
      } else { // lend
        if (transactionType === 'lend_more') {
          finalAmount = -amt; // negative = money out
          memo = formData.note || 'Lent more';
        } else { // receive
          finalAmount = amt; // positive = money in
          memo = formData.note || 'Received payment';
        }
      }

      const transactionData = {
        userId: userId,
        type: 'loan',
        loanType: loan.loanType,
        amount: finalAmount,
        loan: loan.name,
        account: formData.account,
        date: formData.date,
        memo: memo,
        tag: formData.tag || null,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'transactions'), transactionData);

      toast.success('Transaction added!');
      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error("Error: " + error.message);
    }
    setLoading(false);
  };

  if (!isOpen || !loan) return null;

  // Render transaction type buttons based on loan type
  const renderTypeButtons = () => {
    if (isBorrow) {
      // I Borrow: Borrow more (money in) or Pay (money out)
      return (
        <div className="flex gap-3">
          <button
            onClick={() => setTransactionType('borrow_more')}
            className={`flex-1 py-4 rounded-xl font-medium transition-all ${
              transactionType === 'borrow_more'
                ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-400'
                : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">💰</div>
            <div className="font-bold">Borrow More</div>
            <div className="text-xs opacity-70">Money in</div>
          </button>
          <button
            onClick={() => setTransactionType('pay')}
            className={`flex-1 py-4 rounded-xl font-medium transition-all ${
              transactionType === 'pay'
                ? 'bg-red-100 text-red-700 border-2 border-red-400'
                : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">💸</div>
            <div className="font-bold">Pay</div>
            <div className="text-xs opacity-70">Money out</div>
          </button>
        </div>
      );
    } else {
      // I Lend: Lend more (money out) or Receive (money in)
      return (
        <div className="flex gap-3">
          <button
            onClick={() => setTransactionType('lend_more')}
            className={`flex-1 py-4 rounded-xl font-medium transition-all ${
              transactionType === 'lend_more'
                ? 'bg-red-100 text-red-700 border-2 border-red-400'
                : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">💸</div>
            <div className="font-bold">Lend More</div>
            <div className="text-xs opacity-70">Money out</div>
          </button>
          <button
            onClick={() => setTransactionType('receive')}
            className={`flex-1 py-4 rounded-xl font-medium transition-all ${
              transactionType === 'receive'
                ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-400'
                : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">💰</div>
            <div className="font-bold">Receive</div>
            <div className="text-xs opacity-70">Money in</div>
          </button>
        </div>
      );
    }
  };

  // Get helper text based on selection
  const getHelperText = () => {
    if (!transactionType) return null;
    
    if (isBorrow) {
      if (transactionType === 'borrow_more') {
        return { text: '💰 Borrow more → Your debt increases', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      } else {
        return { text: '💸 Pay back → Your debt decreases', color: 'bg-red-50 text-red-700 border-red-200' };
      }
    } else {
      if (transactionType === 'lend_more') {
        return { text: '💸 Lend more → They owe you more', color: 'bg-red-50 text-red-700 border-red-200' };
      } else {
        return { text: '💰 Receive payment → They owe you less', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      }
    }
  };

  const helper = getHelperText();

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      
      {/* Header with Save button */}
      <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-lg p-2">✕</button>
        <div className="text-center">
          <h2 className="font-semibold text-lg">Add Transaction</h2>
          <div className="text-xs text-gray-500">{loan.name}</div>
        </div>
        <button 
          onClick={handleSubmit} 
          disabled={loading || !transactionType}
          className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* Loan Info Banner */}
        <div className={`p-4 rounded-xl ${isBorrow ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-100 border border-gray-300'}`}>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">
                {isBorrow ? 'I Borrowed from' : 'I Lent to'}
              </div>
              <div className="font-bold text-lg">{loan.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase font-semibold">Balance</div>
              <div className={`font-bold text-lg ${Math.abs(loan.balance) === 0 ? 'text-emerald-600' : 'text-gray-800'}`}>
                {new Intl.NumberFormat('en-US').format(Math.abs(loan.balance))}
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Type Selection */}
        <div>
          <label className="text-xs text-gray-500 uppercase font-semibold mb-3 block">
            What do you want to do?
          </label>
          {renderTypeButtons()}
        </div>

        {/* Helper text */}
        {helper && (
          <div className={`text-sm p-3 rounded-lg border ${helper.color}`}>
            {helper.text}
          </div>
        )}

        {/* Amount */}
        {transactionType && (
          <>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Amount</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={displayAmount}
                onChange={handleAmountChange}
                className={`w-full text-3xl font-bold text-center p-4 rounded-lg mt-1 focus:ring-2 outline-none border-2 ${
                  transactionType === 'borrow_more' || transactionType === 'receive'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-300 focus:ring-emerald-500'
                    : 'bg-red-50 text-red-600 border-red-300 focus:ring-red-500'
                }`}
              />
            </div>

            {/* Account */}
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
              <select 
                className="w-full p-3 bg-gray-100 rounded-lg mt-1 outline-none border border-gray-200"
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

            {/* Note */}
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Note</label>
              <input
                type="text"
                placeholder="Optional note..."
                className="w-full p-3 bg-gray-100 rounded-lg mt-1 outline-none border border-gray-200"
                value={formData.note}
                onChange={(e) => setFormData({...formData, note: e.target.value})}
              />
            </div>

            {/* Tag */}
            <div className="relative">
              <label className="text-xs text-gray-500 uppercase font-semibold">Tag</label>
              <input
                type="text"
                placeholder="e.g. DaNang2025 (optional)"
                className="w-full p-3 bg-gray-100 rounded-lg mt-1 outline-none border border-gray-200"
                value={formData.tag}
                onChange={(e) => {
                  setFormData({...formData, tag: e.target.value});
                  setShowTagList(true);
                }}
                onFocus={() => setShowTagList(true)}
                onBlur={() => setTimeout(() => setShowTagList(false), 200)}
              />
              
              {showTagList && tagSuggestions.length > 0 && (
                <div className="absolute z-20 w-full bg-white shadow-xl max-h-36 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                  {tagSuggestions
                    .filter(tag => tag.toLowerCase().includes((formData.tag || '').toLowerCase()))
                    .map(tag => (
                      <div 
                        key={tag} 
                        className="p-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setFormData({...formData, tag});
                          setShowTagList(false);
                        }}
                      >
                        <span className="text-emerald-500">🏷️</span>
                        <span>{tag}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddLoanTransactionModal;
