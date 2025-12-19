import React, { useMemo, useState } from 'react';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import useBackHandler from '../../hooks/useBackHandler';

const CategoryDetail = ({ category, transactions, currentDate, onClose }) => {
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Register back handler for hardware back button
  useBackHandler(true, onClose);

  if (!category) return null;

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

  const handleTransactionClick = (t) => {
    setEditingTransaction(t);
    setIsModalOpen(true);
  };

  // Split icon
  const SplitIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 inline-block mr-1">
      <path d="M16 3l-4 4-4-4" />
      <path d="M12 7v6" />
      <path d="M8 21l4-4 4 4" />
      <path d="M12 17v-4" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* HEADER */}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
        <div className="font-bold text-lg">{category.name}</div>
        <div className="w-10"></div>
      </div>

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
                  
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => handleTransactionClick(t)}
                      className={`p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${index !== items.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
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

      {/* Edit Transaction Modal */}
      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingTransaction(null); }}
        onSave={() => { setIsModalOpen(false); setEditingTransaction(null); }}
        editTransaction={editingTransaction}
      />
    </div>
  );
};

export default CategoryDetail;