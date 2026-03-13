import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddLoanTransactionModal = ({ isOpen, onClose, onSave, loan }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  const { tagSuggestions, groupedAccounts, quickSelectGroupedAccounts, accountNames, parentTags, getSubTags, addUserTag } = useData();
  
  // Create selectable tags list with "Parent > Sub" format
  const selectableTags = useMemo(() => {
    const tags = [];
    
    parentTags.forEach(parent => {
      const subs = getSubTags(parent.id);
      
      if (subs.length > 0) {
        subs.forEach(sub => {
          tags.push({
            value: sub.name,
            display: `${parent.name} > ${sub.name}`,
            parentName: parent.name
          });
        });
      } else {
        tags.push({
          value: parent.name,
          display: parent.name,
          parentName: null
        });
      }
    });
    
    return tags.sort((a, b) => a.display.localeCompare(b.display));
  }, [parentTags, getSubTags]);

  // Create lookup map for tag display names
  const tagDisplayMap = useMemo(() => {
    const map = {};
    selectableTags.forEach(tag => {
      map[tag.value] = tag.display;
    });
    return map;
  }, [selectableTags]);
  
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
    tag: '',
    tags: []
  });

  const isBorrow = loan?.loanType === 'borrow';

  useEffect(() => {
    if (isOpen && loan) {
      const firstQuickAccount = quickSelectGroupedAccounts[0]?.accounts[0]?.name || accountNames[0] || '';
      setFormData({
        amount: '',
        account: firstQuickAccount,
        date: getLocalToday(),
        note: '',
        tag: '',
        tags: []
      });
      setDisplayAmount('');
      setTransactionType(null);
      setShowTagList(false);
      setLoading(false); // Reset loading state
    }
  }, [isOpen, loan, accountNames, quickSelectGroupedAccounts]);

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
        tag: formData.tags.length > 0 ? formData.tags[0] : null,
        tags: formData.tags.length > 0 ? formData.tags : null,
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
                {accountNames.length === 0 ? (
                  <option value="">No accounts available</option>
                ) : (
                  quickSelectGroupedAccounts.map(group => (
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

            {/* Tags - Same style as AddTransactionModal */}
            <div className="relative">
              <label className="text-xs text-gray-500 uppercase font-semibold">Tags</label>

              {/* Available tags - above input */}
              {selectableTags.filter(tag => !formData.tags.includes(tag.value)).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                  {selectableTags
                    .filter(tag => !formData.tags.includes(tag.value))
                    .map(tag => (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          tags: [...formData.tags, tag.value]
                        })}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm hover:bg-emerald-200 transition-colors"
                      >
                        🏷️ {tag.display}
                      </button>
                    ))}
                </div>
              )}
              
              {/* Input box with selected tags inside */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-emerald-400 min-h-[44px]">
                {/* Selected tags */}
                {formData.tags.map(tagValue => (
                  <span 
                    key={tagValue}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-sm"
                  >
                    🏷️ {tagDisplayMap[tagValue] || tagValue}
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData, 
                        tags: formData.tags.filter(t => t !== tagValue)
                      })}
                      className="text-emerald-500 hover:text-emerald-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
                
                {/* Text input */}
                <input
                  type="text"
                  placeholder={formData.tags.length > 0 ? "" : "Type new tag + Enter"}
                  className="flex-1 min-w-[100px] bg-transparent outline-none text-sm py-1"
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
                        // Save new tag to userTags collection
                        addUserTag(newTag).catch(err => {
                          console.error('Failed to save tag:', err);
                        });
                      }
                      setShowTagList(false);
                    }
                    // Backspace to remove last tag when input is empty
                    if (e.key === 'Backspace' && !formData.tag && formData.tags.length > 0) {
                      setFormData({
                        ...formData,
                        tags: formData.tags.slice(0, -1)
                      });
                    }
                  }}
                />
              </div>
              
              {/* Autocomplete dropdown - only show when typing */}
              {showTagList && formData.tag && tagSuggestions.length > 0 && (
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
              
              {/* Helper text */}
              <div className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                <span className="font-bold">💡 Tip:</span>
                <span>Type tag name and press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">Enter</kbd> to save</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddLoanTransactionModal;