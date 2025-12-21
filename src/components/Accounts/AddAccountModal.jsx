import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import useBackHandler from '../../hooks/useBackHandler';

const AddAccountModal = ({ isOpen, onClose, onSave, editAccount = null }) => {
  useBackHandler(isOpen, onClose);
  
  const [formData, setFormData] = useState({
    name: '',
    icon: '🏦',
    type: 'bank',
    group: 'SPENDING',
    currentValue: '',
    costBasis: ''
  });
  const [loading, setLoading] = useState(false);

  // Account type configurations
  const accountTypes = {
    'SPENDING': [
      { value: 'cash', label: 'Cash', icon: '💵' },
      { value: 'bank', label: 'Bank', icon: '🏦' }
    ],
    'SAVINGS': [
      { value: 'savings', label: 'Savings', icon: '💰' }
    ],
    'INVESTMENTS': [
      { value: 'investment', label: 'Investment', icon: '📈' },
      { value: 'property', label: 'Property', icon: '🏠' },
      { value: 'vehicle', label: 'Vehicle', icon: '🚗' },
      { value: 'asset', label: 'Other Asset', icon: '💎' }
    ],
    'LOANS': [
      { value: 'loan', label: 'Loan', icon: '💸' }
    ]
  };

  const allIcons = ['💵', '🏦', '💰', '🐷', '📈', '💎', '🏠', '🚗', '💸', '💳', '🏪', '🛒', '💼', '🎯', '⭐'];

  // Check if account is market-value type
  const isMarketValue = ['investment', 'property', 'vehicle', 'asset'].includes(formData.type);

  useEffect(() => {
    if (isOpen) {
      if (editAccount) {
        setFormData({
          name: editAccount.name,
          icon: editAccount.icon,
          type: editAccount.type,
          group: editAccount.group,
          currentValue: editAccount.currentValue || '',
          costBasis: editAccount.costBasis || ''
        });
      } else {
        setFormData({
          name: '',
          icon: '🏦',
          type: 'bank',
          group: 'SPENDING',
          currentValue: '',
          costBasis: ''
        });
      }
    }
  }, [isOpen, editAccount]);

  // Auto-update group when type changes
  useEffect(() => {
    const groupMap = {
      cash: 'SPENDING',
      bank: 'SPENDING',
      savings: 'SAVINGS',
      investment: 'INVESTMENTS',
      property: 'INVESTMENTS',
      vehicle: 'INVESTMENTS',
      asset: 'INVESTMENTS',
      loan: 'LOANS'
    };
    
    const newGroup = groupMap[formData.type];
    if (newGroup && newGroup !== formData.group) {
      setFormData(prev => ({ ...prev, group: newGroup }));
    }
  }, [formData.type]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert("Vui lòng nhập tên account!");
      return;
    }

    // Validate market-value accounts
    if (isMarketValue && !formData.currentValue) {
      alert("Investment accounts cần nhập Current Value!");
      return;
    }

    setLoading(true);
    try {
      const accountData = {
        userId: 'test-user',
        name: formData.name.trim(),
        icon: formData.icon,
        type: formData.type,
        group: formData.group,
        isActive: true,
        updatedAt: new Date()
      };

      // Add market-value specific fields
      if (isMarketValue) {
        accountData.currentValue = parseFloat(formData.currentValue) || 0;
        accountData.costBasis = parseFloat(formData.costBasis) || 0;
        accountData.lastValueUpdate = new Date();
      }

      if (editAccount) {
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
      alert("Lỗi khi lưu: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editAccount) return;
    
    if (window.confirm(`Xóa account "${editAccount.name}"?\n\nCảnh báo: Các transactions liên quan sẽ bị mất link!`)) {
      try {
        await deleteDoc(doc(db, 'accounts', editAccount.id));
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
      <div className="bg-white w-full sm:w-[450px] sm:rounded-xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">{editAccount ? 'Edit Account' : 'Add Account'}</h2>
          <div className="flex items-center gap-2">
            {editAccount && (
              <button 
                onClick={handleDelete}
                className="text-red-500 text-xl hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
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

        <div className="p-4 space-y-4 overflow-y-auto">
          
          {/* Account Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Account Name</label>
            <input
              type="text"
              placeholder="E.g. Vietcombank, Cash, D-Cash SSI..."
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
              
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

          {/* Market Value Fields - CHỈ hiện khi ADD NEW (không phải edit) */}
          {isMarketValue && !editAccount && (
            <div className="bg-blue-50 p-4 rounded-lg space-y-3 border border-blue-200">
              <div className="flex items-center gap-2 text-blue-700 mb-2">
                <span className="text-xl">📊</span>
                <span className="font-semibold text-sm">Investment Account</span>
              </div>
              
              <div>
                <label className="text-xs text-blue-600 font-semibold uppercase">Current Value *</label>
                <input
                  type="number"
                  placeholder="300000000"
                  value={formData.currentValue}
                  onChange={(e) => setFormData({...formData, currentValue: e.target.value})}
                  className="w-full p-3 bg-white rounded-lg mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="text-xs text-blue-600 mt-1">Giá trị thị trường hiện tại</div>
              </div>

              <div>
                <label className="text-xs text-blue-600 font-semibold uppercase">Cost Basis (Optional)</label>
                <input
                  type="number"
                  placeholder="250000000"
                  value={formData.costBasis}
                  onChange={(e) => setFormData({...formData, costBasis: e.target.value})}
                  className="w-full p-3 bg-white rounded-lg mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="text-xs text-blue-600 mt-1">Tổng số tiền đã đầu tư</div>
              </div>
            </div>
          )}

          {/* Transaction-based Note */}
          {!isMarketValue && (
            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-2 text-emerald-700">
                <span className="text-lg">ℹ️</span>
                <span className="text-xs font-medium">
                  Balance sẽ được tính tự động từ transactions
                </span>
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
      </div>
    </div>
  );
};

export default AddAccountModal;