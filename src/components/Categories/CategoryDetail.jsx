import React, { useMemo, useState } from 'react';
import { writeBatch, doc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import useBackHandler from '../../hooks/useBackHandler';

const CategoryDetail = ({ category, transactions, currentDate, onClose }) => {
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prefilledCategory, setPrefilledCategory] = useState(null);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Register back handler for hardware back button
  useBackHandler(true, isSelectMode ? () => { setIsSelectMode(false); setSelectedItems(new Set()); } : onClose);

  if (!category) return null;

  // Handler để mở Add Transaction với category prefilled
  const handleAddTransaction = () => {
    setPrefilledCategory({ 
      name: category.name, 
      type: category.type,
      spendingType: category.spendingType || 'need'
    });
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  // Get transactions including splits that contain this category
  const history = useMemo(() => {
    const monthStr = currentDate.toISOString().slice(0, 7); 
    const result = [];
    
    transactions.forEach(t => {
      if (!t.date || !t.date.startsWith(monthStr)) return;
      
      // Regular transaction with this category
      if (t.category === category.name) {
        result.push(t);
      }
      
      // Split transaction - check if any split has this category
      if (t.type === 'split' && t.splits) {
        const hasCategoryInSplit = t.splits.some(s => s.category === category.name);
        if (hasCategoryInSplit) {
          // Push the whole split transaction (not virtual)
          result.push({
            ...t,
            isSplitTransaction: true
          });
        }
      }
    });
    
    return result.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [category, transactions, currentDate]);

  // Calculate total from history
  const totalAmount = useMemo(() => {
    let total = 0;
    history.forEach(t => {
      if (t.type === 'split' && t.splits) {
        // Only sum splits that match this category
        t.splits.forEach(s => {
          if (s.category === category.name) {
            total += t.splitType === 'expense' ? -s.amount : s.amount;
          }
        });
      } else {
        total += Number(t.amount);
      }
    });
    return total;
  }, [history, category.name]);

  const groupedHistory = useMemo(() => {
    const groups = {};
    history.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [history]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
  };

  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${yyyy}/${mm}/${dd} ${day}`;
  };

  // Multi-select functions
  const handleLongPress = (itemId) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedItems(new Set([itemId]));
      if (navigator.vibrate) navigator.vibrate(50);
    }
  };

  const handleSelectItem = (itemId) => {
    if (!isSelectMode) return;
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set(history.map(t => t.id));
    setSelectedItems(allIds);
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedItems.forEach(id => {
        batch.delete(doc(db, 'transactions', id));
      });
      await batch.commit();
      setSuccessMessage(`Deleted ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (err) { 
      alert('Error: ' + err.message); 
    }
  };

  const handleDuplicateSelected = async () => {
    if (selectedItems.size === 0) return;
    try {
      const selectedTransactions = history.filter(t => selectedItems.has(t.id));
      
      for (const t of selectedTransactions) {
        const { id, isSplitTransaction, ...transactionData } = t;
        await addDoc(collection(db, 'transactions'), {
          ...transactionData,
          createdAt: new Date()
        });
      }
      
      setSuccessMessage(`Duplicated ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
    } catch (err) { 
      alert('Error: ' + err.message); 
    }
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedItems(new Set());
  };

  // Long press handler
  let longPressTimer = null;
  const handleTouchStart = (itemId) => {
    longPressTimer = setTimeout(() => handleLongPress(itemId), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  };

  const handleTransactionClick = (t) => {
    if (isSelectMode) {
      handleSelectItem(t.id);
    } else {
      setEditingTransaction(t);
      setIsModalOpen(true);
    }
  };

  // Split icon
  const SplitIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 inline-block mr-1">
      <path d="M12 22v-10" />
      <path d="M12 12C12 8 8 5 4 3" />
      <path d="M12 12C12 8 16 5 20 3" />
      <polyline points="6 6 4 3 1 5" />
      <polyline points="18 6 20 3 23 5" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header - changes based on select mode */}
      {isSelectMode ? (
        <div className="bg-indigo-600 p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
          <button onClick={exitSelectMode} className="text-white text-lg p-2 -ml-2">✕</button>
          <div className="font-bold text-lg text-white">{selectedItems.size} selected</div>
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="text-white text-sm px-3 py-1 bg-white/20 rounded-lg">All</button>
            <button onClick={handleDuplicateSelected} className="text-white text-sm px-3 py-1 bg-emerald-500 rounded-lg">📋</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="text-white text-sm px-3 py-1 bg-red-500 rounded-lg">🗑️</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
          <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
          <div className="font-bold text-lg">{category.name}</div>
          <div className="w-10"></div>
        </div>
      )}

      {/* SUMMARY CARD */}
      <div className="p-4 bg-emerald-600 text-white text-center shadow-sm">
        <div className="text-sm opacity-90">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <div className="text-3xl font-bold mt-1">
          {totalAmount >= 0 ? '+' : '-'}{formatCurrency(totalAmount)}
        </div>
        <div className="text-sm mt-1 opacity-80">{history.length} transactions</div>
      </div>

      {/* TRANSACTION LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.keys(groupedHistory).length === 0 ? (
          <div className="text-center text-gray-400 mt-10">No transactions this month</div>
        ) : (
          Object.entries(groupedHistory).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">
                {formatDateLabel(date)}
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {items.map((t, index) => {
                  const isSplit = t.type === 'split';
                  let displayAmount;
                  
                  if (isSplit && t.splits) {
                    // Sum only splits matching this category
                    displayAmount = t.splits
                      .filter(s => s.category === category.name)
                      .reduce((sum, s) => sum + (t.splitType === 'expense' ? -s.amount : s.amount), 0);
                  } else {
                    displayAmount = Number(t.amount);
                  }
                  
                  const isPositive = displayAmount > 0;
                  const isSelected = selectedItems.has(t.id);
                  
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => handleTransactionClick(t)}
                      onTouchStart={() => handleTouchStart(t.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onContextMenu={(e) => { e.preventDefault(); handleLongPress(t.id); }}
                      className={`p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${index !== items.length - 1 ? 'border-b border-gray-50' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isSelectMode && (
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                            {isSelected && <span className="text-white text-sm">✓</span>}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 flex items-center">
                            {isSplit && <SplitIcon />}
                            {t.payee || 'No Payee'}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {t.account}
                            {t.memo && ` • ${t.memo}`}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {isPositive ? '+' : '-'}{formatCurrency(displayAmount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB Add Transaction Button */}
      {!isSelectMode && (
        <button
          onClick={handleAddTransaction}
          className="fixed bottom-24 right-4 bg-emerald-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
        >
          +
        </button>
      )}

      {/* Edit Transaction Modal */}
      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingTransaction(null); setPrefilledCategory(null); }}
        onSave={() => { setIsModalOpen(false); setEditingTransaction(null); setPrefilledCategory(null); }}
        editTransaction={editingTransaction}
        prefilledCategory={prefilledCategory}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-red-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">🗑️</div>
              <div className="font-bold text-lg">Delete Transactions</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Are you sure you want to delete <span className="font-bold">{selectedItems.size}</span> transaction(s)?
                <br/><span className="text-red-500 text-sm">This cannot be undone.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowDeleteConfirm(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteSelected} 
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">✓</div>
              <div className="font-bold text-lg">Success</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">{successMessage}</p>
              <button 
                onClick={() => setSuccessMessage(null)} 
                className="w-full bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryDetail;
