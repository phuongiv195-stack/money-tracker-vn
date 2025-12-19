import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AddTransactionModal = ({ isOpen, onClose, onSave, editTransaction = null }) => {
  const [activeTab, setActiveTab] = useState('expense');
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [dateInputType, setDateInputType] = useState('text');
  const [isSplitMode, setIsSplitMode] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    payee: '',
    category: '',
    account: '',
    fromAccount: '',
    toAccount: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });

  const [splits, setSplits] = useState([
    { amount: '', category: '', loan: '', memo: '', isLoan: false }
  ]);

  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payeeSuggestions, setPayeeSuggestions] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [showPayeeList, setShowPayeeList] = useState(false);
  const [showCategoryList, setShowCategoryList] = useState(false);
  const [activeSplitIndex, setActiveSplitIndex] = useState(null);

  // Real-time accounts listener
  useEffect(() => {
    if (!isOpen) return;
    
    const q = query(
      collection(db, 'accounts'),
      where('userId', '==', 'test-user'),
      where('isActive', '==', true)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const accs = snapshot.docs.map(d => d.data().name).filter(Boolean);
      setAccounts(accs);
      
      // Set default account if not set
      if (accs.length > 0 && !formData.account) {
        setFormData(prev => ({
          ...prev,
          account: accs[0],
          fromAccount: accs[0],
          toAccount: accs[1] || accs[0]
        }));
      }
    });
    
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadPayees();
      loadCategories();
      loadLoans();
      
      if (editTransaction) {
        if (editTransaction.type === 'split') {
          setIsSplitMode(true);
          setActiveTab(editTransaction.splitType || 'expense');
          setSplits(editTransaction.splits || []);
          setFormData({
            amount: Math.abs(editTransaction.totalAmount).toString(),
            payee: editTransaction.payee || '',
            category: '',
            account: editTransaction.account || '',
            fromAccount: '',
            toAccount: '',
            date: editTransaction.date || new Date().toISOString().split('T')[0],
            memo: ''
          });
          setDisplayAmount(Math.abs(editTransaction.totalAmount).toLocaleString('en-US'));
        } else {
          setIsSplitMode(false);
          setActiveTab(editTransaction.type);
          setFormData({
            amount: Math.abs(editTransaction.amount).toString(),
            payee: editTransaction.payee || '',
            category: editTransaction.category || '',
            account: editTransaction.account || '',
            fromAccount: editTransaction.fromAccount || '',
            toAccount: editTransaction.toAccount || '',
            date: editTransaction.date || new Date().toISOString().split('T')[0],
            memo: editTransaction.memo || ''
          });
          setDisplayAmount(Math.abs(editTransaction.amount).toLocaleString('en-US'));
        }
      } else {
        setIsSplitMode(false);
        setSplits([{ amount: '', category: '', loan: '', memo: '', isLoan: false }]);
        setFormData(prev => ({
          ...prev,
          amount: '',
          payee: '',
          category: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        }));
        setDisplayAmount('');
        setActiveTab('expense');
      }
      setDateInputType('text');
    }
  }, [isOpen, editTransaction]);

  const loadLoans = async () => {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', 'test-user'),
        where('type', '==', 'loan')
      );
      const snapshot = await getDocs(q);
      const loanNames = [...new Set(snapshot.docs.map(d => d.data().loan).filter(Boolean))];
      setLoans(loanNames);
    } catch (e) {
      console.error("Load loans error:", e);
    }
  };

  const loadPayees = async () => {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', 'test-user'),
        orderBy('date', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const payees = [...new Set(snapshot.docs.map(d => d.data().payee).filter(Boolean))];
      setPayeeSuggestions(payees);
    } catch (e) {
      console.error("Load payees error:", e);
    }
  };

  const loadCategories = async () => {
    try {
      const q = query(collection(db, 'categories'), where('userId', '==', 'test-user'));
      const snapshot = await getDocs(q);
      setCategorySuggestions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Load categories error:", e);
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

  const handleSplitAmountChange = (index, value) => {
    const rawValue = value.replace(/,/g, '');
    if (!isNaN(rawValue) || rawValue === '') {
      const newSplits = [...splits];
      newSplits[index].amount = rawValue;
      setSplits(newSplits);
    }
  };

  const toggleSplitLoan = (index) => {
    const newSplits = [...splits];
    newSplits[index].isLoan = !newSplits[index].isLoan;
    newSplits[index].category = '';
    newSplits[index].loan = '';
    setSplits(newSplits);
  };

  const handleSplitCategoryChange = (index, category) => {
    const newSplits = [...splits];
    newSplits[index].category = category;
    setSplits(newSplits);
    setActiveSplitIndex(null);
  };

  const handleSplitLoanChange = (index, loan) => {
    const newSplits = [...splits];
    newSplits[index].loan = loan;
    setSplits(newSplits);
  };

  const handleSplitMemoChange = (index, memo) => {
    const newSplits = [...splits];
    newSplits[index].memo = memo;
    setSplits(newSplits);
  };

  const addSplitLine = () => {
    setSplits([...splits, { amount: '', category: '', loan: '', memo: '', isLoan: false }]);
  };

  const removeSplitLine = (index) => {
    if (splits.length > 1) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  const enableSplitMode = () => {
    setIsSplitMode(true);
    setSplits([
      { amount: '', category: '', loan: '', memo: '', isLoan: false },
      { amount: '', category: '', loan: '', memo: '', isLoan: false }
    ]);
  };

  const disableSplitMode = () => {
    setIsSplitMode(false);
    setSplits([{ amount: '', category: '', loan: '', memo: '', isLoan: false }]);
  };

  const getUsedAmount = () => {
    return splits.slice(0, -1).reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  };

  const getRemainingAmount = () => {
    const total = Number(formData.amount) || 0;
    return total - getUsedAmount();
  };

  const handleSubmit = async () => {
    if (!formData.amount) {
      alert("Please enter amount!");
      return;
    }

    if (isSplitMode) {
      const newSplits = [...splits];
      newSplits[newSplits.length - 1].amount = getRemainingAmount().toString();
      
      for (let i = 0; i < newSplits.length; i++) {
        const s = newSplits[i];
        if (Number(s.amount) <= 0) {
          alert(`Split #${i + 1}: Invalid amount`);
          return;
        }
        if (s.isLoan && !s.loan) {
          alert(`Split #${i + 1}: Please select loan`);
          return;
        }
        if (!s.isLoan && !s.category) {
          alert(`Split #${i + 1}: Please select category`);
          return;
        }
      }
      setSplits(newSplits);
    } else {
      if (activeTab !== 'transfer' && !formData.category) {
        alert("Please select category!");
        return;
      }
    }

    setLoading(true);
    try {
      if (isSplitMode) {
        const totalAmount = Number(formData.amount);
        const finalSplits = splits.map((s, i) => ({
          amount: i === splits.length - 1 ? getRemainingAmount() : Number(s.amount),
          category: s.category || null,
          loan: s.loan || null,
          isLoan: s.isLoan,
          memo: s.memo || null
        }));
        
        const transactionData = {
          userId: 'test-user',
          type: 'split',
          splitType: activeTab,
          totalAmount: activeTab === 'expense' ? -Math.abs(totalAmount) : Math.abs(totalAmount),
          account: formData.account,
          payee: formData.payee,
          date: formData.date,
          splits: finalSplits
        };

        if (!editTransaction) {
          transactionData.createdAt = new Date();
        }

        if (editTransaction) {
          await updateDoc(doc(db, 'transactions', editTransaction.id), transactionData);
        } else {
          await addDoc(collection(db, 'transactions'), transactionData);
        }
      } else {
        let finalAmount = Number(formData.amount);

        const transactionData = {
          userId: 'test-user',
          type: activeTab,
          amount: finalAmount,
          date: formData.date,
          memo: formData.memo
        };

        if (!editTransaction) {
          transactionData.createdAt = new Date();
        }

        if (activeTab === 'transfer') {
          transactionData.fromAccount = formData.fromAccount;
          transactionData.toAccount = formData.toAccount;
        } else {
          if (activeTab === 'expense') transactionData.amount = -Math.abs(finalAmount);
          else transactionData.amount = Math.abs(finalAmount);

          transactionData.payee = formData.payee;
          transactionData.category = formData.category;
          transactionData.account = formData.account;
        }

        if (editTransaction) {
          await updateDoc(doc(db, 'transactions', editTransaction.id), transactionData);
        } else {
          await addDoc(collection(db, 'transactions'), transactionData);
        }
      }

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert("Error: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editTransaction) return;
    
    if (window.confirm(`Delete this transaction?`)) {
      try {
        await deleteDoc(doc(db, 'transactions', editTransaction.id));
        if (onSave) onSave();
        onClose();
      } catch (error) {
        alert("Error: " + error.message);
      }
    }
  };

  if (!isOpen) return null;

  const filteredCategories = categorySuggestions.filter(cat => {
    if (activeTab === 'income') return cat.type === 'income';
    if (activeTab === 'expense') return cat.type === 'expense';
    return true;
  });

  // Split icon SVG
  const SplitIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l-4 4-4-4" />
      <path d="M12 7v6" />
      <path d="M8 21l4-4 4 4" />
      <path d="M12 17v-4" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[450px] h-[90vh] sm:h-auto sm:max-h-[90vh] sm:rounded-xl flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">
            {editTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <div className="flex items-center gap-2">
            {editTransaction && (
              <button 
                onClick={handleDelete}
                className="text-red-500 text-xl hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center"
              >
                🗑️
              </button>
            )}
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              className="text-emerald-600 font-bold disabled:opacity-50"
            >
              {loading ? '...' : 'SAVE'}
            </button>
          </div>
        </div>

        {/* Type Tabs */}
        <div className="flex p-2 gap-2 bg-gray-50">
          {['expense', 'income', 'transfer'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'transfer') disableSplitMode();
              }}
              className={`flex-1 py-2 rounded-lg capitalize font-medium transition-colors ${
                activeTab === tab 
                  ? (tab === 'expense' ? 'bg-red-100 text-red-700 border border-red-300' 
                    : tab === 'income' ? 'bg-emerald-100 text-emerald-700 border border-emerald-400' 
                    : 'bg-blue-100 text-blue-700 border border-blue-400')
                  : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          
          {/* Amount + Split Button */}
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center py-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={displayAmount}
                onChange={handleAmountChange}
                className={`text-4xl font-bold text-center w-full focus:outline-none bg-transparent ${
                  activeTab === 'expense' ? 'text-red-500' : activeTab === 'income' ? 'text-emerald-600' : 'text-blue-600'
                }`}
                autoFocus
              />
            </div>
            
            {activeTab !== 'transfer' && (
              <button
                onClick={isSplitMode ? disableSplitMode : enableSplitMode}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                  isSplitMode 
                    ? 'bg-emerald-500 text-white'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                }`}
                title={isSplitMode ? 'Cancel Split' : 'Split Transaction'}
              >
                <SplitIcon />
              </button>
            )}
          </div>

          {/* Payee */}
          {activeTab !== 'transfer' && (
            <div className="relative">
              <label className="text-xs text-gray-500 uppercase font-semibold">Payee</label>
              <input
                type="text"
                placeholder="Who?"
                value={formData.payee}
                onChange={(e) => setFormData({...formData, payee: e.target.value})}
                onFocus={() => setShowPayeeList(true)}
                onBlur={() => setTimeout(() => setShowPayeeList(false), 200)}
                className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
              />
              {showPayeeList && payeeSuggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-white shadow-lg max-h-32 overflow-y-auto rounded-lg mt-1 border">
                  {payeeSuggestions
                    .filter(p => p.toLowerCase().includes(formData.payee.toLowerCase()))
                    .slice(0, 5)
                    .map((payee, idx) => (
                      <div 
                        key={idx} 
                        className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                        onClick={() => {
                          setFormData({...formData, payee});
                          setShowPayeeList(false);
                        }}
                      >
                        {payee}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* SPLIT MODE */}
          {isSplitMode && (
            <div className="space-y-3">
              {splits.map((split, index) => {
                const isLastSplit = index === splits.length - 1;
                const splitAmount = isLastSplit ? getRemainingAmount() : Number(split.amount) || 0;
                
                return (
                  <div 
                    key={index} 
                    className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"
                  >
                    {/* Split Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-700">
                        SPLIT #{index + 1}
                      </span>
                      {splits.length > 2 && (
                        <button
                          onClick={() => removeSplitLine(index)}
                          className="text-gray-400 hover:text-red-500 text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="mb-2">
                      {isLastSplit ? (
                        <div className="text-2xl font-bold text-center p-2 rounded-lg bg-emerald-100 text-emerald-700">
                          {splitAmount.toLocaleString()}
                          <span className="text-xs ml-1 opacity-70">(auto)</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Amount"
                          value={split.amount ? Number(split.amount).toLocaleString() : ''}
                          onChange={(e) => handleSplitAmountChange(index, e.target.value)}
                          className="w-full p-2 text-xl font-bold text-center bg-white rounded-lg border border-emerald-200"
                        />
                      )}
                    </div>

                    {/* Category or Loan Toggle */}
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => { if (split.isLoan) toggleSplitLoan(index); }}
                        className={`flex-1 py-1.5 text-xs rounded-lg font-medium ${
                          !split.isLoan 
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        Category
                      </button>
                      <button
                        onClick={() => { if (!split.isLoan) toggleSplitLoan(index); }}
                        className={`flex-1 py-1.5 text-xs rounded-lg font-medium ${
                          split.isLoan 
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        Loan
                      </button>
                    </div>

                    {/* Category or Loan Selector */}
                    {split.isLoan ? (
                      <select
                        value={split.loan}
                        onChange={(e) => handleSplitLoanChange(index, e.target.value)}
                        className="w-full p-2 bg-white rounded-lg border border-emerald-200 text-sm"
                      >
                        <option value="">Select loan...</option>
                        {loans.map(loan => (
                          <option key={loan} value={loan}>{loan}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Select category..."
                          value={split.category}
                          onChange={(e) => {
                            const newSplits = [...splits];
                            newSplits[index].category = e.target.value;
                            setSplits(newSplits);
                          }}
                          onFocus={() => setActiveSplitIndex(index)}
                          onBlur={() => setTimeout(() => setActiveSplitIndex(null), 200)}
                          className="w-full p-2 bg-white rounded-lg border border-emerald-200 text-sm"
                        />
                        {activeSplitIndex === index && (
                          <div className="absolute z-30 w-full bg-white shadow-xl max-h-32 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                            {filteredCategories
                              .filter(cat => cat.name.toLowerCase().includes(split.category.toLowerCase()))
                              .map(cat => (
                                <div
                                  key={cat.id}
                                  onClick={() => handleSplitCategoryChange(index, cat.name)}
                                  className="p-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-sm"
                                >
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Memo */}
                    <input
                      type="text"
                      placeholder="Memo (optional)"
                      value={split.memo}
                      onChange={(e) => handleSplitMemoChange(index, e.target.value)}
                      className="w-full p-2 bg-white rounded-lg border border-emerald-200 text-sm mt-2"
                    />
                  </div>
                );
              })}

              {/* Add Split Button */}
              <button
                onClick={addSplitLine}
                className="w-full py-2 border-2 border-dashed border-emerald-300 rounded-xl font-medium text-emerald-600 hover:bg-emerald-50"
              >
                + Add Split
              </button>
            </div>
          )}

          {/* Normal Mode - Category */}
          {!isSplitMode && activeTab !== 'transfer' && (
            <div className="relative">
              <label className="text-xs text-gray-500 uppercase font-semibold">Category</label>
              <input
                type="text"
                placeholder="Select category..."
                value={formData.category}
                onChange={(e) => {
                  setFormData({...formData, category: e.target.value});
                  setShowCategoryList(true);
                }}
                onFocus={() => setShowCategoryList(true)}
                onBlur={() => setTimeout(() => setShowCategoryList(false), 200)}
                className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
              />
              
              {showCategoryList && (
                <div className="absolute z-20 w-full bg-white shadow-xl max-h-48 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                  {filteredCategories
                    .filter(cat => cat.name.toLowerCase().includes(formData.category.toLowerCase()))
                    .map(cat => (
                      <div 
                        key={cat.id} 
                        className="p-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setFormData({...formData, category: cat.name});
                          setShowCategoryList(false);
                        }}
                      >
                        <span className="text-xl">{cat.icon}</span>
                        <span>{cat.name}</span>
                        <span className="text-xs text-gray-400 ml-auto">{cat.group}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Transfer Fields */}
          {activeTab === 'transfer' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">From</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
                  value={formData.fromAccount}
                  onChange={(e) => setFormData({...formData, fromAccount: e.target.value})}
                >
                  {accounts.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">To</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
                  value={formData.toAccount}
                  onChange={(e) => setFormData({...formData, toAccount: e.target.value})}
                >
                  {accounts.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Account */}
          {activeTab !== 'transfer' && (
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
              <select 
                className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
                value={formData.account}
                onChange={(e) => setFormData({...formData, account: e.target.value})}
              >
                {accounts.length === 0 ? (
                  <option value="">Loading...</option>
                ) : (
                  accounts.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))
                )}
              </select>
            </div>
          )}

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

          {/* Memo - Only for normal mode */}
          {!isSplitMode && (
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
          )}
        </div>
      </div>
    </div>
  );
};

export default AddTransactionModal;