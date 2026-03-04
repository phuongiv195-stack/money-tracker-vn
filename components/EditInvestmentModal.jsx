import { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Edit Investment Modal
 * Sửa name và note của investment
 */
const EditInvestmentModal = ({ investment, onClose, onSuccess }) => {
  const [name, setName] = useState(investment.name || '');
  const [note, setNote] = useState(investment.note || '');
  const [loading, setLoading] = useState(false);
  
  const handleSave = async () => {
    const trimmedName = name.trim().toUpperCase();
    
    if (!trimmedName) {
      alert('Please enter a name!');
      return;
    }
    
    setLoading(true);
    
    try {
      await updateDoc(doc(db, 'investments', investment.id), {
        name: trimmedName,
        note: note.trim(),
        updatedAt: new Date()
      });
      
      alert('Investment updated successfully!');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating investment:', error);
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
          <h2 className="text-xl font-bold text-gray-800">Edit Investment</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            &times;
          </button>
        </div>
        
        {/* Form */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2 text-left">Ticker / Name</label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              autoFocus
            />
          </div>
          
          {/* Note */}
          <div>
            <label className="block text-sm font-medium mb-2 text-left">Note</label>
            <input 
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Optional note..."
            />
          </div>
          
          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button 
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
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

export default EditInvestmentModal;
