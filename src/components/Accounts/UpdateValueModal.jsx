import React, { useState, useEffect } from 'react';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const UpdateValueModal = ({ isOpen, onClose, onSave, account, currentValue: propCurrentValue }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  
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
  
  const [newValue, setNewValue] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [valueDate, setValueDate] = useState(getLocalToday());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && account) {
      setNewValue('');
      setDisplayValue('');
      setValueDate(getLocalToday());
    }
  }, [isOpen, account]);

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const handleValueChange = (e) => {
    let raw = e.target.value.replace(/,/g, '');
    
    // Allow negative sign at the beginning
    if (raw === '-') {
      setNewValue('-');
      setDisplayValue('-');
      return;
    }
    
    // Check if it's a valid number (including negative)
    if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
      setNewValue(raw);
      if (raw === '' || raw === '-') {
        setDisplayValue(raw);
      } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          // Keep negative sign and format
          const isNegative = raw.startsWith('-');
          setDisplayValue((isNegative ? '-' : '') + formatNumber(Math.abs(num)));
        }
      }
    }
  };

  const handleSubmit = async () => {
    if (!newValue || newValue === '-') {
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
      const previousValue = propCurrentValue || 0;
      const gainLoss = value - previousValue;
      
      // Update currentValue on account (không cần lưu valueHistory nữa)
      await updateDoc(doc(db, 'accounts', account.id), {
        currentValue: value,
        lastValueUpdate: now
      });

      // Create Unrealized Gain/Loss transaction if there's a change
      if (gainLoss !== 0) {
        await addDoc(collection(db, 'transactions'), {
          userId: account.userId,
          type: 'unrealized_gain',
          amount: gainLoss,
          account: account.name,
          date: valueDate, // Use selected date
          createdAt: now
        });
      }

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
  
  // Fix percentage calculation
  // If currentValue is 0 or negative, use absolute value for meaningful %
  let changePercent = 0;
  if (currentValue !== 0) {
    changePercent = ((change / Math.abs(currentValue)) * 100).toFixed(2);
  } else if (newValueNum !== 0) {
    // If starting from 0, show 100% gain/loss based on new value
    changePercent = newValueNum > 0 ? '100.00' : '-100.00';
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-xl">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">Update Value</h2>
          <button 
            onClick={handleSubmit} 
            disabled={loading || !newValue || newValue === '-'}
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
            <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">New Value</label>
            <input
              type="text"
              inputMode="text"
              placeholder="Enter new value..."
              value={displayValue}
              onChange={handleValueChange}
              className="w-full p-4 bg-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-2xl font-bold text-center"
              autoFocus
            />
            {newValue && newValue !== '-' && (
              <div className={`text-center mt-2 text-sm font-medium ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {change >= 0 ? '↑' : '↓'} {change >= 0 ? '+' : ''}{formatNumber(change)} ({change >= 0 ? '+' : ''}{changePercent}%)
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Date</label>
            <div className="relative">
              <div className="w-full p-3 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-between pointer-events-none">
                <span className="text-gray-800">{formatDateForDisplay(valueDate)}</span>
                <span className="text-gray-400">📅</span>
              </div>
              <input 
                type="date" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateValueModal;
