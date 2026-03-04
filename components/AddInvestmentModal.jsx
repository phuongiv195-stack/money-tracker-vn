import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Add Investment Modal
 * Form để thêm Fund/ETF/Stock mới
 */
const AddInvestmentModal = ({ onClose, onSuccess, initialCategory = 'open_fund' }) => {
  const [category, setCategory] = useState(initialCategory);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [fundType, setFundType] = useState('Stock Fund');
  const [loading, setLoading] = useState(false);
  
  // Update form khi đổi category
  const getPlaceholder = () => {
    switch (category) {
      case 'open_fund': return 'Ex: VFMVN30, SSISCA';
      case 'etf': return 'Ex: E1VFVN30, FUEVFVND';
      case 'stock': return 'Ex: FPT, VNM, MSR';
      default: return '';
    }
  };
  
  const getNameLabel = () => {
    switch (category) {
      case 'open_fund': return 'Fund Name';
      case 'etf': return 'ETF Ticker';
      case 'stock': return 'Stock Ticker';
      default: return 'Name';
    }
  };
  
  // Save to Firestore
  const handleSave = async () => {
    const trimmedName = name.trim().toUpperCase();
    
    if (!trimmedName) {
      alert('Please enter a name!');
      return;
    }
    
    setLoading(true);
    
    try {
      // Determine type
      let type;
      if (category === 'open_fund') {
        type = fundType;
      } else if (category === 'etf') {
        type = 'ETF';
      } else {
        type = 'Stock';
      }
      
      const investmentData = {
        name: trimmedName,
        type,
        category,
        note: note.trim(),
        currentNAV: 0,
        currentNAVDate: '',
        currentPrice: 0,
        currentPriceDate: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await addDoc(collection(db, 'investments'), investmentData);
      
      alert('Investment added successfully!');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error adding investment:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Add New Investment</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            &times;
          </button>
        </div>
        
        {/* Form */}
        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2 text-left">Category</label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="category" 
                  value="open_fund"
                  checked={category === 'open_fund'}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <span className="text-sm">Mutual Fund</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="category" 
                  value="etf"
                  checked={category === 'etf'}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <span className="text-sm">ETF</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="category" 
                  value="stock"
                  checked={category === 'stock'}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <span className="text-sm">Stock</span>
              </label>
            </div>
          </div>
          
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2 text-left">{getNameLabel()}</label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder={getPlaceholder()}
              autoFocus
            />
          </div>
          
          {/* Note */}
          <div>
            <label className="block text-sm font-medium mb-2 text-left">Note (Optional)</label>
            <input 
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Ex: Long term, My wife's account..."
            />
          </div>
          
          {/* Fund Type (only for open_fund) */}
          {category === 'open_fund' && (
            <div>
              <label className="block text-sm font-medium mb-2 text-left">Fund Type</label>
              <select 
                value={fundType}
                onChange={(e) => setFundType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="Stock Fund">Stock Fund</option>
                <option value="Bond Fund">Bond Fund</option>
                <option value="Balanced Fund">Balanced Fund</option>
              </select>
            </div>
          )}
          
          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button 
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add'}
            </button>
            <button 
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddInvestmentModal;
