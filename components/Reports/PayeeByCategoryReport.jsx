import React, { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';

const PayeeByCategoryReport = () => {
  const { transactions, categories } = useData();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Mobile: single period filter
  const [mobileFilter, setMobileFilter] = useState('this-month');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  
  // Desktop: multiple periods (2 years to compare)
  const [selectedYears, setSelectedYears] = useState(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear];
  });

  // Check screen size
  React.useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper function to format currency (no $ sign, Vietnamese format)
  const formatCurrency = (amount) => {
    const absAmount = Math.abs(amount);
    return absAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // Get date range based on mobile filter
  const getMobileDateRange = () => {
    const now = new Date();
    let startDate, endDate;

    switch (mobileFilter) {
      case 'today':
        startDate = endDate = now.toISOString().split('T')[0];
        break;
      case 'this-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        break;
      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'this-quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0).toISOString().split('T')[0];
        break;
      case 'last-quarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const qYear = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const qMonth = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(qYear, qMonth * 3, 1).toISOString().split('T')[0];
        endDate = new Date(qYear, (qMonth + 1) * 3, 0).toISOString().split('T')[0];
        break;
      case 'this-year':
        startDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
        break;
      case 'last-year':
        startDate = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
        break;
      case 'custom-range':
        startDate = customRange.from;
        endDate = customRange.to;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    return { startDate, endDate };
  };

  // Process data for MOBILE (single period)
  const mobileReportData = useMemo(() => {
    if (isDesktop) return null;

    const { startDate, endDate } = getMobileDateRange();
    const dataByCategory = {};

    transactions.forEach(trans => {
      if (!trans.date || trans.type === 'transfer') return;
      
      // Filter by date range
      if (trans.date < startDate || trans.date > endDate) return;

      const category = trans.category || 'Uncategorized';
      const payee = trans.payee || 'No Payee';
      const amount = Math.abs(parseFloat(trans.amount) || 0);

      // Initialize structures
      if (!dataByCategory[category]) {
        dataByCategory[category] = {
          total: 0,
          count: 0,
          payees: {}
        };
      }
      if (!dataByCategory[category].payees[payee]) {
        dataByCategory[category].payees[payee] = {
          amount: 0,
          count: 0
        };
      }

      // Accumulate data
      dataByCategory[category].total += amount;
      dataByCategory[category].count += 1;
      dataByCategory[category].payees[payee].amount += amount;
      dataByCategory[category].payees[payee].count += 1;
    });

    // Sort categories alphabetically
    const sortedCategories = Object.keys(dataByCategory).sort();

    // Calculate total
    const total = {
      count: 0,
      amount: 0
    };
    sortedCategories.forEach(cat => {
      total.count += dataByCategory[cat].count;
      total.amount += dataByCategory[cat].total;
    });

    return {
      dataByCategory,
      sortedCategories,
      total
    };
  }, [transactions, mobileFilter, customRange, isDesktop]);

  // Process data for DESKTOP (multiple periods)
  const desktopReportData = useMemo(() => {
    if (!isDesktop) return null;

    const dataByYear = {};

    transactions.forEach(trans => {
      if (!trans.date || trans.type === 'transfer') return;
      
      const year = new Date(trans.date).getFullYear();
      if (!selectedYears.includes(year)) return;

      const category = trans.category || 'Uncategorized';
      const payee = trans.payee || 'No Payee';
      const amount = Math.abs(parseFloat(trans.amount) || 0);

      // Initialize structures
      if (!dataByYear[year]) {
        dataByYear[year] = {};
      }
      if (!dataByYear[year][category]) {
        dataByYear[year][category] = {
          total: 0,
          count: 0,
          payees: {}
        };
      }
      if (!dataByYear[year][category].payees[payee]) {
        dataByYear[year][category].payees[payee] = {
          amount: 0,
          count: 0
        };
      }

      // Accumulate data
      dataByYear[year][category].total += amount;
      dataByYear[year][category].count += 1;
      dataByYear[year][category].payees[payee].amount += amount;
      dataByYear[year][category].payees[payee].count += 1;
    });

    // Get all unique categories across all years
    const allCategories = new Set();
    Object.values(dataByYear).forEach(yearData => {
      Object.keys(yearData).forEach(cat => allCategories.add(cat));
    });

    const sortedCategories = Array.from(allCategories).sort();

    // Calculate totals per year
    const yearTotals = {};
    selectedYears.forEach(year => {
      yearTotals[year] = {
        count: 0,
        amount: 0
      };
      if (dataByYear[year]) {
        Object.values(dataByYear[year]).forEach(catData => {
          yearTotals[year].count += catData.count;
          yearTotals[year].amount += catData.total;
        });
      }
    });

    return {
      dataByYear,
      sortedCategories,
      yearTotals
    };
  }, [transactions, selectedYears, isDesktop]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const changeYear = (index, direction) => {
    setSelectedYears(prev => {
      const newYears = [...prev];
      newYears[index] = newYears[index] + direction;
      return newYears;
    });
  };

  const filterOptions = [
    { value: 'today', label: 'Today' },
    { value: 'this-month', label: 'This Month' },
    { value: 'last-month', label: 'Last Month' },
    { value: 'this-quarter', label: 'This Quarter' },
    { value: 'last-quarter', label: 'Last Quarter' },
    { value: 'this-year', label: 'This Year' },
    { value: 'last-year', label: 'Last Year' },
    { value: 'custom-range', label: 'Custom Range' }
  ];

  // MOBILE VIEW
  if (!isDesktop && mobileReportData) {
    const { dataByCategory, sortedCategories, total } = mobileReportData;

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="mb-3">
            <h1 className="text-xl font-bold text-gray-900">Payees by Category</h1>
          </div>
          
          {/* Filter Dropdown */}
          <div className="relative">
            <select
              value={mobileFilter}
              onChange={(e) => {
                setMobileFilter(e.target.value);
                if (e.target.value === 'custom-range') {
                  setShowCustomPicker(true);
                } else {
                  setShowCustomPicker(false);
                }
              }}
              className="w-full px-4 py-2.5 bg-white border-2 border-emerald-500 rounded-lg text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {filterOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Custom Range Picker */}
          {showCustomPicker && mobileFilter === 'custom-range' && (
            <div className="mt-3 p-3 bg-emerald-50 rounded-lg">
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-700">From:</label>
                  <input
                    type="date"
                    value={customRange.from}
                    onChange={(e) => setCustomRange(prev => ({ ...prev, from: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">To:</label>
                  <input
                    type="date"
                    value={customRange.to}
                    onChange={(e) => setCustomRange(prev => ({ ...prev, to: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm m-4">
          <table className="w-full">
            {/* Header */}
            <thead>
              <tr className="bg-gradient-to-r from-emerald-600 to-teal-600">
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                  Category/Payee
                </th>
                <th className="px-3 py-3 text-center text-sm font-semibold text-white">
                  count
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                  Amount
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {/* Total Row */}
              <tr className="bg-amber-50 border-b-2 border-amber-200">
                <td className="px-4 py-3 font-bold text-gray-900">Total</td>
                <td className="px-3 py-3 text-center font-semibold text-gray-800">{total.count}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(total.amount)}</td>
              </tr>

              {/* Category Rows */}
              {sortedCategories.map((category, idx) => {
                const isExpanded = expandedCategories[category];
                const categoryData = dataByCategory[category];
                const sortedPayees = Object.keys(categoryData.payees).sort();

                return (
                  <React.Fragment key={category}>
                    {/* Category Summary Row */}
                    <tr
                      className={`border-b border-gray-200 cursor-pointer active:bg-emerald-100 ${
                        idx % 2 === 0 ? 'bg-emerald-50' : 'bg-white'
                      }`}
                      onClick={() => toggleCategory(category)}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className={`transform transition-transform duration-200 text-emerald-600 ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          {category}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-gray-700">
                        {categoryData.count}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(categoryData.total)}
                      </td>
                    </tr>

                    {/* Payee Detail Rows */}
                    {isExpanded && sortedPayees.map((payee) => {
                      const payeeData = categoryData.payees[payee];
                      return (
                        <tr
                          key={payee}
                          className={`border-b border-gray-100 ${
                            idx % 2 === 0 ? 'bg-emerald-25' : 'bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-2.5 pl-12 text-gray-700 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500">•</span>
                              {payee}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-600 text-sm">
                            {payeeData.count}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700 text-sm">
                            {formatCurrency(payeeData.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 text-center text-sm text-gray-500">
          💡 Tap on any category to view payee details
        </div>
      </div>
    );
  }

  // DESKTOP VIEW
  if (isDesktop && desktopReportData) {
    const { dataByYear, sortedCategories, yearTotals } = desktopReportData;

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-emerald-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-emerald-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600 tracking-wide uppercase">
                  Payee by Category Report
                </p>
                <h1 className="text-3xl font-bold text-gray-900 mt-1">
                  Payees by Category
                </h1>
              </div>
              <div className="flex items-center gap-4">
                {/* Year selectors */}
                {selectedYears.map((year, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl px-4 py-2 border border-emerald-300">
                    <button
                      onClick={() => changeYear(idx, -1)}
                      className="text-emerald-700 hover:text-emerald-900 font-bold transition-colors"
                    >
                      ◀
                    </button>
                    <span className="font-bold text-gray-800 text-lg min-w-[60px] text-center">
                      {year}
                    </span>
                    <button
                      onClick={() => changeYear(idx, 1)}
                      className="text-emerald-700 hover:text-emerald-900 font-bold transition-colors"
                    >
                      ▶
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-emerald-200">
            <table className="w-full">
              {/* Header */}
              <thead>
                <tr className="bg-gradient-to-r from-emerald-600 to-teal-600">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-white border-r border-emerald-500">
                    Category/Payee
                  </th>
                  {selectedYears.map(year => (
                    <React.Fragment key={year}>
                      <th className="px-4 py-4 text-center text-sm font-semibold text-white border-r border-emerald-500">
                        count
                      </th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-white border-r border-emerald-500">
                        {year}
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {/* Total Row */}
                <tr className="bg-amber-50 border-b-2 border-amber-200">
                  <td className="px-6 py-4 font-bold text-gray-900 text-lg">Total</td>
                  {selectedYears.map(year => (
                    <React.Fragment key={year}>
                      <td className="px-4 py-4 text-center font-semibold text-gray-800">
                        {yearTotals[year]?.count || 0}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 text-lg">
                        {formatCurrency(yearTotals[year]?.amount || 0)}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>

                {/* Category Rows */}
                {sortedCategories.map((category, catIdx) => {
                  const isExpanded = expandedCategories[category];
                  const categoryData = {};
                  
                  selectedYears.forEach(year => {
                    categoryData[year] = dataByYear[year]?.[category] || { total: 0, count: 0, payees: {} };
                  });

                  const hasAnyData = selectedYears.some(year => 
                    (dataByYear[year]?.[category]?.count || 0) > 0
                  );

                  if (!hasAnyData) return null;

                  // Get all unique payees for this category
                  const allPayees = new Set();
                  selectedYears.forEach(year => {
                    if (dataByYear[year]?.[category]) {
                      Object.keys(dataByYear[year][category].payees).forEach(payee => 
                        allPayees.add(payee)
                      );
                    }
                  });
                  const sortedPayees = Array.from(allPayees).sort();

                  return (
                    <React.Fragment key={category}>
                      {/* Category Summary Row */}
                      <tr
                        className={`border-b border-gray-200 cursor-pointer transition-all duration-200 ${
                          catIdx % 2 === 0 
                            ? 'bg-emerald-50 hover:bg-emerald-100' 
                            : 'bg-white hover:bg-gray-50'
                        }`}
                        onClick={() => toggleCategory(category)}
                      >
                        <td className="px-6 py-4 font-bold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className={`transform transition-transform duration-200 text-emerald-600 ${isExpanded ? 'rotate-90' : ''}`}>
                              ▶
                            </span>
                            {category}
                          </div>
                        </td>
                        {selectedYears.map(year => (
                          <React.Fragment key={year}>
                            <td className="px-4 py-4 text-center font-medium text-gray-700">
                              {categoryData[year].count}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-gray-900">
                              {formatCurrency(categoryData[year].total)}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>

                      {/* Payee Detail Rows */}
                      {isExpanded && sortedPayees.map((payee) => (
                        <tr
                          key={payee}
                          className={`border-b border-gray-100 ${
                            catIdx % 2 === 0 ? 'bg-emerald-25' : 'bg-white'
                          } transition-colors duration-150 hover:bg-emerald-50`}
                        >
                          <td className="px-6 py-3 pl-16 text-gray-700 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-500">•</span>
                              {payee}
                            </div>
                          </td>
                          {selectedYears.map(year => {
                            const payeeData = dataByYear[year]?.[category]?.payees?.[payee] || { amount: 0, count: 0 };
                            return (
                              <React.Fragment key={year}>
                                <td className="px-4 py-3 text-center text-gray-600 text-sm">
                                  {payeeData.count || 0}
                                </td>
                                <td className="px-6 py-3 text-right text-gray-700 text-sm">
                                  {payeeData.count > 0 ? formatCurrency(payeeData.amount) : '0'}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-500">
            💡 Click on any category to expand and view detailed payee information
          </div>
        </div>
      </div>
    );
  }

  return <div className="p-4 text-center">Loading...</div>;
};

export default PayeeByCategoryReport;
