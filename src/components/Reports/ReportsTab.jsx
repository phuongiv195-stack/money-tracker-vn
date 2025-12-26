import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import useBackHandler from '../../hooks/useBackHandler';
import DesktopReports from './DesktopReports';

const ReportsTab = () => {
  const { transactions, isLoading } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  
  // Detail view state
  const [detailView, setDetailView] = useState(null); // 'spending' | 'income-expense' | null
  const [dateRange, setDateRange] = useState('this-month');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  // Check screen size - only show desktop reports on large screens
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Register back handler
  useBackHandler(!!detailView, () => setDetailView(null));

  // Colors for pie chart
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#9ca3af'];

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
        label: `${month + 1}/${String(year).slice(2)}`,
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

    let cumulativePercent = 0;
    const chartData = categoryData.slice(0, 5);
    const otherValue = categoryData.slice(5).reduce((sum, item) => sum + item.value, 0);
    if (otherValue > 0) {
      chartData.push({ name: 'Others', value: otherValue, percent: (otherValue / expense) * 100 });
    }

    return (
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
          {chartData.map((item, index) => {
            const strokeDasharray = `${item.percent} ${100 - item.percent}`;
            const strokeDashoffset = -cumulativePercent;
            cumulativePercent += item.percent;
            return (
              <circle
                key={index}
                cx="50" cy="50" r="40"
                fill="transparent"
                stroke={COLORS[index % COLORS.length]}
                strokeWidth="20"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
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

    let cumulativePercent = 0;
    const chartData = categoryData.slice(0, 5);
    const otherValue = categoryData.slice(5).reduce((sum, item) => sum + item.value, 0);
    if (otherValue > 0) {
      chartData.push({ name: 'Others', value: otherValue, percent: (otherValue / totalExpense) * 100 });
    }

    return (
      <>
        <div className="relative w-48 h-48 mx-auto my-4">
          <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
            {chartData.map((item, index) => {
              const strokeDasharray = `${item.percent} ${100 - item.percent}`;
              const strokeDashoffset = -cumulativePercent;
              cumulativePercent += item.percent;
              return (
                <circle
                  key={index}
                  cx="50" cy="50" r="40"
                  fill="transparent"
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth="20"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-gray-500">Total</span>
            <span className="text-sm font-bold text-gray-800">-{formatCurrencyCompact(totalExpense)}</span>
          </div>
        </div>
        
        {/* Legend */}
        <div className="space-y-2 mt-4">
          {categoryData.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                <span className="text-gray-700 truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">-{formatCurrency(item.value)}</span>
                <span className="text-xs text-gray-400 w-10 text-right">{item.percent.toFixed(0)}%</span>
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
        <div className="flex gap-2 mt-2">
          <input
            type="month"
            value={customRange.from}
            onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
            className="flex-1 p-2 bg-gray-50 rounded-lg border text-sm"
            placeholder="From"
          />
          <input
            type="month"
            value={customRange.to}
            onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
            className="flex-1 p-2 bg-gray-50 rounded-lg border text-sm"
            placeholder="To"
          />
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

  // Desktop Detailed Reports - Full Screen
  if (detailView === 'desktop-detail' && isDesktop) {
    return <DesktopReports onBack={() => setDetailView(null)} />;
  }

  // Detail View - Full Screen (Mobile)
  if (detailView === 'spending' || detailView === 'income-expense') {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <button onClick={() => setDetailView(null)} className="text-gray-500 text-lg">✕</button>
          <h2 className="font-semibold text-lg">
            {detailView === 'spending' ? 'Spending by Category' : 'Income vs Expense'}
          </h2>
          <div className="w-8"></div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderDateSelector()}
          
          {detailView === 'spending' ? (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              {renderFullPieChart()}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              {renderFullBarChart()}
              {renderIncomeExpenseTable()}
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
        
        {/* Card 1: Spending by Category */}
        <div 
          onClick={() => setDetailView('spending')}
          className="bg-white rounded-xl shadow-sm p-4 cursor-pointer active:bg-gray-50"
        >
          <div className="flex gap-4">
            {/* Donut Chart */}
            <div className="flex-shrink-0">
              {renderMiniDonut()}
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800">Spending by Category</h3>
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

        {/* Card 3: Detailed Reports - Desktop Only */}
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
