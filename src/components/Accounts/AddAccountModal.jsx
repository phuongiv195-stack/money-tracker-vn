import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddAccountModal = ({ isOpen, onClose, onSave, editAccount = null }) => {
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
  
  const [formData, setFormData] = useState({
    name: '',
    icon: '🏦',
    type: 'bank',
    group: 'SPENDING',
    currentValue: '',
    costBasis: '',
    startingBalance: '',
    startingBalanceDate: getLocalToday(),
    memo: ''
  });
  const [loading, setLoading] = useState(false);
  const [displayStartingBalance, setDisplayStartingBalance] = useState('');

  // Account type configurations
  const accountTypes = {
    'SPENDING': [
      { value: 'cash', label: 'Cash', icon: '💵' },
      { value: 'bank', label: 'Bank', icon: '🏦' }
    ],
    'SAVINGS': [
      { value: 'savings', label: 'Savings', icon: '💰' }
    ],
    'ASSETS': [
      { value: 'property', label: 'Property', icon: '🏠' },
      { value: 'vehicle', label: 'Vehicle', icon: '🚗' },
      { value: 'asset', label: 'Other Asset', icon: '💎' }
    ],
    'INVESTMENTS': [
      { value: 'investment', label: 'Investment', icon: '📈' }
    ]
  };

  const allIcons = ['💵', '🏦', '💰', '🐷', '📈', '💎', '🏠', '🚗', '💸', '💳', '🏪', '🛒', '💼', '🎯', '⭐'];

  // Check if account is market-value type (for Update Value feature)
  const isMarketValue = ['investment', 'property', 'vehicle', 'asset'].includes(formData.type);
  
  // All accounts need starting balance now (loan type removed)
  const needsStartingBalance = true;

  // Helper to format date to YYYY-MM-DD in local timezone
  const formatToLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (isOpen) {
      // Reset loading state when modal opens
      setLoading(false);
      
      if (editAccount) {
        // Get startingBalanceDate
        let sbDateStr = getLocalToday();
        if (editAccount.startingBalanceDate) {
          const sbDate = editAccount.startingBalanceDate.seconds 
            ? new Date(editAccount.startingBalanceDate.seconds * 1000)
            : new Date(editAccount.startingBalanceDate);
          sbDateStr = formatToLocalDateString(sbDate);
        } else if (editAccount.createdAt) {
          const createdDate = editAccount.createdAt.seconds 
            ? new Date(editAccount.createdAt.seconds * 1000)
            : new Date(editAccount.createdAt);
          sbDateStr = formatToLocalDateString(createdDate);
        }
        
        setFormData({
          name: editAccount.name,
          icon: editAccount.icon,
          type: editAccount.type,
          group: editAccount.group,
          currentValue: editAccount.currentValue || '',
          costBasis: editAccount.costBasis || '',
          startingBalance: editAccount.startingBalance || '',
          startingBalanceDate: sbDateStr,
          memo: editAccount.memo || ''
        });
        setDisplayStartingBalance(
          editAccount.startingBalance 
            ? Number(editAccount.startingBalance).toLocaleString('en-US')
            : ''
        );
      } else {
        setFormData({
          name: '',
          icon: '🏦',
          type: 'bank',
          group: 'SPENDING',
          currentValue: '',
          costBasis: '',
          startingBalance: '',
          startingBalanceDate: getLocalToday(),
          memo: ''
        });
        setDisplayStartingBalance('');
      }
    }
  }, [isOpen, editAccount]);

  // Auto-update group when type changes
  useEffect(() => {
    const groupMap = {
      cash: 'SPENDING',
      bank: 'SPENDING',
      savings: 'SAVINGS',
      property: 'ASSETS',
      vehicle: 'ASSETS',
      asset: 'ASSETS',
      investment: 'INVESTMENTS'
    };
    
    const newGroup = groupMap[formData.type];
    if (newGroup && newGroup !== formData.group) {
      setFormData(prev => ({ ...prev, group: newGroup }));
    }
  }, [formData.type]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter account name!");
      return;
    }

    setLoading(true);
    try {
      const accountData = {
        userId: userId,
        name: formData.name.trim(),
        icon: formData.icon,
        type: formData.type,
        group: formData.group,
        memo: formData.memo.trim(),
        isActive: true,
        updatedAt: new Date()
      };

      // Add market-value specific fields (for Update Value feature)
      if (isMarketValue) {
        accountData.currentValue = parseFloat(formData.currentValue) || parseFloat(formData.startingBalance) || 0;
        accountData.costBasis = parseFloat(formData.costBasis) || 0;
        accountData.lastValueUpdate = new Date();
      }

      // Add starting balance for all accounts except loan
      if (needsStartingBalance) {
        accountData.startingBalance = parseFloat(formData.startingBalance) || 0;
        accountData.startingBalanceDate = new Date(formData.startingBalanceDate);
      }

      if (editAccount) {
        const oldName = editAccount.name;
        const newName = formData.name.trim();
        
        // If name changed, update all transactions with old account name
        if (oldName !== newName) {
          const updatePromises = [];
          
          // Update transactions where account = oldName
          const accountQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', userId),
            where('account', '==', oldName)
          );
          const accountSnapshot = await getDocs(accountQuery);
          accountSnapshot.docs.forEach(transDoc => {
            updatePromises.push(
              updateDoc(doc(db, 'transactions', transDoc.id), { account: newName })
            );
          });
          
          // Update transfers where fromAccount = oldName
          const fromQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', userId),
            where('fromAccount', '==', oldName)
          );
          const fromSnapshot = await getDocs(fromQuery);
          fromSnapshot.docs.forEach(transDoc => {
            updatePromises.push(
              updateDoc(doc(db, 'transactions', transDoc.id), { fromAccount: newName })
            );
          });
          
          // Update transfers where toAccount = oldName
          const toQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', userId),
            where('toAccount', '==', oldName)
          );
          const toSnapshot = await getDocs(toQuery);
          toSnapshot.docs.forEach(transDoc => {
            updatePromises.push(
              updateDoc(doc(db, 'transactions', transDoc.id), { toAccount: newName })
            );
          });
          
          await Promise.all(updatePromises);
          
          const totalUpdated = accountSnapshot.size + fromSnapshot.size + toSnapshot.size;
          if (totalUpdated > 0) {
            toast.success(`Updated ${totalUpdated} transactions`);
          }
        }
        
        await updateDoc(doc(db, 'accounts', editAccount.id), accountData);
      } else {
        accountData.createdAt = new Date();
        accountData.order = 999; // Will be reordered later
        await addDoc(collection(db, 'accounts'), accountData);
      }

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving account:", error);
      toast.error("Error saving: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editAccount) return;
    
    const confirmed = await toast.confirm({
      title: 'Delete Account',
      message: `Delete "${editAccount.name}"?\n\nWarning: Related transactions will lose their link!`,
      confirmText: 'Delete',
      type: 'danger'
    });
    
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'accounts', editAccount.id));
        if (onSave) onSave();
        onClose();
      } catch (error) {
        toast.error("Error deleting: " + error.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 sm:flex sm:items-center sm:justify-center">
      <div className="bg-white w-full h-full sm:w-[450px] sm:h-auto sm:max-h-[90vh] sm:rounded-xl flex flex-col">
        
        {/* Header with Save button */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">{editAccount ? 'Edit Account' : 'Add Account'}</h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : 'Save'}
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          
          {/* Account Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Account Name</label>
            <input
              type="text"
              placeholder="E.g. Vietcombank, Cash, D-Cash SSI..."
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none text-base"
              
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Account Type</label>
            <div className="space-y-2">
              {Object.entries(accountTypes).map(([group, types]) => (
                <div key={group}>
                  <div className="text-[10px] text-gray-400 font-bold uppercase mb-1 px-1">{group}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {types.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setFormData({...formData, type: t.value, icon: t.icon})}
                        className={`p-3 rounded-lg font-medium transition-all text-left flex items-center gap-2 ${
                          formData.type === t.value
                            ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-700'
                            : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-xl">{t.icon}</span>
                        <span className="text-sm">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Icon Picker */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Icon</label>
            <div className="grid grid-cols-8 gap-2">
              {allIcons.map(icon => (
                <button
                  key={icon}
                  onClick={() => setFormData({...formData, icon})}
                  className={`text-2xl p-2 rounded-lg transition-all ${
                    formData.icon === icon
                      ? 'bg-emerald-100 ring-2 ring-emerald-500 scale-110'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Memo (Optional)</label>
            <input
              type="text"
              placeholder="E.g. Account number, notes..."
              value={formData.memo}
              onChange={(e) => setFormData({...formData, memo: e.target.value})}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none text-base"
            />
          </div>

          {/* Starting Balance - For all accounts except loan */}
          {needsStartingBalance && (
            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-2 text-emerald-700 mb-2">
                <span className="text-xl">💵</span>
                <span className="font-semibold text-sm">Starting Balance</span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-emerald-600 font-semibold uppercase">Amount</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={displayStartingBalance}
                    onChange={(e) => {
                      const rawValue = e.target.value.replace(/,/g, '');
                      if (rawValue === '' || /^\d*$/.test(rawValue)) {
                        setFormData({...formData, startingBalance: rawValue});
                        setDisplayStartingBalance(rawValue ? Number(rawValue).toLocaleString('en-US') : '');
                      }
                    }}
                    className="w-full p-3 bg-white rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none text-center text-lg font-semibold"
                  />
                </div>
                
                <div>
                  <label className="text-xs text-emerald-600 font-semibold uppercase">Date</label>
                  <div className="relative mt-1">
                    <div className="w-full p-3 bg-white rounded-lg flex items-center justify-between pointer-events-none">
                      <span className="text-gray-800">{formatDateForDisplay(formData.startingBalanceDate)}</span>
                      <span className="text-gray-400">📅</span>
                    </div>
                    <input
                      type="date"
                      value={formData.startingBalanceDate}
                      onChange={(e) => setFormData({...formData, startingBalanceDate: e.target.value})}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                  </div>
                </div>
                
                <div className="text-xs text-emerald-600">
                  Enter your current account balance. Leave as 0 if starting fresh.
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="bg-gradient-to-br from-emerald-50 to-blue-50 p-4 rounded-lg border border-emerald-200">
            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Preview</div>
            <div className="flex items-center justify-between bg-white p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{formData.icon}</span>
                <div>
                  <div className="font-bold text-gray-800">{formData.name || 'Account Name'}</div>
                  <div className="text-xs text-gray-500">{formData.group}</div>
                </div>
              </div>
              {isMarketValue && formData.currentValue && (
                <div className="text-right">
                  <div className="font-bold text-gray-900">
                    {new Intl.NumberFormat('en-US').format(formData.currentValue)}
                  </div>
                  <div className="text-xs text-gray-500">Current Value</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar - Only show Delete when editing */}
        {editAccount && (
          <div className="p-4 border-t bg-white">
            <button 
              onClick={handleDelete}
              className="w-full py-3 bg-red-50 text-red-600 font-medium hover:bg-red-100 rounded-lg transition-colors"
            >
              🗑️ Delete Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddAccountModal;