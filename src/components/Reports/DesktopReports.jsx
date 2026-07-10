import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import AddTransactionModal from '../Transactions/AddTransactionModal';

const DesktopReports = ({ onBack }) => {
  const userId = useUserId();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateRange, setDateRange] = useState('this-year');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [wantNeedFilter, setWantNeedFilter] = useState('all'); // 'all' | 'want' | 'need'
  const [reportType, setReportType] = useState('income-expense'); // 'income-expense' | 'category-detail'
  
  // Expand/collapse state
  const [expandedGroups, setExpandedGroups] = useState({});

  // Collapse an entire section (income / expense) to hide its detail rows
  const [collapsedSections, setCollapsedSections] = useState({ income: false, expense: false });

  // Category filter state - which categories are checked (visible in report)
  const [checkedCategories, setCheckedCategories] = useState({});

  // Tooltip state
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, transactions: [], category: '', month: '' });
  
  // Edit transaction modal
  const [editTransaction, setEditTransaction] = useState(null);

  // Exchange rate state
  const [exchangeRate, setExchangeRate] = useState(30000);
  const [displayExchangeRate, setDisplayExchangeRate] = useState('30,000');
  const exchangeRateLoadedRef = useRef(false);

  // Fetch transactions
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'transactions'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(trans);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userId]);

  // Fetch categories
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'categories'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    });
    return () => unsubscribe();
  }, [userId]);

  // Load exchange rate from Firebase
  useEffect(() => {
    if (!userId) return;
    const loadExchangeRate = async () => {
      try {
        const docRef = doc(db, 'userSettings', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.detailedReportExchangeRate !== undefined) {
            const rate = Number(data.detailedReportExchangeRate);
            setExchangeRate(rate);
            setDisplayExchangeRate(rate.toLocaleString('en-US', { maximumFractionDigits: 2 }));
          }
        }
        exchangeRateLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading exchange rate:', error);
        exchangeRateLoadedRef.current = true;
      }
    };
    loadExchangeRate();
  }, [userId]);

  // Save exchange rate to Firebase (debounced)
  const saveExchangeRateTimeoutRef = useRef(null);
  useEffect(() => {
    if (!userId || !exchangeRateLoadedRef.current) return;
    if (saveExchangeRateTimeoutRef.current) {
      clearTimeout(saveExchangeRateTimeoutRef.current);
    }
    saveExchangeRateTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'userSettings', userId);
        await setDoc(docRef, { detailedReportExchangeRate: exchangeRate }, { merge: true });
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

  // Handle exchange rate input
  const handleExchangeRateChange = (e) => {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      const num = Number(raw) || 0;
      setExchangeRate(num);
      if (raw.endsWith('.') || raw.includes('.')) {
        const parts = raw.split('.');
        const intPart = parts[0] ? Number(parts[0]).toLocaleString('en-US') : '';
        const decPart = parts[1] !== undefined ? '.' + parts[1] : '.';
        setDisplayExchangeRate(intPart + decPart);
      } else if (num) {
        setDisplayExchangeRate(num.toLocaleString('en-US'));
      } else {
        setDisplayExchangeRate('');
      }
    }
  };

  // Format USD
  const formatUSD = (amountVND) => {
    if (!exchangeRate || exchangeRate === 0) return '$0.00';
    const usd = amountVND / exchangeRate;
    return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // USD value rounded to whole cents (so per-row displays reconcile with totals)
  const roundUSDCents = (amountVND) => {
    if (!exchangeRate || exchangeRate === 0) return 0;
    return Math.round((amountVND / exchangeRate) * 100) / 100;
  };

  // Format an already-computed USD number
  const formatUSDAmount = (usd) =>
    `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Sum of each group's USD (each group rounded to cents) so the Total USD row
  // equals the sum of the visible group rows instead of converting the aggregate VND.
  const sumGroupsUSD = (type) =>
    Object.values(reportData[type] || {}).reduce((sum, groupData) => {
      const groupVND = groupData.categories
        .filter(cat => checkedCategories[`${type}-cat-${cat.name}`])
        .reduce((s, cat) => s + cat.total, 0);
      return sum + roundUSDCents(groupVND);
    }, 0);

  // Get months in date range
  const getDateRangeMonths = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    switch (dateRange) {
      case 'today':
        return [{ year: currentYear, month: currentMonth, isToday: true }];
      case 'this-month':
        return [{ year: currentYear, month: currentMonth }];
      case 'last-month':
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return [{ year: lastMonthYear, month: lastMonth }];
      case 'this-quarter':
        const quarterStart = Math.floor(currentMonth / 3) * 3;
        return Array.from({ length: currentMonth - quarterStart + 1 }, (_, i) => ({
          year: currentYear,
          month: quarterStart + i
        }));
      case 'last-quarter':
        const lastQuarterEnd = Math.floor(currentMonth / 3) * 3 - 1;
        const lastQuarterStart = lastQuarterEnd - 2;
        return Array.from({ length: 3 }, (_, i) => {
          const m = lastQuarterStart + i;
          const y = m < 0 ? currentYear - 1 : currentYear;
          return { year: y, month: m < 0 ? m + 12 : m };
        });
      case 'this-year':
        return Array.from({ length: currentMonth + 1 }, (_, i) => ({
          year: currentYear,
          month: i
        }));
      case 'last-year':
        return Array.from({ length: 12 }, (_, i) => ({
          year: currentYear - 1,
          month: i
        }));
      case 'custom':
        if (!customRange.from || !customRange.to) return [];
        const fromDate = new Date(customRange.from + '-01');
        const toDate = new Date(customRange.to + '-01');
        const months = [];
        const current = new Date(fromDate);
        while (current <= toDate) {
          months.push({ year: current.getFullYear(), month: current.getMonth() });
          current.setMonth(current.getMonth() + 1);
        }
        return months;
      default:
        return [{ year: currentYear, month: currentMonth }];
    }
  };

  // Process transactions into report data
  const reportData = useMemo(() => {
    const months = getDateRangeMonths();
    if (months.length === 0) return { months: [], income: {}, expense: {}, totals: {} };

    const today = new Date().toISOString().split('T')[0];
    const isToday = months.some(m => m.isToday);

    // Get all unique categories grouped by type
    const incomeCategories = new Map(); // category -> { group, months data }
    const expenseCategories = new Map();

    // Initialize month columns
    const monthKeys = isToday 
      ? [today] 
      : months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`);

    // Process each transaction
    transactions.forEach(t => {
      if (!t.date || t.type === 'transfer' || t.type === 'loan') return;
      
      let transKey;
      if (isToday) {
        if (t.date !== today) return;
        transKey = today;
      } else {
        transKey = t.date.slice(0, 7);
        if (!monthKeys.includes(transKey)) return;
      }

      // Apply want/need filter
      if (wantNeedFilter !== 'all') {
        // For regular expense transactions
        if (t.type === 'expense') {
          const transSpendingType = t.spendingType || 'need';
          if (transSpendingType !== wantNeedFilter) return;
        }
        // For split transactions, we'll filter individual splits below
      }

      const processCategory = (category, amount, type, group) => {
        const map = type === 'income' ? incomeCategories : expenseCategories;
        if (!map.has(category)) {
          map.set(category, {
            group: group || 'Other',
            months: {},
            total: 0
          });
        }
        const catData = map.get(category);
        catData.months[transKey] = (catData.months[transKey] || 0) + Math.abs(amount);
        catData.total += Math.abs(amount);
      };

      if (t.type === 'income') {
        if (!t.category) return; // Skip income without category
        const cat = categories.find(c => c.name === t.category && c.type === 'income') || categories.find(c => c.name === t.category);
        processCategory(t.category, t.amount, 'income', cat?.group);
      } else if (t.type === 'expense') {
        if (!t.category) return; // Skip expense without category
        const cat = categories.find(c => c.name === t.category && c.type === 'expense') || categories.find(c => c.name === t.category);
        processCategory(t.category, t.amount, 'expense', cat?.group);
      } else if (t.type === 'split' && t.splits) {
        t.splits.forEach(s => {
          if (s.isLoan) return;
          if (!s.category) return; // Skip splits without category
          // Apply want/need filter for split items
          if (wantNeedFilter !== 'all' && t.splitType === 'expense') {
            const splitSpendingType = s.spendingType || 'need';
            if (splitSpendingType !== wantNeedFilter) return;
          }
          const type = t.splitType || 'expense';
          const cat = categories.find(c => c.name === s.category && c.type === type) || categories.find(c => c.name === s.category);
          processCategory(s.category, s.amount, type, cat?.group);
        });
      }
    });

    // Group categories by their group - build from categories array first to preserve exact order from Category tab
    const groupCategories = (catMap, type) => {
      // Step 1: Build groups from categories array in exact order (same as CategoriesTab)
      const filteredCats = categories.filter(c => c.type === type);
      
      // Build sorted groups with ordered categories (exact same logic as CategoriesTab)
      const orderedGroups = {};
      filteredCats.forEach(cat => {
        const groupName = cat.group || 'Other';
        if (!orderedGroups[groupName]) orderedGroups[groupName] = [];
        orderedGroups[groupName].push(cat);
      });
      // Sort categories within each group by order (same as CategoriesTab)
      Object.keys(orderedGroups).forEach(groupName => {
        orderedGroups[groupName].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      });
      
      // Get sorted group names (same as CategoriesTab sortedGroupNames)
      const grpOrderMap = {};
      filteredCats.forEach(cat => {
        if (cat.group && grpOrderMap[cat.group] === undefined) {
          grpOrderMap[cat.group] = cat.groupOrder ?? 999;
        }
      });

      // Step 2: Build report groups, only including categories that have transaction data
      const groups = {};
      Object.keys(orderedGroups).forEach(groupName => {
        const orderedCatsInGroup = orderedGroups[groupName];
        orderedCatsInGroup.forEach(catDef => {
          if (!catMap.has(catDef.name)) return; // Skip categories without transactions
          const data = catMap.get(catDef.name);
          if (!groups[groupName]) {
            groups[groupName] = { categories: [], months: {}, total: 0, groupOrder: grpOrderMap[groupName] ?? 999 };
          }
          // Push in the same order as Category tab (no need to sort later)
          groups[groupName].categories.push({ name: catDef.name, ...data });
          groups[groupName].total += data.total;
          monthKeys.forEach(mk => {
            groups[groupName].months[mk] = (groups[groupName].months[mk] || 0) + (data.months[mk] || 0);
          });
        });
      });
      
      // Also add any categories from catMap that aren't in the categories array (edge case)
      catMap.forEach((data, catName) => {
        const groupName = data.group || 'Other';
        const alreadyAdded = groups[groupName]?.categories.some(c => c.name === catName);
        if (!alreadyAdded) {
          if (!groups[groupName]) {
            groups[groupName] = { categories: [], months: {}, total: 0, groupOrder: grpOrderMap[groupName] ?? 999 };
          }
          groups[groupName].categories.push({ name: catName, ...data });
          groups[groupName].total += data.total;
          monthKeys.forEach(mk => {
            groups[groupName].months[mk] = (groups[groupName].months[mk] || 0) + (data.months[mk] || 0);
          });
        }
      });

      return groups;
    };

    // Calculate totals per month
    const incomeTotals = {};
    const expenseTotals = {};
    monthKeys.forEach(mk => {
      incomeTotals[mk] = 0;
      expenseTotals[mk] = 0;
    });

    incomeCategories.forEach(data => {
      monthKeys.forEach(mk => {
        incomeTotals[mk] += data.months[mk] || 0;
      });
    });

    expenseCategories.forEach(data => {
      monthKeys.forEach(mk => {
        expenseTotals[mk] += data.months[mk] || 0;
      });
    });

    return {
      months: months.map(m => ({
        key: `${m.year}-${String(m.month + 1).padStart(2, '0')}`,
        label: new Date(m.year, m.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      })),
      income: groupCategories(incomeCategories, 'income'),
      expense: groupCategories(expenseCategories, 'expense'),
      incomeTotals,
      expenseTotals,
      grandTotalIncome: Object.values(incomeTotals).reduce((a, b) => a + b, 0),
      grandTotalExpense: Object.values(expenseTotals).reduce((a, b) => a + b, 0)
    };
  }, [transactions, categories, dateRange, customRange, wantNeedFilter]);

  // Initialize checkedCategories when reportData changes - default to all checked
  useEffect(() => {
    const newChecked = {};
    
    // Mark all income groups and categories as checked
    Object.entries(reportData.income).forEach(([groupName, groupData]) => {
      newChecked[`income-group-${groupName}`] = true;
      groupData.categories.forEach(cat => {
        newChecked[`income-cat-${cat.name}`] = true;
      });
    });
    
    // Mark all expense groups and categories as checked
    Object.entries(reportData.expense).forEach(([groupName, groupData]) => {
      newChecked[`expense-group-${groupName}`] = true;
      groupData.categories.forEach(cat => {
        newChecked[`expense-cat-${cat.name}`] = true;
      });
    });
    
    setCheckedCategories(prev => {
      // Only update if we have new categories (preserve user's unchecked selections)
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(newChecked);
      
      // If this is first load or categories changed significantly, reset to all checked
      if (prevKeys.length === 0) {
        return newChecked;
      }
      
      // Otherwise, merge: keep existing states, add new ones as checked
      const merged = { ...prev };
      newKeys.forEach(key => {
        if (!(key in merged)) {
          merged[key] = true;
        }
      });
      return merged;
    });
  }, [reportData.income, reportData.expense]);

  // Calculate filtered totals based on checked categories
  const filteredReportData = useMemo(() => {
    const filteredIncomeTotals = {};
    const filteredExpenseTotals = {};
    
    reportData.months.forEach(m => {
      filteredIncomeTotals[m.key] = 0;
      filteredExpenseTotals[m.key] = 0;
    });
    
    let filteredGrandTotalIncome = 0;
    let filteredGrandTotalExpense = 0;
    
    // Calculate filtered income totals
    Object.entries(reportData.income).forEach(([groupName, groupData]) => {
      groupData.categories.forEach(cat => {
        if (checkedCategories[`income-cat-${cat.name}`]) {
          filteredGrandTotalIncome += cat.total;
          reportData.months.forEach(m => {
            filteredIncomeTotals[m.key] += cat.months[m.key] || 0;
          });
        }
      });
    });
    
    // Calculate filtered expense totals
    Object.entries(reportData.expense).forEach(([groupName, groupData]) => {
      groupData.categories.forEach(cat => {
        if (checkedCategories[`expense-cat-${cat.name}`]) {
          filteredGrandTotalExpense += cat.total;
          reportData.months.forEach(m => {
            filteredExpenseTotals[m.key] += cat.months[m.key] || 0;
          });
        }
      });
    });
    
    return {
      incomeTotals: filteredIncomeTotals,
      expenseTotals: filteredExpenseTotals,
      grandTotalIncome: filteredGrandTotalIncome,
      grandTotalExpense: filteredGrandTotalExpense
    };
  }, [reportData, checkedCategories]);

  // Toggle category checkbox
  const toggleCategory = (type, categoryName, e) => {
    e.stopPropagation();
    const key = `${type}-cat-${categoryName}`;
    setCheckedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Toggle group checkbox (check/uncheck all categories in group)
  const toggleGroupCheck = (type, groupName, groupData, e) => {
    e.stopPropagation();
    const groupKey = `${type}-group-${groupName}`;
    const isCurrentlyChecked = checkedCategories[groupKey];
    
    const newChecked = { ...checkedCategories };
    newChecked[groupKey] = !isCurrentlyChecked;
    
    // Also toggle all categories in this group
    groupData.categories.forEach(cat => {
      newChecked[`${type}-cat-${cat.name}`] = !isCurrentlyChecked;
    });
    
    setCheckedCategories(newChecked);
  };

  // Check if group is partially checked (some but not all categories checked)
  const isGroupIndeterminate = (type, groupData) => {
    const checkedCount = groupData.categories.filter(
      cat => checkedCategories[`${type}-cat-${cat.name}`]
    ).length;
    return checkedCount > 0 && checkedCount < groupData.categories.length;
  };

  // Check if all categories in group are checked
  const isGroupFullyChecked = (type, groupData) => {
    return groupData.categories.every(
      cat => checkedCategories[`${type}-cat-${cat.name}`]
    );
  };

  // Check if all categories across all groups are checked
  const isAllCategoriesChecked = useMemo(() => {
    const allKeys = [];
    Object.entries(reportData.income).forEach(([groupName, groupData]) => {
      groupData.categories.forEach(cat => {
        allKeys.push(`income-cat-${cat.name}`);
      });
    });
    Object.entries(reportData.expense).forEach(([groupName, groupData]) => {
      groupData.categories.forEach(cat => {
        allKeys.push(`expense-cat-${cat.name}`);
      });
    });
    if (allKeys.length === 0) return true;
    return allKeys.every(key => checkedCategories[key]);
  }, [reportData, checkedCategories]);

  // Check All / Uncheck All functions
  const checkAllCategories = () => {
    const newChecked = {};
    Object.entries(reportData.income).forEach(([groupName, groupData]) => {
      newChecked[`income-group-${groupName}`] = true;
      groupData.categories.forEach(cat => {
        newChecked[`income-cat-${cat.name}`] = true;
      });
    });
    Object.entries(reportData.expense).forEach(([groupName, groupData]) => {
      newChecked[`expense-group-${groupName}`] = true;
      groupData.categories.forEach(cat => {
        newChecked[`expense-cat-${cat.name}`] = true;
      });
    });
    setCheckedCategories(newChecked);
  };

  const uncheckAllCategories = () => {
    const newChecked = {};
    Object.entries(reportData.income).forEach(([groupName, groupData]) => {
      newChecked[`income-group-${groupName}`] = false;
      groupData.categories.forEach(cat => {
        newChecked[`income-cat-${cat.name}`] = false;
      });
    });
    Object.entries(reportData.expense).forEach(([groupName, groupData]) => {
      newChecked[`expense-group-${groupName}`] = false;
      groupData.categories.forEach(cat => {
        newChecked[`expense-cat-${cat.name}`] = false;
      });
    });
    setCheckedCategories(newChecked);
  };

  // --- Section-level (all income / all expense) check helpers ---
  const getSectionCategories = (type) =>
    Object.values(reportData[type] || {}).flatMap(g => g.categories);

  const isSectionFullyChecked = (type) => {
    const cats = getSectionCategories(type);
    return cats.length > 0 && cats.every(cat => checkedCategories[`${type}-cat-${cat.name}`]);
  };

  const isSectionIndeterminate = (type) => {
    const cats = getSectionCategories(type);
    const checked = cats.filter(cat => checkedCategories[`${type}-cat-${cat.name}`]).length;
    return checked > 0 && checked < cats.length;
  };

  const setSectionChecked = (type, checked) => {
    setCheckedCategories(prev => {
      const next = { ...prev };
      Object.entries(reportData[type] || {}).forEach(([groupName, groupData]) => {
        next[`${type}-group-${groupName}`] = checked;
        groupData.categories.forEach(cat => {
          next[`${type}-cat-${cat.name}`] = checked;
        });
      });
      return next;
    });
  };

  const toggleSectionCollapse = (type) => {
    setCollapsedSections(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // Format currency
  const formatCurrency = (val) => {
    if (val === 0 || val === undefined) return '';
    return new Intl.NumberFormat('en-US').format(Math.round(val));
  };

  // Get sorted group entries (by groupOrder, then alphabetical)
  const getSortedGroupEntries = (groups) => {
    return Object.entries(groups).sort(([aName, aData], [bName, bData]) => {
      const orderA = aData.groupOrder ?? 999;
      const orderB = bData.groupOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return aName.localeCompare(bName);
    });
  };

  // Get transactions for a specific category and month
  const getTransactionsForCell = (category, monthKey, type) => {
    return transactions.filter(t => {
      if (!t.date) return false;
      const transMonth = t.date.slice(0, 7);
      if (transMonth !== monthKey) return false;
      
      // Apply want/need filter
      if (wantNeedFilter !== 'all' && type === 'expense') {
        if (t.type === 'expense') {
          const transSpendingType = t.spendingType || 'need';
          if (transSpendingType !== wantNeedFilter) return false;
        }
      }
      
      if (t.type === type && t.category === category) {
        return true;
      }
      
      // Check split transactions
      if (t.type === 'split' && t.splitType === type && t.splits) {
        return t.splits.some(s => !s.isLoan && !s.isTransfer && !s.transferAccount && s.category === category);
      }
      
      return false;
    }).flatMap(t => {
      // For split transactions, create separate entry for each matching split with its own memo
      if (t.type === 'split' && t.splits) {
        const relevantSplits = t.splits.filter(s => !s.isLoan && !s.isTransfer && !s.transferAccount && s.category === category);
        return relevantSplits.map(s => ({
          ...t,
          displayAmount: Math.abs(s.amount),
          isSplit: true,
          splitMemo: s.memo // Store split's memo separately
        }));
      }
      return [{ ...t, displayAmount: Math.abs(t.amount) }];
    });
  };

  // Handle cell click (changed from hover for better stability)
  const handleCellClick = (e, category, monthKey, type, amount) => {
    if (!amount) return;
    const trans = getTransactionsForCell(category, monthKey, type);
    if (trans.length === 0) return;
    
    const rect = e.target.getBoundingClientRect();
    // Position tooltip to the left of the cell, aligned with top
    setTooltip({
      show: true,
      x: rect.left - 320, // Position to the left of the cell
      y: rect.top - 10,   // Align with cell top
      transactions: trans,
      category,
      month: monthKey,
      type,
      total: amount // Store total for display
    });
  };

  // Close tooltip when clicking outside
  const closeTooltip = () => {
    setTooltip(prev => ({ ...prev, show: false }));
  };

  // AmountCell component with click to show transactions
  const AmountCell = ({ amount, category, monthKey, type, className = '' }) => {
    if (!amount) return <td className={`py-1.5 px-3 text-right ${className}`}></td>;
    
    return (
      <td 
        className={`py-1.5 px-3 text-right cursor-pointer hover:bg-yellow-50 hover:underline transition-colors ${className}`}
        onClick={(e) => handleCellClick(e, category, monthKey, type, amount)}
      >
        {formatCurrency(amount)}
      </td>
    );
  };

  // Toggle group expand/collapse
  const toggleGroup = (type, groupName) => {
    const key = `${type}-${groupName}`;
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Expand/Collapse all
  const expandAll = () => {
    const allKeys = {};
    Object.keys(reportData.income).forEach(g => allKeys[`income-${g}`] = true);
    Object.keys(reportData.expense).forEach(g => allKeys[`expense-${g}`] = true);
    setExpandedGroups(allKeys);
  };

  const collapseAll = () => {
    setExpandedGroups({});
  };

  // Export to CSV
  const exportCSV = () => {
    const rows = [];
    const headers = ['Type', 'Group', 'Category', ...reportData.months.map(m => m.label), 'Total VND', 'Total USD'];
    rows.push(headers);

    // Only export categories that are currently checked
    const usdCell = (vnd) => exchangeRate ? roundUSDCents(vnd).toFixed(2) : '';

    const pushSection = (label, type) => {
      rows.push([label, '', '', ...reportData.months.map(() => ''), '', '']);
      getSortedGroupEntries(reportData[type]).forEach(([groupName, groupData]) => {
        const checkedCats = groupData.categories.filter(cat => checkedCategories[`${type}-cat-${cat.name}`]);
        if (checkedCats.length === 0) return; // skip fully-unchecked groups
        const groupTotal = checkedCats.reduce((sum, cat) => sum + cat.total, 0);
        rows.push(['', groupName, '',
          ...reportData.months.map(m => checkedCats.reduce((sum, cat) => sum + (cat.months[m.key] || 0), 0) || ''),
          groupTotal, usdCell(groupTotal)]);
        checkedCats.forEach(cat => {
          rows.push(['', '', cat.name, ...reportData.months.map(m => cat.months[m.key] || ''), cat.total, usdCell(cat.total)]);
        });
      });
    };

    // Income
    pushSection('Income', 'income');
    rows.push(['Total Income', '', '', ...reportData.months.map(m => filteredReportData.incomeTotals[m.key] || ''), filteredReportData.grandTotalIncome, exchangeRate ? sumGroupsUSD('income').toFixed(2) : '']);

    rows.push([]); // Empty row

    // Expense
    pushSection('Expenses', 'expense');
    rows.push(['Total Expenses', '', '', ...reportData.months.map(m => filteredReportData.expenseTotals[m.key] || ''), filteredReportData.grandTotalExpense, exchangeRate ? sumGroupsUSD('expense').toFixed(2) : '']);

    rows.push([]); // Empty row
    const netVND = filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense;
    rows.push(['Net Income', '', '', ...reportData.months.map(m => (filteredReportData.incomeTotals[m.key] || 0) - (filteredReportData.expenseTotals[m.key] || 0)), netVND, exchangeRate ? (sumGroupsUSD('income') - sumGroupsUSD('expense')).toFixed(2) : '']);

    // Convert to CSV string
    const csvContent = rows.map(row => row.map(cell => {
      if (typeof cell === 'string' && cell.includes(',')) {
        return `"${cell}"`;
      }
      return cell;
    }).join(',')).join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `money-tracker-report-${dateRange}-${wantNeedFilter}.csv`;
    link.click();
  };

  if (loading) return <div className="p-8 text-center">Loading reports...</div>;

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 overflow-auto">
      {/* Full width container with padding */}
      <div className="p-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 font-medium"
                title="Back to Reports"
              >
                ← Back
              </button>
              <h1 className="text-xl font-bold text-gray-800">📊 Detailed Reports</h1>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range Filter */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="today">Today</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="this-quarter">This Quarter</option>
                <option value="last-quarter">Last Quarter</option>
                <option value="this-year">This Year</option>
                <option value="last-year">Last Year</option>
                <option value="custom">Custom Range</option>
              </select>

              {/* Custom Range Inputs */}
              {dateRange === 'custom' && (
                <>
                  <div className="flex items-center gap-1">
                    <select
                      value={customRange.from ? customRange.from.split('-')[0] : ''}
                      onChange={(e) => {
                        const year = e.target.value;
                        const month = customRange.from ? customRange.from.split('-')[1] : '';
                        if (year && month) {
                          setCustomRange({ ...customRange, from: `${year}-${month}` });
                        } else if (year) {
                          setCustomRange({ ...customRange, from: `${year}-` });
                        } else {
                          setCustomRange({ ...customRange, from: '' });
                        }
                      }}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="">Year</option>
                      {[2026, 2027, 2028, 2029, 2030].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <select
                      value={customRange.from ? customRange.from.split('-')[1] : ''}
                      onChange={(e) => {
                        const month = e.target.value;
                        const year = customRange.from ? customRange.from.split('-')[0] : '';
                        if (year && month) {
                          setCustomRange({ ...customRange, from: `${year}-${month}` });
                        } else if (month) {
                          setCustomRange({ ...customRange, from: `-${month}` });
                        } else {
                          setCustomRange({ ...customRange, from: year ? `${year}-` : '' });
                        }
                      }}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="flex items-center gap-1">
                    <select
                      value={customRange.to ? customRange.to.split('-')[0] : ''}
                      onChange={(e) => {
                        const year = e.target.value;
                        const month = customRange.to ? customRange.to.split('-')[1] : '';
                        if (year && month) {
                          setCustomRange({ ...customRange, to: `${year}-${month}` });
                        } else if (year) {
                          setCustomRange({ ...customRange, to: `${year}-` });
                        } else {
                          setCustomRange({ ...customRange, to: '' });
                        }
                      }}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="">Year</option>
                      {[2026, 2027, 2028, 2029, 2030].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <select
                      value={customRange.to ? customRange.to.split('-')[1] : ''}
                      onChange={(e) => {
                        const month = e.target.value;
                        const year = customRange.to ? customRange.to.split('-')[0] : '';
                        if (year && month) {
                          setCustomRange({ ...customRange, to: `${year}-${month}` });
                        } else if (month) {
                          setCustomRange({ ...customRange, to: `-${month}` });
                        } else {
                          setCustomRange({ ...customRange, to: year ? `${year}-` : '' });
                        }
                      }}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Want/Need Filter */}
              <select
                value={wantNeedFilter}
                onChange={(e) => setWantNeedFilter(e.target.value)}
                className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="all">All Transactions</option>
                <option value="need">Needs Only</option>
                <option value="want">Wants Only</option>
              </select>

              {/* Export Button */}
              <button
                onClick={exportCSV}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors flex items-center gap-2"
              >
                📥 Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards + Buttons + Table wrapper */}
        <div className="flex justify-center">
          <div className="inline-block">
            {/* Summary Cards */}
            <div className="flex gap-4 mb-4">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="text-sm text-gray-500 mb-1">Total Income</div>
                <div className="text-xl font-bold text-emerald-600">+{formatCurrency(filteredReportData.grandTotalIncome)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="text-sm text-gray-500 mb-1">Total Expenses</div>
                <div className="text-xl font-bold text-red-600">-{formatCurrency(filteredReportData.grandTotalExpense)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="text-sm text-gray-500 mb-1">Net Income</div>
                <div className={`text-xl font-bold ${filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense >= 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense))}
                </div>
              </div>
            </div>

            {/* Exchange Rate Input */}
            <div className="flex justify-center items-center gap-2 mb-4">
              <span className="text-gray-600 text-sm">Exchange Rate:</span>
              <input
                type="text"
                value={displayExchangeRate}
                onChange={handleExchangeRateChange}
                className="w-28 px-3 py-1.5 border rounded-lg text-center font-medium text-gray-700"
                placeholder="30,000"
              />
              <span className="text-gray-600 text-sm">VND = 1 USD</span>
            </div>

            {/* Expand/Collapse Buttons + Check/Uncheck All */}
            <div className="flex gap-2 mb-4 justify-center">
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
              <div className="w-px bg-gray-300 mx-1"></div>
              <button
                onClick={checkAllCategories}
                className={`px-3 py-1 text-sm rounded-lg ${
                  isAllCategoriesChecked 
                    ? 'text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100' 
                    : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isAllCategoriesChecked ? '☑' : '☐'} Check All
              </button>
              <button
                onClick={uncheckAllCategories}
                className={`px-3 py-1 text-sm rounded-lg ${
                  !isAllCategoriesChecked 
                    ? 'text-red-600 bg-red-50 border border-red-200 hover:bg-red-100' 
                    : 'text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {!isAllCategoriesChecked ? '☑' : '☐'} Uncheck All
              </button>
            </div>

            {/* Report Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto flex justify-center">
                <table className="text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-3 px-3 font-semibold text-gray-700 sticky left-0 bg-gray-50 whitespace-nowrap">
                        Category
                      </th>
                      {reportData.months.map(m => (
                        <th key={m.key} className="text-right py-3 px-3 font-semibold text-gray-700 whitespace-nowrap">
                          {m.label}
                        </th>
                      ))}
                      <th className="text-right py-3 px-3 font-semibold text-gray-700 whitespace-nowrap bg-gray-100">
                        Total VND
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-700 whitespace-nowrap bg-gray-100">
                        Total USD
                      </th>
                    </tr>
              </thead>
              <tbody>
                {/* Income Section */}
                <tr className="bg-emerald-50 border-b border-emerald-200">
                  <td colSpan={reportData.months.length + 3} className="py-2 px-3 font-bold text-emerald-700">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSectionFullyChecked('income')}
                        ref={el => { if (el) el.indeterminate = isSectionIndeterminate('income'); }}
                        onChange={(e) => setSectionChecked('income', e.target.checked)}
                        className="w-4 h-4 rounded border-emerald-300 focus:ring-0 cursor-pointer accent-emerald-500"
                        title="Check / uncheck all income"
                      />
                      <button
                        onClick={() => toggleSectionCollapse('income')}
                        className="flex items-center gap-2 hover:opacity-70"
                        title="Collapse / expand income section"
                      >
                        <span>{collapsedSections.income ? '▶' : '▼'}</span>
                        📈 Income
                      </button>
                    </div>
                  </td>
                </tr>
                {!collapsedSections.income && getSortedGroupEntries(reportData.income).map(([groupName, groupData]) => (
                  <React.Fragment key={`income-${groupName}`}>
                    {/* Group Row */}
                    <tr 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleGroup('income', groupName)}
                    >
                      <td className="py-2 px-3 font-medium text-gray-800 sticky left-0 bg-white hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isGroupFullyChecked('income', groupData)}
                            ref={el => {
                              if (el) el.indeterminate = isGroupIndeterminate('income', groupData);
                            }}
                            onChange={(e) => toggleGroupCheck('income', groupName, groupData, e)}
                            className="w-4 h-4 rounded border-blue-200 focus:ring-0 cursor-pointer accent-blue-300"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="mr-1">{expandedGroups[`income-${groupName}`] ? '▼' : '▶'}</span>
                          {groupName}
                        </div>
                      </td>
                      {reportData.months.map(m => {
                        // Calculate filtered amount for this group
                        const filteredAmount = groupData.categories
                          .filter(cat => checkedCategories[`income-cat-${cat.name}`])
                          .reduce((sum, cat) => sum + (cat.months[m.key] || 0), 0);
                        return (
                          <td key={m.key} className={`py-2 px-3 text-right text-emerald-600 ${!isGroupFullyChecked('income', groupData) && !isGroupIndeterminate('income', groupData) ? 'opacity-30' : ''}`}>
                            {formatCurrency(filteredAmount)}
                          </td>
                        );
                      })}
                      <td className={`py-2 px-3 text-right font-medium text-emerald-700 bg-gray-50 ${!isGroupFullyChecked('income', groupData) && !isGroupIndeterminate('income', groupData) ? 'opacity-30' : ''}`}>
                        {formatCurrency(groupData.categories
                          .filter(cat => checkedCategories[`income-cat-${cat.name}`])
                          .reduce((sum, cat) => sum + cat.total, 0))}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium text-emerald-700 bg-gray-50 ${!isGroupFullyChecked('income', groupData) && !isGroupIndeterminate('income', groupData) ? 'opacity-30' : ''}`}>
                        {formatUSD(groupData.categories
                          .filter(cat => checkedCategories[`income-cat-${cat.name}`])
                          .reduce((sum, cat) => sum + cat.total, 0))}
                      </td>
                    </tr>
                    {/* Category Rows */}
                    {expandedGroups[`income-${groupName}`] && groupData.categories.map(cat => {
                      const isChecked = checkedCategories[`income-cat-${cat.name}`];
                      return (
                        <tr key={cat.name} className={`border-b border-gray-50 bg-gray-50/50 ${!isChecked ? 'opacity-40' : ''}`}>
                          <td className="py-1.5 px-3 pl-8 text-gray-600 sticky left-0 bg-gray-50/50">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleCategory('income', cat.name, e)}
                                className="w-3 h-3 rounded border-gray-300 focus:ring-0 cursor-pointer accent-gray-500"
                              />
                              <span className={!isChecked ? 'line-through' : ''}>{cat.name}</span>
                            </div>
                          </td>
                          {reportData.months.map(m => (
                            <AmountCell 
                              key={m.key}
                              amount={isChecked ? cat.months[m.key] : 0} 
                              category={cat.name} 
                              monthKey={m.key} 
                              type="income"
                              className="text-gray-600"
                            />
                          ))}
                          <td className="py-1.5 px-3 text-right text-gray-700 bg-gray-100/50">
                            {isChecked ? formatCurrency(cat.total) : ''}
                          </td>
                          <td className="py-1.5 px-3 text-right text-gray-500 bg-gray-100/50">
                            {isChecked ? formatUSD(cat.total) : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {/* Income Total */}
                <tr className="bg-emerald-100 border-b-2 border-emerald-300">
                  <td className="py-2 px-3 font-bold text-emerald-800 sticky left-0 bg-emerald-100">
                    Total Income
                  </td>
                  {reportData.months.map(m => (
                    <td key={m.key} className="py-2 px-3 text-right font-bold text-emerald-700">
                      {formatCurrency(filteredReportData.incomeTotals[m.key])}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-emerald-800 bg-emerald-200">
                    {formatCurrency(filteredReportData.grandTotalIncome)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-800 bg-emerald-200">
                    {formatUSDAmount(sumGroupsUSD('income'))}
                  </td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={reportData.months.length + 3} className="py-2"></td></tr>

                {/* Expense Section */}
                <tr className="bg-red-50 border-b border-red-200">
                  <td colSpan={reportData.months.length + 3} className="py-2 px-3 font-bold text-red-700">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSectionFullyChecked('expense')}
                        ref={el => { if (el) el.indeterminate = isSectionIndeterminate('expense'); }}
                        onChange={(e) => setSectionChecked('expense', e.target.checked)}
                        className="w-4 h-4 rounded border-red-300 focus:ring-0 cursor-pointer accent-red-500"
                        title="Check / uncheck all expenses"
                      />
                      <button
                        onClick={() => toggleSectionCollapse('expense')}
                        className="flex items-center gap-2 hover:opacity-70"
                        title="Collapse / expand expense section"
                      >
                        <span>{collapsedSections.expense ? '▶' : '▼'}</span>
                        📉 Expenses
                      </button>
                    </div>
                  </td>
                </tr>
                {!collapsedSections.expense && getSortedGroupEntries(reportData.expense).map(([groupName, groupData]) => (
                  <React.Fragment key={`expense-${groupName}`}>
                    {/* Group Row */}
                    <tr 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleGroup('expense', groupName)}
                    >
                      <td className="py-2 px-3 font-medium text-gray-800 sticky left-0 bg-white hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isGroupFullyChecked('expense', groupData)}
                            ref={el => {
                              if (el) el.indeterminate = isGroupIndeterminate('expense', groupData);
                            }}
                            onChange={(e) => toggleGroupCheck('expense', groupName, groupData, e)}
                            className="w-4 h-4 rounded border-blue-200 focus:ring-0 cursor-pointer accent-blue-300"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="mr-1">{expandedGroups[`expense-${groupName}`] ? '▼' : '▶'}</span>
                          {groupName}
                        </div>
                      </td>
                      {reportData.months.map(m => {
                        // Calculate filtered amount for this group
                        const filteredAmount = groupData.categories
                          .filter(cat => checkedCategories[`expense-cat-${cat.name}`])
                          .reduce((sum, cat) => sum + (cat.months[m.key] || 0), 0);
                        return (
                          <td key={m.key} className={`py-2 px-3 text-right text-red-600 ${!isGroupFullyChecked('expense', groupData) && !isGroupIndeterminate('expense', groupData) ? 'opacity-30' : ''}`}>
                            {formatCurrency(filteredAmount)}
                          </td>
                        );
                      })}
                      <td className={`py-2 px-3 text-right font-medium text-red-700 bg-gray-50 ${!isGroupFullyChecked('expense', groupData) && !isGroupIndeterminate('expense', groupData) ? 'opacity-30' : ''}`}>
                        {formatCurrency(groupData.categories
                          .filter(cat => checkedCategories[`expense-cat-${cat.name}`])
                          .reduce((sum, cat) => sum + cat.total, 0))}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium text-red-700 bg-gray-50 ${!isGroupFullyChecked('expense', groupData) && !isGroupIndeterminate('expense', groupData) ? 'opacity-30' : ''}`}>
                        {formatUSD(groupData.categories
                          .filter(cat => checkedCategories[`expense-cat-${cat.name}`])
                          .reduce((sum, cat) => sum + cat.total, 0))}
                      </td>
                    </tr>
                    {/* Category Rows */}
                    {expandedGroups[`expense-${groupName}`] && groupData.categories.map(cat => {
                      const isChecked = checkedCategories[`expense-cat-${cat.name}`];
                      return (
                        <tr key={cat.name} className={`border-b border-gray-50 bg-gray-50/50 ${!isChecked ? 'opacity-40' : ''}`}>
                          <td className="py-1.5 px-3 pl-8 text-gray-600 sticky left-0 bg-gray-50/50">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleCategory('expense', cat.name, e)}
                                className="w-3 h-3 rounded border-gray-300 focus:ring-0 cursor-pointer accent-gray-500"
                              />
                              <span className={!isChecked ? 'line-through' : ''}>{cat.name}</span>
                            </div>
                          </td>
                          {reportData.months.map(m => (
                            <AmountCell 
                              key={m.key}
                              amount={isChecked ? cat.months[m.key] : 0} 
                              category={cat.name} 
                              monthKey={m.key} 
                              type="expense"
                              className="text-gray-600"
                            />
                          ))}
                          <td className="py-1.5 px-3 text-right text-gray-700 bg-gray-100/50">
                            {isChecked ? formatCurrency(cat.total) : ''}
                          </td>
                          <td className="py-1.5 px-3 text-right text-gray-500 bg-gray-100/50">
                            {isChecked ? formatUSD(cat.total) : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {/* Expense Total */}
                <tr className="bg-red-100 border-b-2 border-red-300">
                  <td className="py-2 px-3 font-bold text-red-800 sticky left-0 bg-red-100">
                    Total Expenses
                  </td>
                  {reportData.months.map(m => (
                    <td key={m.key} className="py-2 px-3 text-right font-bold text-red-700">
                      {formatCurrency(filteredReportData.expenseTotals[m.key])}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-bold text-red-800 bg-red-200">
                    {formatCurrency(filteredReportData.grandTotalExpense)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-red-800 bg-red-200">
                    {formatUSDAmount(sumGroupsUSD('expense'))}
                  </td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={reportData.months.length + 3} className="py-2"></td></tr>

                {/* Net Income */}
                <tr className="bg-blue-50 border-2 border-blue-200">
                  <td className="py-3 px-3 font-bold text-blue-800 sticky left-0 bg-blue-50">
                    💰 Net Income
                  </td>
                  {reportData.months.map(m => {
                    const net = (filteredReportData.incomeTotals[m.key] || 0) - (filteredReportData.expenseTotals[m.key] || 0);
                    return (
                      <td key={m.key} className={`py-3 px-3 text-right font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net))}
                      </td>
                    );
                  })}
                  <td className={`py-3 px-3 text-right font-bold ${filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense >= 0 ? 'text-emerald-700' : 'text-red-700'} bg-blue-100`}>
                    {filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense >= 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense))}
                  </td>
                  <td className={`py-3 px-3 text-right font-bold ${filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense >= 0 ? 'text-emerald-700' : 'text-red-700'} bg-blue-100`}>
                    {filteredReportData.grandTotalIncome - filteredReportData.grandTotalExpense >= 0 ? '+' : '-'}
                    {formatUSDAmount(Math.abs(sumGroupsUSD('income') - sumGroupsUSD('expense')))}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>

        {/* Footer Note */}
        <div className="mt-4 text-center text-sm text-gray-500">
          {wantNeedFilter !== 'all' && (
            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Filtered: {wantNeedFilter === 'want' ? 'Wants' : 'Needs'} only
            </span>
          )}
        </div>
      </div>

      {/* Tooltip for transaction details */}
      {tooltip.show && tooltip.transactions.length > 0 && (
        <>
          {/* Overlay to close tooltip when clicking outside */}
          <div 
            className="fixed inset-0 z-40"
            onClick={closeTooltip}
          />
          <div 
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-50 w-80"
            style={{ 
              left: Math.max(10, tooltip.x), 
              top: Math.max(10, Math.min(tooltip.y, window.innerHeight - 350))
            }}
          >
            {/* Header with category and total */}
            <div className={`px-3 py-2 rounded-t-lg ${tooltip.type === 'income' ? 'bg-emerald-50 border-b border-emerald-200' : 'bg-red-50 border-b border-red-200'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className={`font-semibold ${tooltip.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {tooltip.category}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(tooltip.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className={`font-bold text-lg ${tooltip.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tooltip.type === 'expense' ? '-' : ''}{formatCurrency(tooltip.total)}
                  </div>
                  <button 
                    onClick={closeTooltip}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
            
            {/* Transaction list */}
            <div className="max-h-60 overflow-y-auto">
              {tooltip.transactions.map((t, idx) => {
                // Use splitMemo for split transactions, fallback to main memo
                const displayMemo = t.isSplit ? (t.splitMemo || t.memo) : t.memo;
                return (
                  <div 
                    key={t.id + '-' + idx}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                    onClick={() => {
                      setEditTransaction(t);
                      setTooltip({ ...tooltip, show: false });
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-800 truncate">
                          {t.payee || 'No Payee'}
                          {t.isSplit && <span className="ml-1 text-xs text-purple-600">(split)</span>}
                        </div>
                        <div className="text-xs text-gray-400">
                          {t.date}
                          {displayMemo && <span className="text-gray-500"> • {displayMemo}</span>}
                        </div>
                      </div>
                      <div className="font-medium ml-2 text-gray-700">
                        {formatCurrency(t.displayAmount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Footer */}
            <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-500 rounded-b-lg text-center">
              Click transaction to edit
            </div>
          </div>
        </>
      )}

      {/* Edit Transaction Modal */}
      {editTransaction && (
        <AddTransactionModal
          isOpen={!!editTransaction}
          onClose={() => setEditTransaction(null)}
          editTransaction={editTransaction}
          onSave={() => setEditTransaction(null)}
        />
      )}
    </div>
  );
};

export default DesktopReports;
