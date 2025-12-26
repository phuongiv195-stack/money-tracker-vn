import React, { useState, useEffect, useRef } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const ReorderCategoriesModal = ({ isOpen, onClose, categories, onSave, categoryType = 'expense' }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  
  // Store categories grouped by their group
  const [groupedCategories, setGroupedCategories] = useState({});
  const [groupOrder, setGroupOrder] = useState([]);
  const [saving, setSaving] = useState(false);
  
  // Drag state
  const [dragItem, setDragItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const dragNode = useRef(null);

  useEffect(() => {
    if (isOpen && categories.length > 0) {
      // Filter categories by type and group them
      const filteredCategories = categories.filter(c => c.type === categoryType);
      
      // Get unique groups and sort them
      const groups = [...new Set(filteredCategories.map(c => c.group).filter(Boolean))].sort();
      setGroupOrder(groups);
      
      // Group categories
      const grouped = {};
      groups.forEach(group => {
        grouped[group] = filteredCategories
          .filter(c => c.group === group)
          .sort((a, b) => {
            const orderA = a.order ?? 999;
            const orderB = b.order ?? 999;
            return orderA - orderB;
          });
      });
      
      setGroupedCategories(grouped);
      setSaving(false);
    }
  }, [isOpen, categories, categoryType]);

  // Drag handlers
  const handleDragStart = (e, group, index) => {
    setDragItem({ group, index });
    dragNode.current = e.target;
    dragNode.current.addEventListener('dragend', handleDragEnd);
    
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.classList.add('opacity-50');
      }
    }, 0);
  };

  const handleDragEnter = (e, group, index) => {
    e.preventDefault();
    
    if (!dragItem || dragItem.group !== group) return;
    if (dragItem.index === index) return;
    
    setDragOverItem({ group, index });
    
    const newGrouped = { ...groupedCategories };
    const arr = [...newGrouped[group]];
    const draggedItem = arr[dragItem.index];
    
    arr.splice(dragItem.index, 1);
    arr.splice(index, 0, draggedItem);
    
    newGrouped[group] = arr;
    setGroupedCategories(newGrouped);
    setDragItem({ group, index });
  };

  const handleDragEnd = () => {
    if (dragNode.current) {
      dragNode.current.classList.remove('opacity-50');
      dragNode.current.removeEventListener('dragend', handleDragEnd);
    }
    setDragItem(null);
    setDragOverItem(null);
    dragNode.current = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Touch drag handlers for mobile
  const touchStartY = useRef(0);
  const touchStartIndex = useRef(null);
  const touchGroup = useRef(null);
  
  const handleTouchStart = (e, group, index) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartIndex.current = index;
    touchGroup.current = group;
  };

  const handleTouchMove = (e) => {
    if (touchStartIndex.current === null) return;
    
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY.current;
    const threshold = 50;
    
    const group = touchGroup.current;
    const currentIndex = touchStartIndex.current;
    const arr = groupedCategories[group] || [];
    
    if (diff < -threshold && currentIndex > 0) {
      moveUp(group, currentIndex);
      touchStartY.current = touchY;
      touchStartIndex.current = currentIndex - 1;
    } else if (diff > threshold && currentIndex < arr.length - 1) {
      moveDown(group, currentIndex);
      touchStartY.current = touchY;
      touchStartIndex.current = currentIndex + 1;
    }
  };

  const handleTouchEnd = () => {
    touchStartIndex.current = null;
    touchGroup.current = null;
  };

  const moveUp = (group, index) => {
    if (index === 0) return;
    const newGrouped = { ...groupedCategories };
    const arr = [...newGrouped[group]];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    newGrouped[group] = arr;
    setGroupedCategories(newGrouped);
  };

  const moveDown = (group, index) => {
    const arr = groupedCategories[group];
    if (index === arr.length - 1) return;
    const newGrouped = { ...groupedCategories };
    const newArr = [...arr];
    [newArr[index], newArr[index + 1]] = [newArr[index + 1], newArr[index]];
    newGrouped[group] = newArr;
    setGroupedCategories(newGrouped);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    
    try {
      const batch = writeBatch(db);
      
      groupOrder.forEach(group => {
        const cats = groupedCategories[group] || [];
        if (cats.length === 0) return;
        cats.forEach((cat, index) => {
          const catRef = doc(db, 'categories', cat.id);
          batch.update(catRef, { order: index });
        });
      });
      
      await batch.commit();
      toast.success('Category order saved!');
      onClose();
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving order:', error);
      toast.error('Error saving: ' + error.message);
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 sm:flex sm:items-center sm:justify-center">
      <div className="bg-white w-full h-full sm:w-[450px] sm:h-auto sm:max-h-[90vh] sm:rounded-xl flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">
            Reorder {categoryType === 'expense' ? 'Expenses' : 'Income'}
          </h2>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="text-emerald-600 font-bold disabled:opacity-50"
          >
            {saving ? 'SAVING...' : 'SAVE'}
          </button>
        </div>

        {/* Instructions */}
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 text-center">
          Drag to reorder or use arrows • Only within same group
        </div>

        {/* Category List by Group */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {groupOrder.map(group => {
            const cats = groupedCategories[group] || [];
            if (cats.length === 0) return null;
            
            return (
              <div key={group}>
                {/* Group Header */}
                <div className="text-xs font-bold text-gray-500 uppercase mb-2 px-1">
                  {group}
                </div>
                
                {/* Categories in this group */}
                <div className="space-y-2">
                  {cats.map((cat, index) => (
                    <div
                      key={cat.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, group, index)}
                      onDragEnter={(e) => handleDragEnter(e, group, index)}
                      onDragOver={handleDragOver}
                      onTouchStart={(e) => handleTouchStart(e, group, index)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className={`flex items-center gap-3 p-3 bg-white rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing ${
                        dragOverItem?.group === group && dragOverItem?.index === index
                          ? 'border-emerald-400 bg-emerald-50'
                          : 'border-gray-200'
                      }`}
                    >
                      {/* Drag Handle */}
                      <div className="text-gray-400 text-lg cursor-grab">☰</div>
                      
                      {/* Category Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-2xl">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 truncate">{cat.name}</div>
                        </div>
                      </div>

                      {/* Arrow Buttons */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => moveUp(group, index)}
                          disabled={index === 0}
                          className="w-8 h-8 rounded bg-gray-100 text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors text-sm font-bold"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveDown(group, index)}
                          disabled={index === cats.length - 1}
                          className="w-8 h-8 rounded bg-gray-100 text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors text-sm font-bold"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {groupOrder.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No {categoryType} categories found
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="p-4 border-t bg-gray-50 text-center text-xs text-gray-500">
          This order will be used when displaying categories
        </div>

      </div>
    </div>
  );
};

export default ReorderCategoriesModal;
