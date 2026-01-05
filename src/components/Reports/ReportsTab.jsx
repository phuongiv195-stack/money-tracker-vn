import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import DesktopReports from './DesktopReports';
import AccountStatement from './AccountStatement';
import SpendingBreakdown from './SpendingBreakdown';
import BalanceSheet from './BalanceSheet';

const ReportsTab = () => {
  const { 
    transactions, 
    tagSuggestions, 
    isLoading, 
    accounts, 
    categories, 
    groupedAccounts,
    hasMoreTransactions,
    loadAllTransactions,
    loadingMore
  } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  
  // Detail view state
  const [detailView, setDetailView] = useState(null); // 'spending' | 'income-expense' | 'tag-report' | 'desktop-detail' | 'account-statement' | null
  const [dateRange, setDateRange] = useState('this-month');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [selectedTag, setSelectedTag] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({}); // Track which categories are expanded
  
  // Account Statement state (lifted up for back button handling)
  const [selectedStatementAccount, setSelectedStatementAccount] = useState('');

  // Reset dateRange when exiting detail view
  useEffect(() => {
    if (!detailView) {
      setDateRange('this-month');
      setCustomRange({ from: '', to: '' });
    }
  }, [detailView]);

  // Check screen size - only show desktop reports on large screens
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-load all transactions when entering detail view that needs full data
  useEffect(() => {
    if (detailView && hasMoreTransactions && !loadingMore) {
      // Load all for detailed reports
      loadAllTransactions();
    }
  }, [detailView, hasMoreTransactions, loadingMore, loadAllTransactions]);

  // Register back handler - handle account-statement differently
  useBackHandler(!!detailView, () => {
    if (detailView === 'account-statement' && selectedStatementAccount) {
      // Clear account selection first - go back to account picker
      setSelectedStatementAccount('');
    } else {
      // Go back to Reports Tab
      setDetailView(null);
    }
  });

  // Colors for pie chart
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ef4444', '#0ea5e9', '#a855f7', '#9ca3af'];

  // Get date range based on selection
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
      case 'last-3-months':
        return Array.from({ length: 3 }, (_, i) => {
          const d = new Date(currentYear, currentMonth - i, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        }).reverse();
      case 'last-6-months':
        return Array.from({ length: 6 }, (_, i) => {
          const d = new Date(currentYear, currentMonth - i, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        }).reverse();
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

  // Current month summary (for main view)
  const currentMonthSummary = useMemo(() => {
    const monthStr = currentDate.toISOString().slice(0, 7);
    const monthlyTrans = transactions.filter(t => 
      t.date && t.date.startsWith(monthStr) && t.type !== 'loan'
    );

    let income = 0, expense = 0;
    const catMap = {};

    monthlyTrans.forEach(t => {
      const amt = Number(t.amount);
      if (t.type === 'income') income += amt;
      if (t.type === 'expense') {
        expense += Math.abs(amt);
        if (t.category) {
          catMap[t.category] = (catMap[t.category] || 0) + Math.abs(amt);
        }
      }
      // Handle split transactions
      if (t.type === 'split' && t.splits) {
        t.splits.forEach(s => {
          if (!s.isLoan) {
            const splitAmt = Math.abs(s.amount);
            if (t.splitType === 'expense') {
              expense += splitAmt;
              if (s.category) {
                catMap[s.category] = (catMap[s.category] || 0) + splitAmt;
              }
            } else if (t.splitType === 'income') {
              income += splitAmt;
            }
          }
        });
      }
    });

    const categoryData = Object.entries(catMap)
      .map(([name, value]) => ({ name, value, percent: expense > 0 ? (value / expense) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    return { income, expense, net: income - expense, categoryData };
  }, [transactions, currentDate]);

  // Needs vs Wants summary (for main view)
  const needWantSummary = useMemo(() => {
    const monthStr = currentDate.toISOString().slice(0, 7);
    const monthlyTrans = transactions.filter(t => 
      t.date && t.date.startsWith(monthStr) && t.type !== 'loan' && t.type !== 'income' && t.type !== 'transfer'
    );

    let needs = 0, wants = 0;
    const needCatMap = {}, wantCatMap = {};

    monthlyTrans.forEach(t => {
      if (t.type === 'expense') {
        const amt = Math.abs(Number(t.amount));
        const spendingType = t.spendingType || 'need';
        if (spendingType === 'need') {
          needs += amt;
          if (t.category) needCatMap[t.category] = (needCatMap[t.category] || 0) + amt;
        } else {
          wants += amt;
          if (t.category) wantCatMap[t.category] = (wantCatMap[t.category] || 0) + amt;
        }
      }
      if (t.type === 'split' && t.splitType === 'expense' && t.splits) {
        t.splits.forEach(s => {
          if (!s.isLoan) {
            const splitAmt = Math.abs(s.amount);
            const spendingType = s.spendingType || 'need';
            if (spendingType === 'need') {
              needs += splitAmt;
              if (s.category) needCatMap[s.category] = (needCatMap[s.category] || 0) + splitAmt;
            } else {
              wants += splitAmt;
              if (s.category) wantCatMap[s.category] = (wantCatMap[s.category] || 0) + splitAmt;
            }
          }
        });
      }
    });

    const total = needs + wants;
    const needPercent = total > 0 ? Math.round((needs / total) * 100) : 0;
    const wantPercent = total > 0 ? Math.round((wants / total) * 100) : 0;

    return { needs, wants, total, needPercent, wantPercent };
  }, [transactions, currentDate]);

  // Needs vs Wants monthly data for detail view
  const needWantMonthlyData = useMemo(() => {
    const months = getDateRangeMonths();
    const today = new Date().toISOString().split('T')[0];
    
    return months.map(({ year, month, isToday }) => {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthlyTrans = transactions.filter(t => {
        if (!t.date || t.type === 'loan' || t.type === 'income' || t.type === 'transfer') return false;
        if (isToday) return t.date === today;
        return t.date.startsWith(monthStr);
      });

      let needs = 0, wants = 0;

      monthlyTrans.forEach(t => {
        if (t.type === 'expense') {
          const amt = Math.abs(Number(t.amount));
          const spendingType = t.spendingType || 'need';
          if (spendingType === 'need') needs += amt;
          else wants += amt;
        }
        if (t.type === 'split' && t.splitType === 'expense' && t.splits) {
          t.splits.forEach(s => {
            if (!s.isLoan) {
              const splitAmt = Math.abs(s.amount);
              const spendingType = s.spendingType || 'need';
              if (spendingType === 'need') needs += splitAmt;
              else wants += splitAmt;
            }
          });
        }
      });

      return {
        month: isToday ? 'Today' : `${String(month + 1).padStart(2, '0')}/${String(year).slice(2)}`,
        monthKey: monthStr,
        needs,
        wants,
        total: needs + wants
      };
    });
  }, [transactions, dateRange, customRange]);

  // Monthly data for detail view
  const monthlyData = useMemo(() => {
    const months = getDateRangeMonths();
    const today = new Date().toISOString().split('T')[0];
    
    return months.map(({ year, month, isToday }) => {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthlyTrans = transactions.filter(t => {
        if (!t.date || t.type === 'loan') return false;
        if (isToday) {
          return t.date === today;
        }
        return t.date.startsWith(monthStr);
      });

      let income = 0, expense = 0;
      const catMap = {};

      monthlyTrans.forEach(t => {
        const amt = Number(t.amount);
        if (t.type === 'income') income += amt;
        if (t.type === 'expense') {
          expense += Math.abs(amt);
          if (t.category) {
            catMap[t.category] = (catMap[t.category] || 0) + Math.abs(amt);
          }
        }
        if (t.type === 'split' && t.splits) {
          t.splits.forEach(s => {
            if (!s.isLoan) {
              const splitAmt = Math.abs(s.amount);
              if (t.splitType === 'expense') {
                expense += splitAmt;
                if (s.category) {
                  catMap[s.category] = (catMap[s.category] || 0) + splitAmt;
                }
              } else if (t.splitType === 'income') {
                income += splitAmt;
              }
            }
          });
        }
      });

      const categoryData = Object.entries(catMap)
        .map(([name, value]) => ({ name, value, percent: expense > 0 ? (value / expense) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);

      return {
        monthStr,
        label: `${String(month + 1).padStart(2, '0')}/${String(year).slice(2)}`,
        fullLabel: new Date(year, month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        income,
        expense,
        net: income - expense,
        categoryData
      };
    });
  }, [transactions, dateRange, customRange]);

  // Helpers
  const formatCurrency = (val) => new Intl.NumberFormat('en-US').format(Math.abs(val));
  const formatCurrencyCompact = (val) => {
    const absVal = Math.abs(val);
    if (absVal >= 1000000) return (absVal / 1000000).toFixed(1) + 'M';
    if (absVal >= 1000) return (absVal / 1000).toFixed(0) + 'k';
    return absVal.toString();
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const getMonthLabel = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Render mini donut chart for main view
  const renderMiniDonut = () => {
    const { categoryData, expense } = currentMonthSummary;
    if (expense === 0) return <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center"></div>;

    const chartData = categoryData.slice(0, 10);
    const otherValue = categoryData.slice(10).reduce((sum, item) => sum + item.value, 0);
    if (otherValue > 0) {
      chartData.push({ name: 'Others', value: otherValue, percent: (otherValue / expense) * 100 });
    }

    // Circle circumference: 2 * PI * r = 2 * 3.14159 * 40 ≈ 251.3
    const circumference = 2 * Math.PI * 40;
    let cumulativeOffset = 0;

    return (
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
          {chartData.map((item, index) => {
            const segmentLength = (item.percent / 100) * circumference;
            const offset = cumulativeOffset;
            cumulativeOffset += segmentLength;
            return (
              <circle
                key={index}
                cx="50" cy="50" r="40"
                fill="transparent"
                stroke={COLORS[index % COLORS.length]}
                strokeWidth="20"
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={-offset}
              />
            );
          })}
        </svg>
      </div>
    );
  };

  // Render mini bar chart with Y axis for main view
  const renderMiniBarWithAxis = () => {
    const { income, expense } = currentMonthSummary;
    const maxVal = Math.max(income, expense) || 1;
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'short' });
    
    return (
      <div className="w-24 h-24 flex">
        {/* Y Axis */}
        <div className="flex flex-col justify-between text-[9px] text-gray-400 pr-1 py-1">
          <span>{formatCurrencyCompact(maxVal)}</span>
          <span>0</span>
        </div>
        
        {/* Chart area */}
        <div className="flex-1 flex flex-col">
          {/* Bars container */}
          <div className="flex-1 flex items-end justify-center gap-1 border-l border-b border-gray-200 px-2">
            <div 
              className="w-6 bg-emerald-500 rounded-t"
              style={{ height: `${(income / maxVal) * 100}%`, minHeight: income > 0 ? '2px' : '0' }}
            ></div>
            <div 
              className="w-6 bg-red-500 rounded-t"
              style={{ height: `${(expense / maxVal) * 100}%`, minHeight: expense > 0 ? '2px' : '0' }}
            ></div>
          </div>
          {/* X label */}
          <div className="text-[9px] text-gray-500 text-center mt-0.5">{monthLabel}</div>
        </div>
      </div>
    );
  };

  // Render full pie chart for detail view
  const renderFullPieChart = () => {
    // Aggregate all months data
    const allCatMap = {};
    let totalExpense = 0;
    
    monthlyData.forEach(m => {
      m.categoryData.forEach(cat => {
        allCatMap[cat.name] = (allCatMap[cat.name] || 0) + cat.value;
      });
      totalExpense += m.expense;
    });

    const categoryData = Object.entries(allCatMap)
      .map(([name, value]) => ({ name, value, percent: totalExpense > 0 ? (value / totalExpense) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    if (totalExpense === 0) return <div className="text-gray-400 text-sm py-10 text-center">No data</div>;

    const chartData = categoryData.slice(0, 12);
    const otherValue = categoryData.slice(12).reduce((sum, item) => sum + item.value, 0);
    if (otherValue > 0) {
      chartData.push({ name: 'Others', value: otherValue, percent: (otherValue / totalExpense) * 100 });
    }

    // Circle circumference: 2 * PI * r = 2 * 3.14159 * 40 ≈ 251.3
    const circumference = 2 * Math.PI * 40;
    let cumulativeOffset = 0;

    return (
      <>
        {/* Total - outside chart */}
        <div className="text-center mb-2">
          <span className="text-sm text-gray-500">Total Spending</span>
          <div className="text-xl font-bold text-red-600">-{formatCurrency(totalExpense)}</div>
        </div>

        <div className="relative w-48 h-48 mx-auto">
          <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
            {chartData.map((item, index) => {
              const segmentLength = (item.percent / 100) * circumference;
              const offset = cumulativeOffset;
              cumulativeOffset += segmentLength;
              return (
                <circle
                  key={index}
                  cx="50" cy="50" r="40"
                  fill="transparent"
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth="20"
                  strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                  strokeDashoffset={-offset}
                />
              );
            })}
          </svg>
        </div>
        
        {/* Legend - use chartData to match pie segments */}
        <div className="space-y-2 mt-4">
          {chartData.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                <span className="text-gray-700 truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">-{formatCurrency(item.value)}</span>
                <span className="text-xs text-gray-400 w-10 text-right">{item.percent < 1 && item.percent > 0 ? '<1' : item.percent.toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  // Render bar chart for detail view (multiple months)
  const renderFullBarChart = () => {
    if (monthlyData.length === 0) return <div className="text-gray-400 text-sm py-10 text-center">No data</div>;
    
    const maxVal = Math.max(...monthlyData.flatMap(m => [m.income, m.expense])) || 1;
    const barWidth = monthlyData.length <= 3 ? 24 : monthlyData.length <= 6 ? 16 : 12;
    
    return (
      <div className="overflow-x-auto">
        <div className="flex items-end justify-center gap-1 h-40 min-w-fit px-2" style={{ minWidth: monthlyData.length * 50 }}>
          {monthlyData.map((m, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className="flex items-end gap-0.5">
                <div 
                  className="bg-emerald-500 rounded-t"
                  style={{ width: barWidth, height: `${(m.income / maxVal) * 100}px`, minHeight: m.income > 0 ? '2px' : '0' }}
                ></div>
                <div 
                  className="bg-red-500 rounded-t"
                  style={{ width: barWidth, height: `${(m.expense / maxVal) * 100}px`, minHeight: m.expense > 0 ? '2px' : '0' }}
                ></div>
              </div>
              <span className="text-[10px] text-gray-500 mt-1">{m.label}</span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex justify-center gap-4 mt-3">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-emerald-500"></div>
            <span className="text-xs text-gray-600">Income</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500"></div>
            <span className="text-xs text-gray-600">Expense</span>
          </div>
        </div>
      </div>
    );
  };

  // Date range selector
  const renderDateSelector = () => (
    <div className="mb-4">
      <select
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm"
      >
        <option value="today">Today</option>
        <option value="this-month">This Month</option>
        <option value="last-month">Last Month</option>
        <option value="last-3-months">Last 3 Months</option>
        <option value="last-6-months">Last 6 Months</option>
        <option value="this-year">This Year</option>
        <option value="last-year">Last Year</option>
        <option value="custom">Custom Range</option>
      </select>
      
      {dateRange === 'custom' && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* From */}
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-sm">From:</span>
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
              className="p-2 bg-gray-50 rounded-lg border text-sm"
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
              className="p-2 bg-gray-50 rounded-lg border text-sm"
            >
              <option value="">Month</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          
          <span className="text-gray-400 text-sm">→</span>
          
          {/* To */}
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-sm">To:</span>
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
              className="p-2 bg-gray-50 rounded-lg border text-sm"
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
              className="p-2 bg-gray-50 rounded-lg border text-sm"
            >
              <option value="">Month</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );

  // Render detail table for Income vs Expense
  const renderIncomeExpenseTable = () => {
    const totals = monthlyData.reduce(
      (acc, m) => ({ income: acc.income + m.income, expense: acc.expense + m.expense }),
      { income: 0, expense: 0 }
    );
    totals.net = totals.income - totals.expense;

    return (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 text-gray-500 font-medium">Month</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Income</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Spending</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((m, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-2 px-2 text-gray-700">{m.label}</td>
                <td className="py-2 px-2 text-right text-emerald-600">+{formatCurrency(m.income)}</td>
                <td className="py-2 px-2 text-right text-red-600">-{formatCurrency(m.expense)}</td>
                <td className={`py-2 px-2 text-right font-medium ${m.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {m.net >= 0 ? '+' : '-'}{formatCurrency(m.net)}
                </td>
              </tr>
            ))}
          </tbody>
          {monthlyData.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-2 px-2 text-gray-700">Total</td>
                <td className="py-2 px-2 text-right text-emerald-600">+{formatCurrency(totals.income)}</td>
                <td className="py-2 px-2 text-right text-red-600">-{formatCurrency(totals.expense)}</td>
                <td className={`py-2 px-2 text-right ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {totals.net >= 0 ? '+' : '-'}{formatCurrency(totals.net)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  if (isLoading) return <div className="p-4 text-center">Loading reports...</div>;

  // Spending Breakdown - Desktop Full Screen
  if (detailView === 'spending-breakdown' && isDesktop) {
    return (
      <SpendingBreakdown 
        transactions={transactions}
        categories={categories}
        accounts={accounts}
        onBack={() => setDetailView(null)} 
      />
    );
  }

  // Balance Sheet - Desktop Full Screen
  if (detailView === 'balance-sheet' && isDesktop) {
    return (
      <BalanceSheet 
        transactions={transactions}
        accounts={accounts}
        onBack={() => setDetailView(null)} 
      />
    );
  }

  // Desktop Detailed Reports - Full Screen
  if (detailView === 'desktop-detail' && isDesktop) {
    return <DesktopReports onBack={() => setDetailView(null)} />;
  }

  // Account Statement - Desktop Only
  if (detailView === 'account-statement' && isDesktop) {
    return (
      <AccountStatement 
        accounts={accounts} 
        transactions={transactions} 
        categories={categories}
        groupedAccounts={groupedAccounts}
        selectedAccount={selectedStatementAccount}
        setSelectedAccount={setSelectedStatementAccount}
        onBack={() => setDetailView(null)} 
      />
    );
  }

  // Tag Report Detail View
  if (detailView === 'tag-report') {
    // Calculate tag report data
    const tagTransactions = selectedTag 
      ? transactions.filter(t => {
          // Support both old 'tag' and new 'tags' fields
          const transactionTags = t.tags || (t.tag ? [t.tag] : []);
          return transactionTags.includes(selectedTag);
        })
      : [];
    
    // Calculate totals
    let tagIncome = 0;
    let tagExpense = 0;
    let tagLoansOut = 0; // Money lent (will be received)
    let tagLoansIn = 0; // Money borrowed (will be paid)
    const categoryBreakdown = {};
    const categoryTransactions = {}; // Store transactions by category
    const loanBreakdown = {};
    const loanTransactionsList = []; // Store loan transactions

    tagTransactions.forEach(t => {
      if (t.type === 'split') {
        const amt = Number(t.totalAmount) || 0;
        if (amt > 0) tagIncome += amt;
        else tagExpense += Math.abs(amt);
        
        // Process splits
        t.splits?.forEach(s => {
          if (s.isLoan && s.loan) {
            const splitAmt = Number(s.amount) || 0;
            if (t.splitType === 'expense') {
              // Split expense with loan = you paid for someone (lend)
              // Amount should be negative (money out of your pocket)
              loanBreakdown[s.loan] = (loanBreakdown[s.loan] || 0) - splitAmt;
            } else if (t.splitType === 'income') {
              // Split income with loan = someone paid you back
              // Amount should be positive (money into your pocket)
              loanBreakdown[s.loan] = (loanBreakdown[s.loan] || 0) + splitAmt;
            }
          } else if (s.category) {
            const splitAmt = Number(s.amount) || 0;
            categoryBreakdown[s.category] = (categoryBreakdown[s.category] || 0) + splitAmt;
            // Add to category transactions
            if (!categoryTransactions[s.category]) categoryTransactions[s.category] = [];
            categoryTransactions[s.category].push({
              ...t,
              displayAmount: splitAmt,
              displayName: t.payee || s.category || 'Split'
            });
          }
        });
      } else if (t.type === 'loan') {
        const amt = Number(t.amount) || 0;
        if (t.loanType === 'lend') {
          if (amt < 0) tagLoansOut += Math.abs(amt); // Lent more
          else tagLoansIn += amt; // Received payment
        } else { // borrow
          if (amt > 0) tagLoansIn += amt; // Borrowed more
          else tagLoansOut += Math.abs(amt); // Paid back
        }
        // Track by person
        if (t.loan) {
          loanBreakdown[t.loan] = (loanBreakdown[t.loan] || 0) + amt;
        }
        loanTransactionsList.push(t);
      } else if (t.type === 'income') {
        tagIncome += Math.abs(Number(t.amount));
        if (t.category) {
          categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + Math.abs(Number(t.amount));
          // Add to category transactions
          if (!categoryTransactions[t.category]) categoryTransactions[t.category] = [];
          categoryTransactions[t.category].push({
            ...t,
            displayAmount: Math.abs(Number(t.amount)),
            displayName: t.payee || t.category
          });
        }
      } else if (t.type === 'expense') {
        tagExpense += Math.abs(Number(t.amount));
        if (t.category) {
          categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + Math.abs(Number(t.amount));
          // Add to category transactions
          if (!categoryTransactions[t.category]) categoryTransactions[t.category] = [];
          categoryTransactions[t.category].push({
            ...t,
            displayAmount: Math.abs(Number(t.amount)),
            displayName: t.payee || t.category
          });
        }
      }
    });

    const netLoans = Object.values(loanBreakdown).reduce((sum, v) => sum + v, 0);
    const actualCost = tagExpense - tagIncome + netLoans;

    const sortedCategories = Object.entries(categoryBreakdown)
      .sort((a, b) => b[1] - a[1]);

    const sortedLoans = Object.entries(loanBreakdown)
      .filter(([_, v]) => v !== 0)
      .sort((a, b) => b[1] - a[1]);

    // Toggle category expansion
    const toggleCategory = (cat) => {
      setExpandedCategories(prev => ({
        ...prev,
        [cat]: !prev[cat]
      }));
    };

    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <button onClick={() => { setDetailView(null); setSelectedTag(''); setExpandedCategories({}); }} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">Tag Report</h2>
          <div className="w-8"></div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tag Selector */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Select Tag</label>
            <select
              value={selectedTag}
              onChange={(e) => { setSelectedTag(e.target.value); setExpandedCategories({}); }}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 border border-gray-200 outline-none"
            >
              <option value="">-- Choose a tag --</option>
              {tagSuggestions.map(tag => (
                <option key={tag} value={tag}>🏷️ {tag}</option>
              ))}
            </select>
          </div>

          {/* Report Content */}
          {selectedTag && (
            <>
              {/* 1. Total Project Cost */}
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 text-white">
                <div className="text-sm opacity-80">💰 Total Project Cost</div>
                <div className="text-3xl font-bold mt-1">
                  {formatCurrency(tagExpense)}
                </div>
                <div className="text-sm opacity-80 mt-1">
                  {tagTransactions.length} transactions • Including loans
                </div>
              </div>

              {/* 2. Who Paid What */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-700 text-sm">💸 Who Paid</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">I paid</span>
                  <span className="text-gray-800 font-medium">{formatCurrency(tagExpense)}</span>
                </div>
                {/* Show others who paid for me (from borrow - positive amount means money came to me) */}
                {sortedLoans.filter(([_, amt]) => amt > 0).map(([person, amount]) => (
                  <div key={person} className="flex justify-between text-sm">
                    <span className="text-gray-600">{person} paid for me</span>
                    <span className="text-gray-800 font-medium">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>

              {/* 3. By Category with Expandable Transactions */}
              {sortedCategories.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-4 mb-3">
                    <h3 className="font-semibold text-gray-800">📂 By Category</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const allExpanded = {};
                          sortedCategories.forEach(([cat]) => { allExpanded[cat] = true; });
                          setExpandedCategories(allExpanded);
                        }}
                        className="text-sm text-gray-600 px-3 py-1 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200"
                      >
                        Expand All
                      </button>
                      <button
                        onClick={() => setExpandedCategories({})}
                        className="text-sm text-gray-600 px-3 py-1 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200"
                      >
                        Collapse All
                      </button>
                    </div>
                  </div>
                  
                  {/* Category list */}
                  <div className="space-y-0">
                    {sortedCategories.map(([cat, amount]) => {
                      const isExpanded = expandedCategories[cat];
                      const catTrans = categoryTransactions[cat] || [];
                      
                      return (
                        <div key={cat}>
                          {/* Category Row */}
                          <div 
                            className="flex items-center py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleCategory(cat)}
                          >
                            <span className={`text-gray-400 text-xs w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className="text-gray-700 min-w-0 flex-shrink">{cat}</span>
                            <span className="text-gray-400 text-xs mx-2">({catTrans.length})</span>
                            <span className="text-red-600 font-medium ml-auto">{formatCurrency(amount)}</span>
                          </div>
                          
                          {/* Expanded Transactions */}
                          {isExpanded && catTrans.length > 0 && (
                            <div className="border-l-2 border-gray-200 ml-2 bg-gray-50">
                              {catTrans
                                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                                .map((t, idx) => (
                                  <div key={t.id || idx} className="flex items-center py-1.5 pl-3 pr-1 text-sm border-b border-gray-100 last:border-b-0">
                                    <span className="text-gray-600 min-w-0 flex-shrink truncate">{t.displayName}</span>
                                    <span className="text-gray-400 text-xs mx-2 flex-shrink-0">{t.date}</span>
                                    <span className="text-red-500 ml-auto flex-shrink-0">-{formatCurrency(t.displayAmount)}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Settlement - Ai nợ ai */}
              {sortedLoans.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-700 text-sm">🔄 Settlement</h3>
                    <span className="text-xs text-gray-400">• I paid for others up front</span>
                  </div>
                  {sortedLoans.map(([person, amount]) => {
                    const theyOweMe = amount < 0;
                    const displayAmount = Math.abs(amount);
                    return (
                      <div key={person} className="flex justify-between text-sm">
                        <span className="text-gray-600">{person}</span>
                        <span className={`font-medium ${theyOweMe ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {theyOweMe ? `owes me ${formatCurrency(displayAmount)}` : `I owe ${formatCurrency(displayAmount)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 5. My Actual Cost */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-4 text-white">
                <div className="text-sm opacity-80">✨ My Actual Cost</div>
                <div className="text-3xl font-bold mt-1">
                  {formatCurrency(Math.abs(actualCost))}
                </div>
                <div className="text-xs opacity-70 mt-1">
                  After loans settled (e.g. everyone pays me back)
                </div>
              </div>
            </>
          )}

          {/* Empty State - No tag selected but tags exist */}
          {!selectedTag && tagSuggestions.length > 0 && (
            <div className="text-center text-gray-500 py-10">
              <span className="text-5xl">🏷️</span>
              <p className="mt-2">Select a tag to view report</p>
            </div>
          )}

          {/* Empty State - No tags exist */}
          {tagSuggestions.length === 0 && (
            <div className="text-center py-10 px-4">
              <span className="text-5xl">🏷️</span>
              <p className="text-gray-700 font-medium mt-3">No tags yet</p>
              <p className="text-gray-500 text-sm mt-2">
                Add tags when creating transactions to track spending by trip, event, or project.
              </p>
              <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 text-left">
                <p className="text-amber-800 text-sm font-medium">💡 How to add tags:</p>
                <ol className="text-amber-700 text-sm mt-2 space-y-1 list-decimal list-inside">
                  <li>Open Add Transaction</li>
                  <li>Scroll down to "Tags" field</li>
                  <li>Type your tag name (e.g. "DaNang2025")</li>
                  <li>Press <span className="font-bold">Enter</span> to add the tag</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Detail View - Full Screen (Mobile)
  if (detailView === 'spending' || detailView === 'income-expense' || detailView === 'need-want') {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <button onClick={() => setDetailView(null)} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">
            {detailView === 'spending' ? 'Spending Breakdown' : detailView === 'income-expense' ? 'Income vs Expense' : 'Needs vs Wants'}
          </h2>
          <div className="w-8"></div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderDateSelector()}
          
          {detailView === 'spending' ? (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                {renderFullPieChart()}
              </div>
              {/* Desktop note */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-center">
                <span className="text-blue-600 text-sm">💻 View full Spending Breakdown with more features on desktop</span>
              </div>
            </>
          ) : detailView === 'income-expense' ? (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              {renderFullBarChart()}
              {renderIncomeExpenseTable()}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              {/* Needs vs Wants Bar Chart */}
              <div className="mb-6">
                <div className="flex items-end justify-center gap-4 h-48">
                  {needWantMonthlyData.map((m, idx) => {
                    const maxVal = Math.max(...needWantMonthlyData.map(d => Math.max(d.needs, d.wants))) || 1;
                    const needHeight = (m.needs / maxVal) * 150;
                    const wantHeight = (m.wants / maxVal) * 150;
                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <div className="flex items-end gap-1 h-40">
                          <div className="w-6 bg-blue-500 rounded-t" style={{ height: `${Math.max(needHeight, 2)}px` }} title={`Needs: ${formatCurrency(m.needs)}`}></div>
                          <div className="w-6 bg-purple-500 rounded-t" style={{ height: `${Math.max(wantHeight, 2)}px` }} title={`Wants: ${formatCurrency(m.wants)}`}></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">{m.month}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded"></div>
                    <span className="text-sm text-gray-600">Needs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-500 rounded"></div>
                    <span className="text-sm text-gray-600">Wants</span>
                  </div>
                </div>
              </div>

              {/* Needs vs Wants Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-600 font-medium">Month</th>
                      <th className="text-right py-2 text-blue-600 font-medium">Needs</th>
                      <th className="text-right py-2 text-purple-600 font-medium">Wants</th>
                      <th className="text-right py-2 text-gray-600 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needWantMonthlyData.map((m, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 text-gray-800">{m.month}</td>
                        <td className="py-2 text-right text-blue-600">{formatCurrency(m.needs)}</td>
                        <td className="py-2 text-right text-purple-600">{formatCurrency(m.wants)}</td>
                        <td className="py-2 text-right text-gray-700">{formatCurrency(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totalNeeds = needWantMonthlyData.reduce((sum, m) => sum + m.needs, 0);
                      const totalWants = needWantMonthlyData.reduce((sum, m) => sum + m.wants, 0);
                      const grandTotal = totalNeeds + totalWants;
                      const needsPercent = grandTotal > 0 ? Math.round((totalNeeds / grandTotal) * 100) : 0;
                      const wantsPercent = grandTotal > 0 ? Math.round((totalWants / grandTotal) * 100) : 0;
                      return (
                        <tr className="border-t-2 border-gray-300 font-semibold">
                          <td className="py-2 text-gray-800">Total</td>
                          <td className="py-2 text-right text-blue-700">{formatCurrency(totalNeeds)} <span className="text-xs font-normal">({needsPercent}%)</span></td>
                          <td className="py-2 text-right text-purple-700">{formatCurrency(totalWants)} <span className="text-xs font-normal">({wantsPercent}%)</span></td>
                          <td className="py-2 text-right text-gray-800">{formatCurrency(grandTotal)}</td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main View
  return (
    <div className="pb-24 bg-gray-100 min-h-screen">

      {/* Report Cards */}
      <div className="p-4 space-y-4">
        
        {/* Card 1: Spending Breakdown */}
        <div 
          onClick={() => isDesktop ? setDetailView('spending-breakdown') : setDetailView('spending')}
          className="bg-white rounded-xl shadow-sm p-4 cursor-pointer active:bg-gray-50"
        >
          <div className="flex gap-4">
            {/* Donut Chart */}
            <div className="flex-shrink-0">
              {renderMiniDonut()}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800">Spending Breakdown</h3>
                {isDesktop && <span className="text-xs text-blue-500">📊 Full View</span>}
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-gray-700">Total Spending</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(currentMonthSummary.expense)}</span>
              </div>
              
              {/* Top categories */}
              {currentMonthSummary.categoryData.slice(0, 3).map((cat, idx) => (
                <div key={cat.name} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                    <span className="text-gray-600 truncate">{cat.name}</span>
                  </div>
                  <span className="text-gray-700">{formatCurrency(cat.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Income vs Spending */}
        <div 
          onClick={() => setDetailView('income-expense')}
          className="bg-white rounded-xl shadow-sm p-4 cursor-pointer active:bg-gray-50"
        >
          <div className="flex gap-4">
            {/* Bar Chart with Y axis */}
            <div className="flex-shrink-0">
              {renderMiniBarWithAxis()}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800">Income vs Spending</h3>
              <div className="text-xs text-gray-500 mb-2">
                {new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              
              <div className="space-y-0.5">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></div>
                    <span className="text-gray-600">Income</span>
                  </div>
                  <span className="text-gray-700">{formatCurrency(currentMonthSummary.income)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-red-500"></div>
                    <span className="text-gray-600">Spending</span>
                  </div>
                  <span className="text-gray-700">{formatCurrency(currentMonthSummary.expense)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-gray-100 mt-1">
                  <span className="font-semibold text-gray-700">Net Total</span>
                  <span className={`font-bold ${currentMonthSummary.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(currentMonthSummary.net)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Needs vs Wants */}
        <div 
          onClick={() => setDetailView('need-want')}
          className="bg-white rounded-xl shadow-sm p-4 cursor-pointer active:bg-gray-50"
        >
          <div className="flex gap-4">
            {/* Mini Bar Chart for Needs vs Wants */}
            <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
              <div className="flex items-end gap-2 h-16">
                <div className="flex flex-col items-center">
                  <div 
                    className="w-8 bg-blue-500 rounded-t" 
                    style={{ height: `${needWantSummary.total > 0 ? Math.max((needWantSummary.needs / needWantSummary.total) * 50, 4) : 4}px` }}
                  ></div>
                  <span className="text-xs text-gray-500 mt-1">N</span>
                </div>
                <div className="flex flex-col items-center">
                  <div 
                    className="w-8 bg-purple-500 rounded-t" 
                    style={{ height: `${needWantSummary.total > 0 ? Math.max((needWantSummary.wants / needWantSummary.total) * 50, 4) : 4}px` }}
                  ></div>
                  <span className="text-xs text-gray-500 mt-1">W</span>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800">Needs vs Wants</h3>
              <div className="text-xs text-gray-500 mb-2">
                {new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              
              <div className="space-y-0.5">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-blue-500"></div>
                    <span className="text-gray-600">Needs ({needWantSummary.needPercent}%)</span>
                  </div>
                  <span className="text-gray-700">{formatCurrency(needWantSummary.needs)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-purple-500"></div>
                    <span className="text-gray-600">Wants ({needWantSummary.wantPercent}%)</span>
                  </div>
                  <span className="text-gray-700">{formatCurrency(needWantSummary.wants)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-gray-100 mt-1">
                  <span className="font-semibold text-gray-700">Total Spending</span>
                  <span className="font-bold text-gray-800">{formatCurrency(needWantSummary.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Tag Report - Always visible */}
        <div 
          onClick={() => setDetailView('tag-report')}
          className="bg-white rounded-xl shadow-sm p-4 cursor-pointer active:bg-gray-50"
        >
          <div className="flex gap-4 items-center">
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-50 to-teal-100 rounded-xl flex items-center justify-center">
              <span className="text-5xl">🏷️</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-800">Tag Report</h3>
              <p className="text-sm text-gray-500 mt-1">
                Track spending by trip, event, or project
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {tagSuggestions.length > 0 
                  ? `${tagSuggestions.length} tag${tagSuggestions.length > 1 ? 's' : ''} available`
                  : '📝 Add tags when creating transactions'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Card 5: Account Statement - Desktop Only */}
        <div 
          onClick={() => {
            if (isDesktop) {
              setDetailView('account-statement');
            }
          }}
          className={`bg-white rounded-xl shadow-sm p-4 ${isDesktop ? 'cursor-pointer active:bg-gray-50' : 'opacity-60'}`}
        >
          <div className="flex gap-4 items-center">
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-50 to-teal-100 rounded-xl flex items-center justify-center p-2">
              {/* Account Statement Icon */}
              <svg viewBox="0 0 64 64" className="w-full h-full">
                {/* Paper background */}
                <rect x="6" y="4" width="44" height="56" rx="3" fill="#E8F5E9" stroke="#1E3A5F" strokeWidth="2"/>
                {/* Header bar */}
                <rect x="6" y="4" width="44" height="12" rx="3" fill="#10B981"/>
                {/* Table lines */}
                <line x1="12" y1="24" x2="44" y2="24" stroke="#1E3A5F" strokeWidth="1.5"/>
                <line x1="12" y1="32" x2="44" y2="32" stroke="#E5E7EB" strokeWidth="1"/>
                <line x1="12" y1="40" x2="44" y2="40" stroke="#E5E7EB" strokeWidth="1"/>
                <line x1="12" y1="48" x2="44" y2="48" stroke="#E5E7EB" strokeWidth="1"/>
                {/* Vertical dividers */}
                <line x1="28" y1="20" x2="28" y2="52" stroke="#E5E7EB" strokeWidth="1"/>
                {/* Check marks */}
                <text x="14" y="30" fontSize="8" fill="#10B981">✓</text>
                <text x="14" y="38" fontSize="8" fill="#10B981">✓</text>
                <text x="14" y="46" fontSize="8" fill="#F59E0B">🔒</text>
                {/* Numbers */}
                <text x="32" y="30" fontSize="6" fill="#1E3A5F" fontFamily="monospace">1,234</text>
                <text x="32" y="38" fontSize="6" fill="#1E3A5F" fontFamily="monospace">5,678</text>
                <text x="32" y="46" fontSize="6" fill="#1E3A5F" fontFamily="monospace">9,012</text>
                {/* Dollar sign */}
                <circle cx="52" cy="48" r="10" fill="#10B981" stroke="#1E3A5F" strokeWidth="1.5"/>
                <text x="48" y="52" fontSize="12" fill="white" fontWeight="bold">$</text>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800">Account Ledger</h3>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Desktop Only</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Table view with running balance, reconcile transactions
              </p>
              {!isDesktop && (
                <p className="text-xs text-orange-600 mt-2">
                  🖥️ Open on desktop (screen width ≥ 1024px) to access
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card 6: Balance Sheet - Desktop Only */}
        <div 
          onClick={() => {
            if (isDesktop) {
              setDetailView('balance-sheet');
            }
          }}
          className={`bg-white rounded-xl shadow-sm p-4 ${isDesktop ? 'cursor-pointer active:bg-gray-50' : 'opacity-60'}`}
        >
          <div className="flex gap-4 items-center">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-50 to-orange-100 rounded-xl flex items-center justify-center p-2">
              {/* Balance Sheet Icon */}
              <svg viewBox="0 0 64 64" className="w-full h-full">
                {/* Background */}
                <rect x="8" y="8" width="48" height="48" rx="4" fill="#FEF3C7" stroke="#D97706" strokeWidth="2"/>
                {/* Cash section */}
                <rect x="12" y="14" width="40" height="10" rx="2" fill="#10B981"/>
                <text x="16" y="21" fontSize="6" fill="white" fontWeight="bold">💵 CASH</text>
                <text x="42" y="21" fontSize="5" fill="white">5.5M</text>
                {/* Checking section */}
                <rect x="12" y="26" width="40" height="10" rx="2" fill="#3B82F6"/>
                <text x="16" y="33" fontSize="6" fill="white" fontWeight="bold">🏦 CHECK</text>
                <text x="42" y="33" fontSize="5" fill="white">45M</text>
                {/* Investment section */}
                <rect x="12" y="38" width="40" height="10" rx="2" fill="#8B5CF6"/>
                <text x="16" y="45" fontSize="6" fill="white" fontWeight="bold">📈 INVEST</text>
                <text x="42" y="45" fontSize="5" fill="white">120M</text>
                {/* Total */}
                <text x="16" y="54" fontSize="6" fill="#1E3A5F" fontWeight="bold">TOTAL</text>
                <text x="36" y="54" fontSize="6" fill="#D97706" fontWeight="bold">170.5M</text>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800">Balance Sheet</h3>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Desktop Only</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Net worth snapshot by Cash, Checking, Investments
              </p>
              {!isDesktop && (
                <p className="text-xs text-orange-600 mt-2">
                  🖥️ Open on desktop (screen width ≥ 1024px) to access
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card 7: Detailed Reports - Desktop Only */}
        <div 
          onClick={() => {
            if (isDesktop) {
              setDetailView('desktop-detail');
            }
          }}
          className={`bg-white rounded-xl shadow-sm p-4 ${isDesktop ? 'cursor-pointer active:bg-gray-50' : 'opacity-60'}`}
        >
          <div className="flex gap-4 items-center">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl flex items-center justify-center p-2">
              {/* Custom Report Icon SVG */}
              <svg viewBox="0 0 64 64" className="w-full h-full">
                {/* Paper background */}
                <rect x="8" y="4" width="40" height="52" rx="3" fill="#E8EEF4" stroke="#1E3A5F" strokeWidth="2.5"/>
                {/* Pie chart */}
                <circle cx="22" cy="18" r="8" fill="#3B82F6" stroke="#1E3A5F" strokeWidth="1.5"/>
                <path d="M22 18 L22 10 A8 8 0 0 1 28.9 14.1 Z" fill="#F59E0B"/>
                <path d="M22 18 L28.9 14.1 A8 8 0 0 1 26.5 25.2 Z" fill="#10B981"/>
                {/* Lines */}
                <line x1="34" y1="12" x2="44" y2="12" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round"/>
                <line x1="34" y1="18" x2="44" y2="18" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round"/>
                <line x1="34" y1="24" x2="44" y2="24" stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round"/>
                {/* Bar chart */}
                <rect x="14" y="40" width="5" height="10" fill="#3B82F6" rx="1"/>
                <rect x="22" y="36" width="5" height="14" fill="#3B82F6" rx="1"/>
                <rect x="30" y="32" width="5" height="18" fill="#3B82F6" rx="1"/>
                <rect x="38" y="38" width="5" height="12" fill="#3B82F6" rx="1"/>
                {/* Pencil */}
                <rect x="42" y="20" width="8" height="32" rx="2" fill="#F472B6" stroke="#1E3A5F" strokeWidth="1.5" transform="rotate(30 46 36)"/>
                <polygon points="58,52 54,58 52,52" fill="#F472B6" stroke="#1E3A5F" strokeWidth="1" transform="rotate(30 55 55)"/>
                <ellipse cx="49" cy="27" rx="2" ry="1" fill="white" transform="rotate(30 49 27)"/>
                <ellipse cx="51" cy="32" rx="2" ry="1" fill="white" transform="rotate(30 51 32)"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800">Detailed Reports</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Desktop Only</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Full spreadsheet view with monthly breakdown, export to CSV
              </p>
              {!isDesktop && (
                <p className="text-xs text-orange-600 mt-2">
                  🖥️ Open on desktop (screen width ≥ 1024px) to access
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReportsTab;