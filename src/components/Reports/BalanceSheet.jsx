import React, { useState, useMemo, useEffect } from 'react';

const BalanceSheet = ({ transactions, accounts, onBack }) => {
  // Get end of last month as default
  const getLastMonthValue = () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedDate, setSelectedDate] = useState(getLastMonthValue());
  const [showConfig, setShowConfig] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customYear, setCustomYear] = useState(new Date().getFullYear());
  const [customMonth, setCustomMonth] = useState(new Date().getMonth() + 1);
  
  // Drag & Drop state
  const [draggedAccount, setDraggedAccount] = useState(null);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  
  // Load config from localStorage
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('balanceSheetConfig');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      cash: [],
      checking: [],
      investments: []
    };
  });

  // Save config to localStorage
  useEffect(() => {
    localStorage.setItem('balanceSheetConfig', JSON.stringify(config));
  }, [config]);

  // Format currency
  const formatCurrency = (amount) => {
    const num = Math.round(Math.abs(amount || 0));
    const formatted = num.toLocaleString('en-US');
    return amount < 0 ? `-${formatted}` : formatted;
  };

  // Get end of month date (YYYY-MM-DD format, no timezone issues)
  const getEndOfMonthDate = (yearMonth) => {
    if (!yearMonth) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    const [year, month] = yearMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  };

  // Format selected date for display
  const formatSelectedDate = (yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Check if selected date is last month
  const isLastMonth = () => {
    return selectedDate === getLastMonthValue();
  };

  // Apply custom date
  const applyCustomDate = () => {
    setSelectedDate(`${customYear}-${String(customMonth).padStart(2, '0')}`);
    setShowCustomPicker(false);
  };

  // Calculate balance for an account at a specific date
  const calculateAccountBalance = (accountName, asOfDate) => {
    const account = accounts.find(a => a.name === accountName);
    if (!account) return 0;

    // For investment accounts with valueHistory
    if ((account.group === 'INVESTMENTS' || account.group === 'ASSETS') && account.valueHistory?.length > 0) {
      const validEntries = account.valueHistory
        .filter(v => v.date <= asOfDate)
        .sort((a, b) => b.date.localeCompare(a.date));
      
      if (validEntries.length > 0) {
        return validEntries[0].value || 0;
      }
    }

    // Calculate from starting balance + transactions
    let balance = account.startingBalance || 0;

    transactions.forEach(t => {
      // Include transactions on or before asOfDate (use <= not <)
      if (!t.date || t.date > asOfDate) return;

      if ((t.type === 'expense' || t.type === 'income') && t.account === accountName) {
        balance += Number(t.amount) || 0;
      }

      if (t.type === 'transfer') {
        if (t.fromAccount === accountName) {
          balance -= Math.abs(Number(t.amount) || 0);
        }
        if (t.toAccount === accountName) {
          balance += Math.abs(Number(t.amount) || 0);
        }
      }

      if (t.type === 'loan' && t.account === accountName) {
        if (t.loanType === 'lend') {
          balance -= Math.abs(Number(t.amount) || 0);
        } else {
          balance += Math.abs(Number(t.amount) || 0);
        }
      }

      if (t.type === 'split' && t.account === accountName) {
        balance += Number(t.totalAmount) || 0;
      }
    });

    return balance;
  };

  // Calculate balances for all groups
  const balanceData = useMemo(() => {
    const asOfDate = getEndOfMonthDate(selectedDate);
    
    const calculateGroup = (accountNames) => {
      const items = accountNames
        .map(name => {
          const account = accounts.find(a => a.name === name);
          if (!account || !account.isActive) return null;
          return {
            name,
            icon: account.icon || '💰',
            balance: calculateAccountBalance(name, asOfDate)
          };
        })
        .filter(Boolean);
      
      const total = items.reduce((sum, item) => sum + item.balance, 0);
      return { items, total };
    };

    const cash = calculateGroup(config.cash);
    const checking = calculateGroup(config.checking);
    const investments = calculateGroup(config.investments);
    const grandTotal = cash.total + checking.total + investments.total;

    return { cash, checking, investments, grandTotal, asOfDate };
  }, [selectedDate, config, accounts, transactions]);

  // Get all active accounts grouped like Account Tab
  const groupedActiveAccounts = useMemo(() => {
    const activeAccs = accounts.filter(a => a.isActive !== false);
    const groupOrder = ['SPENDING', 'SAVINGS', 'INVESTMENTS', 'ASSETS'];
    
    const grouped = {};
    groupOrder.forEach(g => grouped[g] = []);
    
    activeAccs.forEach(acc => {
      const group = acc.group || 'SPENDING';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(acc);
    });
    
    Object.keys(grouped).forEach(g => {
      grouped[g].sort((a, b) => (a.order || 0) - (b.order || 0));
    });
    
    return { grouped, groupOrder };
  }, [accounts]);

  // Get unassigned accounts (grouped)
  const unassignedAccounts = useMemo(() => {
    const assigned = [...config.cash, ...config.checking, ...config.investments];
    const { grouped, groupOrder } = groupedActiveAccounts;
    
    const result = {};
    groupOrder.forEach(g => {
      result[g] = grouped[g].filter(acc => !assigned.includes(acc.name));
    });
    
    return { grouped: result, groupOrder };
  }, [groupedActiveAccounts, config]);

  // Check if there are any unassigned accounts
  const hasUnassignedAccounts = useMemo(() => {
    return Object.values(unassignedAccounts.grouped).some(arr => arr.length > 0);
  }, [unassignedAccounts]);

  // Drag & Drop handlers
  const handleDragStart = (e, accountName) => {
    setDraggedAccount(accountName);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, groupKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupKey);
  };

  const handleDragLeave = () => {
    setDragOverGroup(null);
  };

  const handleDrop = (e, groupKey) => {
    e.preventDefault();
    if (!draggedAccount) return;

    setConfig(prev => {
      const newConfig = {
        cash: prev.cash.filter(n => n !== draggedAccount),
        checking: prev.checking.filter(n => n !== draggedAccount),
        investments: prev.investments.filter(n => n !== draggedAccount)
      };
      
      if (groupKey !== 'unassigned') {
        newConfig[groupKey] = [...newConfig[groupKey], draggedAccount];
      }
      
      return newConfig;
    });

    setDraggedAccount(null);
    setDragOverGroup(null);
  };

  const handleDragEnd = () => {
    setDraggedAccount(null);
    setDragOverGroup(null);
  };

  // Render a balance group in main view
  const renderGroup = (title, icon, data, colorClass) => {
    if (data.items.length === 0) return null;
    
    return (
      <div className="mb-6">
        <div className={`flex items-center justify-between py-3 px-4 rounded-lg ${colorClass}`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <span className="font-bold text-gray-800 text-lg">{title}</span>
          </div>
          <span className="font-bold text-gray-900 text-xl">{formatCurrency(data.total)}</span>
        </div>
        
        <div className="mt-2 space-y-1">
          {data.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 px-4 hover:bg-gray-50 rounded">
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span className="text-gray-700">{item.name}</span>
              </div>
              <span className={`font-medium ${item.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                {formatCurrency(item.balance)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render draggable account item
  const renderDraggableAccount = (account) => {
    const isDragging = draggedAccount === account.name;
    
    return (
      <div
        key={account.id}
        draggable
        onDragStart={(e) => handleDragStart(e, account.name)}
        onDragEnd={handleDragEnd}
        className={`flex items-center gap-3 p-2 rounded cursor-grab active:cursor-grabbing border border-transparent
          ${isDragging ? 'opacity-50 bg-gray-100' : 'hover:bg-gray-50 hover:border-gray-200'}
        `}
      >
        <span className="text-gray-400">⋮⋮</span>
        <span className="text-lg">{account.icon || '💰'}</span>
        <span className="text-gray-700">{account.name}</span>
      </div>
    );
  };

  // Render config modal with drag & drop
  const renderConfigModal = () => {
    if (!showConfig) return null;

    const balanceSheetGroups = [
      { key: 'cash', title: 'Cash', icon: '💵', color: 'bg-green-50 border-green-200' },
      { key: 'checking', title: 'Checking', icon: '🏦', color: 'bg-blue-50 border-blue-200' },
      { key: 'investments', title: 'Investments', icon: '📈', color: 'bg-purple-50 border-purple-200' }
    ];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConfig(false)}>
        <div className="bg-white rounded-xl shadow-2xl w-[700px] max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-xl text-gray-800">Configure Balance Sheet</h3>
            <button onClick={() => setShowConfig(false)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
          </div>
          
          <div className="p-4 overflow-auto max-h-[65vh]">
            <p className="text-sm text-gray-500 mb-4">
              Drag accounts into the categories below. Each account can only belong to one category.
            </p>
            
            {/* Balance Sheet Groups - Drop zones */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {balanceSheetGroups.map(group => {
                const groupAccounts = config[group.key]
                  .map(name => accounts.find(a => a.name === name))
                  .filter(Boolean);
                const isOver = dragOverGroup === group.key;
                
                return (
                  <div
                    key={group.key}
                    onDragOver={(e) => handleDragOver(e, group.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, group.key)}
                    className={`rounded-lg border-2 border-dashed p-3 min-h-[150px] transition-all
                      ${isOver ? 'border-emerald-500 bg-emerald-50' : `${group.color}`}
                    `}
                  >
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                      <span className="text-xl">{group.icon}</span>
                      <span className="font-bold text-gray-800">{group.title}</span>
                      <span className="text-xs text-gray-400 ml-auto">{groupAccounts.length}</span>
                    </div>
                    
                    <div className="space-y-1">
                      {groupAccounts.map(acc => renderDraggableAccount(acc))}
                      {groupAccounts.length === 0 && (
                        <div className="text-sm text-gray-400 text-center py-4">
                          Drop accounts here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unassigned Accounts - grouped by Account Tab groups */}
            <div 
              onDragOver={(e) => handleDragOver(e, 'unassigned')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'unassigned')}
              className={`rounded-lg border-2 border-dashed p-4 transition-all
                ${dragOverGroup === 'unassigned' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}
              `}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📋</span>
                <span className="font-bold text-gray-700">Available Accounts</span>
                <span className="text-xs text-gray-400">(drag to assign)</span>
              </div>
              
              {!hasUnassignedAccounts ? (
                <div className="text-sm text-gray-400 text-center py-4">
                  All accounts assigned ✓
                </div>
              ) : (
                <div className="space-y-4">
                  {unassignedAccounts.groupOrder.map(groupName => {
                    const accs = unassignedAccounts.grouped[groupName];
                    if (accs.length === 0) return null;
                    
                    return (
                      <div key={groupName}>
                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">{groupName}</div>
                        <div className="grid grid-cols-2 gap-1">
                          {accs.map(acc => renderDraggableAccount(acc))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          <div className="p-4 border-t bg-gray-50">
            <button 
              onClick={() => setShowConfig(false)} 
              className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Check if any accounts are configured
  const hasConfiguredAccounts = config.cash.length > 0 || config.checking.length > 0 || config.investments.length > 0;

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            
            <button 
              onClick={() => setShowConfig(true)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex items-center gap-2"
            >
              ⚙️ Configure
            </button>
          </div>
          
          {/* Title */}
          <div className="mt-4 text-center">
            <h1 className="text-2xl font-bold text-gray-800">📊 Balance Sheet</h1>
            <p className="text-gray-500 mt-1">Net Worth Snapshot</p>
          </div>
          
          {/* Date Filter */}
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => setSelectedDate(getLastMonthValue())}
              className={`px-4 py-2 rounded-lg font-medium transition-all border ${
                isLastMonth() 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              End of Last Month
            </button>
            <div className="relative">
              <button
                onClick={() => setShowCustomPicker(!showCustomPicker)}
                className={`px-4 py-2 rounded-lg font-medium transition-all border ${
                  !isLastMonth() 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {!isLastMonth() ? `End of ${formatSelectedDate(selectedDate)}` : 'Custom Date'}
              </button>
              
              {/* Custom Date Picker Dropdown */}
              {showCustomPicker && (
                <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-xl p-4 z-20 min-w-[240px] border">
                  <div className="text-gray-700 font-medium mb-3">Select Month & Year</div>
                  <div className="flex gap-2 mb-3">
                    <select
                      value={customMonth}
                      onChange={e => setCustomMonth(Number(e.target.value))}
                      className="flex-1 px-3 py-2 border rounded-lg text-gray-700"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customYear}
                      onChange={e => setCustomYear(Number(e.target.value))}
                      className="w-24 px-3 py-2 border rounded-lg text-gray-700"
                    >
                      {Array.from({ length: 10 }, (_, i) => {
                        const year = 2026 + i;
                        return <option key={year} value={year}>{year}</option>;
                      })}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      className="flex-1 px-3 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={applyCustomDate}
                      className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-4xl mx-auto">
        {!hasConfiguredAccounts ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No Accounts Configured</h2>
            <p className="text-gray-500 mb-6">
              Click "Configure" to drag accounts into Cash, Checking, or Investments categories.
            </p>
            <button 
              onClick={() => setShowConfig(true)}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
            >
              ⚙️ Configure Balance Sheet
            </button>
          </div>
        ) : (
          <>
            {/* Date Info */}
            <div className="mb-6 text-center">
              <p className="text-gray-500">
                Balances as of <span className="font-semibold text-gray-700">
                  {new Date(balanceData.asOfDate).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </p>
            </div>

            {/* Balance Groups */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              {renderGroup('CASH', '💵', balanceData.cash, 'bg-green-50')}
              {renderGroup('CHECKING', '🏦', balanceData.checking, 'bg-blue-50')}
              {renderGroup('INVESTMENTS', '📈', balanceData.investments, 'bg-purple-50')}
              
              {/* Grand Total */}
              <div className="mt-6 pt-6 border-t-2 border-gray-200">
                <div className="flex items-center justify-between py-4 px-4 bg-gray-100 rounded-lg">
                  <span className="font-bold text-gray-800 text-xl">TOTAL NET WORTH</span>
                  <span className={`font-bold text-2xl ${balanceData.grandTotal < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatCurrency(balanceData.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {renderConfigModal()}
    </div>
  );
};

export default BalanceSheet;
