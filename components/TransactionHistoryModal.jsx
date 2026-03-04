import { useState } from 'react';

/**
 * Transaction History Modal - Full Screen
 * Hiển thị tất cả transactions của 1 investment
 */
const TransactionHistoryModal = ({ investment, onClose, onEdit, onDelete }) => {
  const isOpenFund = investment.category === 'open_fund';
  const [filter, setFilter] = useState('all'); // all, buy, sell
  const [searchTerm, setSearchTerm] = useState('');
  
  const formatNumber = (num) => {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
  };
  
  // Filter transactions
  const filteredTransactions = (investment.transactions || [])
    .filter(tx => {
      if (filter !== 'all' && tx.action !== filter) return false;
      if (searchTerm && !tx.note?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.purchasedDate || a.tradeDate || a.bankDate);
      const dateB = new Date(b.purchasedDate || b.tradeDate || b.bankDate);
      return dateB - dateA; // Newest first
    });
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-xl">
        {/* Header - Simple */}
        <div className="border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Transaction History</h2>
            <p className="text-sm text-gray-500">{investment.name}</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            &times;
          </button>
        </div>
        
        {/* Filters */}
        <div className="border-b px-6 py-3 flex gap-4 items-center bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'all' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              All ({investment.transactions?.length || 0})
            </button>
            <button
              onClick={() => setFilter('buy')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'buy' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setFilter('sell')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                filter === 'sell' 
                  ? 'bg-red-500 text-white' 
                  : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              Sell
            </button>
          </div>
          
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by note..."
              className="w-full max-w-md border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          
          <div className="text-sm text-gray-500">
            Showing {filteredTransactions.length} transaction(s)
          </div>
        </div>
        
        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredTransactions.length > 0 ? (
            <div className="space-y-3">
              {filteredTransactions.map((tx, idx) => (
                <div 
                  key={idx} 
                  className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        tx.action === 'buy' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {tx.action === 'buy' ? 'Buy' : 'Sell'}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {tx.purchasedDate || tx.tradeDate || tx.bankDate}
                        </p>
                        {(tx.bank || tx.broker) && (
                          <p className="text-xs text-gray-500">via {tx.bank || tx.broker}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onEdit?.(tx)}
                        className="text-blue-600 hover:text-blue-800 px-2 py-1 text-sm"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDelete?.(tx.id)}
                        className="text-red-600 hover:text-red-800 px-2 py-1 text-sm"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Volume</p>
                      <p className="font-semibold text-gray-800">{tx.volume?.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{isOpenFund ? 'NAV' : 'Price'}</p>
                      <p className="font-semibold text-gray-800">{formatNumber(tx.purchaseNAV || tx.price)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Amount</p>
                      <p className="font-semibold text-gray-800">{formatNumber(tx.investedAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Fee</p>
                      <p className="font-semibold text-gray-800">{formatNumber(tx.fee || 0)}</p>
                    </div>
                  </div>
                  
                  {tx.action === 'sell' && (
                    <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t">
                      <div>
                        <p className="text-xs text-gray-500">Tax</p>
                        <p className="font-semibold text-orange-600">{formatNumber(tx.tax || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Net Amount</p>
                        <p className="font-semibold text-green-600">{formatNumber(tx.bankAmount || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">P/L</p>
                        <p className="font-semibold text-green-600">
                          {tx.realizedPL >= 0 ? '+' : ''}{formatNumber(tx.realizedPL || 0)}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {tx.note && (
                    <div className="mt-2 pt-2 border-t text-sm text-gray-600 italic">
                      {tx.note}
                    </div>
                  )}
                  
                  {tx.orderType && tx.orderType !== 'LO' && (
                    <div className="mt-2">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                        {tx.orderType}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">📭</p>
              <p className="text-gray-500 mt-2">
                {searchTerm || filter !== 'all' 
                  ? 'No transactions match your filter'
                  : 'No transactions yet'
                }
              </p>
            </div>
          )}
        </div>
        
        {/* Summary Footer */}
        {filteredTransactions.length > 0 && (
          <div className="border-t px-6 py-4 bg-gray-50">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Transactions</p>
                <p className="text-lg font-bold text-gray-800">{filteredTransactions.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Invested</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatNumber(
                    filteredTransactions
                      .filter(tx => tx.action === 'buy')
                      .reduce((sum, tx) => sum + (tx.investedAmount || 0), 0)
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Fees</p>
                <p className="text-lg font-bold text-orange-600">
                  {formatNumber(
                    filteredTransactions.reduce((sum, tx) => sum + (tx.fee || 0), 0)
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Volume</p>
                <p className="text-lg font-bold text-purple-600">
                  {filteredTransactions
                    .reduce((sum, tx) => {
                      if (tx.action === 'buy') return sum + (tx.volume || 0);
                      if (tx.action === 'sell') return sum - (tx.volume || 0);
                      return sum;
                    }, 0)
                    .toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionHistoryModal;
