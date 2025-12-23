import React, { useMemo, useState } from 'react';
import { writeBatch, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddLoanTransactionModal from './AddLoanTransactionModal';
import EditLoanTransactionModal from './EditLoanTransactionModal';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const LoanDetail = ({ loan, onClose, onLoanUpdated }) => {
  const toast = useToast();
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  
  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Loan actions state
  const [showMenu, setShowMenu] = useState(false);
  const [showEditLoan, setShowEditLoan] = useState(false);
  const [showDeleteLoan, setShowDeleteLoan] = useState(false);
  const [showArchiveLoan, setShowArchiveLoan] = useState(false);
  const [editLoanName, setEditLoanName] = useState('');

  useBackHandler(!!loan, isSelectMode ? () => { setIsSelectMode(false); setSelectedItems(new Set()); } : onClose);
  
  if (!loan) return null;

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups = {};
    loan.transactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [loan.transactions]);

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

  // Loan action handlers
  const handleEditLoan = async () => {
    if (!editLoanName.trim()) return;
    try {
      const batch = writeBatch(db);
      // Update all transactions with old loan name to new name
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { loan: editLoanName.trim() });
        }
      });
      await batch.commit();
      setShowEditLoan(false);
      setSuccessMessage('Loan renamed successfully!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeleteLoan = async () => {
    try {
      const batch = writeBatch(db);
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.delete(doc(db, 'transactions', t.id));
        }
      });
      await batch.commit();
      setShowDeleteLoan(false);
      onClose();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleArchiveLoan = async () => {
    try {
      const batch = writeBatch(db);
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { archived: true });
        }
      });
      await batch.commit();
      setShowArchiveLoan(false);
      setSuccessMessage('Loan archived!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
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
    const allIds = new Set(loan.transactions.filter(t => !t.isSplitPart).map(t => t.id));
    setSelectedItems(allIds);
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedItems.forEach(id => {
        // Don't delete split parts (they're virtual)
        if (!id.includes('-split-')) {
          batch.delete(doc(db, 'transactions', id));
        }
      });
      await batch.commit();
      setSuccessMessage(`Deleted ${selectedItems.size} transaction(s)`);
      setSelectedItems(new Set());
      setIsSelectMode(false);
      setShowDeleteConfirm(false);
    } catch (err) { 
      toast.error('Error: ' + err.message); 
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
    } else if (!t.isSplitPart) {
      setEditingTransaction(t);
    }
  };

  const isBorrow = loan.loanType === 'borrow';

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header - changes based on select mode */}
      {isSelectMode ? (
        <div className="bg-indigo-600 p-4 shadow-sm flex items-center justify-between sticky top-0">
          <button onClick={exitSelectMode} className="text-white text-lg p-2 -ml-2">✕</button>
          <div className="font-bold text-lg text-white">{selectedItems.size} selected</div>
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="text-white text-sm px-3 py-1 bg-white/20 rounded-lg">All</button>
            <button onClick={() => setShowDeleteConfirm(true)} className="text-white text-sm px-3 py-1 bg-red-500 rounded-lg">🗑️</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0">
          <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
          <div className="font-bold text-lg flex items-center gap-2">
            <span>{isBorrow ? '💰' : '💸'}</span>
            <span>{loan.name}</span>
          </div>
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className="text-gray-600 text-xl p-2 hover:bg-gray-100 rounded-lg"
            >
              ⋮
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 min-w-[140px] z-50">
                <button 
                  onClick={() => { setShowMenu(false); setEditLoanName(loan.name); setShowEditLoan(true); }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700"
                >
                  ✏️ Rename
                </button>
                <button 
                  onClick={() => { setShowMenu(false); setShowArchiveLoan(true); }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700"
                >
                  📦 Archive
                </button>
                <button 
                  onClick={() => { setShowMenu(false); setShowDeleteLoan(true); }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-600"
                >
                  🗑️ Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loan Summary Card */}
      <div className="p-4 bg-emerald-600 text-white shadow-sm">
        <div className="text-sm opacity-90 text-center">Outstanding Balance</div>
        <div className="text-3xl font-bold text-center mt-1">
          {loan.balance < 0 ? '-' : ''}{formatCurrency(loan.balance)}
        </div>
        
        {/* Paid Back / Received info */}
        <div className="mt-3 pt-3 border-t border-white/20 text-center text-sm">
          {isBorrow ? (
            <span>Paid back: {formatCurrency(loan.paidBack)}</span>
          ) : (
            <span>Received: {formatCurrency(loan.received)}</span>
          )}
        </div>
      </div>

      {/* FAB Add Transaction Button */}
      {!isSelectMode && (
        <button
          onClick={() => setIsAddTransactionOpen(true)}
          className="fixed bottom-24 right-4 md:right-[calc(50%-200px)] bg-emerald-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
        >
          +
        </button>
      )}

      {/* Transaction History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="text-xs font-bold text-gray-500 uppercase ml-1">
          Transaction History ({loan.transactions.length})
        </div>

        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-400 mt-10">No transactions yet</div>
        ) : (
          Object.entries(groupedTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">
                {formatDateLabel(date)}
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {items.map((t, index) => {
                  const amt = Number(t.amount);
                  const isPositive = amt > 0;
                  const isSelected = selectedItems.has(t.id);
                  
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => handleTransactionClick(t)}
                      onTouchStart={() => !t.isSplitPart && handleTouchStart(t.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onContextMenu={(e) => { e.preventDefault(); !t.isSplitPart && handleLongPress(t.id); }}
                      className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors ${index !== items.length - 1 ? 'border-b border-gray-50' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
                    >
                      {/* Checkbox in select mode */}
                      {isSelectMode && (
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                          {isSelected && <span className="text-white text-sm">✓</span>}
                        </div>
                      )}

                      {/* Transaction Info */}
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {t.memo || 'Loan transaction'}
                          {t.isSplitPart && <span className="text-xs text-gray-400 ml-1">(from split)</span>}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t.account}
                        </div>
                      </div>

                      {/* Amount - GREEN for positive, BLACK for negative */}
                      <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {isPositive ? '+' : '-'}{formatCurrency(amt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Transaction Modal */}
      <AddLoanTransactionModal
        isOpen={isAddTransactionOpen}
        onClose={() => setIsAddTransactionOpen(false)}
        onSave={() => {
          setIsAddTransactionOpen(false);
          onClose(); // Close LoanDetail to refresh data
        }}
        loan={loan}
      />

      {/* Edit Transaction Modal */}
      <EditLoanTransactionModal
        isOpen={editingTransaction !== null}
        onClose={() => setEditingTransaction(null)}
        onSave={() => {
          setEditingTransaction(null);
          onClose(); // Close LoanDetail to refresh data
        }}
        transaction={editingTransaction}
        loan={loan}
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
                onClick={() => { setSuccessMessage(null); onClose(); }} 
                className="w-full bg-emerald-500 text-white py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Loan Modal */}
      {showEditLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-indigo-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">✏️</div>
              <div className="font-bold text-lg">Rename Loan</div>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={editLoanName}
                onChange={(e) => setEditLoanName(e.target.value)}
                className="w-full p-3 border-2 border-gray-200 rounded-lg text-center text-lg font-medium focus:border-indigo-500 outline-none"
                placeholder="Loan name"
              />
              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => setShowEditLoan(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditLoan} 
                  disabled={!editLoanName.trim()}
                  className="flex-1 bg-indigo-500 text-white py-3 rounded-lg font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Loan Modal */}
      {showDeleteLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-red-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">🗑️</div>
              <div className="font-bold text-lg">Delete Loan</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Delete <span className="font-bold">{loan.name}</span> and all its transactions?
                <br/><span className="text-red-500 text-sm">This cannot be undone.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowDeleteLoan(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteLoan} 
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Loan Modal */}
      {showArchiveLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">📦</div>
              <div className="font-bold text-lg">Archive Loan</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Archive <span className="font-bold">{loan.name}</span>?
                <br/><span className="text-gray-500 text-sm">It will be hidden from the loan list.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowArchiveLoan(false)} 
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleArchiveLoan} 
                  className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-medium"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {showMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
      )}
    </div>
  );
};

export default LoanDetail;
