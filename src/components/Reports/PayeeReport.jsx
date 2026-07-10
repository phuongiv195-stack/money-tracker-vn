import React, { useState, useMemo } from 'react';
import AddTransactionModal from '../Transactions/AddTransactionModal';

const PayeeReport = ({ transactions, categories: categoriesData, onBack }) => {
  // Filter mode state
  const [dateRange, setDateRange] = useState('this-month');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sortBy, setSortBy] = useState('amount');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1080);
  const [searchPayee, setSearchPayee] = useState(''); // Search payee state
  
  // View mode state: 'byCategory' | 'byPayee'
  const [viewMode, setViewMode] = useState('byCategory');
  
  // Expanded categories state for By Category view
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Show/hide Categories column in By Payee view
  const [showCategoriesColumn, setShowCategoriesColumn] = useState(true);

  // Compare mode state
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareType, setCompareType] = useState('months'); // 'months' | 'years'
  const [compareFromMonth, setCompareFromMonth] = useState('01');
  const [compareFromYear, setCompareFromYear] = useState('2026');
  const [compareToMonth, setCompareToMonth] = useState('01');
  const [compareToYear, setCompareToYear] = useState('2026');

  // Transaction popup state
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, transactions: [], payee: '', category: '', total: 0 });
  const [editTransaction, setEditTransaction] = useState(null);

  // Block mobile access
  if (!isDesktop) {
    return (
      <div className="fixed inset-0 bg-gray-100 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm text-center">
          <div className="text-6xl mb-4">🖥️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Desktop Only</h2>
          <p className="text-gray-600 mb-4">
            Payee Report requires a larger screen to display properly.
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
          >
            ← Back to Reports
          </button>
        </div>
      </div>
    );
  }

  // Format currency
  const formatCurrency = (amount) => {
    return Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  // Format date as YYYY/MM/DD
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  // Get date range based on selection (for filter mode)
  const getDateRangeValues = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let startDate, endDate;
    
    switch (dateRange) {
      case 'this-month':
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'last-month':
        startDate = new Date(currentYear, currentMonth - 1, 1);
        endDate = new Date(currentYear, currentMonth, 0);
        break;
      case 'last-3-months':
        startDate = new Date(currentYear, currentMonth - 2, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'last-6-months':
        startDate = new Date(currentYear, currentMonth - 5, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'last-12-months':
        startDate = new Date(currentYear, currentMonth - 11, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'year-to-date':
        startDate = new Date(currentYear, 0, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'last-year':
        startDate = new Date(currentYear - 1, 0, 1);
        endDate = new Date(currentYear - 1, 11, 31);
        break;
      case 'q1':
        startDate = new Date(currentYear, 0, 1);
        endDate = new Date(currentYear, 2, 31);
        break;
      case 'q2':
        startDate = new Date(currentYear, 3, 1);
        endDate = new Date(currentYear, 5, 30);
        break;
      case 'q3':
        startDate = new Date(currentYear, 6, 1);
        endDate = new Date(currentYear, 8, 30);
        break;
      case 'q4':
        startDate = new Date(currentYear, 9, 1);
        endDate = new Date(currentYear, 11, 31);
        break;
      case 'all':
        startDate = new Date(2020, 0, 1);
        endDate = new Date(currentYear + 10, 11, 31);
        break;
      default:
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
    }
    
    return { startDate, endDate };
  }, [dateRange]);

  // Get label for current date range with actual period
  const getDateRangeLabel = () => {
    const { startDate, endDate } = getDateRangeValues;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // For single month periods, show "Mon YYYY"
    if (dateRange === 'this-month' || dateRange === 'last-month') {
      return `${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;
    }
    
    // For year periods
    if (dateRange === 'last-year') {
      return `${startDate.getFullYear()}`;
    }
    
    // For quarters
    if (dateRange.startsWith('q')) {
      return `Q${dateRange.charAt(1)} ${startDate.getFullYear()}`;
    }
    
    // For ranges, show "Mon YYYY - Mon YYYY"
    if (dateRange === 'all') {
      return 'All Time';
    }
    
    return `${monthNames[startDate.getMonth()]} ${startDate.getFullYear()} - ${monthNames[endDate.getMonth()]} ${endDate.getFullYear()}`;
  };

  const dateRangeOptions = [
    { value: 'this-month', label: 'This Month' },
    { value: 'last-month', label: 'Last Month' },
    { value: 'last-3-months', label: 'Last 3 Months' },
    { value: 'last-6-months', label: 'Last 6 Months' },
    { value: 'last-12-months', label: 'Last 12 Months' },
    { value: 'year-to-date', label: 'Year To Date' },
    { value: 'last-year', label: 'Last Year' },
    { value: 'q1', label: 'Q1' },
    { value: 'q2', label: 'Q2' },
    { value: 'q3', label: 'Q3' },
    { value: 'q4', label: 'Q4' },
    { value: 'all', label: 'All Time' }
  ];

  // Get compare label
  const getCompareLabel = () => {
    if (compareType === 'months') {
      const fromLabel = `${new Date(2000, parseInt(compareFromMonth) - 1).toLocaleString('en-US', {month: 'short'})} ${compareFromYear}`;
      const toLabel = `${new Date(2000, parseInt(compareToMonth) - 1).toLocaleString('en-US', {month: 'short'})} ${compareToYear}`;
      return `${fromLabel} → ${toLabel}`;
    } else {
      return `${compareFromYear} → ${compareToYear}`;
    }
  };

  // Get all expense transactions with payee (including split transactions)
  const expenseTransactions = useMemo(() => {
    const result = [];
    
    transactions.forEach(t => {
      if (t.isFuture) return;
      
      // Regular expense transactions
      if (t.type === 'expense' && t.payee && t.payee.trim() !== '') {
        result.push(t);
      }
      
      // Split transactions - expand each split into a virtual transaction
      if (t.type === 'split' && t.splitType === 'expense' && t.splits) {
        t.splits.forEach(split => {
          if (!split.isLoan && split.category) {
            // Use parent payee, or category name as fallback
            const payee = (t.payee && t.payee.trim() !== '') ? t.payee : split.category;
            result.push({
              ...t,
              // Override with split-specific data
              payee: payee,
              amount: split.amount,
              category: split.category,
              memo: split.memo || t.memo,
              // Keep original date from parent transaction
              _isSplit: true,
              _splitId: split.id
            });
          }
        });
      }
    });
    
    return result;
  }, [transactions]);

  // Create category name -> icon map
  const categoryIconMap = useMemo(() => {
    const map = {};
    if (categoriesData && Array.isArray(categoriesData)) {
      categoriesData.forEach(cat => {
        if (cat.name && cat.icon) {
          map[cat.name] = cat.icon;
        }
      });
    }
    return map;
  }, [categoriesData]);

  // Build hierarchical category structure for filter dropdown (same logic as CategoriesTab)
  const hierarchicalCategories = useMemo(() => {
    const groups = {};
    categoriesData.forEach(cat => {
      if (cat.type !== 'expense') return;
      const groupName = cat.group || 'Other';
      if (!groups[groupName]) {
        groups[groupName] = {
          icon: '',
          groupOrder: cat.groupOrder ?? 999,
          items: []
        };
      }
      if ((cat.groupOrder ?? 999) < groups[groupName].groupOrder) {
        groups[groupName].groupOrder = cat.groupOrder ?? 999;
      }
      groups[groupName].items.push(cat);
    });

    // Sort items within each group by order
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      if (g.items.length > 0 && g.items[0].icon) {
        g.icon = g.items[0].icon;
      }
    });

    // Sort groups by groupOrder
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      const diff = groups[a].groupOrder - groups[b].groupOrder;
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    return { groups, sortedGroupNames };
  }, [categoriesData]);

  // Get the set of category names that match the current filter
  const filteredCategoryNames = useMemo(() => {
    if (categoryFilter === 'all') return null;
    if (categoryFilter.startsWith('group:')) {
      const groupName = categoryFilter.slice(6);
      const group = hierarchicalCategories.groups[groupName];
      if (!group) return new Set();
      return new Set(group.items.map(c => c.name));
    }
    return new Set([categoryFilter]);
  }, [categoryFilter, hierarchicalCategories]);

  // Generate compare periods
  const comparePeriods = useMemo(() => {
    if (!isCompareMode) return [];
    
    const periods = [];
    
    if (compareType === 'months') {
      const fromDate = new Date(parseInt(compareFromYear), parseInt(compareFromMonth) - 1, 1);
      const toDate = new Date(parseInt(compareToYear), parseInt(compareToMonth) - 1, 1);
      
      let current = new Date(fromDate);
      while (current <= toDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        periods.push({
          type: 'month',
          year,
          month,
          key: `${year}-${String(month).padStart(2, '0')}`,
          label: `${new Date(2000, month - 1).toLocaleString('en-US', {month: 'short'})} ${year}`
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      // Years
      const fromYear = parseInt(compareFromYear);
      const toYear = parseInt(compareToYear);
      for (let year = fromYear; year <= toYear; year++) {
        periods.push({
          type: 'year',
          year,
          key: String(year),
          label: String(year)
        });
      }
    }
    
    return periods;
  }, [isCompareMode, compareType, compareFromMonth, compareFromYear, compareToMonth, compareToYear]);

  // Filter transactions by date range and category (for filter mode)
  const filteredTransactions = useMemo(() => {
    if (isCompareMode) {
      // For compare mode, get all transactions within the compare range
      let filtered = expenseTransactions;
      
      if (compareType === 'months') {
        const fromDate = new Date(parseInt(compareFromYear), parseInt(compareFromMonth) - 1, 1);
        const toDate = new Date(parseInt(compareToYear), parseInt(compareToMonth), 0);
        const startStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
        const endStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;
        
        filtered = filtered.filter(t => {
          if (!t.date) return false;
          return t.date >= startStr && t.date <= endStr;
        });
      } else {
        const fromYear = parseInt(compareFromYear);
        const toYear = parseInt(compareToYear);
        filtered = filtered.filter(t => {
          if (!t.date) return false;
          const tYear = new Date(t.date).getFullYear();
          return tYear >= fromYear && tYear <= toYear;
        });
      }
      
      if (filteredCategoryNames) {
        filtered = filtered.filter(t => filteredCategoryNames.has(t.category));
      }
      
      return filtered;
    }
    
    // Normal filter mode - use local date format YYYY-MM-DD
    const { startDate, endDate } = getDateRangeValues;
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    let filtered = expenseTransactions.filter(t => {
      if (!t.date) return false;
      if (t.date < startStr || t.date > endStr) return false;
      return true;
    });

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }

    return filtered;
  }, [expenseTransactions, isCompareMode, compareType, compareFromMonth, compareFromYear, compareToMonth, compareToYear, getDateRangeValues, filteredCategoryNames]);

  // Aggregate data by payee AND category (for filter mode and compare mode)
  // This ensures same payee with different categories (from splits) are tracked separately
  const payeeDataWithCategory = useMemo(() => {
    const data = {};

    filteredTransactions.forEach(t => {
      const category = t.category || 'Uncategorized';
      const key = `${t.payee}|||${category}`; // Unique key per payee-category combo
      
      if (!data[key]) {
        data[key] = {
          payee: t.payee,
          category: category,
          count: 0,
          totalAmount: 0,
          lastDate: t.date,
          periodData: {}
        };
      }

      const amount = Math.abs(t.amount);
      data[key].count++;
      data[key].totalAmount += amount;
      
      if (new Date(t.date) > new Date(data[key].lastDate)) {
        data[key].lastDate = t.date;
      }

      // For compare mode, track by period
      if (isCompareMode && comparePeriods.length > 0) {
        const tDate = new Date(t.date);
        const tYear = tDate.getFullYear();
        const tMonth = tDate.getMonth() + 1;
        
        comparePeriods.forEach(period => {
          let matches = false;
          if (period.type === 'month') {
            matches = tYear === period.year && tMonth === period.month;
          } else {
            matches = tYear === period.year;
          }
          
          if (matches) {
            if (!data[key].periodData[period.key]) {
              data[key].periodData[period.key] = { count: 0, amount: 0 };
            }
            data[key].periodData[period.key].count++;
            data[key].periodData[period.key].amount += amount;
          }
        });
      }
    });

    // Calculate average
    Object.values(data).forEach(item => {
      item.avgAmount = item.count > 0 ? item.totalAmount / item.count : 0;
    });

    // Filter by search term
    let result = Object.values(data);
    if (searchPayee.trim()) {
      const searchLower = searchPayee.toLowerCase().trim();
      result = result.filter(item => 
        item.payee.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [filteredTransactions, isCompareMode, comparePeriods, searchPayee]);

  // Group by category and sort
  const groupedByCategory = useMemo(() => {
    const grouped = {};
    
    payeeDataWithCategory.forEach(item => {
      const cat = item.category;
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(item);
    });

    // Sort payees within each category
    Object.keys(grouped).forEach(cat => {
      if (sortBy === 'amount') {
        grouped[cat].sort((a, b) => b.totalAmount - a.totalAmount);
      } else if (sortBy === 'count') {
        grouped[cat].sort((a, b) => b.count - a.count);
      } else if (sortBy === 'avg') {
        grouped[cat].sort((a, b) => b.avgAmount - a.avgAmount);
      } else if (sortBy === 'lastDate') {
        grouped[cat].sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
      }
    });

    // Calculate totals for each category
    const categoryTotals = {};
    Object.keys(grouped).forEach(cat => {
      categoryTotals[cat] = {
        count: grouped[cat].reduce((sum, p) => sum + p.count, 0),
        amount: grouped[cat].reduce((sum, p) => sum + p.totalAmount, 0),
        payeeCount: grouped[cat].length,
        periodData: {}
      };
      
      // Sum period data for category
      if (isCompareMode) {
        comparePeriods.forEach(period => {
          categoryTotals[cat].periodData[period.key] = { count: 0, amount: 0 };
          grouped[cat].forEach(payee => {
            const pd = payee.periodData[period.key];
            if (pd) {
              categoryTotals[cat].periodData[period.key].count += pd.count;
              categoryTotals[cat].periodData[period.key].amount += pd.amount;
            }
          });
        });
      }
    });

    // Sort categories by total amount
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      return categoryTotals[b].amount - categoryTotals[a].amount;
    });

    return { grouped, sortedCategories, categoryTotals };
  }, [payeeDataWithCategory, sortBy, isCompareMode, comparePeriods]);

  // Aggregate by payee only (merge all categories)
  const payeeOnlyData = useMemo(() => {
    const data = {};

    filteredTransactions.forEach(t => {
      const payee = t.payee;
      
      if (!data[payee]) {
        data[payee] = {
          payee: payee,
          categories: new Set(),
          count: 0,
          countedTransactions: new Set(), // Track unique transaction IDs
          totalAmount: 0,
          lastDate: t.date,
          periodData: {}
        };
      }

      const amount = Math.abs(t.amount);
      
      // Only count unique transactions (not each split separately)
      if (!data[payee].countedTransactions.has(t.id)) {
        data[payee].count++;
        data[payee].countedTransactions.add(t.id);
      }
      
      data[payee].totalAmount += amount;
      data[payee].categories.add(t.category || 'Uncategorized');
      
      if (new Date(t.date) > new Date(data[payee].lastDate)) {
        data[payee].lastDate = t.date;
      }

      // For compare mode, track by period
      if (isCompareMode && comparePeriods.length > 0) {
        const tDate = new Date(t.date);
        const tYear = tDate.getFullYear();
        const tMonth = tDate.getMonth() + 1;
        
        comparePeriods.forEach(period => {
          let matches = false;
          if (period.type === 'month') {
            matches = tYear === period.year && tMonth === period.month;
          } else {
            matches = tYear === period.year;
          }
          
          if (matches) {
            if (!data[payee].periodData[period.key]) {
              data[payee].periodData[period.key] = { count: 0, amount: 0, countedTransactions: new Set() };
            }
            // Only count unique transactions per period
            if (!data[payee].periodData[period.key].countedTransactions.has(t.id)) {
              data[payee].periodData[period.key].count++;
              data[payee].periodData[period.key].countedTransactions.add(t.id);
            }
            data[payee].periodData[period.key].amount += amount;
          }
        });
      }
    });

    // Convert Set to Array and calculate average
    let result = Object.values(data).map(item => ({
      ...item,
      categories: Array.from(item.categories),
      avgAmount: item.count > 0 ? item.totalAmount / item.count : 0
    }));

    // Filter by search term
    if (searchPayee.trim()) {
      const searchLower = searchPayee.toLowerCase().trim();
      result = result.filter(item => 
        item.payee.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    if (sortBy === 'amount') {
      result.sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (sortBy === 'count') {
      result.sort((a, b) => b.count - a.count);
    } else if (sortBy === 'avg') {
      result.sort((a, b) => b.avgAmount - a.avgAmount);
    } else if (sortBy === 'lastDate') {
      result.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
    }

    return result;
  }, [filteredTransactions, sortBy, isCompareMode, comparePeriods, searchPayee]);

  // Get transactions for a specific payee (and optionally category and period)
  const getTransactionsForPayee = (payee, category = null, periodKey = null) => {
    return filteredTransactions.filter(t => {
      if (t.payee !== payee) return false;
      if (category && t.category !== category) return false;
      
      // Filter by period if specified
      if (periodKey) {
        const tDate = new Date(t.date);
        const tYear = tDate.getFullYear();
        const tMonth = tDate.getMonth() + 1;
        
        // Parse period key (format: "2026-01" for month or "2026" for year)
        if (periodKey.includes('-')) {
          // Month format
          const [pYear, pMonth] = periodKey.split('-').map(Number);
          if (tYear !== pYear || tMonth !== pMonth) return false;
        } else {
          // Year format
          const pYear = Number(periodKey);
          if (tYear !== pYear) return false;
        }
      }
      
      return true;
    }).map(t => ({
      ...t,
      displayAmount: Math.abs(t.amount)
    }));
  };

  // Handle amount cell click
  const handleAmountClick = (e, payee, category, amount, periodKey = null) => {
    if (!amount) return;
    const trans = getTransactionsForPayee(payee, category, periodKey);
    if (trans.length === 0) return;
    
    const rect = e.target.getBoundingClientRect();
    setTooltip({
      show: true,
      x: rect.left - 320,
      y: rect.top - 10,
      transactions: trans,
      payee,
      category,
      total: amount
    });
  };

  // Close tooltip
  const closeTooltip = () => {
    setTooltip(prev => ({ ...prev, show: false }));
  };

  // Date Picker Modal (without Custom)
  const renderDatePicker = () => {
    if (!showDatePicker) return null;
    
    const options = [
      { value: 'this-month', label: 'This Month' },
      { value: 'last-month', label: 'Last Month' },
      { value: 'last-3-months', label: 'Last 3 Months' },
      { value: 'last-6-months', label: 'Last 6 Months' },
      { value: 'last-12-months', label: 'Last 12 Months' },
      { value: 'year-to-date', label: 'Year To Date' },
      { value: 'last-year', label: 'Last Year' },
      { value: 'all', label: 'All Dates' },
      { value: 'q1', label: 'Q1 (Jan - Mar)' },
      { value: 'q2', label: 'Q2 (Apr - Jun)' },
      { value: 'q3', label: 'Q3 (Jul - Sep)' },
      { value: 'q4', label: 'Q4 (Oct - Dec)' },
    ];

    return (
      <div 
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
        onClick={() => setShowDatePicker(false)}
      >
        <div 
          className="bg-white rounded-xl shadow-2xl w-96 max-h-[80vh] overflow-auto" 
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 space-y-1">
            {options.map(opt => (
              <div
                key={opt.value}
                className={`p-3 rounded-lg cursor-pointer transition ${dateRange === opt.value ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}
                onClick={() => {
                  setDateRange(opt.value);
                  setShowDatePicker(false);
                }}
              >
                <div className="flex justify-between">
                  <span>{opt.label}</span>
                  {dateRange === opt.value && <span>✓</span>}
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t">
            <button 
              onClick={() => setShowDatePicker(false)} 
              className="w-full py-2.5 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Compare Modal
  const renderCompareModal = () => {
    if (!showCompareModal) return null;

    return (
      <div 
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
        onClick={() => setShowCompareModal(false)}
      >
        <div 
          className="bg-white rounded-xl shadow-2xl w-96" 
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 border-b">
            <h3 className="text-lg font-bold text-gray-800">Compare Periods</h3>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Compare Type */}
            <div>
              <label className="text-sm text-gray-500 block mb-2">Compare Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCompareType('months')}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    compareType === 'months' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Months
                </button>
                <button
                  onClick={() => setCompareType('years')}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    compareType === 'years' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Years
                </button>
              </div>
            </div>
            
            {/* From */}
            <div>
              <label className="text-sm text-gray-500 block mb-2">From</label>
              <div className="flex gap-2">
                {compareType === 'months' && (
                  <select
                    value={compareFromMonth}
                    onChange={e => setCompareFromMonth(e.target.value)}
                    className="flex-1 p-3 border rounded-lg"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i+1} value={String(i+1).padStart(2,'0')}>
                        {new Date(2000, i, 1).toLocaleString('en-US', {month: 'short'})}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={compareFromYear}
                  onChange={e => setCompareFromYear(e.target.value)}
                  className="flex-1 p-3 border rounded-lg"
                >
                  {[...Array(10)].map((_, i) => (
                    <option key={2026+i} value={2026+i}>{2026+i}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* To */}
            <div>
              <label className="text-sm text-gray-500 block mb-2">To</label>
              <div className="flex gap-2">
                {compareType === 'months' && (
                  <select
                    value={compareToMonth}
                    onChange={e => setCompareToMonth(e.target.value)}
                    className="flex-1 p-3 border rounded-lg"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i+1} value={String(i+1).padStart(2,'0')}>
                        {new Date(2000, i, 1).toLocaleString('en-US', {month: 'short'})}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={compareToYear}
                  onChange={e => setCompareToYear(e.target.value)}
                  className="flex-1 p-3 border rounded-lg"
                >
                  {[...Array(10)].map((_, i) => (
                    <option key={2026+i} value={2026+i}>{2026+i}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t flex gap-3">
            <button 
              onClick={() => setShowCompareModal(false)} 
              className="flex-1 py-2.5 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                setIsCompareMode(true);
                setShowCompareModal(false);
              }} 
              className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 overflow-auto">
      <div className="p-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm mb-4">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={onBack}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 font-medium"
                >
                  ← Back
                </button>
                <h1 className="text-2xl font-bold text-gray-800">
                  📊 Payee Report
                </h1>
                
                {/* Date Range Button (only show in filter mode) */}
                {!isCompareMode && (
                  <button
                    onClick={() => setShowDatePicker(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    <span>📅</span>
                    <span className="font-medium">{getDateRangeLabel()}</span>
                    <span>▼</span>
                  </button>
                )}
                
                {/* Compare Mode Label */}
                {isCompareMode && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg">
                    <span>⚖️</span>
                    <span className="font-medium">{getCompareLabel()}</span>
                  </div>
                )}
                
                {/* Compare Button */}
                {!isCompareMode ? (
                  <button
                    onClick={() => setShowCompareModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                  >
                    <span>⚖️</span>
                    <span className="font-medium">Compare</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCompareMode(false)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    <span>✕</span>
                    <span className="font-medium">Exit Compare</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 bg-gray-50 flex flex-wrap items-end gap-4 justify-center">
            {/* View Mode Toggle */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">View</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  onClick={() => setViewMode('byCategory')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'byCategory'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  By Category
                </button>
                <button
                  onClick={() => setViewMode('byPayee')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'byPayee'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  By Payee
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-1">Category Filter</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="p-2 border rounded-lg bg-white"
              >
                <option value="all">All Categories</option>
                {hierarchicalCategories.sortedGroupNames.map(groupName => {
                  const group = hierarchicalCategories.groups[groupName];
                  return (
                    <optgroup key={groupName} label={`${group.icon ? group.icon + ' ' : ''}${groupName}`}>
                      <option value={`group:${groupName}`}>
                        All {groupName}
                      </option>
                      {group.items.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {cat.icon ? cat.icon + ' ' : ''}{cat.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="p-2 border rounded-lg bg-white"
              >
                <option value="amount">Total Amount</option>
                <option value="count">Transaction Counts</option>
                <option value="avg">Average Amount</option>
                <option value="lastDate">Last Purchase</option>
              </select>
            </div>

            {/* Search Payee */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">Search Payee</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchPayee}
                  onChange={(e) => setSearchPayee(e.target.value)}
                  placeholder="Type to search..."
                  className="p-2 pl-8 border rounded-lg bg-white w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                {searchPayee && (
                  <button
                    onClick={() => setSearchPayee('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Card + Table wrapper for By Category */}
        {!isCompareMode && viewMode === 'byCategory' && (
          <div className="flex justify-center">
            <div className="inline-block">
              {/* Summary Card */}
              <div className="bg-white rounded-xl shadow-sm mb-4 p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {payeeDataWithCategory.length}
                    </div>
                    <div className="text-xs text-gray-500">Payees</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-600">
                      {payeeDataWithCategory.reduce((sum, p) => sum + p.count, 0)}
                    </div>
                    <div className="text-xs text-gray-500">Transactions</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(payeeDataWithCategory.reduce((sum, p) => sum + p.totalAmount, 0))}
                    </div>
                    <div className="text-xs text-gray-500">Total Spent</div>
                  </div>
                </div>
              </div>

              {/* Data Table - By Category */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Expand/Collapse buttons */}
                <div className="p-3 border-b bg-gray-50 flex gap-2">
                  <button
                    onClick={() => {
                      const allExpanded = {};
                      groupedByCategory.sortedCategories.forEach(cat => { allExpanded[cat] = true; });
                      setExpandedCategories(allExpanded);
                    }}
                    className="text-sm text-gray-600 px-3 py-1 bg-white rounded-lg border border-gray-200 hover:bg-gray-100"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={() => {
                      const allCollapsed = {};
                      groupedByCategory.sortedCategories.forEach(cat => { allCollapsed[cat] = false; });
                      setExpandedCategories(allCollapsed);
                    }}
                    className="text-sm text-gray-600 px-3 py-1 bg-white rounded-lg border border-gray-200 hover:bg-gray-100"
                  >
                    Collapse All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700">Payee</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700">Count</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700">Total</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700">Avg</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700">Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedByCategory.sortedCategories.map((category, catIdx) => {
                        const isExpanded = expandedCategories[category] !== false; // default expanded
                        return (
                          <React.Fragment key={catIdx}>
                            {/* Category Header Row */}
                            <tr 
                              className="bg-emerald-50 border-t-2 border-emerald-200 cursor-pointer hover:bg-emerald-100"
                              onClick={() => setExpandedCategories(prev => ({ ...prev, [category]: prev[category] === false ? true : false }))}
                            >
                              <td className="px-3 py-2 font-bold text-emerald-800">
                                <span className={`inline-block w-4 text-xs text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                <span className="mr-1">{categoryIconMap[category] || '📂'}</span> {category}
                                <span className="ml-2 text-sm font-normal text-emerald-600">
                                  ({groupedByCategory.categoryTotals[category].payeeCount} payee{groupedByCategory.categoryTotals[category].payeeCount > 1 ? 's' : ''})
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-emerald-700">
                                {groupedByCategory.categoryTotals[category].count}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-red-600">
                                {formatCurrency(groupedByCategory.categoryTotals[category].amount)}
                              </td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2"></td>
                            </tr>
                            {/* Payees in this category */}
                            {isExpanded && groupedByCategory.grouped[category].map((item, idx) => (
                              <tr key={idx} className="border-b hover:bg-gray-50">
                                <td className="px-3 py-1.5 text-gray-800 pl-8">{item.payee}</td>
                                <td className="px-3 py-1.5 text-right text-gray-600">{item.count}</td>
                                <td 
                                  className="px-3 py-1.5 text-right text-red-600 font-medium cursor-pointer hover:bg-yellow-50 hover:underline"
                                  onClick={(e) => handleAmountClick(e, item.payee, item.category, item.totalAmount)}
                                >
                                  {formatCurrency(item.totalAmount)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-600">{formatCurrency(item.avgAmount)}</td>
                                <td className="px-3 py-1.5 text-right text-gray-500 whitespace-nowrap">{formatDate(item.lastDate)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {payeeDataWithCategory.length === 0 && (
                  <div className="p-8 text-center text-gray-400">
                    <div className="text-4xl mb-2">📊</div>
                    <div>No data for selected period</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary Card + Table wrapper for By Payee */}
        {!isCompareMode && viewMode === 'byPayee' && (
          <div className="flex justify-center">
            <div className="inline-block">
              {/* Summary Card */}
              <div className="bg-white rounded-xl shadow-sm mb-4 p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {payeeOnlyData.length}
                    </div>
                    <div className="text-xs text-gray-500">Unique Payees</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-emerald-600">
                      {payeeOnlyData.reduce((sum, p) => sum + p.count, 0)}
                    </div>
                    <div className="text-xs text-gray-500">Transactions</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(payeeOnlyData.reduce((sum, p) => sum + p.totalAmount, 0))}
                    </div>
                    <div className="text-xs text-gray-500">Total Spent</div>
                  </div>
                </div>
              </div>

              {/* Data Table - By Payee */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Payee</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">
                      <button
                        onClick={() => setShowCategoriesColumn(!showCategoriesColumn)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          showCategoriesColumn 
                            ? 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' 
                            : 'text-gray-500 bg-gray-100 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {showCategoriesColumn ? 'Hide Categories' : 'Show Categories'}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Count</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Total</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Avg</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {payeeOnlyData.map((item, idx) => (
                    <tr key={idx} className={`border-b hover:bg-gray-50 ${item.categories.length > 1 ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2 text-gray-800 font-medium">{item.payee}</td>
                      <td className="px-3 py-2">
                        {showCategoriesColumn && (
                          <div className="flex flex-wrap gap-1">
                            {item.categories.map((cat, catIdx) => (
                              <span 
                                key={catIdx}
                                className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                              >
                                {categoryIconMap[cat] || '📂'} {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{item.count}</td>
                      <td 
                        className="px-3 py-2 text-right text-red-600 font-medium cursor-pointer hover:bg-yellow-50 hover:underline"
                        onClick={(e) => handleAmountClick(e, item.payee, null, item.totalAmount)}
                      >
                        {formatCurrency(item.totalAmount)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(item.avgAmount)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{formatDate(item.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {payeeOnlyData.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <div className="text-4xl mb-2">📊</div>
                <div>No data for selected period</div>
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        {/* Data Table - Compare View By Category */}
        {isCompareMode && viewMode === 'byCategory' && comparePeriods.length > 0 && (
          <div className="flex justify-center">
            <div className="inline-block">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Expand/Collapse buttons */}
                <div className="p-3 border-b bg-gray-50 flex gap-2">
                  <button
                    onClick={() => {
                      const allExpanded = {};
                      groupedByCategory.sortedCategories.forEach(cat => { allExpanded[cat] = true; });
                      setExpandedCategories(allExpanded);
                    }}
                    className="text-sm text-gray-600 px-3 py-1 bg-white rounded-lg border border-gray-200 hover:bg-gray-100"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={() => {
                      const allCollapsed = {};
                      groupedByCategory.sortedCategories.forEach(cat => { allCollapsed[cat] = false; });
                      setExpandedCategories(allCollapsed);
                    }}
                    className="text-sm text-gray-600 px-3 py-1 bg-white rounded-lg border border-gray-200 hover:bg-gray-100"
                  >
                    Collapse All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-center font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">Payee</th>
                        {comparePeriods.map((period, idx) => (
                          <React.Fragment key={idx}>
                            <th className="px-2 py-2 text-center font-semibold text-gray-700 border-l whitespace-nowrap" colSpan={2}>
                              {period.label}
                            </th>
                          </React.Fragment>
                        ))}
                        <th className="px-2 py-2 text-center font-semibold text-blue-700 border-l whitespace-nowrap" colSpan={2}>
                          Total
                        </th>
                      </tr>
                      <tr className="bg-gray-100">
                        <th className="px-3 py-1 text-center text-xs text-gray-500 sticky left-0 bg-gray-100 z-10"></th>
                        {comparePeriods.map((period, idx) => (
                          <React.Fragment key={idx}>
                            <th className="px-2 py-1 text-center text-xs text-gray-500 border-l">Count</th>
                            <th className="px-2 py-1 text-center text-xs text-gray-500">Amount</th>
                          </React.Fragment>
                        ))}
                        <th className="px-2 py-1 text-center text-xs text-emerald-500 border-l">Count</th>
                        <th className="px-2 py-1 text-center text-xs text-emerald-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedByCategory.sortedCategories.map((category, catIdx) => {
                        const isExpanded = expandedCategories[category] !== false;
                        return (
                          <React.Fragment key={catIdx}>
                            {/* Category Header Row */}
                            <tr 
                              className="bg-emerald-50 border-t-2 border-emerald-200 cursor-pointer hover:bg-emerald-100"
                              onClick={() => setExpandedCategories(prev => ({ ...prev, [category]: prev[category] === false ? true : false }))}
                            >
                              <td className="px-3 py-2 font-bold text-emerald-800 sticky left-0 bg-emerald-50 z-10">
                                <span className={`inline-block w-4 text-xs text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                <span className="mr-1">{categoryIconMap[category] || '📂'}</span> {category}
                                <span className="ml-2 text-sm font-normal text-emerald-600">
                                  ({groupedByCategory.categoryTotals[category].payeeCount} payee{groupedByCategory.categoryTotals[category].payeeCount > 1 ? 's' : ''})
                                </span>
                              </td>
                              {comparePeriods.map((period, pIdx) => {
                                const pd = groupedByCategory.categoryTotals[category].periodData[period.key] || { count: 0, amount: 0 };
                                return (
                                  <React.Fragment key={pIdx}>
                                    <td className="px-2 py-2 text-right font-bold text-emerald-700 border-l">
                                      {pd.count > 0 ? pd.count : '-'}
                                    </td>
                                    <td className="px-2 py-2 text-right font-bold text-emerald-700">
                                      {pd.amount > 0 ? formatCurrency(pd.amount) : '-'}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                              <td className="px-2 py-2 text-right font-bold text-emerald-700 border-l">
                                {groupedByCategory.categoryTotals[category].count}
                              </td>
                              <td className="px-2 py-2 text-right font-bold text-red-600">
                                {formatCurrency(groupedByCategory.categoryTotals[category].amount)}
                              </td>
                            </tr>
                            {/* Payees in this category */}
                            {isExpanded && groupedByCategory.grouped[category].map((item, idx) => (
                              <tr key={idx} className="border-b hover:bg-gray-50">
                                <td className="px-3 py-1.5 text-gray-800 sticky left-0 bg-white pl-8">{item.payee}</td>
                                {comparePeriods.map((period, pIdx) => {
                                  const pd = item.periodData[period.key] || { count: 0, amount: 0 };
                                  return (
                                    <React.Fragment key={pIdx}>
                                      <td className="px-2 py-1.5 text-right text-gray-600 border-l">
                                        {pd.count > 0 ? pd.count : '-'}
                                      </td>
                                      <td 
                                        className={`px-2 py-1.5 text-right text-gray-600 ${pd.amount > 0 ? 'cursor-pointer hover:bg-yellow-50 hover:underline' : ''}`}
                                        onClick={(e) => pd.amount > 0 && handleAmountClick(e, item.payee, item.category, pd.amount, period.key)}
                                      >
                                        {pd.amount > 0 ? formatCurrency(pd.amount) : '-'}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                                <td className="px-2 py-1.5 text-right text-emerald-600 font-medium border-l">{item.count}</td>
                                <td 
                                  className="px-2 py-1.5 text-right text-red-600 font-medium cursor-pointer hover:bg-yellow-50 hover:underline"
                                  onClick={(e) => handleAmountClick(e, item.payee, item.category, item.totalAmount)}
                                >
                                  {formatCurrency(item.totalAmount)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {payeeDataWithCategory.length === 0 && (
                  <div className="p-8 text-center text-gray-400">
                    <div className="text-4xl mb-2">📊</div>
                    <div>No data for selected period</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Data Table - Compare View By Payee Only */}
        {isCompareMode && viewMode === 'byPayee' && comparePeriods.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto flex justify-center">
              <table className="text-sm border-collapse">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">Payee</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700">
                      <button
                        onClick={() => setShowCategoriesColumn(!showCategoriesColumn)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          showCategoriesColumn 
                            ? 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' 
                            : 'text-gray-500 bg-gray-100 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {showCategoriesColumn ? 'Hide Categories' : 'Show Categories'}
                      </button>
                    </th>
                    {comparePeriods.map((period, idx) => (
                      <React.Fragment key={idx}>
                        <th className="px-2 py-2 text-center font-semibold text-gray-700 border-l whitespace-nowrap" colSpan={2}>
                          {period.label}
                        </th>
                      </React.Fragment>
                    ))}
                    <th className="px-2 py-2 text-center font-semibold text-blue-700 border-l whitespace-nowrap" colSpan={2}>
                      Total
                    </th>
                  </tr>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-1 text-center text-xs text-gray-500 sticky left-0 bg-gray-100 z-10"></th>
                    <th className="px-3 py-1 text-center text-xs text-gray-500"></th>
                    {comparePeriods.map((period, idx) => (
                      <React.Fragment key={idx}>
                        <th className="px-2 py-1 text-center text-xs text-gray-500 border-l">Count</th>
                        <th className="px-2 py-1 text-center text-xs text-gray-500">Amount</th>
                      </React.Fragment>
                    ))}
                    <th className="px-2 py-1 text-center text-xs text-blue-500 border-l">Count</th>
                    <th className="px-2 py-1 text-center text-xs text-blue-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payeeOnlyData.map((item, idx) => (
                    <tr key={idx} className={`border-b hover:bg-gray-50 ${item.categories.length > 1 ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-1.5 text-gray-800 font-medium sticky left-0 bg-white">
                        {item.payee}
                      </td>
                      <td className="px-3 py-1.5">
                        {showCategoriesColumn && (
                          <div className="flex flex-wrap gap-1">
                            {item.categories.map((cat, catIdx) => (
                              <span 
                                key={catIdx}
                                className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                              >
                                {categoryIconMap[cat] || '📂'} {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {comparePeriods.map((period, pIdx) => {
                        const pd = item.periodData[period.key] || { count: 0, amount: 0 };
                        return (
                          <React.Fragment key={pIdx}>
                            <td className="px-2 py-1.5 text-right text-gray-600 border-l">
                              {pd.count > 0 ? pd.count : '-'}
                            </td>
                            <td 
                              className={`px-2 py-1.5 text-right text-gray-600 ${pd.amount > 0 ? 'cursor-pointer hover:bg-yellow-50 hover:underline' : ''}`}
                              onClick={(e) => pd.amount > 0 && handleAmountClick(e, item.payee, null, pd.amount, period.key)}
                            >
                              {pd.amount > 0 ? formatCurrency(pd.amount) : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right text-blue-600 font-medium border-l">{item.count}</td>
                      <td 
                        className="px-2 py-1.5 text-right text-red-600 font-medium cursor-pointer hover:bg-yellow-50 hover:underline"
                        onClick={(e) => handleAmountClick(e, item.payee, null, item.totalAmount)}
                      >
                        {formatCurrency(item.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {payeeOnlyData.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <div className="text-4xl mb-2">📊</div>
                <div>No data for selected period</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {renderDatePicker()}
      {renderCompareModal()}

      {/* Transaction Popup */}
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
            {/* Header */}
            <div className="px-3 py-2 rounded-t-lg bg-red-50 border-b border-red-200">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-red-700">
                    {tooltip.payee}
                  </div>
                  {tooltip.category && (
                    <div className="text-xs text-gray-500">
                      {tooltip.category}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <div className="font-bold text-lg text-red-600">
                    -{formatCurrency(tooltip.total)}
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
              {tooltip.transactions.map((t, idx) => (
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
                        {t.category || 'Uncategorized'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {t.date}
                        {t.memo && <span className="text-gray-500"> • {t.memo}</span>}
                      </div>
                    </div>
                    <div className="font-medium ml-2 text-gray-700">
                      {formatCurrency(t.displayAmount)}
                    </div>
                  </div>
                </div>
              ))}
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

export default PayeeReport;
