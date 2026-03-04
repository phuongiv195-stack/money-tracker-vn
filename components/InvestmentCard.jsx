import { useState } from 'react';

/**
 * Component hiển thị card cho mỗi investment với UI đẹp hơn
 */
const InvestmentCard = ({ investment, onEdit, onDelete, onAddTransaction }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { 
    id,
    name, 
    type, 
    category,
    currentNAV = 0,
    currentPrice = 0,
    transactions = [],
    note
  } = investment;
  
  // Tính toán
  const totalInvested = transactions
    .filter(tx => tx.action === 'buy')
    .reduce((sum, tx) => sum + (tx.investedAmount || 0), 0);
  
  const totalVolume = transactions.reduce((sum, tx) => {
    if (tx.action === 'buy') return sum + (tx.volume || 0);
    if (tx.action === 'sell') return sum - (tx.volume || 0);
    return sum;
  }, 0);
  
  const price = category === 'open_fund' ? currentNAV : currentPrice;
  const currentValue = totalVolume * price;
  const pl = currentValue - totalInvested;
  const plPercent = totalInvested > 0 ? (pl / totalInvested) * 100 : 0;
  
  const formatNumber = (num) => {
    return new Intl.NumberFormat('vi-VN').format(num);
  };
  
  const getCategoryStyle = () => {
    switch (category) {
      case 'open_fund': 
        return {
          bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
          border: 'border-blue-300',
          text: 'text-blue-700',
          badge: 'bg-blue-500'
        };
      case 'etf': 
        return {
          bg: 'bg-gradient-to-br from-green-50 to-green-100',
          border: 'border-green-300',
          text: 'text-green-700',
          badge: 'bg-green-500'
        };
      case 'stock': 
        return {
          bg: 'bg-gradient-to-br from-purple-50 to-purple-100',
          border: 'border-purple-300',
          text: 'text-purple-700',
          badge: 'bg-purple-500'
        };
      default: 
        return {
          bg: 'bg-gradient-to-br from-gray-50 to-gray-100',
          border: 'border-gray-300',
          text: 'text-gray-700',
          badge: 'bg-gray-500'
        };
    }
  };
  
  const style = getCategoryStyle();
  
  return (
    <div className={`${style.bg} border-2 ${style.border} rounded-xl p-4 hover:shadow-lg transition-all duration-200`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-bold ${style.text} text-base`}>{name}</h3>
            <span className={`${style.badge} text-white text-xs px-2 py-0.5 rounded-full`}>
              {category === 'open_fund' ? 'Fund' : category === 'etf' ? 'ETF' : 'Stock'}
            </span>
          </div>
          <p className="text-xs text-gray-500">{type}</p>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`${style.text} hover:bg-white/50 p-2 rounded-lg transition-all duration-200`}
        >
          <svg 
            className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white/60 rounded-lg p-2.5">
          <p className="text-xs text-gray-500 mb-0.5">Invested</p>
          <p className="font-bold text-sm text-gray-800">{formatNumber(totalInvested)}</p>
        </div>
        <div className="bg-white/60 rounded-lg p-2.5">
          <p className="text-xs text-gray-500 mb-0.5">Current</p>
          <p className="font-bold text-sm text-gray-800">{formatNumber(currentValue)}</p>
        </div>
        <div className="bg-white/60 rounded-lg p-2.5">
          <p className="text-xs text-gray-500 mb-0.5">P/L</p>
          <p className={`font-bold text-sm ${pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {pl >= 0 ? '+' : ''}{formatNumber(pl)}
          </p>
        </div>
        <div className="bg-white/60 rounded-lg p-2.5">
          <p className="text-xs text-gray-500 mb-0.5">ROI</p>
          <p className={`font-bold text-sm ${plPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {plPercent >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
          </p>
        </div>
      </div>
      
      {/* Quick Info */}
      <div className="flex justify-between text-xs bg-white/40 rounded-lg px-3 py-2 mb-2">
        <div>
          <span className="text-gray-500">Vol: </span>
          <span className="font-semibold text-gray-700">{formatNumber(totalVolume)}</span>
        </div>
        <div>
          <span className="text-gray-500">Price: </span>
          <span className="font-semibold text-gray-700">{formatNumber(price)}</span>
        </div>
        <div>
          <span className="text-gray-500">Txs: </span>
          <span className="font-semibold text-gray-700">{transactions.length}</span>
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t-2 border-white/50 space-y-3">
          {/* Note */}
          {note && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
              <p className="text-xs text-yellow-800 italic">💡 {note}</p>
            </div>
          )}
          
          {/* Transactions */}
          {transactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <span>📜</span>
                <span>Recent Transactions ({transactions.length})</span>
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {transactions.slice(0, 5).map((tx, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-2.5 shadow-sm border border-gray-200">
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        tx.action === 'buy' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {tx.action.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">{tx.tradeDate || tx.purchasedDate}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">
                        {formatNumber(tx.volume)} @ {formatNumber(tx.price || tx.purchaseNAV)}
                      </span>
                      <span className="font-bold text-gray-800">{formatNumber(tx.investedAmount)}</span>
                    </div>
                  </div>
                ))}
                {transactions.length > 5 && (
                  <p className="text-xs text-gray-500 text-center">
                    + {transactions.length - 5} more transactions
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button
              onClick={() => onAddTransaction(investment)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md"
            >
              ➕ Add
            </button>
            <button
              onClick={() => onEdit(investment)}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md"
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => onDelete(id)}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvestmentCard;
