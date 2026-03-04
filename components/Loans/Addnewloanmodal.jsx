import React, { useState, useEffect } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddNewLoanModal = ({ isOpen, onClose, onSave }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  const { tagSuggestions, groupedAccounts, accountNames } = useData();
  
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
  const [showTagList, setShowTagList] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    loanName: '',
    amount: '',
    account: '',
    date: getLocalToday(),
    memo: '',
    tag: '',
    tags: []
  });

  useEffect(() => {
    if (isOpen) {
      // Reset loading state
      setLoading(false);
      
      // Set default account from accountNames (already sorted)
      const defaultAccount = accountNames[0] || '';
      setFormData({
        name: '',
        loanName: '',
        amount: '',
        account: defaultAccount,
        date: getLocalToday(),
        memo: '',
        tag: '',
        tags: []
      });
      setDisplayAmount('');
      setLoanType('borrow');
      setShowTagList(false);
    }
  }, [isOpen, accountNames]);

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
        tag: formData.tags.length > 0 ? formData.tags[0] : null,
        tags: formData.tags.length > 0 ? formData.tags : null,
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
      
      {/* Header with Save button */}
      <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-lg p-2">✕</button>
        <h2 className="font-semibold text-lg">Add New Loan</h2>
        <button 
          onClick={handleSubmit} 
          disabled={loading}
          className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'Save'}
        </button>
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
              className="w-full p-3 bg-gray-100 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none border border-gray-200 text-base"
              
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
              className="w-full p-3 bg-emerald-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none border border-emerald-200 text-base"
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
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none border border-gray-200 text-base"
              value={formData.account}
              onChange={(e) => setFormData({...formData, account: e.target.value})}
            >
              {accountNames.length === 0 ? (
                <option value="">No accounts available</option>
              ) : (
                groupedAccounts.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.accounts.map(acc => (
                      <option key={acc.name} value={acc.name}>
                        {acc.icon} {acc.name}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <div className="relative mt-1">
              <div className="w-full p-3 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-between pointer-events-none">
                <span className="text-gray-800">{formatDateForDisplay(formData.date)}</span>
                <span className="text-gray-400">📅</span>
              </div>
              <input 
                type="date" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Memo</label>
            <input
              type="text"
              placeholder="Notes (optional)"
              className="w-full p-3 bg-white rounded-lg mt-1 outline-none border border-gray-200 text-base"
              value={formData.memo}
              onChange={(e) => setFormData({...formData, memo: e.target.value})}
            />
          </div>

          {/* Tags */}
          <div className="relative">
            <label className="text-xs text-gray-500 uppercase font-semibold">Tags</label>
            
            {/* Selected tags chips */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mb-2">
                {formData.tags.map(tag => (
                  <span 
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm"
                  >
                    🏷️ {tag}
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData, 
                        tags: formData.tags.filter(t => t !== tag)
                      })}
                      className="text-emerald-500 hover:text-emerald-700 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            <input
              type="text"
              placeholder={formData.tags.length > 0 ? "Add another tag..." : "e.g. DaNang2025 (optional)"}
              className="w-full p-3 bg-white rounded-lg mt-1 outline-none border border-gray-200 text-base"
              value={formData.tag}
              onChange={(e) => {
                setFormData({...formData, tag: e.target.value});
                setShowTagList(true);
              }}
              onFocus={() => setShowTagList(true)}
              onBlur={() => setTimeout(() => setShowTagList(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && formData.tag.trim()) {
                  e.preventDefault();
                  const newTag = formData.tag.trim();
                  if (!formData.tags.includes(newTag)) {
                    setFormData({
                      ...formData,
                      tags: [...formData.tags, newTag],
                      tag: ''
                    });
                  }
                  setShowTagList(false);
                }
              }}
            />
            
            {showTagList && tagSuggestions.length > 0 && (
              <div className="absolute z-20 w-full bg-white shadow-xl max-h-36 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                {tagSuggestions
                  .filter(tag => 
                    tag.toLowerCase().includes((formData.tag || '').toLowerCase()) &&
                    !formData.tags.includes(tag)
                  )
                  .map(tag => (
                    <div 
                      key={tag} 
                      className="p-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                      onClick={() => {
                        setFormData({
                          ...formData, 
                          tags: [...formData.tags, tag],
                          tag: ''
                        });
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
        </div>
    </div>
  );
};

export default AddNewLoanModal;