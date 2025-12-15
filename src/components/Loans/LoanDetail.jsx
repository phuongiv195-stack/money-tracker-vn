import React, { useMemo, useState } from 'react';
import AddLoanTransactionModal from './AddLoanTransactionModal';

const LoanDetail = ({ loan, onClose }) => {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  
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
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${yyyy}/${mm}/${dd} ${day}`;
  };

  // Determine loan type
  const isBorrow = loan.loanType === 'borrow';
  const loanIcon = isBorrow ? '💰' : '💸';
  const progressColor = isBorrow ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0">
        <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
        <div className="font-bold text-lg flex items-center gap-2">
          <span>{loanIcon}</span>
          <span>{loan.name}</span>
        </div>
        <div className="w-16"></div>
      </div>

      {/* Loan Summary Card */}
      <div className="p-4 bg-gradient-to-br from-emerald-600 to-green-600 text-white shadow-sm">
        <div className="text-sm opacity-90 text-center">Outstanding Balance</div>
        <div className="text-3xl font-bold text-center mt-1">
          {formatCurrency(loan.balance)}
        </div>
        <div className="text-xs mt-2 opacity-75 text-center">
          {loan.transactions.length} transactions
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
                  const isOut = t.direction === 'out';
                  const displayAmount = Number(t.amount);
                  
                  return (
                    <div 
                      key={t.id} 
                      className={`p-3 flex items-center gap-3 ${index !== items.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                        isOut ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'
                      }`}>
                        {isOut ? '🔴' : '🟢'}
                      </div>

                      {/* Transaction Info */}
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {t.memo || (isOut ? 'Pay Out' : 'Receive In')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t.account}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right">
                        <div className="font-bold text-gray-900">
                          {displayAmount > 0 ? '+' : ''}{formatCurrency(Math.abs(displayAmount))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Footer */}
      <div className="bg-blue-50 border-t border-blue-200 p-3">
        <div className="flex items-start gap-2 text-xs text-blue-700">
          <span className="text-sm">ℹ️</span>
          <div>
            <div className="font-semibold mb-1">Note:</div>
            <div>
              • Loan transactions affect <strong>Account balance</strong> but not Income/Expense
            </div>
          </div>
        </div>
      </div>

      {/* Add Transaction Modal */}
      <AddLoanTransactionModal
        isOpen={isAddTransactionOpen}
        onClose={() => setIsAddTransactionOpen(false)}
        onSave={() => setIsAddTransactionOpen(false)}
        loanName={loan.name}
        transactions={loan.transactions}
      />
    </div>
  );
};

export default LoanDetail;