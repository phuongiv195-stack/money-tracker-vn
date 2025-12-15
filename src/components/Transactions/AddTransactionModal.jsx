import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AddTransactionModal = ({ isOpen, onClose, onSave, editTransaction = null }) => {
  const [activeTab, setActiveTab] = useState('expense');
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [dateInputType, setDateInputType] = useState('text');
  const [formData, setFormData] = useState({
    amount: '',
    payee: '',
    category: '',
    account: 'Cash',
    fromAccount: 'Cash',
    toAccount: 'Vietcombank',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });

  const [payeeSuggestions, setPayeeSuggestions] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [showPayeeList, setShowPayeeList] = useState(false);
  const [showCategoryList, setShowCategoryList] = useState(false);

  // Load data khi mở modal hoặc có editTransaction
  useEffect(() => {
    if (isOpen) {
      loadPayees();
      loadCategories();
      
      if (editTransaction) {
        // EDIT MODE: Điền data có sẵn
        setActiveTab(editTransaction.type);
        setFormData({
          amount: Math.abs(editTransaction.amount).toString(),
          payee: editTransaction.payee || '',
          category: editTransaction.category || '',
          account: editTransaction.account || 'Cash',
          fromAccount: editTransaction.fromAccount || 'Cash',
          toAccount: editTransaction.toAccount || 'Vietcombank',
          date: editTransaction.date || new Date().toISOString().split('T')[0],
          memo: editTransaction.memo || ''
        });
        setDisplayAmount(Math.abs(editTransaction.amount).toLocaleString('en-US'));
      } else {
        // ADD MODE: Reset form
        setFormData({
          amount: '',
          payee: '',
          category: '',
          account: 'Cash',
          fromAccount: 'Cash',
          toAccount: 'Vietcombank',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setDisplayAmount('');
      }
      setDateInputType('text');
    }
  }, [isOpen, editTransaction]);

  const formatDateForDisplay = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
      const payees = [...new Set(snapshot.docs.map(d => d.data().payee))];
      setPayeeSuggestions(payees);
    } catch (e) {}
  };

  const loadCategories = async () => {
    const q = query(collection(db, 'categories'), where('userId', '==', 'test-user'));
    const snapshot = await getDocs(q);
    setCategorySuggestions(snapshot.docs.map(d => d.data()));
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
      alert("Vui lòng nhập số tiền!");
      return;
    }
    if (activeTab !== 'transfer' && !formData.category) {
      alert("Vui lòng chọn hoặc nhập Category!");
      return;
    }

    setLoading(true);
    try {
      let finalAmount = Number(formData.amount);

      const transactionData = {
        userId: 'test-user',
        type: activeTab,
        amount: finalAmount,
        date: formData.date,
        memo: formData.memo
      };

      // ✅ FIX: Chỉ thêm createdAt khi tạo mới, không ghi undefined khi edit
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

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert("Lỗi khi lưu: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editTransaction) return;
    
    if (window.confirm(`Xóa giao dịch "${editTransaction.payee || editTransaction.category}"?`)) {
      try {
        await deleteDoc(doc(db, 'transactions', editTransaction.id));
        if (onSave) onSave();
        onClose();
      } catch (error) {
        alert("Lỗi khi xóa: " + error.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[450px] h-[90vh] sm:h-auto sm:rounded-xl flex flex-col animate-slide-up">
        
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">
            {editTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <div className="flex items-center gap-2">
            {editTransaction && (
              <button 
                onClick={handleDelete}
                className="text-red-500 text-xl hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                title="Delete"
              >
                🗑️
              </button>
            )}
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              className="text-emerald-600 font-bold disabled:opacity-50"
            >
              {loading ? 'SAVING...' : 'SAVE'}
            </button>
          </div>
        </div>

        <div className="flex p-2 gap-2 bg-gray-50">
          {['expense', 'income', 'transfer'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg capitalize font-medium transition-colors ${
                activeTab === tab 
                  ? (tab === 'expense' ? 'bg-red-100 text-red-700' : tab === 'income' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')
                  : 'bg-white text-gray-500 border'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="text-center py-4">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={displayAmount}
              onChange={handleAmountChange}
              className={`text-4xl font-bold text-center w-full focus:outline-none bg-transparent ${
                activeTab === 'expense' ? 'text-red-500' : activeTab === 'income' ? 'text-green-500' : 'text-blue-500'
              }`}
              autoFocus
            />
          </div>

          {activeTab !== 'transfer' ? (
            <>
              <div className="relative">
                <label className="text-xs text-gray-500 uppercase font-semibold">Payee</label>
                <input
                  type="text"
                  placeholder="Who did you pay?"
                  value={formData.payee}
                  onChange={(e) => setFormData({...formData, payee: e.target.value})}
                  onFocus={() => setShowPayeeList(true)}
                  onBlur={() => setTimeout(() => setShowPayeeList(false), 200)}
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                {showPayeeList && payeeSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-white shadow-lg max-h-40 overflow-y-auto rounded-lg mt-1 border">
                    {payeeSuggestions
                      .filter(p => p.toLowerCase().includes(formData.payee.toLowerCase()))
                      .map((payee, idx) => (
                        <div 
                          key={idx} 
                          className="p-2 hover:bg-gray-100 cursor-pointer"
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

              <div className="relative">
                <label className="text-xs text-gray-500 uppercase font-semibold">Category</label>
                <input
                  type="text"
                  placeholder="Search category..."
                  value={formData.category}
                  onChange={(e) => {
                    setFormData({...formData, category: e.target.value});
                    setShowCategoryList(true);
                  }}
                  onFocus={() => setShowCategoryList(true)}
                  onBlur={() => setTimeout(() => setShowCategoryList(false), 200)}
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                
                {showCategoryList && (
                  <div className="absolute z-20 w-full bg-white shadow-xl max-h-60 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                    {categorySuggestions
                      .filter(cat => cat.name.toLowerCase().includes(formData.category.toLowerCase()))
                      .map(cat => (
                        <div 
                          key={cat.id} 
                          className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 flex items-center gap-2"
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
                    {categorySuggestions.filter(cat => cat.name.toLowerCase().includes(formData.category.toLowerCase())).length === 0 && (
                      <div className="p-3 text-gray-500 text-sm text-center">No category found</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
                  value={formData.account}
                  onChange={(e) => setFormData({...formData, account: e.target.value})}
                >
                  <option>Cash</option>
                  <option>Vietcombank</option>
                  <option>Techcombank</option>
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">From Account</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none border border-gray-200"
                  value={formData.fromAccount}
                  onChange={(e) => setFormData({...formData, fromAccount: e.target.value})}
                >
                  <option>Cash</option>
                  <option>Vietcombank</option>
                  <option>Techcombank</option>
                </select>
              </div>
              
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">To Account</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none border border-gray-200"
                  value={formData.toAccount}
                  onChange={(e) => setFormData({...formData, toAccount: e.target.value})}
                >
                  <option>Cash</option>
                  <option>Vietcombank</option>
                  <option>Techcombank</option>
                </select>
              </div>
            </div>
          )}

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

export default AddTransactionModal;