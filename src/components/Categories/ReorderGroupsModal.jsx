import React, { useState, useEffect, useRef } from 'react';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const ReorderGroupsModal = ({ isOpen, onClose, categories, onSave, categoryType = 'expense' }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  
  // Drag state
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNode = useRef(null);

  useEffect(() => {
    if (isOpen && categories.length > 0) {
      // Get unique groups for this category type
      const filteredCategories = categories.filter(c => c.type === categoryType);
      const uniqueGroups = [...new Set(filteredCategories.map(c => c.group).filter(Boolean))];
      
      // Load saved order from localStorage
      const savedOrder = localStorage.getItem(`groupOrder_${categoryType}`);
      
      if (savedOrder) {
        try {
          const parsedOrder = JSON.parse(savedOrder);
          // Sort groups by saved order, put new groups at end
          uniqueGroups.sort((a, b) => {
            const indexA = parsedOrder.indexOf(a);
            const indexB = parsedOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });
        } catch (e) {
          console.error('Error parsing saved group order:', e);
        }
      } else {
        // Default alphabetical sort
        uniqueGroups.sort((a, b) => a.localeCompare(b));
      }
      
      setGroups(uniqueGroups);
      setSaving(false);
    }
  }, [isOpen, categories, categoryType]);

  // Drag handlers
  const handleDragStart = (e, index) => {
    setDragIndex(index);
    dragNode.current = e.target;
    dragNode.current.addEventListener('dragend', handleDragEnd);
    
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.classList.add('opacity-50');
      }
    }, 0);
  };

  const handleDragEnter = (e, index) => {
    e.preventDefault();
    if (dragIndex === index) return;
    
    setDragOverIndex(index);
    
    // Reorder in real-time
    const newGroups = [...groups];
    const draggedItem = newGroups[dragIndex];
    
    newGroups.splice(dragIndex, 1);
    newGroups.splice(index, 0, draggedItem);
    
    setGroups(newGroups);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    if (dragNode.current) {
      dragNode.current.classList.remove('opacity-50');
      dragNode.current.removeEventListener('dragend', handleDragEnd);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Touch drag handlers for mobile
  const touchStartY = useRef(0);
  const touchStartIndex = useRef(null);
  
  const handleTouchStart = (e, index) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartIndex.current = index;
  };

  const handleTouchMove = (e) => {
    if (touchStartIndex.current === null) return;
    
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY.current;
    const threshold = 50;
    
    const currentIndex = touchStartIndex.current;
    
    if (diff < -threshold && currentIndex > 0) {
      moveUp(currentIndex);
      touchStartY.current = touchY;
      touchStartIndex.current = currentIndex - 1;
    } else if (diff > threshold && currentIndex < groups.length - 1) {
      moveDown(currentIndex);
      touchStartY.current = touchY;
      touchStartIndex.current = currentIndex + 1;
    }
  };

  const handleTouchEnd = () => {
    touchStartIndex.current = null;
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newGroups = [...groups];
    [newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]];
    setGroups(newGroups);
  };

  const moveDown = (index) => {
    if (index === groups.length - 1) return;
    const newGroups = [...groups];
    [newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]];
    setGroups(newGroups);
  };

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    
    try {
      // Save to localStorage
      localStorage.setItem(`groupOrder_${categoryType}`, JSON.stringify(groups));
      
      toast.success('Group order saved!');
      onClose();
      if (onSave) onSave(groups);
    } catch (error) {
      console.error('Error saving group order:', error);
      toast.error('Error saving: ' + error.message);
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Count categories per group
  const getCategoryCount = (groupName) => {
    return categories.filter(c => c.type === categoryType && c.group === groupName).length;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 sm:flex sm:items-center sm:justify-center">
      <div className="bg-white w-full h-full sm:w-[450px] sm:h-auto sm:max-h-[90vh] sm:rounded-xl flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <button onClick={onClose} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">
            Reorder {categoryType === 'expense' ? 'Expense' : 'Income'} Groups
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
          Drag to reorder or use arrows
        </div>

        {/* Group List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {groups.map((group, index) => (
            <div
              key={group}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onDragOver={handleDragOver}
              onTouchStart={(e) => handleTouchStart(e, index)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`flex items-center gap-3 p-4 bg-white rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing ${
                dragOverIndex === index
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-200'
              }`}
            >
              {/* Drag Handle */}
              <div className="text-gray-400 text-lg cursor-grab">☰</div>
              
              {/* Group Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800">{group}</div>
                <div className="text-xs text-gray-500">{getCategoryCount(group)} categories</div>
              </div>

              {/* Arrow Buttons */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="w-8 h-8 rounded bg-gray-100 text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors text-sm font-bold"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === groups.length - 1}
                  className="w-8 h-8 rounded bg-gray-100 text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors text-sm font-bold"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {groups.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No {categoryType} groups found
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="p-4 border-t bg-gray-50 text-center text-xs text-gray-500">
          Group order is saved locally on this device
        </div>

      </div>
    </div>
  );
};

export default ReorderGroupsModal;
