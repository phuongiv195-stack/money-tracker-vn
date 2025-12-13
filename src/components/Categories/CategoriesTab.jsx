import React, { useState, useMemo, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import CategoryDetail from './CategoryDetail';
import AddCategoryModal from './AddCategoryModal';
import EditGroupModal from './EditGroupModal';

const CategoriesTab = () => {
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('expense');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  
  // Group editing
  const [editingGroup, setEditingGroup] = useState(null);
  const [longPressTimer, setLongPressTimer] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'categories'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'transactions'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(trans);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getMonthYearLabel = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const { categoryTotals, summary } = useMemo(() => {
    const currentMonthStr = currentDate.toISOString().slice(0, 7); 
    const filteredTrans = transactions.filter(t => t.date.startsWith(currentMonthStr));

    const catTotals = {};
    let income = 0;
    let expense = 0;

    filteredTrans.forEach(t => {
      const amt = Number(t.amount);
      if (t.type === 'income') income += amt;
      if (t.type === 'expense') expense += amt; 

      if (t.category) {
        catTotals[t.category] = (catTotals[t.category] || 0) + amt;
      }
    });

    return {
      categoryTotals: catTotals,
      summary: { income, expense, net: income + expense }
    };
  }, [transactions, currentDate]);

  const filteredGroups = useMemo(() => {
    const groups = {};
    categories.forEach(cat => {
      if (cat.type !== activeTab) return;
      const groupName = cat.group || 'Other';
      if (!groups[groupName]) groups[groupName] = [];
      const realAmount = categoryTotals[cat.name] || 0;
      groups[groupName].push({ ...cat, amount: realAmount });
    });

    if (!searchQuery.trim()) return groups;

    return Object.entries(groups).reduce((acc, [group, cats]) => {
      const filtered = cats.filter(cat => 
        cat.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (filtered.length > 0) acc[group] = filtered;
      return acc;
    }, {});
  }, [categories, searchQuery, categoryTotals, activeTab]);

  // Long press handlers
  const handleGroupTouchStart = (groupName) => {
    const timer = setTimeout(() => {
      setEditingGroup({ name: groupName, type: activeTab });
    }, 500); // 500ms = long press
    setLongPressTimer(timer);
  };

  const handleGroupTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleCategoryClick = (cat) => {
    setEditingCategory(cat);
    setIsAddModalOpen(true);
  };

  if (loading) return <div className="p-4 text-center">Loading data...</div>;

  return (
    <div className="pb-20">
      <div className="bg-white p-4 shadow-sm mb-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => changeMonth(-1)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">←</button>
          <button className="text-gray-800 font-bold text-lg">{getMonthYearLabel(currentDate)}</button>
          <button onClick={() => changeMonth(1)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">→</button>
        </div>
        
        <div className="flex justify-between text-sm mb-2 text-gray-600">
          <span>Income: <span className="text-green-600 font-medium">{formatCurrency(summary.income)}</span></span>
          <span>Expense: <span className="text-red-600 font-medium">{formatCurrency(Math.abs(summary.expense))}</span></span>
        </div>
        
        <div className="flex justify-between items-center border-t pt-2">
          <span className="text-gray-500 font-medium">Net Total</span>
          <span className={`font-bold text-xl ${summary.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {summary.net > 0 ? '+' : ''}{formatCurrency(summary.net)}
          </span>
        </div>
      </div>

      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            placeholder={`🔍 Search ${activeTab} categories...`}
            className="flex-1 p-2 pl-3 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:border-emerald-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            onClick={() => {
              setEditingCategory(null);
              setIsAddModalOpen(true);
            }}
            className="bg-emerald-500 text-white w-10 h-10 rounded-lg flex items-center justify-center text-2xl hover:bg-emerald-600 transition-colors shadow-md"
          >
            +
          </button>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('expense')}
            className={`flex-1 py-2 font-medium rounded-lg transition-colors border ${
              activeTab === 'expense' 
                ? 'bg-red-50 border-red-200 text-red-600 shadow-sm' 
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            - Expenses
          </button>
          <button 
            onClick={() => setActiveTab('income')}
            className={`flex-1 py-2 font-medium rounded-lg transition-colors border ${
              activeTab === 'income' 
                ? 'bg-green-50 border-green-200 text-green-600 shadow-sm' 
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            + Income
          </button>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {Object.entries(filteredGroups).map(([groupName, groupCats]) => (
          <div key={groupName} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
            <div 
              className="bg-gray-50 p-2 px-3 flex justify-between items-center font-semibold text-xs text-gray-500 uppercase tracking-wider cursor-pointer select-none active:bg-gray-100"
              onTouchStart={() => handleGroupTouchStart(groupName)}
              onTouchEnd={handleGroupTouchEnd}
              onMouseDown={() => handleGroupTouchStart(groupName)}
              onMouseUp={handleGroupTouchEnd}
              onMouseLeave={handleGroupTouchEnd}
            >
              <span>{groupName}</span>
              <span className="text-[10px] opacity-50">Long press to edit</span>
            </div>
            
            <div className="divide-y divide-gray-50">
              {groupCats.map(cat => (
                <div 
                  key={cat.id} 
                  onClick={() => handleCategoryClick(cat)}
                  className="p-3 flex justify-between items-center hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl w-8 text-center">{cat.icon}</span>
                    <span className="text-gray-700 font-medium">{cat.name}</span>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm ${cat.amount !== 0 ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                      {formatCurrency(cat.amount)}
                    </div> 
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(filteredGroups).length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-2">🤷‍♂️</div>
            No {activeTab} categories found
            <button
              onClick={() => {
                setEditingCategory(null);
                setIsAddModalOpen(true);
              }}
              className="block mx-auto mt-4 bg-emerald-500 text-white px-6 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              + Add First Category
            </button>
          </div>
        )}
      </div>

      {selectedCategory && (
        <CategoryDetail 
          category={selectedCategory}
          transactions={transactions}
          currentDate={currentDate}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      <AddCategoryModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCategory(null);
        }}
        onSave={() => {
          setIsAddModalOpen(false);
          setEditingCategory(null);
        }}
        defaultType={activeTab}
        editCategory={editingCategory}
      />

      <EditGroupModal
        isOpen={editingGroup !== null}
        onClose={() => setEditingGroup(null)}
        onSave={() => setEditingGroup(null)}
        groupName={editingGroup?.name}
        groupType={editingGroup?.type}
      />
    </div>
  );
};

export default CategoriesTab;