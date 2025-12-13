import React, { useMemo } from 'react';

const CategoryDetail = ({ category, transactions, currentDate, onClose }) => {
  if (!category) return null;

  const history = useMemo(() => {
    const monthStr = currentDate.toISOString().slice(0, 7); 
    return transactions
      .filter(t => t.category === category.name && t.date.startsWith(monthStr))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [category, transactions, currentDate]);

  const groupedHistory = useMemo(() => {
    const groups = {};
    history.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [history]);

  // Xóa 'đ', chỉ hiện số
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

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col animate-slide-left">
      {/* HEADER */}
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0">
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
          {formatCurrency(category.amount)}
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
                {items.map((t, index) => (
                  <div key={t.id} className={`p-3 flex justify-between items-center ${index !== items.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div>
                      <div className="font-medium text-gray-800">{t.payee || 'No Payee'}</div>
                      <div className="text-xs text-gray-500">
                        {t.account} {t.memo ? `• ${t.memo}` : ''}
                      </div>
                    </div>
                    <div className={`font-bold ${t.type === 'expense' ? 'text-gray-900' : 'text-green-600'}`}>
                      {formatCurrency(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CategoryDetail;