import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import CategoryDetail from './CategoryDetail';
import AddCategoryModal from './AddCategoryModal';
import EditGroupModal from './EditGroupModal';
import ReorderCategoriesModal from './ReorderCategoriesModal';
import ReorderGroupsModal from './ReorderGroupsModal';

const CategoriesTab = () => {
  const { categories, transactions, isLoading } = useData();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('expense');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [isReorderGroupsModalOpen, setIsReorderGroupsModalOpen] = useState(false);
  const [groupOrderVersion, setGroupOrderVersion] = useState(0); // Force re-render when group order changes
  
  // Group editing
  const [editingGroup, setEditingGroup] = useState(null);
  
  // Long press state
  const longPressTriggered = useRef(false);
  const longPressTimer = useRef(null);
  const touchStartPos = useRef({ x: 0, y: 0 });

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
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
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
  };

  const { categoryTotals, summary } = useMemo(() => {
    const currentMonthStr = currentDate.toISOString().slice(0, 7); 
    const filteredTrans = transactions.filter(t => t.date && t.date.startsWith(currentMonthStr));

    const catTotals = {};
    let income = 0;
    let expense = 0;

    filteredTrans.forEach(t => {
      if (t.type === 'split' && t.splits) {
        t.splits.forEach(split => {
          if (split.category) {
            const splitAmt = t.splitType === 'expense' ? -split.amount : split.amount;
            catTotals[split.category] = (catTotals[split.category] || 0) + splitAmt;
            if (t.splitType === 'income') income += split.amount;
            if (t.splitType === 'expense') expense -= split.amount;
          }
        });
      } else {
        const amt = Number(t.amount);
        if (t.type === 'income') income += amt;
        if (t.type === 'expense') expense += amt;
        if (t.category) {
          catTotals[t.category] = (catTotals[t.category] || 0) + amt;
        }
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

    // Sort categories within each group by order
    Object.keys(groups).forEach(groupName => {
      groups[groupName].sort((a, b) => {
        const orderA = a.order ?? 999;
        const orderB = b.order ?? 999;
        return orderA - orderB;
      });
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

  // Get sorted group names based on saved order
  const sortedGroupNames = useMemo(() => {
    const groupNames = Object.keys(filteredGroups);
    
    // Load saved order from localStorage
    const savedOrder = localStorage.getItem(`groupOrder_${activeTab}`);
    
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        // Sort groups by saved order, put new groups at end (alphabetically)
        groupNames.sort((a, b) => {
          const indexA = parsedOrder.indexOf(a);
          const indexB = parsedOrder.indexOf(b);
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
      } catch (e) {
        console.error('Error parsing saved group order:', e);
        groupNames.sort((a, b) => a.localeCompare(b));
      }
    } else {
      // Default alphabetical sort
      groupNames.sort((a, b) => a.localeCompare(b));
    }
    
    return groupNames;
  }, [filteredGroups, activeTab, groupOrderVersion]);

  // Simple click handler - view category detail
  const handleCategoryClick = (cat) => {
    // Don't open if long press was triggered
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    setSelectedCategory({ ...cat, amount: categoryTotals[cat.name] || 0 });
  };

  // Trigger haptic feedback
  const triggerHaptic = () => {
    if (navigator.vibrate) {
      navigator.vibrate(50); // 50ms vibration
    }
  };

  // Long press start
  const handleLongPressStart = (cat, type, e) => {
    longPressTriggered.current = false;
    
    // Lưu vị trí touch ban đầu
    if (e?.touches?.[0]) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e) {
      touchStartPos.current = { x: e.clientX, y: e.clientY };
    }
    
    // Giảm xuống 400ms và trigger haptic + action cùng lúc
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      triggerHaptic();
      
      // Mở modal ngay lập tức sau haptic
      if (type === 'category') {
        setEditingCategory(cat);
        setIsAddModalOpen(true);
      } else if (type === 'group') {
        setEditingGroup({ name: cat, type: activeTab });
      }
    }, 400);
  };

  // Long press move - cancel nếu di chuyển quá 10px
  const handleLongPressMove = (e) => {
    if (!longPressTimer.current) return;
    
    let currentX, currentY;
    if (e?.touches?.[0]) {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    const deltaX = Math.abs(currentX - touchStartPos.current.x);
    const deltaY = Math.abs(currentY - touchStartPos.current.y);
    
    // Nếu di chuyển quá 10px thì cancel long press
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Long press end
  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  if (isLoading) return <div className="p-4 text-center">Loading data...</div>;

  return (
    <div className="pb-20">
      <div className="bg-white p-4 shadow-sm mb-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded">←</button>
          <button className="text-gray-800 font-bold text-lg">{getMonthYearLabel(currentDate)}</button>
          <div className="flex items-center gap-1">
            <button onClick={() => changeMonth(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded">→</button>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('openSettings'))}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded"
            >
              ⚙️
            </button>
          </div>
        </div>
        
        <div className="flex justify-between text-sm mb-2 text-gray-600">
          <span>Income: <span className="text-emerald-600 font-medium">+{formatCurrency(summary.income)}</span></span>
          <span>Expense: <span className="text-gray-900 font-medium">-{formatCurrency(summary.expense)}</span></span>
        </div>
        
        <div className="flex justify-between items-center border-t pt-2">
          <span className="text-gray-500 font-medium">Net Total</span>
          <span className={`font-bold text-xl ${summary.net >= 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
            {summary.net >= 0 ? '+' : '-'}{formatCurrency(summary.net)}
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
            onClick={() => setIsReorderModalOpen(true)}
            className="bg-white text-gray-600 border border-gray-300 w-10 h-10 rounded-lg flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
            title="Reorder categories"
          >
            ↕️
          </button>
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
        
        <div className="flex justify-between items-center mt-2">
          <div className="text-xs text-gray-400">
            Tap to view • Hold to edit
          </div>
          <button
            onClick={() => setIsReorderGroupsModalOpen(true)}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ↕️ Reorder Groups
          </button>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {sortedGroupNames.map(groupName => {
          const groupCats = filteredGroups[groupName];
          if (!groupCats || groupCats.length === 0) return null;
          
          return (
          <div key={groupName} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
            <div 
              className="bg-gray-50 p-2 px-3 flex justify-between items-center font-semibold text-xs text-gray-500 uppercase tracking-wider cursor-pointer select-none active:bg-gray-100"
              onTouchStart={(e) => handleLongPressStart(groupName, 'group', e)}
              onTouchMove={handleLongPressMove}
              onTouchEnd={handleLongPressEnd}
              onMouseDown={(e) => handleLongPressStart(groupName, 'group', e)}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
            >
              <span>{groupName}</span>
              <span className="text-[10px] opacity-50">Hold to edit</span>
            </div>
            
            <div className="divide-y divide-gray-50">
              {groupCats.map(cat => {
                const amt = cat.amount || 0;
                const isPositive = amt > 0;
                
                return (
                  <div 
                    key={cat.id} 
                    onClick={() => handleCategoryClick(cat)}
                    onTouchStart={(e) => handleLongPressStart(cat, 'category', e)}
                    onTouchMove={handleLongPressMove}
                    onTouchEnd={handleLongPressEnd}
                    onMouseDown={(e) => handleLongPressStart(cat, 'category', e)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    className="p-3 flex justify-between items-center hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors select-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl w-8 text-center">{cat.icon}</span>
                      <span className="text-gray-700 font-medium">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`text-sm font-medium ${
                        amt === 0 ? 'text-gray-300' : isPositive ? 'text-emerald-600' : 'text-gray-900'
                      }`}>
                        {amt !== 0 && (isPositive ? '+' : '-')}{formatCurrency(amt)}
                      </div>
                      <span className="text-gray-300">›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}

        {sortedGroupNames.length === 0 && (
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

      <ReorderCategoriesModal
        isOpen={isReorderModalOpen}
        onClose={() => setIsReorderModalOpen(false)}
        categories={categories}
        onSave={() => setIsReorderModalOpen(false)}
        categoryType={activeTab}
      />

      <ReorderGroupsModal
        isOpen={isReorderGroupsModalOpen}
        onClose={() => setIsReorderGroupsModalOpen(false)}
        categories={categories}
        onSave={() => {
          setIsReorderGroupsModalOpen(false);
          setGroupOrderVersion(v => v + 1); // Force re-render
        }}
        categoryType={activeTab}
      />
    </div>
  );
};

export default CategoriesTab;