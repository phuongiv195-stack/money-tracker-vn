import React, { useState, useMemo, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';

const BalanceSheet = ({ transactions, accounts, onBack }) => {
  const userId = useUserId();
  const configLoadedRef = useRef(false);
  
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
  
  // Expand/Collapse state for each group
  const [expandedGroups, setExpandedGroups] = useState({
    cash: true,
    checking: true,
    investments: true,
    fixedAssets: true,
    loansGiven: true,
    loansOwed: true
  });

  // Which items are checked (included in totals) — key: `${groupKey}-${name}`
  const [checkedItems, setCheckedItems] = useState({});
  
  // Exchange rate state - will be loaded from Firebase
  const [exchangeRate, setExchangeRate] = useState(25000);
  const [displayExchangeRate, setDisplayExchangeRate] = useState('25,000');
  const exchangeRateLoadedRef = useRef(false);
  
  // Drag & Drop state
  const [draggedAccount, setDraggedAccount] = useState(null);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  
  // Config state - will be loaded from Firestore
  const [config, setConfig] = useState({
    cash: [],
    checking: [],
    investments: [],
    fixedAssets: []
  });

  // Load config from Firestore once
  useEffect(() => {
    if (!userId || configLoadedRef.current) return;
    
    const loadConfig = async () => {
      try {
        const docRef = doc(db, 'userSettings', userId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          // Load balance sheet config
          if (data.balanceSheetConfig) {
            const savedConfig = data.balanceSheetConfig;
            setConfig({
              cash: savedConfig.cash || [],
              checking: savedConfig.checking || [],
              investments: savedConfig.investments || [],
              fixedAssets: savedConfig.fixedAssets || []
            });
          }
          
          // Load exchange rate
          if (data.balanceSheetExchangeRate !== undefined) {
            const rate = Number(data.balanceSheetExchangeRate);
            setExchangeRate(rate);
            setDisplayExchangeRate(rate.toLocaleString('en-US', { maximumFractionDigits: 2 }));
          }
        }
        configLoadedRef.current = true;
        exchangeRateLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading balance sheet config:', error);
        configLoadedRef.current = true;
        exchangeRateLoadedRef.current = true;
      }
    };
    
    loadConfig();
  }, [userId]);

  // Save config to Firestore when changed (debounced)
  const saveConfigTimeoutRef = useRef(null);
  useEffect(() => {
    if (!userId || !configLoadedRef.current) return;
    
    // Debounce save to avoid too many writes
    if (saveConfigTimeoutRef.current) {
      clearTimeout(saveConfigTimeoutRef.current);
    }
    
    saveConfigTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'userSettings', userId);
        await setDoc(docRef, { balanceSheetConfig: config }, { merge: true });
      } catch (error) {
        console.error('Error saving balance sheet config:', error);
      }
    }, 500);
    
    return () => {
      if (saveConfigTimeoutRef.current) {
        clearTimeout(saveConfigTimeoutRef.current);
      }
    };
  }, [config, userId]);

  // Toggle group expand/collapse
  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Expand All / Collapse All
  const expandAll = () => {
    setExpandedGroups({
      cash: true,
      checking: true,
      investments: true,
      fixedAssets: true,
      loansGiven: true,
      loansOwed: true
    });
  };

  const collapseAll = () => {
    setExpandedGroups({
      cash: false,
      checking: false,
      investments: false,
      fixedAssets: false,
      loansGiven: false,
      loansOwed: false
    });
  };

  // Save exchange rate to Firebase when changed (debounced)
  const saveExchangeRateTimeoutRef = useRef(null);
  useEffect(() => {
    if (!userId || !exchangeRateLoadedRef.current) return;
    
    if (saveExchangeRateTimeoutRef.current) {
      clearTimeout(saveExchangeRateTimeoutRef.current);
    }
    
    saveExchangeRateTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'userSettings', userId);
        await setDoc(docRef, { balanceSheetExchangeRate: exchangeRate }, { merge: true });
      } catch (error) {
        console.error('Error saving exchange rate:', error);
      }
    }, 500);
    
    return () => {
      if (saveExchangeRateTimeoutRef.current) {
        clearTimeout(saveExchangeRateTimeoutRef.current);
      }
    };
  }, [exchangeRate, userId]);

  // Format currency VND
  const formatCurrency = (amount) => {
    const num = Math.round(Math.abs(amount || 0));
    const formatted = num.toLocaleString('en-US');
    return amount < 0 ? `-${formatted}` : formatted;
  };

  // USD value rounded to whole cents (so per-row displays reconcile with totals)
  const roundUSDCents = (amountVND) => {
    if (!exchangeRate || exchangeRate === 0) return 0;
    return Math.round(((amountVND || 0) / exchangeRate) * 100) / 100;
  };

  // Format an already-computed USD number
  const formatUSDAmount = (usd) =>
    `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Format currency USD (single row: convert then round to cents)
  const formatUSD = (amountVND) => {
    if (!exchangeRate || exchangeRate === 0) return '$0.00';
    return formatUSDAmount(roundUSDCents(amountVND));
  };

  // USD for a group = sum of its checked items' USD, each rounded to cents, so a
  // group row equals the sum of the item rows shown beneath it.
  const groupUSD = (groupKey, items) =>
    items
      .filter(i => isItemChecked(groupKey, i.name))
      .reduce((s, i) => s + roundUSDCents(i.balance), 0);

  // Handle exchange rate input (supports decimals like 26,360.55)
  const handleExchangeRateChange = (e) => {
    const raw = e.target.value.replace(/,/g, '');
    // Allow digits and one decimal point with up to 2 decimal places
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      const num = Number(raw) || 0;
      setExchangeRate(num);
      // Format display: keep user's input as-is while typing
      if (raw.endsWith('.') || raw.includes('.')) {
        // Keep the raw input while user is typing decimal
        // Just add commas to integer part
        const parts = raw.split('.');
        const intPart = parts[0] ? Number(parts[0]).toLocaleString('en-US') : '';
        const decPart = parts[1] !== undefined ? '.' + parts[1] : '.';
        setDisplayExchangeRate(intPart + decPart);
      } else if (num) {
        // Format with commas for whole numbers
        setDisplayExchangeRate(num.toLocaleString('en-US'));
      } else {
        setDisplayExchangeRate('');
      }
    }
  };

  // Get end of month date (YYYY-MM-DD format)
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

    let balance = account.startingBalance || 0;

    transactions.forEach(t => {
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

      if (t.type === 'unrealized_gain' && t.account === accountName) {
        balance += Number(t.amount) || 0;
      }
    });

    return balance;
  };

  // Calculate loan balances from transactions
  const calculateLoanBalances = (asOfDate) => {
    // Group loan transactions by loan name
    const loanMap = {};
    
    transactions.forEach(t => {
      if (t.type !== 'loan' || !t.loan || !t.date || t.date > asOfDate) return;
      
      if (!loanMap[t.loan]) {
        loanMap[t.loan] = { name: t.loan, loanType: t.loanType, balance: 0 };
      }
      
      // Loan amount is stored as the effect on the loan balance
      // For borrow: positive = received money (debt increases)
      // For lend: negative = gave money (receivable increases)
      const amount = Number(t.amount) || 0;
      loanMap[t.loan].balance += amount;
    });

    // Separate into lent (I Lent = assets) and borrowed (I Borrowed = liabilities)
    const loansGiven = []; // I Lent - these are assets (money owed TO me)
    const loansOwed = [];  // I Borrowed - these are liabilities (money I OWE)

    Object.values(loanMap).forEach(loan => {
      if (loan.loanType === 'lend') {
        // I Lent: balance is negative (money went out), so receivable = -balance
        const receivable = -loan.balance;
        if (receivable !== 0) {
          loansGiven.push({ name: loan.name, balance: receivable });
        }
      } else if (loan.loanType === 'borrow') {
        // I Borrowed: balance is positive (money came in), debt = balance
        if (loan.balance !== 0) {
          loansOwed.push({ name: loan.name, balance: loan.balance });
        }
      }
    });

    const totalLoansGiven = loansGiven.reduce((sum, l) => sum + l.balance, 0);
    const totalLoansOwed = loansOwed.reduce((sum, l) => sum + l.balance, 0);

    return { loansGiven, loansOwed, totalLoansGiven, totalLoansOwed };
  };

  // Calculate all balance data
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
    const fixedAssets = calculateGroup(config.fixedAssets);
    
    // Calculate loan balances
    const { loansGiven, loansOwed, totalLoansGiven, totalLoansOwed } = calculateLoanBalances(asOfDate);
    
    // Total Assets = Cash + Checking + Investments + Fixed Assets + Loans Given
    const totalAssets = cash.total + checking.total + investments.total + fixedAssets.total + totalLoansGiven;
    
    // Total Liabilities = Loans Owed
    const totalLiabilities = totalLoansOwed;
    
    // Net Worth = Assets - Liabilities
    const netWorth = totalAssets - totalLiabilities;

    return {
      cash, checking, investments, fixedAssets,
      loansGiven, loansOwed, totalLoansGiven, totalLoansOwed,
      totalAssets, totalLiabilities, netWorth,
      asOfDate
    };
  }, [selectedDate, config, accounts, transactions]);

  // All groups with their item arrays (cash/checking/... hold {items,total}; loans are arrays)
  const itemGroups = () => ([
    ['cash', balanceData.cash.items],
    ['checking', balanceData.checking.items],
    ['investments', balanceData.investments.items],
    ['fixedAssets', balanceData.fixedAssets.items],
    ['loansGiven', balanceData.loansGiven],
    ['loansOwed', balanceData.loansOwed],
  ]);

  // Default new items to checked (only fill in missing keys, preserve user choices)
  useEffect(() => {
    setCheckedItems(prev => {
      const next = { ...prev };
      let changed = false;
      itemGroups().forEach(([gk, items]) => {
        items.forEach(item => {
          const key = `${gk}-${item.name}`;
          if (next[key] === undefined) { next[key] = true; changed = true; }
        });
      });
      return changed ? next : prev;
    });
  }, [balanceData]);

  // An item counts as checked unless explicitly set to false
  const isItemChecked = (groupKey, name) => checkedItems[`${groupKey}-${name}`] !== false;

  const toggleItem = (groupKey, name) => {
    const key = `${groupKey}-${name}`;
    setCheckedItems(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  const isGroupFullyChecked = (groupKey, items) =>
    items.length > 0 && items.every(i => isItemChecked(groupKey, i.name));

  const isGroupIndeterminate = (groupKey, items) => {
    const checked = items.filter(i => isItemChecked(groupKey, i.name)).length;
    return checked > 0 && checked < items.length;
  };

  const toggleGroupCheck = (groupKey, items) => {
    const allChecked = isGroupFullyChecked(groupKey, items);
    setCheckedItems(prev => {
      const next = { ...prev };
      items.forEach(i => { next[`${groupKey}-${i.name}`] = !allChecked; });
      return next;
    });
  };

  const isAllItemsChecked = useMemo(() => {
    const all = itemGroups().flatMap(([gk, items]) => items.map(i => isItemChecked(gk, i.name)));
    return all.length > 0 && all.every(Boolean);
  }, [balanceData, checkedItems]);

  const setAllItemsChecked = (val) => {
    setCheckedItems(prev => {
      const next = { ...prev };
      itemGroups().forEach(([gk, items]) => items.forEach(i => { next[`${gk}-${i.name}`] = val; }));
      return next;
    });
  };

  // Totals recomputed from only the checked items
  const checkedTotals = useMemo(() => {
    const groupTotal = (groupKey, items) =>
      items.filter(i => isItemChecked(groupKey, i.name)).reduce((s, i) => s + i.balance, 0);
    const cash = groupTotal('cash', balanceData.cash.items);
    const checking = groupTotal('checking', balanceData.checking.items);
    const investments = groupTotal('investments', balanceData.investments.items);
    const fixedAssets = groupTotal('fixedAssets', balanceData.fixedAssets.items);
    const loansGiven = groupTotal('loansGiven', balanceData.loansGiven);
    const loansOwed = groupTotal('loansOwed', balanceData.loansOwed);
    const totalAssets = cash + checking + investments + fixedAssets + loansGiven;
    const totalLiabilities = loansOwed;

    // USD is summed bottom-up (item cents → group → total) so the totals equal
    // the sum of the group rows displayed on screen.
    const totalAssetsUSD =
      groupUSD('cash', balanceData.cash.items) +
      groupUSD('checking', balanceData.checking.items) +
      groupUSD('investments', balanceData.investments.items) +
      groupUSD('fixedAssets', balanceData.fixedAssets.items) +
      groupUSD('loansGiven', balanceData.loansGiven);
    const totalLiabilitiesUSD = groupUSD('loansOwed', balanceData.loansOwed);

    return {
      cash, checking, investments, fixedAssets, loansGiven, loansOwed,
      totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities,
      totalAssetsUSD, totalLiabilitiesUSD,
      netWorthUSD: totalAssetsUSD - totalLiabilitiesUSD,
    };
  }, [balanceData, checkedItems, exchangeRate]);

  // Get all active accounts grouped
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

  // Get unassigned accounts
  const unassignedAccounts = useMemo(() => {
    const assigned = [...config.cash, ...config.checking, ...config.investments, ...config.fixedAssets];
    const { grouped, groupOrder } = groupedActiveAccounts;
    
    const result = {};
    groupOrder.forEach(g => {
      result[g] = grouped[g].filter(acc => !assigned.includes(acc.name));
    });
    
    return { grouped: result, groupOrder };
  }, [groupedActiveAccounts, config]);

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
        investments: prev.investments.filter(n => n !== draggedAccount),
        fixedAssets: prev.fixedAssets.filter(n => n !== draggedAccount)
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

  // Render account group (Assets section)
  const renderGroup = (groupKey, title, icon, data, colorClass) => {
    if (data.items.length === 0) return null;
    const isExpanded = expandedGroups[groupKey];
    const fullyChecked = isGroupFullyChecked(groupKey, data.items);
    const indeterminate = isGroupIndeterminate(groupKey, data.items);
    const groupTotal = data.items
      .filter(i => isItemChecked(groupKey, i.name))
      .reduce((s, i) => s + i.balance, 0);
    const groupTotalUSD = groupUSD(groupKey, data.items);
    const dim = !fullyChecked && !indeterminate;

    return (
      <div className="mb-4">
        <div
          className={`flex items-center justify-between py-3 px-4 rounded-lg ${colorClass} cursor-pointer hover:opacity-90 transition-opacity`}
          onClick={() => toggleGroup(groupKey)}
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fullyChecked}
              ref={el => { if (el) el.indeterminate = indeterminate; }}
              onChange={() => toggleGroupCheck(groupKey, data.items)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-gray-300 focus:ring-0 cursor-pointer accent-emerald-500"
              title="Check / uncheck this category"
            />
            <span className="text-sm text-gray-500">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-xl">{icon}</span>
            <span className="font-bold text-gray-800">{title}</span>
            {!isExpanded && <span className="text-xs text-gray-500">({data.items.length})</span>}
          </div>
          <div className={`flex items-center gap-6 ${dim ? 'opacity-30' : ''}`}>
            <span className="font-bold text-gray-900 w-32 text-right">{formatCurrency(groupTotal)}</span>
            <span className="font-bold text-gray-900 w-28 text-right">{formatUSDAmount(groupTotalUSD)}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-1 space-y-1 ml-6">
            {data.items.map((item, idx) => {
              const checked = isItemChecked(groupKey, item.name);
              return (
                <div key={idx} className={`flex items-center justify-between py-1.5 px-4 hover:bg-gray-50 rounded ${!checked ? 'opacity-40' : ''}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(groupKey, item.name)}
                      className="w-3.5 h-3.5 rounded border-gray-300 focus:ring-0 cursor-pointer accent-gray-500"
                    />
                    <span>{item.icon}</span>
                    <span className={`text-gray-700 ${!checked ? 'line-through' : ''}`}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`w-32 text-right ${item.balance < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {formatCurrency(item.balance)}
                    </span>
                    <span className={`w-28 text-right ${item.balance < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {formatUSD(item.balance)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Render loan group
  const renderLoanGroup = (groupKey, title, icon, items, total, colorClass) => {
    if (items.length === 0) return null;
    const isExpanded = expandedGroups[groupKey];
    const fullyChecked = isGroupFullyChecked(groupKey, items);
    const indeterminate = isGroupIndeterminate(groupKey, items);
    const groupTotal = items
      .filter(i => isItemChecked(groupKey, i.name))
      .reduce((s, i) => s + i.balance, 0);
    const groupTotalUSD = groupUSD(groupKey, items);
    const dim = !fullyChecked && !indeterminate;

    return (
      <div className="mb-4">
        <div
          className={`flex items-center justify-between py-3 px-4 rounded-lg ${colorClass} cursor-pointer hover:opacity-90 transition-opacity`}
          onClick={() => toggleGroup(groupKey)}
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={fullyChecked}
              ref={el => { if (el) el.indeterminate = indeterminate; }}
              onChange={() => toggleGroupCheck(groupKey, items)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-gray-300 focus:ring-0 cursor-pointer accent-emerald-500"
              title="Check / uncheck this category"
            />
            <span className="text-sm text-gray-500">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-xl">{icon}</span>
            <span className="font-bold text-gray-800">{title}</span>
            {!isExpanded && <span className="text-xs text-gray-500">({items.length})</span>}
          </div>
          <div className={`flex items-center gap-6 ${dim ? 'opacity-30' : ''}`}>
            <span className="font-bold text-gray-900 w-32 text-right">{formatCurrency(groupTotal)}</span>
            <span className="font-bold text-gray-900 w-28 text-right">{formatUSDAmount(groupTotalUSD)}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-1 space-y-1 ml-6">
            {items.map((item, idx) => {
              const checked = isItemChecked(groupKey, item.name);
              return (
                <div key={idx} className={`flex items-center justify-between py-1.5 px-4 hover:bg-gray-50 rounded ${!checked ? 'opacity-40' : ''}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(groupKey, item.name)}
                      className="w-3.5 h-3.5 rounded border-gray-300 focus:ring-0 cursor-pointer accent-gray-500"
                    />
                    <span>👤</span>
                    <span className={`text-gray-700 ${!checked ? 'line-through' : ''}`}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`w-32 text-right ${item.balance < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {formatCurrency(item.balance)}
                    </span>
                    <span className={`w-28 text-right ${item.balance < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {formatUSD(item.balance)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

  // Render drop zone for config
  const renderDropZone = (groupKey, title, icon, colorClass) => {
    const items = config[groupKey] || [];
    const isOver = dragOverGroup === groupKey;
    
    return (
      <div
        onDragOver={(e) => handleDragOver(e, groupKey)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, groupKey)}
        className={`rounded-lg border-2 border-dashed p-4 transition-all min-h-[100px]
          ${isOver ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}
        `}
      >
        <div className={`flex items-center gap-2 mb-3 px-2 py-1 rounded ${colorClass}`}>
          <span className="text-xl">{icon}</span>
          <span className="font-bold text-gray-700">{title}</span>
        </div>
        
        {items.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-4">
            Drop accounts here
          </div>
        ) : (
          <div className="space-y-1">
            {items.map(name => {
              const account = accounts.find(a => a.name === name);
              if (!account) return null;
              return renderDraggableAccount(account);
            })}
          </div>
        )}
      </div>
    );
  };

  // Config Modal
  const renderConfigModal = () => {
    if (!showConfig) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl max-h-[90vh] flex flex-col">
          <div className="p-4 border-b flex justify-between items-center shrink-0">
            <h2 className="text-xl font-bold">⚙️ Configure Balance Sheet</h2>
            <button onClick={() => setShowConfig(false)} className="text-gray-500 text-xl">✕</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-gray-600 text-sm">
              Drag accounts from "Available Accounts" to assign them to categories.
              Loans are automatically included based on your loan transactions.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              {renderDropZone('cash', 'CASH', '💵', 'bg-green-100')}
              {renderDropZone('checking', 'CHECKING', '🏦', 'bg-blue-100')}
              {renderDropZone('investments', 'INVESTMENTS', '📈', 'bg-purple-100')}
              {renderDropZone('fixedAssets', 'FIXED ASSETS', '🏠', 'bg-amber-100')}
            </div>
            
            {/* Unassigned Accounts */}
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

  const hasConfiguredAccounts = config.cash.length > 0 || config.checking.length > 0 || config.investments.length > 0 || config.fixedAssets.length > 0;
  const hasAnyData = hasConfiguredAccounts || balanceData.loansGiven.length > 0 || balanceData.loansOwed.length > 0;

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
                        const year = 2020 + i;
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
          
          {/* Exchange Rate Input */}
          <div className="mt-4 flex justify-center items-center gap-2">
            <span className="text-gray-600 text-sm">Exchange Rate:</span>
            <input
              type="text"
              value={displayExchangeRate}
              onChange={handleExchangeRateChange}
              className="w-28 px-3 py-1.5 border rounded-lg text-center font-medium text-gray-700"
              placeholder="25,000"
            />
            <span className="text-gray-600 text-sm">VND = 1 USD</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-4xl mx-auto">
        {!hasAnyData ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No Data to Display</h2>
            <p className="text-gray-500 mb-6">
              Click "Configure" to assign accounts to categories, or add some loan transactions.
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
                  {new Date(balanceData.asOfDate + 'T00:00:00').toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </p>
            </div>

            {/* CURRENT ASSETS Section */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="border-b-2 border-emerald-500 pb-2 mb-4 flex justify-between items-center">
                <h2 className="text-lg font-bold text-emerald-700">CURRENT ASSETS</h2>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={expandAll}
                    className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Collapse All
                  </button>
                  <div className="w-px bg-gray-300 mx-1 self-stretch"></div>
                  <button
                    onClick={() => setAllItemsChecked(true)}
                    className={`px-3 py-1 text-sm rounded-lg ${
                      isAllItemsChecked
                        ? 'text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                        : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {isAllItemsChecked ? '☑' : '☐'} Check All
                  </button>
                  <button
                    onClick={() => setAllItemsChecked(false)}
                    className={`px-3 py-1 text-sm rounded-lg ${
                      !isAllItemsChecked
                        ? 'text-red-600 bg-red-50 border border-red-200 hover:bg-red-100'
                        : 'text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {!isAllItemsChecked ? '☑' : '☐'} Uncheck All
                  </button>
                </div>
              </div>
              
              {renderGroup('cash', 'CASH', '💵', balanceData.cash, 'bg-green-50')}
              {renderGroup('checking', 'CHECKING', '🏦', balanceData.checking, 'bg-blue-50')}
              {renderGroup('investments', 'INVESTMENTS', '📈', balanceData.investments, 'bg-purple-50')}
              {renderGroup('fixedAssets', 'FIXED ASSETS', '🏠', balanceData.fixedAssets, 'bg-amber-50')}
              {renderLoanGroup('loansGiven', 'LOANS GIVEN', '💰', balanceData.loansGiven, balanceData.totalLoansGiven, 'bg-teal-50')}
              
              {/* Total Assets */}
              <div className="mt-4 pt-4 border-t-2 border-gray-200">
                <div className="flex items-center justify-between py-3 px-4 bg-emerald-100 rounded-lg">
                  <span className="font-bold text-emerald-800">TOTAL ASSETS</span>
                  <div className="flex items-center gap-6">
                    <span className="font-bold text-emerald-800 text-xl w-32 text-right">{formatCurrency(checkedTotals.totalAssets)}</span>
                    <span className="font-bold text-emerald-800 text-xl w-28 text-right">{formatUSDAmount(checkedTotals.totalAssetsUSD)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CURRENT LIABILITIES Section */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="border-b-2 border-red-400 pb-2 mb-4">
                <h2 className="text-lg font-bold text-red-600">CURRENT LIABILITIES</h2>
              </div>
              
              {renderLoanGroup('loansOwed', 'LOANS OWED', '💸', balanceData.loansOwed, balanceData.totalLoansOwed, 'bg-red-50')}
              
              {balanceData.loansOwed.length === 0 && (
                <div className="text-gray-400 text-center py-4">No liabilities</div>
              )}
              
              {/* Total Liabilities */}
              <div className="mt-4 pt-4 border-t-2 border-gray-200">
                <div className="flex items-center justify-between py-3 px-4 bg-red-100 rounded-lg">
                  <span className="font-bold text-red-800">TOTAL LIABILITIES</span>
                  <div className="flex items-center gap-6">
                    <span className="font-bold text-red-800 text-xl w-32 text-right">{formatCurrency(checkedTotals.totalLiabilities)}</span>
                    <span className="font-bold text-red-800 text-xl w-28 text-right">{formatUSDAmount(checkedTotals.totalLiabilitiesUSD)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* NET WORTH */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">💎</span>
                    <div>
                      <div className="text-white text-xl font-bold uppercase tracking-wide">Total Net Worth</div>
                      <div className="text-emerald-200 text-sm">
                        (Total Assets − Total Liabilities)
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-white text-2xl font-bold w-36 text-right">
                    {formatCurrency(checkedTotals.netWorth)}
                  </span>
                  <span className="text-white text-2xl font-bold w-32 text-right">
                    {formatUSDAmount(checkedTotals.netWorthUSD)}
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