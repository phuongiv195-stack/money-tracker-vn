import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';

const TransactionsTab = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  // 1. Fetch Transactions
  useEffect(() => {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', 'test-user'),
        orderBy('date', 'desc'),
        limit(100)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const trans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTransactions(trans);
        setLoading(false);
      }, (err) => {
        console.error("Firebase Error:", err);
        setError("Không tải được dữ liệu (Đang đợi Index hoặc lỗi mạng)");
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error("Setup Error:", err);
      setError("Lỗi cài đặt query: " + err.message);
      setLoading(false);
    }
  }, []);

  // 2. Filter & Search Logic
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;

    const lowerQuery = searchQuery.toLowerCase();
    return transactions.filter(t => {
      const payee = t.payee ? t.payee.toLowerCase() : '';
      const category = t.category ? t.category.toLowerCase() : '';
      const memo = t.memo ? t.memo.toLowerCase() : '';
      const amount = t.amount !== undefined && t.amount !== null ? t.amount.toString() : '';

      return payee.includes(lowerQuery) ||
             category.includes(lowerQuery) ||
             memo.includes(lowerQuery) ||
             amount.includes(lowerQuery);
    });
  }, [transactions, searchQuery]);

  // 3. Group by Date
  const groupedTransactions = useMemo(() => {
    const groups = {};
    filteredTransactions.forEach(t => {
      const dateKey = t.date || 'Unknown';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });
    return groups;
  }, [filteredTransactions]);

  // Helpers
  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '0';
    // Dùng en-US để có dấu phẩy (50,000) và KHÔNG hiện ký hiệu tiền tệ
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr || dateStr === 'Unknown') return 'Unknown Date';
    try {
      const date = new Date(dateStr);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const day = date.toLocaleDateString('en-US', { weekday: 'short' });
      return `${yyyy}/${mm}/${dd} ${day}`;
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) return <div className="p-4 text-center">Loading transactions...</div>;
  if (error) return <div className="p-4 text-center text-red-500 text-sm">{error}</div>;

  return (
    <div className="pb-24">
      {/* 1. Header & Search */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800 mb-3">All Transactions</h1>
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 Search payee, amount, memo..."
            className="w-full p-2 pl-3 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:border-emerald-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 2. Transaction List */}
      <div className="px-4 mt-4 space-y-4">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            {searchQuery ? 'No transactions found.' : 'No transactions yet.'}
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1 sticky top-20">
                {formatDateLabel(date)}
              </div>
              
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {items.map((t, index) => (
                  <div key={t.id || index} className={`p-3 flex justify-between items-center ${index !== items.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg
                        ${t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500'}
                      `}>
                        {t.type === 'income' ? '💰' : (t.type === 'transfer' ? '⇄' : '💸')}
                      </div>
                      
                      <div>
                        <div className="font-medium text-gray-800 line-clamp-1">
                          {t.payee || t.category || 'No Name'}
                        </div>
                        <div className="text-xs text-gray-500 flex gap-1">
                          <span>{t.category}</span>
                          {t.account && <span>• {t.account}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-bold ${
                        t.type === 'income' ? 'text-green-600' : 
                        t.type === 'expense' ? 'text-gray-900' : 'text-blue-600'
                      }`}>
                        {t.type === 'income' ? '+' : ''}{formatCurrency(t.amount)}
                      </div>
                      {t.type === 'transfer' && (
                        <div className="text-[10px] text-gray-400">Transfer</div>
                      )}
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

export default TransactionsTab;