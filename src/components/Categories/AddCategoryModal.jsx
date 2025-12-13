import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AddCategoryModal = ({ isOpen, onClose, onSave, defaultType = 'expense', editCategory = null }) => {
  const [formData, setFormData] = useState({
    name: '',
    icon: '📦',
    type: defaultType,
    group: ''
  });
  const [loading, setLoading] = useState(false);
  const [existingGroups, setExistingGroups] = useState([]);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);

  const expenseIcons = ['🍔', '🚗', '🏠', '💊', '👕', '🎮', '✈️', '📱', '💇', '🎬', '📚', '🐶', '⚡', '💳', '🛒', '🎁', '🍺', '☕', '🏋️', '🎓', '🚌', '🍕'];
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
          group: editCategory.group || ''
        });
      } else {
        setFormData({
          name: '',
          icon: '📦',
          type: defaultType,
          group: ''
        });
      }
    }
  }, [isOpen, editCategory, defaultType]);

  const loadGroups = async () => {
    try {
      const q = query(collection(db, 'categories'), where('userId', '==', 'test-user'));
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
      alert("Vui lòng nhập tên category!");
      return;
    }
    if (!formData.group.trim()) {
      alert("Vui lòng nhập Group!");
      return;
    }

    setLoading(true);
    try {
      const categoryData = {
        userId: 'test-user',
        name: formData.name.trim(),
        icon: formData.icon,
        type: formData.type,
        group: formData.group.trim(),
        createdAt: editCategory ? editCategory.createdAt : new Date()
      };

      if (editCategory) {
        await updateDoc(doc(db, 'categories', editCategory.id), categoryData);
      } else {
        await addDoc(collection(db, 'categories'), categoryData);
      }

      if (onSave) onSave();
      onClose();
      
      setFormData({
        name: '',
        icon: '📦',
        type: defaultType,
        group: ''
      });
    } catch (error) {
      console.error("Error saving category:", error);
      alert("Lỗi khi lưu: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!editCategory) return;
    
    if (window.confirm(`Xóa category "${editCategory.name}"?`)) {
      try {
        await deleteDoc(doc(db, 'categories', editCategory.id));
        if (onSave) onSave();
        onClose();
      } catch (error) {
        alert("Lỗi khi xóa: " + error.message);
      }
    }
  };

  if (!isOpen) return null;

  const currentIcons = formData.type === 'expense' ? expenseIcons : incomeIcons;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[450px] sm:rounded-xl flex flex-col max-h-[85vh]">
        
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">{editCategory ? 'Edit Category' : 'Add Category'}</h2>
          <div className="flex items-center gap-2">
            {editCategory && (
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
              autoFocus
            />
          </div>

          {/* Icon Picker */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Icon</label>
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
      </div>
    </div>
  );
};

export default AddCategoryModal;