import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const AddCategoryModal = ({ isOpen, onClose, onSave, defaultType = 'expense', editCategory = null }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  
  const [formData, setFormData] = useState({
    name: '',
    icon: '📦',
    type: defaultType,
    group: '',
    spendingType: 'need' // default spending type for expense categories
  });
  const [loading, setLoading] = useState(false);
  const [existingGroups, setExistingGroups] = useState([]);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);

  const expenseIcons = ['🍔', '🚗', '🏠', '💊', '👕', '🎮', '✈️', '📱', '💇', '🎬', '📚', '🐶', '⚡', '💳', '🛒', '🎁', '🍺', '☕', '🏋️', '🎓', '🚌', '🍕', '🏸'];
  const incomeIcons = ['💰', '💵', '💼', '🎁', '📈', '🏆', '💎', '🌟', '🎯', '💸'];

  // Load existing groups
  useEffect(() => {
    if (isOpen) {
      loadGroups();
      
      if (editCategory) {
        setFormData({
          name: editCategory.name,
          icon: editCategory.icon,
          type: editCategory.type,
          group: editCategory.group || '',
          spendingType: editCategory.spendingType || 'need'
        });
      } else {
        setFormData({
          name: '',
          icon: '📦',
          type: defaultType,
          group: '',
          spendingType: 'need'
        });
      }
    }
  }, [isOpen, editCategory, defaultType]);

  const loadGroups = async () => {
    try {
      const q = query(collection(db, 'categories'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const groups = [...new Set(snapshot.docs.map(d => d.data().group).filter(Boolean))];
      setExistingGroups(groups);
    } catch (e) {
      console.error("Load groups error:", e);
    }
  };

  const filteredGroups = existingGroups.filter(g => 
    g.toLowerCase().includes(formData.group.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter category name!");
      return;
    }
    if (!formData.group.trim()) {
      toast.error("Please enter Group!");
      return;
    }

    setLoading(true);
    try {
      const categoryData = {
        userId: userId,
        name: formData.name.trim(),
        icon: formData.icon,
        type: formData.type,
        group: formData.group.trim(),
        spendingType: formData.type === 'expense' ? formData.spendingType : null
      };

      if (editCategory) {
        // Keep existing createdAt if it exists
        if (editCategory.createdAt) {
          categoryData.createdAt = editCategory.createdAt;
        }
        
        const oldName = editCategory.name;
        const newName = formData.name.trim();
        
        // If name changed, update all transactions with old category name
        if (oldName !== newName) {
          const transQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', userId),
            where('category', '==', oldName)
          );
          const transSnapshot = await getDocs(transQuery);
          
          // Update each transaction
          const updatePromises = transSnapshot.docs.map(transDoc => 
            updateDoc(doc(db, 'transactions', transDoc.id), { category: newName })
          );
          
          // Also update split transactions that contain this category
          const splitQuery = query(
            collection(db, 'transactions'),
            where('userId', '==', userId),
            where('type', '==', 'split')
          );
          const splitSnapshot = await getDocs(splitQuery);
          
          splitSnapshot.docs.forEach(splitDoc => {
            const data = splitDoc.data();
            if (data.splits && data.splits.some(s => s.category === oldName)) {
              const updatedSplits = data.splits.map(s => 
                s.category === oldName ? { ...s, category: newName } : s
              );
              updatePromises.push(
                updateDoc(doc(db, 'transactions', splitDoc.id), { splits: updatedSplits })
              );
            }
          });
          
          await Promise.all(updatePromises);
          
          if (transSnapshot.size > 0 || splitSnapshot.size > 0) {
            toast.success(`Updated ${transSnapshot.size} transactions`);
          }
        }
        
        await updateDoc(doc(db, 'categories', editCategory.id), categoryData);
      } else {
        categoryData.createdAt = new Date();
        await addDoc(collection(db, 'categories'), categoryData);
      }

      if (onSave) onSave();
      onClose();
      
      setFormData({
        name: '',
        icon: '📦',
        type: defaultType,
        group: '',
        spendingType: 'need'
      });
    } catch (error) {
      console.error("Error saving category:", error);
      toast.error("Error saving: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editCategory) return;
    
    const confirmed = await toast.confirm({
      title: 'Delete Category',
      message: `Delete "${editCategory.name}"?`,
      confirmText: 'Delete',
      type: 'danger'
    });
    
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'categories', editCategory.id));
        if (onSave) onSave();
        onClose();
      } catch (error) {
        toast.error("Error deleting: " + error.message);
      }
    }
  };

  if (!isOpen) return null;

  const currentIcons = formData.type === 'expense' ? expenseIcons : incomeIcons;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 sm:flex sm:items-center sm:justify-center">
      <div className="bg-white w-full h-full sm:w-[450px] sm:h-auto sm:max-h-[90vh] sm:rounded-xl flex flex-col">
        
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">{editCategory ? 'Edit Category' : 'Add Category'}</h2>
          <div className="w-8"></div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          
          {/* Type Selector */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormData({...formData, type: 'expense'})}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  formData.type === 'expense'
                    ? 'bg-red-100 text-red-700 border-2 border-red-300'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                💸 Expense
              </button>
              <button
                onClick={() => setFormData({...formData, type: 'income'})}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  formData.type === 'income'
                    ? 'bg-green-100 text-green-700 border-2 border-green-300'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                💰 Income
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Category Name</label>
            <input
              type="text"
              placeholder="E.g. Coffee, Gym, Salary..."
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
              
            />
          </div>

          {/* Icon Picker */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Icon</label>
            
            {/* Custom Icon Input */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Type or paste emoji..."
                  value={formData.icon}
                  onChange={(e) => {
                    // Get the last character/emoji entered
                    const value = e.target.value;
                    // Take only the last emoji (handles paste of multiple)
                    const emojis = [...value];
                    const lastEmoji = emojis[emojis.length - 1] || '📦';
                    setFormData({...formData, icon: lastEmoji});
                  }}
                  className="w-full p-3 bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-center text-2xl"
                />
              </div>
              <div className={`w-14 h-14 flex items-center justify-center text-3xl rounded-lg ${
                formData.icon ? 'bg-emerald-100 ring-2 ring-emerald-500' : 'bg-gray-100'
              }`}>
                {formData.icon || '📦'}
              </div>
            </div>

            <div className="text-xs text-gray-400 text-center mb-2">Or choose from presets:</div>
            
            {/* Preset Icons Grid */}
            <div className="grid grid-cols-9 gap-2">
              {currentIcons.map(icon => (
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

          {/* Want/Need Toggle - Only for Expense categories */}
          {formData.type === 'expense' && (
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Default Spending Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormData({...formData, spendingType: 'need'})}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    formData.spendingType === 'need'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-400'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>🎯</span>
                    <span>Need</span>
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">Essential</div>
                </button>
                <button
                  onClick={() => setFormData({...formData, spendingType: 'want'})}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    formData.spendingType === 'want'
                      ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>✨</span>
                    <span>Want</span>
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">Optional</div>
                </button>
              </div>
            </div>
          )}

          {/* Group - Autocomplete */}
          <div className="relative">
            <label className="text-xs text-gray-500 uppercase font-semibold">Group</label>
            <input
              type="text"
              placeholder="Type to search or create new group..."
              value={formData.group}
              onChange={(e) => {
                setFormData({...formData, group: e.target.value});
                setShowGroupSuggestions(true);
              }}
              onFocus={() => setShowGroupSuggestions(true)}
              onBlur={() => setTimeout(() => setShowGroupSuggestions(false), 200)}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            
            {showGroupSuggestions && formData.group.trim() && (
              <div className="absolute z-20 w-full bg-white shadow-xl max-h-48 overflow-y-auto rounded-lg mt-1 border border-gray-200">
                {filteredGroups.length > 0 ? (
                  filteredGroups.map(group => (
                    <div
                      key={group}
                      onClick={() => {
                        setFormData({...formData, group});
                        setShowGroupSuggestions(false);
                      }}
                      className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-50"
                    >
                      {group}
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-emerald-600 hover:bg-emerald-50 cursor-pointer flex items-center gap-2">
                    <span>➕</span>
                    <span>Create "{formData.group}"</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-gradient-to-br from-emerald-50 to-blue-50 p-4 rounded-lg border border-emerald-200">
            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Preview</div>
            <div className="flex items-center gap-3 bg-white p-3 rounded-lg">
              <span className="text-3xl">{formData.icon}</span>
              <div>
                <div className="font-bold text-gray-800">{formData.name || 'Category Name'}</div>
                <div className="text-xs text-gray-500">{formData.group || 'Group Name'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Bar */}
        <div className="p-4 mb-20 border-t bg-white flex justify-between items-center gap-3">
          {editCategory && (
            <button 
              onClick={handleDelete}
              className="px-4 py-2 bg-red-50 text-red-600 font-medium hover:bg-red-100 rounded-lg transition-colors"
            >
              🗑️ Delete
            </button>
          )}
          <div className="flex-1"></div>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="px-6 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCategoryModal;