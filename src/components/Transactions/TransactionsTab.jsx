import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddTransactionModal from './AddTransactionModal';

const TransactionsTab = () => {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', 'test-user'),
        orderBy('date', 'desc'),
        limit(200)
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
        setError("Cannot load data");
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      setError("Query error: " + err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'accounts'),
      where('userId', '==', 'test-user'),
      where('isActive', '==', true)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => doc.data().name).filter(Boolean));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'categories'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(snapshot.docs.map(doc => doc.data().name).filter(Boolean));
    });
    return () => unsubscribe();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterType !== 'all') {
        if (filterType === 'split' && t.type !== 'split') return false;
        if (filterType !== 'split' && t.type === 'split' && t.splitType !== filterType) return false;
        if (filterType !== 'split' && t.type !== 'split' && t.type !== filterType) return false;
      }

      if (filterAccount !== 'all') {
        if (t.type === 'transfer') {
          if (t.fromAccount !== filterAccount && t.toAccount !== filterAccount) return false;
        } else {
          if (t.account !== filterAccount) return false;
        }
      }

      if (filterCategory !== 'all') {
        if (t.type === 'split') {
          const hasCategory = t.splits?.some(s => s.category === filterCategory);
          if (!hasCategory) return false;
        } else {
          if (t.category !== filterCategory) return false;
        }
      }

      if (searchQuery.trim()) {
        const lowerQuery = searchQuery.toLowerCase();
        const searchFields = [t.payee, t.category, t.memo, t.loan, t.account].filter(Boolean).join(' ').toLowerCase();
        
        let splitMatch = false;
        if (t.type === 'split' && t.splits) {
          splitMatch = t.splits.some(s => 
            [s.category, s.loan, s.memo].filter(Boolean).join(' ').toLowerCase().includes(lowerQuery)
          );
        }

        if (!searchFields.includes(lowerQuery) && !splitMatch) return false;
      }

      return true;
    });
  }, [transactions, filterType, filterAccount, filterCategory, searchQuery]);

  const totals = useMemo(() => {
    let income = 0, expense = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'split') {
        const amt = Number(t.totalAmount) || 0;
        if (amt > 0) income += amt;
        else expense += Math.abs(amt);
      } else if (t.type === 'income') {
        income += Math.abs(Number(t.amount));
      } else if (t.type === 'expense') {
        expense += Math.abs(Number(t.amount));
      }
    });

    return { income, expense, net: income - expense };
  }, [filteredTransactions]);

  const groupedTransactions = useMemo(() => {
    const groups = {};
    filteredTransactions.forEach(t => {
      const dateKey = t.date || 'Unknown';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });
    return groups;
  }, [filteredTransactions]);

  const hasActiveFilters = filterType !== 'all' || filterAccount !== 'all' || filterCategory !== 'all';

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '0';
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
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

  const handleTransactionClick = (transaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterAccount('all');
    setFilterCategory('all');
    setSearchQuery('');
  };

  // Split icon
  const SplitIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600">
      <path d="M16 3l-4 4-4-4" />
      <path d="M12 7v6" />
      <path d="M8 21l4-4 4 4" />
      <path d="M12 17v-4" />
    </svg>
  );

  if (loading) return <div className="p-4 text-center">Loading transactions...</div>;
  if (error) return <div className="p-4 text-center text-red-500 text-sm">{error}</div>;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800">Transactions</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              hasActiveFilters 
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' 
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            🔽 Filters {hasActiveFilters && `(${[filterType !== 'all', filterAccount !== 'all', filterCategory !== 'all'].filter(Boolean).length})`}
          </button>
        </div>

        <input
          type="text"
          placeholder="🔍 Search..."
          className="w-full p-2 pl-3 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:border-emerald-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border space-y-3">
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Type</label>
              <div className="flex gap-2">
                {['all', 'income', 'expense', 'loan'].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${
                      filterType === type
                        ? type === 'income' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : type === 'expense' ? 'bg-gray-200 text-gray-800 border border-gray-400'
                        : type === 'loan' ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-emerald-500 text-white'
                        : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Account</label>
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="w-full p-2 bg-white rounded-lg border outline-none"
              >
                <option value="all">All Accounts</option>
                {accounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full p-2 bg-white rounded-lg border outline-none"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="w-full py-2 text-sm text-gray-600">
                ✕ Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="bg-emerald-600 text-white px-4 py-3">
        <div className="flex justify-between text-sm">
          <div><span className="opacity-70">Income: </span><span className="font-medium">+{formatCurrency(totals.income)}</span></div>
          <div><span className="opacity-70">Expense: </span><span className="font-medium">-{formatCurrency(totals.expense)}</span></div>
          <div><span className="opacity-70">Net: </span><span className={`font-bold ${totals.net >= 0 ? 'text-green-200' : 'text-red-200'}`}>{totals.net >= 0 ? '+' : '-'}{formatCurrency(totals.net)}</span></div>
        </div>
        <div className="text-xs opacity-70 mt-1 text-center">
          {filteredTransactions.length} transactions{hasActiveFilters && ' (filtered)'}
        </div>
      </div>

      {/* Transaction List */}
      <div className="px-4 mt-4 space-y-4">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            {searchQuery || hasActiveFilters ? 'No matches.' : 'No transactions.'}
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">
                {formatDateLabel(date)}
              </div>
              
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {items.map((t, index) => {
                  const isSplit = t.type === 'split';
                  const amount = isSplit ? Number(t.totalAmount) : Number(t.amount);
                  const isPositive = amount > 0;
                  
                  // Get account display
                  const accountDisplay = t.type === 'transfer' 
                    ? `${t.fromAccount} → ${t.toAccount}`
                    : t.account;
                  
                  return (
                    <div 
                      key={t.id || index}
                      onClick={() => handleTransactionClick(t)}
                      className={`p-3 cursor-pointer hover:bg-gray-50 ${index !== items.length - 1 ? 'border-b' : ''}`}
                    >
                      {/* Main row */}
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 flex items-center gap-1.5">
                            {isSplit && <SplitIcon />}
                            {t.type === 'loan' 
                              ? (t.memo || 'Loan transaction')
                              : t.type === 'transfer'
                                ? 'Transfer'
                                : (t.payee || 'No Payee')
                            }
                          </div>
                          
                          {/* Subtitle with category/loan + account */}
                          {!isSplit && (
                            <div className="text-xs text-gray-500">
                              {t.type === 'loan' ? t.loan : t.type === 'transfer' ? '' : t.category}
                              {accountDisplay && <span className="text-gray-400"> • {accountDisplay}</span>}
                            </div>
                          )}
                          
                          {/* Split: show account */}
                          {isSplit && (
                            <div className="text-xs text-gray-400">
                              {accountDisplay}
                            </div>
                          )}
                        </div>

                        <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>
                          {isPositive ? '+' : '-'}{formatCurrency(amount)}
                        </div>
                      </div>

                      {/* Split details */}
                      {isSplit && t.splits && (
                        <div className="mt-2 space-y-1 pl-4 border-l-2 border-sky-200 ml-1">
                          {t.splits.map((s, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                {s.isLoan ? s.loan : s.category}
                                {s.memo && <span className="text-gray-400 ml-1">• {s.memo}</span>}
                              </span>
                              <span className="text-gray-700 font-medium">
                                {formatCurrency(s.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingTransaction(null); }}
        onSave={() => { setIsModalOpen(false); setEditingTransaction(null); }}
        editTransaction={editingTransaction}
      />
    </div>
  );
};

export default TransactionsTab;