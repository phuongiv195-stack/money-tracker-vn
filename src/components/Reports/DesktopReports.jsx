import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';

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
        const transWantNeed = t.wantNeed || 'need';
        if (transWantNeed !== wantNeedFilter) return;
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
        const cat = categories.find(c => c.name === t.category);
        processCategory(t.category || 'Uncategorized', t.amount, 'income', cat?.group);
      } else if (t.type === 'expense') {
        const cat = categories.find(c => c.name === t.category);
        processCategory(t.category || 'Uncategorized', t.amount, 'expense', cat?.group);
      } else if (t.type === 'split' && t.splits) {
        t.splits.forEach(s => {
          if (s.isLoan) return;
          const cat = categories.find(c => c.name === s.category);
          const type = t.splitType || 'expense';
          processCategory(s.category || 'Uncategorized', s.amount, type, cat?.group);
        });
      }
    });

    // Group categories by their group
    const groupCategories = (catMap) => {
      const groups = {};
      catMap.forEach((data, catName) => {
        const groupName = data.group || 'Other';
        if (!groups[groupName]) {
          groups[groupName] = { categories: [], months: {}, total: 0 };
        }
        groups[groupName].categories.push({ name: catName, ...data });
        groups[groupName].total += data.total;
        monthKeys.forEach(mk => {
          groups[groupName].months[mk] = (groups[groupName].months[mk] || 0) + (data.months[mk] || 0);
        });
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
      income: groupCategories(incomeCategories),
      expense: groupCategories(expenseCategories),
      incomeTotals,
      expenseTotals,
      grandTotalIncome: Object.values(incomeTotals).reduce((a, b) => a + b, 0),
      grandTotalExpense: Object.values(expenseTotals).reduce((a, b) => a + b, 0)
    };
  }, [transactions, categories, dateRange, customRange, wantNeedFilter]);

  // Format currency
  const formatCurrency = (val) => {
    if (val === 0 || val === undefined) return '';
    return new Intl.NumberFormat('en-US').format(Math.round(val));
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
    const headers = ['Type', 'Group', 'Category', ...reportData.months.map(m => m.label), 'Total'];
    rows.push(headers);

    // Income
    rows.push(['Income', '', '', ...reportData.months.map(() => ''), '']);
    Object.entries(reportData.income).forEach(([groupName, groupData]) => {
      rows.push(['', groupName, '', ...reportData.months.map(m => groupData.months[m.key] || ''), groupData.total]);
      groupData.categories.forEach(cat => {
        rows.push(['', '', cat.name, ...reportData.months.map(m => cat.months[m.key] || ''), cat.total]);
      });
    });
    rows.push(['Total Income', '', '', ...reportData.months.map(m => reportData.incomeTotals[m.key] || ''), reportData.grandTotalIncome]);

    rows.push([]); // Empty row

    // Expense
    rows.push(['Expenses', '', '', ...reportData.months.map(() => ''), '']);
    Object.entries(reportData.expense).forEach(([groupName, groupData]) => {
      rows.push(['', groupName, '', ...reportData.months.map(m => groupData.months[m.key] || ''), groupData.total]);
      groupData.categories.forEach(cat => {
        rows.push(['', '', cat.name, ...reportData.months.map(m => cat.months[m.key] || ''), cat.total]);
      });
    });
    rows.push(['Total Expenses', '', '', ...reportData.months.map(m => reportData.expenseTotals[m.key] || ''), reportData.grandTotalExpense]);

    rows.push([]); // Empty row
    rows.push(['Net Income', '', '', ...reportData.months.map(m => (reportData.incomeTotals[m.key] || 0) - (reportData.expenseTotals[m.key] || 0)), reportData.grandTotalIncome - reportData.grandTotalExpense]);

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
                  <input
                    type="month"
                    value={customRange.from}
                    onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="month"
                    value={customRange.to}
                    onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
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

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-sm text-gray-500 mb-1">Total Income</div>
            <div className="text-xl font-bold text-emerald-600">+{formatCurrency(reportData.grandTotalIncome)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-sm text-gray-500 mb-1">Total Expenses</div>
            <div className="text-xl font-bold text-red-600">-{formatCurrency(reportData.grandTotalExpense)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-sm text-gray-500 mb-1">Net Income</div>
            <div className={`text-xl font-bold ${reportData.grandTotalIncome - reportData.grandTotalExpense >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {reportData.grandTotalIncome - reportData.grandTotalExpense >= 0 ? '+' : '-'}
              {formatCurrency(Math.abs(reportData.grandTotalIncome - reportData.grandTotalExpense))}
            </div>
          </div>
        </div>

        {/* Expand/Collapse Buttons */}
        <div className="flex gap-2 mb-4">
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
        </div>

        {/* Report Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-[250px]">
                    Category
                  </th>
                  {reportData.months.map(m => (
                    <th key={m.key} className="text-right py-3 px-4 font-semibold text-gray-700 min-w-[100px]">
                      {m.label}
                    </th>
                  ))}
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 min-w-[120px] bg-gray-100">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Income Section */}
                <tr className="bg-emerald-50 border-b border-emerald-200">
                  <td colSpan={reportData.months.length + 2} className="py-2 px-4 font-bold text-emerald-700">
                    📈 Income
                  </td>
                </tr>
                {Object.entries(reportData.income).map(([groupName, groupData]) => (
                  <React.Fragment key={`income-${groupName}`}>
                    {/* Group Row */}
                    <tr 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleGroup('income', groupName)}
                    >
                      <td className="py-2 px-4 font-medium text-gray-800 sticky left-0 bg-white hover:bg-gray-50">
                        <span className="mr-2">{expandedGroups[`income-${groupName}`] ? '▼' : '▶'}</span>
                        {groupName}
                      </td>
                      {reportData.months.map(m => (
                        <td key={m.key} className="py-2 px-4 text-right text-emerald-600">
                          {formatCurrency(groupData.months[m.key])}
                        </td>
                      ))}
                      <td className="py-2 px-4 text-right font-medium text-emerald-700 bg-gray-50">
                        {formatCurrency(groupData.total)}
                      </td>
                    </tr>
                    {/* Category Rows */}
                    {expandedGroups[`income-${groupName}`] && groupData.categories.map(cat => (
                      <tr key={cat.name} className="border-b border-gray-50 bg-gray-50/50">
                        <td className="py-1.5 px-4 pl-10 text-gray-600 sticky left-0 bg-gray-50/50">
                          {cat.name}
                        </td>
                        {reportData.months.map(m => (
                          <td key={m.key} className="py-1.5 px-4 text-right text-gray-600">
                            {formatCurrency(cat.months[m.key])}
                          </td>
                        ))}
                        <td className="py-1.5 px-4 text-right text-gray-700 bg-gray-100/50">
                          {formatCurrency(cat.total)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {/* Income Total */}
                <tr className="bg-emerald-100 border-b-2 border-emerald-300">
                  <td className="py-2 px-4 font-bold text-emerald-800 sticky left-0 bg-emerald-100">
                    Total Income
                  </td>
                  {reportData.months.map(m => (
                    <td key={m.key} className="py-2 px-4 text-right font-bold text-emerald-700">
                      {formatCurrency(reportData.incomeTotals[m.key])}
                    </td>
                  ))}
                  <td className="py-2 px-4 text-right font-bold text-emerald-800 bg-emerald-200">
                    {formatCurrency(reportData.grandTotalIncome)}
                  </td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={reportData.months.length + 2} className="py-2"></td></tr>

                {/* Expense Section */}
                <tr className="bg-red-50 border-b border-red-200">
                  <td colSpan={reportData.months.length + 2} className="py-2 px-4 font-bold text-red-700">
                    📉 Expenses
                  </td>
                </tr>
                {Object.entries(reportData.expense).map(([groupName, groupData]) => (
                  <React.Fragment key={`expense-${groupName}`}>
                    {/* Group Row */}
                    <tr 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleGroup('expense', groupName)}
                    >
                      <td className="py-2 px-4 font-medium text-gray-800 sticky left-0 bg-white hover:bg-gray-50">
                        <span className="mr-2">{expandedGroups[`expense-${groupName}`] ? '▼' : '▶'}</span>
                        {groupName}
                      </td>
                      {reportData.months.map(m => (
                        <td key={m.key} className="py-2 px-4 text-right text-red-600">
                          {formatCurrency(groupData.months[m.key])}
                        </td>
                      ))}
                      <td className="py-2 px-4 text-right font-medium text-red-700 bg-gray-50">
                        {formatCurrency(groupData.total)}
                      </td>
                    </tr>
                    {/* Category Rows */}
                    {expandedGroups[`expense-${groupName}`] && groupData.categories.map(cat => (
                      <tr key={cat.name} className="border-b border-gray-50 bg-gray-50/50">
                        <td className="py-1.5 px-4 pl-10 text-gray-600 sticky left-0 bg-gray-50/50">
                          {cat.name}
                        </td>
                        {reportData.months.map(m => (
                          <td key={m.key} className="py-1.5 px-4 text-right text-gray-600">
                            {formatCurrency(cat.months[m.key])}
                          </td>
                        ))}
                        <td className="py-1.5 px-4 text-right text-gray-700 bg-gray-100/50">
                          {formatCurrency(cat.total)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {/* Expense Total */}
                <tr className="bg-red-100 border-b-2 border-red-300">
                  <td className="py-2 px-4 font-bold text-red-800 sticky left-0 bg-red-100">
                    Total Expenses
                  </td>
                  {reportData.months.map(m => (
                    <td key={m.key} className="py-2 px-4 text-right font-bold text-red-700">
                      {formatCurrency(reportData.expenseTotals[m.key])}
                    </td>
                  ))}
                  <td className="py-2 px-4 text-right font-bold text-red-800 bg-red-200">
                    {formatCurrency(reportData.grandTotalExpense)}
                  </td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={reportData.months.length + 2} className="py-2"></td></tr>

                {/* Net Income */}
                <tr className="bg-blue-50 border-2 border-blue-200">
                  <td className="py-3 px-4 font-bold text-blue-800 sticky left-0 bg-blue-50">
                    💰 Net Income
                  </td>
                  {reportData.months.map(m => {
                    const net = (reportData.incomeTotals[m.key] || 0) - (reportData.expenseTotals[m.key] || 0);
                    return (
                      <td key={m.key} className={`py-3 px-4 text-right font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net))}
                      </td>
                    );
                  })}
                  <td className={`py-3 px-4 text-right font-bold ${reportData.grandTotalIncome - reportData.grandTotalExpense >= 0 ? 'text-emerald-700' : 'text-red-700'} bg-blue-100`}>
                    {reportData.grandTotalIncome - reportData.grandTotalExpense >= 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(reportData.grandTotalIncome - reportData.grandTotalExpense))}
                  </td>
                </tr>
              </tbody>
            </table>
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
    </div>
  );
};

export default DesktopReports;
