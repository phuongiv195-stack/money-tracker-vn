import React, { useMemo, useState } from 'react';
import AddLoanTransactionModal from './AddLoanTransactionModal';
import EditLoanTransactionModal from './EditLoanTransactionModal';

const LoanDetail = ({ loan, onClose }) => {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  
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

  const isBorrow = loan.loanType === 'borrow';

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0">
        <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
        <div className="font-bold text-lg flex items-center gap-2">
          <span>{isBorrow ? '💰' : '💸'}</span>
          <span>{loan.name}</span>
        </div>
        <div className="w-16"></div>
      </div>

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
      <button
        onClick={() => setIsAddTransactionOpen(true)}
        className="fixed bottom-24 right-4 md:right-[calc(50%-200px)] bg-emerald-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
      >
        +
      </button>

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
                  
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => setEditingTransaction(t)}
                      className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors ${index !== items.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      {/* Transaction Info */}
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {t.memo || 'Loan transaction'}
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
    </div>
  );
};

export default LoanDetail;