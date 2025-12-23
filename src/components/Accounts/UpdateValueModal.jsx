import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../services/firebase';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const UpdateValueModal = ({ isOpen, onClose, onSave, account, currentValue: propCurrentValue }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  
  const [newValue, setNewValue] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && account) {
      setNewValue('');
      setDisplayValue('');
    }
  }, [isOpen, account]);

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const handleValueChange = (e) => {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || !isNaN(raw)) {
      setNewValue(raw);
      setDisplayValue(raw ? formatNumber(raw) : '');
    }
  };

  const handleSubmit = async () => {
    if (!newValue) {
      toast.error('Please enter new value!');
      return;
    }

    const value = parseFloat(newValue);
    if (isNaN(value)) {
      toast.error('Invalid value!');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const historyEntry = {
        value: value,
        previousValue: propCurrentValue || 0,
        date: now.toISOString(),
        timestamp: now.getTime()
      };

      await updateDoc(doc(db, 'accounts', account.id), {
        currentValue: value,
        lastValueUpdate: now,
        valueHistory: arrayUnion(historyEntry)
      });

      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error('Error updating value:', error);
      toast.error('Error: ' + error.message);
    }
    setLoading(false);
  };

  if (!isOpen || !account) return null;

  const currentValue = propCurrentValue || 0;
  const newValueNum = parseFloat(newValue) || 0;
  const change = newValueNum - currentValue;
  const changePercent = currentValue > 0 ? ((change / currentValue) * 100).toFixed(2) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-xl">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">Update Value</h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading || !newValue}
            className="text-emerald-600 font-bold disabled:opacity-50"
          >
            {loading ? '...' : 'SAVE'}
          </button>
        </div>

        <div className="p-4 space-y-4">
          
          {/* Current Value */}
          <div className="text-center py-2">
            <div className="text-xs text-gray-500 uppercase">Current Value</div>
            <div className="text-2xl font-bold text-gray-800">{formatNumber(currentValue)}</div>
          </div>

          {/* New Value Input */}
          <div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter new value..."
              value={displayValue}
              onChange={handleValueChange}
              className="w-full p-4 bg-gray-50 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-2xl font-bold text-center"
              
            />
            {newValue && (
              <div className={`text-center mt-2 text-sm font-medium ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {change >= 0 ? '↑' : '↓'} {change >= 0 ? '+' : ''}{formatNumber(change)} ({changePercent}%)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateValueModal;
