import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function CategoriesTab() {
  const [activeView, setActiveView] = useState('expenses');
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch categories and transactions
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Fetch categories
        const catQuery = query(
          collection(db, 'categories'),
          where('userId', '==', 'test-user'),
          where('type', '==', activeView === 'expenses' ? 'expense' : 'income')
        );
        const catSnapshot = await getDocs(catQuery);
        const cats = [];
        catSnapshot.forEach((doc) => {
          cats.push({ id: doc.id, ...doc.data() });
        });
        
        // Fetch ALL transactions for summary calculation
const txnQuery = query(
  collection(db, 'transactions'),
  where('userId', '==', 'test-user')
);
        const txnSnapshot = await getDocs(txnQuery);
        const txns = [];
        txnSnapshot.forEach((doc) => {
          txns.push({ id: doc.id, ...doc.data() });
        });
        
        setCategories(cats);
        setTransactions(txns);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    }

    fetchData();
  }, [activeView]);

  // Calculate totals for each category
  const categoryTotals = {};
  transactions.forEach((txn) => {
    if (!categoryTotals[txn.categoryId]) {
      categoryTotals[txn.categoryId] = 0;
    }
    categoryTotals[txn.categoryId] += txn.amount;
  });

  // Group categories with totals
  const groupedCategories = categories.reduce((acc, cat) => {
    const group = cat.group || 'Uncategorized';
    if (!acc[group]) {
      acc[group] = {
        categories: [],
        total: 0
      };
    }
    const catTotal = categoryTotals[cat.id] || 0;
    acc[group].categories.push({ ...cat, total: catTotal });
    acc[group].total += catTotal;
    return acc;
  }, {});

  // Calculate summary
  const totalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const summary = {
    income: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses
  };

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
        <button className="text-primary-600 hover:text-primary-700">←</button>
        <select className="text-sm font-medium border-0 focus:ring-2 focus:ring-primary-500 rounded">
          <option>December 2025</option>
        </select>
        <button className="text-primary-600 hover:text-primary-700">→</button>
      </div>

      {/* Summary Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 mb-1">Income</div>
            <div className="font-semibold text-green-600">
              {summary.income.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Expenses</div>
            <div className="font-semibold text-red-600">
              {summary.expenses.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Net</div>
            <div className={`font-semibold ${summary.net >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
              {summary.net >= 0 ? '+' : ''}{summary.net.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-lg shadow-sm">
        <input 
          type="text" 
          placeholder="🔍 Search categories..." 
          className="w-full border-0 focus:ring-2 focus:ring-primary-500 rounded text-sm"
        />
      </div>

      {/* Toggle Expenses/Income */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView('expenses')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeView === 'expenses'
              ? 'bg-primary-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          - Expenses
        </button>
        <button
          onClick={() => setActiveView('income')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeView === 'income'
              ? 'bg-primary-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          + Income
        </button>
      </div>

      {/* Category Groups */}
      {loading ? (
        <div className="bg-white p-6 rounded-lg shadow-sm text-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : Object.keys(groupedCategories).length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-sm text-center">
          <p className="text-gray-500">No categories found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(groupedCategories).map(([groupName, data]) => (
            <div key={groupName} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-3 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm">▼</span>
                  <span className="font-medium">{groupName}</span>
                </div>
                <span className="font-semibold">
                  {data.total.toLocaleString()}
                </span>
              </div>
              {data.categories.map((cat) => (
                <div 
                  key={cat.id} 
                  className="p-3 border-b border-gray-50 flex justify-between items-center hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span className="text-sm">{cat.name}</span>
                  </div>
                  <span className={`text-sm font-medium ${cat.total < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {cat.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}