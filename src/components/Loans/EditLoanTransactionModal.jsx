import React, { useState, useEffect } from 'react';
import { updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const EditLoanTransactionModal = ({ isOpen, onClose, onSave, transaction, loan }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const { tagSuggestions, groupedAccounts, quickSelectGroupedAccounts } = useData();
  
  // Duplicate mode - when true, creates new transaction instead of updating
  const [isDuplicating, setIsDuplicating] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState('');
  const [direction, setDirection] = useState('out');
  const [showTagList, setShowTagList] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    account: '',
    date: '',
    memo: '',
    tag: '',
    tags: []
  });

  useEffect(() => {
    if (isOpen && transaction) {
      const amt = Number(transaction.amount);
      const isPositive = amt > 0;
      
      setLoading(false); // Reset loading state
      setIsDuplicating(false); // Reset duplicate mode
      setDirection(isPositive ? 'in' : 'out');
      setFormData({
        amount: Math.abs(amt).toString(),
        account: transaction.account || '',
        date: transaction.date || new Date().toISOString().split('T')[0],
        memo: transaction.memo || '',
        tag: '',
        tags: transaction.tags || (transaction.tag ? [transaction.tag] : [])
      });
      setDisplayAmount(Math.abs(amt).toLocaleString('en-US'));
      setShowTagList(false);
    }
  }, [isOpen, transaction]);

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

      if (isDuplicating) {
        // Create new transaction when duplicating
        const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
        await addDoc(collection(db, 'transactions'), {
          type: 'loan',
          loan: transaction.loan,
          loanType: transaction.loanType,
          amount: finalAmount,
          account: formData.account,
          date: formData.date,
          memo: formData.memo,
          tag: formData.tags.length > 0 ? formData.tags[0] : null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          clearStatus: 'uncleared', // New transactions start as uncleared
          userId: transaction.userId,
          createdAt: serverTimestamp()
        });
        toast.success('Transaction duplicated!');
      } else {
        // Update existing transaction
        await updateDoc(doc(db, 'transactions', transaction.id), {
          amount: finalAmount,
          account: formData.account,
          date: formData.date,
          memo: formData.memo,
          tag: formData.tags.length > 0 ? formData.tags[0] : null,
          tags: formData.tags.length > 0 ? formData.tags : null
        });
      }

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
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
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-gray-500 text-lg p-2 -ml-2">✕</button>
            {/* Duplicate button - only show when NOT already duplicating */}
            {!isDuplicating && (
              <button 
                onClick={() => {
                  setIsDuplicating(true);
                  // Update date to today when duplicating
                  const today = new Date().toISOString().split('T')[0];
                  setFormData(prev => ({ ...prev, date: today }));
                  toast.success('Duplicating - edit and save as new');
                }}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Copy
              </button>
            )}
          </div>
          <h2 className="font-semibold text-lg">
            {isDuplicating ? 'Duplicate Transaction' : 'Edit Transaction'}
          </h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="text-emerald-600 font-bold disabled:opacity-50 px-3 py-1.5"
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
                ? 'bg-red-100 text-red-700 border-2 border-red-400'
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
                direction === 'out' ? 'text-red-600' : 'text-emerald-600'
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
              {quickSelectGroupedAccounts.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.accounts.map(acc => (
                    <option key={acc.name} value={acc.name}>
                      {acc.icon} {acc.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
            <div className="relative mt-1">
              <div className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between pointer-events-none">
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
            <div className="relative mt-1">
              <input
                type="text"
                placeholder="Notes (optional)"
                className="w-full p-3 bg-gray-50 rounded-lg outline-none pr-10"
                value={formData.memo}
                onChange={(e) => setFormData({...formData, memo: e.target.value})}
              />
              {/* Clear memo button - only show when memo has value */}
              {formData.memo && (
                <button
                  type="button"
                  onClick={() => setFormData({...formData, memo: ''})}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="Clear memo"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tag */}
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
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none"
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

          {/* Delete Button - only show when NOT duplicating */}
          {!isDuplicating && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="w-full py-3 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
            >
              🗑️ Delete Transaction
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditLoanTransactionModal;