import React, { useState, useMemo } from 'react';

// Pie chart colors - same as SpendingBreakdown for consistency
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#f43f5e', '#0ea5e9', '#22c55e'
];

const IncomeBreakdown = ({ transactions, categories, accounts, onBack }) => {
  const [dateRange, setDateRange] = useState('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [viewMode, setViewMode] = useState('categories'); // 'categories' | 'groups'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState(null);

  // Format currency - use comma as thousand separator, no decimals
  const formatCurrency = (amount) => {
    return Math.round(Math.abs(amount || 0)).toLocaleString('en-US');
  };

  // Format percent - show <1% for small values
  const formatPercent = (percent) => {
    if (percent < 1 && percent > 0) return '<1%';
    return `${Math.round(percent)}%`;
  };

  // Get date range
  const getDateRange = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let startDate, endDate;
    
    switch (dateRange) {
      case 'this-month':
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
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
      case 'custom':
        if (customStart && customEnd) {
          startDate = new Date(customStart);
          endDate = new Date(customEnd);
        } else {
          startDate = new Date(currentYear, currentMonth, 1);
          endDate = new Date(currentYear, currentMonth + 1, 0);
        }
        break;
      default:
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
    }
    
    return { startDate, endDate };
  }, [dateRange, customStart, customEnd]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const { startDate, endDate } = getDateRange;
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    return transactions.filter(t => {
      if (!t.date) return false;
      if (t.date < startStr || t.date > endStr) return false;
      return true;
    });
  }, [transactions, getDateRange]);

  // Calculate income data
  const incomeData = useMemo(() => {
    const categoryTotals = {};
    const categoryTransactions = {};
    const groupTotals = {};
    let totalIncome = 0;
    let largestInflow = { amount: 0, payee: '', category: '' };
    const categoryFrequency = {};

    filteredTransactions.forEach(t => {
      // Handle regular income
      if (t.type === 'income') {
        const amount = Math.abs(Number(t.amount) || 0);
        const cat = t.category || 'Uncategorized';
        
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
        if (!categoryTransactions[cat]) categoryTransactions[cat] = [];
        categoryTransactions[cat].push(t);
        
        totalIncome += amount;
        categoryFrequency[cat] = (categoryFrequency[cat] || 0) + 1;
        
        if (amount > largestInflow.amount) {
          largestInflow = { amount, payee: t.payee || 'Unknown', category: cat };
        }
      }
      
      // Handle split transactions with income type
      if (t.type === 'split' && t.splitType === 'income') {
        t.splits?.forEach(s => {
          // Skip transfer and loan splits
          if (s.isTransfer || s.transferAccount || s.isLoan) return;
          if (s.category) {
            const amount = Math.abs(Number(s.amount) || 0);
            const cat = s.category;
            
            categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
            if (!categoryTransactions[cat]) categoryTransactions[cat] = [];
            categoryTransactions[cat].push({ ...t, splitAmount: amount, splitCategory: cat, splitMemo: s.memo });
            
            totalIncome += amount;
            categoryFrequency[cat] = (categoryFrequency[cat] || 0) + 1;
          }
        });
      }
    });

    // Group by category group
    Object.entries(categoryTotals).forEach(([catName, amount]) => {
      const catInfo = categories.find(c => c.name === catName);
      const group = catInfo?.group || 'Other';
      groupTotals[group] = (groupTotals[group] || 0) + amount;
    });

    // Convert to arrays
    const categoryData = Object.entries(categoryTotals)
      .map(([name, value]) => {
        const catInfo = categories.find(c => c.name === name);
        return {
          name,
          value,
          icon: catInfo?.icon || '💰',
          group: catInfo?.group || 'Other',
          percent: totalIncome > 0 ? (value / totalIncome * 100) : 0,
          transactions: categoryTransactions[name] || []
        };
      })
      .sort((a, b) => b.value - a.value);

    const groupData = Object.entries(groupTotals)
      .map(([name, value]) => ({
        name,
        value,
        percent: totalIncome > 0 ? (value / totalIncome * 100) : 0
      }))
      .sort((a, b) => b.value - a.value);

    // Most frequent
    let mostFrequent = { name: '-', count: 0 };
    Object.entries(categoryFrequency).forEach(([cat, count]) => {
      if (count > mostFrequent.count) {
        mostFrequent = { name: cat, count };
      }
    });

    // Averages
    const { startDate, endDate } = getDateRange;
    const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    const monthsDiff = Math.max(1, Math.ceil(daysDiff / 30));

    return {
      categoryData,
      groupData,
      totalIncome,
      largestInflow,
      mostFrequent,
      avgMonthly: totalIncome / monthsDiff,
      avgDaily: totalIncome / daysDiff
    };
  }, [filteredTransactions, categories, getDateRange]);

  const displayData = viewMode === 'categories' ? incomeData.categoryData : incomeData.groupData;
  const maxValue = Math.max(...displayData.map(d => d.value), 1);

  // Date range label
  const getDateRangeLabel = () => {
    const { startDate, endDate } = getDateRange;
    const format = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (dateRange === 'this-month') return format(startDate);
    return `${format(startDate)} – ${format(endDate)}`;
  };

  // Render Donut Chart with labels
  const renderDonutChart = () => {
    const total = displayData.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) {
      return (
        <div className="flex items-center justify-center h-[500px]">
          <div className="text-gray-400 text-center">
            <div className="text-6xl mb-4">📊</div>
            <div className="text-xl">No income data</div>
          </div>
        </div>
      );
    }

    const size = 420;
    const strokeWidth = 75;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const centerX = size / 2;
    const centerY = size / 2;

    // Calculate segments with proper offsets
    let offset = 0;
    const segments = displayData.map((item, index) => {
      const percent = item.value / total;
      const dashLength = circumference * percent;
      const seg = {
        ...item,
        color: COLORS[index % COLORS.length],
        dashArray: `${dashLength} ${circumference - dashLength}`,
        dashOffset: circumference - offset,
        percent: percent * 100,
        midAngle: -90 + (offset / circumference) * 360 + (dashLength / circumference) * 180,
        index
      };
      offset += dashLength;
      return seg;
    });

    // Container dimensions
    const containerWidth = size + 500;
    const containerHeight = size + 140;
    const chartOffsetX = 220;
    const chartOffsetY = 70;

    // Separate large and small segments
    const largeSegments = segments.filter(s => s.percent >= 3);
    const smallSegments = segments.filter(s => s.percent < 3);

    // Calculate label positions avoiding overlap for large segments
    const getSmartLabelPositions = () => {
      const labels = [];
      const minLabelGap = 45;
      
      largeSegments.forEach((seg) => {
        const angleRad = (seg.midAngle) * Math.PI / 180;
        const labelRadius = size / 2 + 35;
        let x = chartOffsetX + centerX + labelRadius * Math.cos(angleRad);
        let y = chartOffsetY + centerY + labelRadius * Math.sin(angleRad);
        
        const isLeft = x < chartOffsetX + centerX;
        
        for (let i = 0; i < labels.length; i++) {
          const existingLabel = labels[i];
          const yDiff = Math.abs(y - existingLabel.y);
          const sameHalf = (isLeft && existingLabel.isLeft) || (!isLeft && !existingLabel.isLeft);
          
          if (sameHalf && yDiff < minLabelGap) {
            if (y > existingLabel.y) {
              y = existingLabel.y + minLabelGap;
            } else {
              y = existingLabel.y - minLabelGap;
            }
          }
        }
        
        labels.push({ ...seg, x, y, isLeft, originalIndex: seg.index });
      });
      
      return labels;
    };

    const labelPositions = getSmartLabelPositions();

    // Calculate Everything Else totals
    const everythingElseTotal = smallSegments.reduce((s, d) => s + d.value, 0);
    const everythingElsePercent = smallSegments.reduce((s, d) => s + d.percent, 0);

    // Create combined segments: large segments + one "Everything Else" segment
    const combinedSegments = [];
    let combinedOffset = 0;
    
    // Add large segments first
    largeSegments.forEach((seg) => {
      const percent = seg.value / total;
      const dashLength = circumference * percent;
      combinedSegments.push({
        ...seg,
        dashArray: `${dashLength} ${circumference - dashLength}`,
        dashOffset: circumference - combinedOffset,
        isEverythingElse: false
      });
      combinedOffset += dashLength;
    });
    
    // Add "Everything Else" as single segment if there are small segments
    if (smallSegments.length > 0) {
      const everythingElsePercent = everythingElseTotal / total;
      const dashLength = circumference * everythingElsePercent;
      combinedSegments.push({
        name: 'Everything Else',
        value: everythingElseTotal,
        color: '#9ca3af', // Gray color for Everything Else
        dashArray: `${dashLength} ${circumference - dashLength}`,
        dashOffset: circumference - combinedOffset,
        percent: everythingElsePercent * 100,
        isEverythingElse: true,
        smallSegments: smallSegments,
        index: segments.length
      });
    }

    return (
      <div className="relative" style={{ width: containerWidth, height: containerHeight, margin: '0 auto' }}>
        {/* SVG Chart */}
        <svg 
          width={size} 
          height={size} 
          className="transform -rotate-90"
          style={{ marginLeft: chartOffsetX, marginTop: chartOffsetY }}
        >
          {combinedSegments.map((seg, idx) => (
            <circle
              key={idx}
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              className="cursor-pointer transition-all duration-200"
              style={{
                opacity: hoveredSegment === null ? 1 : (hoveredSegment === (seg.isEverythingElse ? 'everything-else' : seg.index) ? 1 : 0.3),
                filter: hoveredSegment === (seg.isEverythingElse ? 'everything-else' : seg.index) ? 'brightness(1.1)' : 'none'
              }}
              onMouseEnter={() => setHoveredSegment(seg.isEverythingElse ? 'everything-else' : seg.index)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => {
                if (!seg.isEverythingElse && viewMode === 'categories') {
                  setSelectedCategory(seg);
                }
              }}
            />
          ))}
        </svg>
        
        {/* Center Text */}
        <div 
          className="absolute flex flex-col items-center justify-center"
          style={{ 
            left: chartOffsetX + size/2 - 100, 
            top: chartOffsetY + size/2 - 50,
            width: 200,
            height: 100
          }}
        >
          <div className="text-gray-600 text-base font-medium">Total Income</div>
          <div className="text-4xl font-bold text-emerald-600 mt-1">{formatCurrency(total)}</div>
        </div>
        
        {/* Labels for large segments */}
        {labelPositions.map((label, idx) => (
          <div
            key={idx}
            className="absolute pointer-events-none transition-all duration-200"
            style={{
              left: label.x,
              top: label.y,
              transform: `translate(${label.isLeft ? '-100%' : '0'}, -50%)`,
              maxWidth: 200,
              opacity: hoveredSegment === null ? 1 : (hoveredSegment === label.originalIndex ? 1 : 0.4),
              fontWeight: hoveredSegment === label.originalIndex ? '700' : undefined
            }}
          >
            <div 
              className="font-semibold text-gray-800 truncate"
              style={{ 
                fontSize: '14px',
                color: hoveredSegment === label.originalIndex ? label.color : undefined
              }}
            >
              {viewMode === 'categories' && label.icon} {label.name}
            </div>
            <div className="text-gray-700 font-medium" style={{ fontSize: '13px' }}>
              {formatCurrency(label.value)} <span className="text-gray-500">({formatPercent(label.percent)})</span>
            </div>
          </div>
        ))}

        {/* Everything Else label for small segments */}
        {smallSegments.length > 0 && (
          <div 
            className="absolute pointer-events-none text-center transition-all duration-200"
            style={{ 
              left: chartOffsetX + centerX - 40, 
              top: 8, 
              width: 160,
              opacity: hoveredSegment === null ? 1 : (hoveredSegment === 'everything-else' ? 1 : 0.4)
            }}
          >
            <div className="font-semibold text-gray-800" style={{ fontSize: '14px' }}>Everything Else</div>
            <div className="text-gray-700 font-medium" style={{ fontSize: '13px' }}>
              {formatCurrency(everythingElseTotal)} <span className="text-gray-500">({formatPercent(everythingElsePercent)})</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Category List with bar chart
  const renderCategoryList = () => {
    return (
      <div className="space-y-3">
        {displayData.map((item, idx) => (
          <div
            key={item.name}
            className={`p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition ${
              selectedCategory?.name === item.name ? 'bg-emerald-50' : ''
            }`}
            onClick={() => viewMode === 'categories' && setSelectedCategory(item)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div 
                  className="w-4 h-4 rounded flex-shrink-0" 
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="text-sm font-medium text-gray-800 truncate">
                  {viewMode === 'categories' && item.icon} {item.name}
                </span>
              </div>
              <div className="text-base font-bold text-gray-900 ml-2">
                {formatCurrency(item.value)}
              </div>
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${Math.max((item.value / maxValue) * 100, 0.5)}%`,
                    backgroundColor: COLORS[idx % COLORS.length]
                  }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 w-12 text-right">{formatPercent(item.percent)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Transaction Popup
  const renderTransactionPopup = () => {
    if (!selectedCategory || viewMode !== 'categories') return null;
    const trans = selectedCategory.transactions || [];
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedCategory(null)}>
        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b bg-emerald-50">
            <h3 className="font-bold text-xl text-emerald-800">{selectedCategory.icon} {selectedCategory.name}</h3>
            <div className="text-sm text-emerald-600">{trans.length} transactions • {formatCurrency(selectedCategory.value)} total</div>
          </div>
          
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">ACCOUNT</th>
                  <th className="text-left p-3 font-medium text-gray-600">DATE</th>
                  <th className="text-left p-3 font-medium text-gray-600">PAYEE</th>
                  <th className="text-left p-3 font-medium text-gray-600">MEMO</th>
                  <th className="text-right p-3 font-medium text-gray-600">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {trans.map((t, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-600">{t.account || '-'}</td>
                    <td className="p-3 text-gray-600">{t.date}</td>
                    <td className="p-3 text-gray-700">{t.payee || '-'}</td>
                    <td className="p-3 text-gray-500">{t.splitMemo || t.memo || '-'}</td>
                    <td className="p-3 text-right font-medium text-emerald-600">+{formatCurrency(t.splitAmount || Math.abs(t.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 border-t">
            <button onClick={() => setSelectedCategory(null)} className="w-full py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 font-medium">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Date Picker
  const renderDatePicker = () => {
    if (!showDatePicker) return null;
    
    const options = [
      { value: 'this-month', label: 'This Month' },
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
      { value: 'custom', label: 'Custom' },
    ];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDatePicker(false)}>
        <div className="bg-white rounded-xl shadow-2xl w-96 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="p-4 space-y-1">
            {options.map(opt => (
              <div
                key={opt.value}
                className={`p-3 rounded-lg cursor-pointer transition ${dateRange === opt.value ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50'}`}
                onClick={() => {
                  setDateRange(opt.value);
                  if (opt.value !== 'custom') setShowDatePicker(false);
                }}
              >
                <div className="flex justify-between">
                  <span>{opt.label}</span>
                  {dateRange === opt.value && <span>✓</span>}
                </div>
              </div>
            ))}
            
            {dateRange === 'custom' && (
              <div className="mt-4 pt-4 border-t space-y-4">
                <div>
                  <label className="text-sm text-gray-500 block mb-2">Start Date</label>
                  <div className="flex gap-2">
                    <select
                      value={customStart ? customStart.split('-')[1] : ''}
                      onChange={e => {
                        const year = customStart ? customStart.split('-')[0] : new Date().getFullYear();
                        setCustomStart(`${year}-${e.target.value}-01`);
                      }}
                      className="flex-1 p-3 border rounded-lg"
                    >
                      <option value="">Month</option>
                      {[...Array(12)].map((_, i) => (
                        <option key={i+1} value={String(i+1).padStart(2,'0')}>
                          {new Date(2000, i, 1).toLocaleString('en-US', {month: 'short'})}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customStart ? customStart.split('-')[0] : ''}
                      onChange={e => {
                        const month = customStart ? customStart.split('-')[1] : '01';
                        setCustomStart(`${e.target.value}-${month}-01`);
                      }}
                      className="flex-1 p-3 border rounded-lg"
                    >
                      <option value="">Year</option>
                      {[...Array(10)].map((_, i) => (
                        <option key={2026+i} value={2026+i}>{2026+i}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-2">End Date</label>
                  <div className="flex gap-2">
                    <select
                      value={customEnd ? customEnd.split('-')[1] : ''}
                      onChange={e => {
                        const year = customEnd ? customEnd.split('-')[0] : new Date().getFullYear();
                        setCustomEnd(`${year}-${e.target.value}-28`);
                      }}
                      className="flex-1 p-3 border rounded-lg"
                    >
                      <option value="">Month</option>
                      {[...Array(12)].map((_, i) => (
                        <option key={i+1} value={String(i+1).padStart(2,'0')}>
                          {new Date(2000, i, 1).toLocaleString('en-US', {month: 'short'})}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customEnd ? customEnd.split('-')[0] : ''}
                      onChange={e => {
                        const month = customEnd ? customEnd.split('-')[1] : '12';
                        setCustomEnd(`${e.target.value}-${month}-28`);
                      }}
                      className="flex-1 p-3 border rounded-lg"
                    >
                      <option value="">Year</option>
                      {[...Array(10)].map((_, i) => (
                        <option key={2026+i} value={2026+i}>{2026+i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t flex gap-3">
            <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">Cancel</button>
            <button onClick={() => setShowDatePicker(false)} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 font-medium">Apply</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
                ← Back
              </button>
              <h1 className="text-xl font-bold text-gray-800">Income Breakdown</h1>
              
              {/* Date Range Button */}
              <button
                onClick={() => setShowDatePicker(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <span>📅</span>
                <span className="font-medium">{getDateRangeLabel()}</span>
                <span>▼</span>
              </button>
            </div>
            
            <button className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 font-medium">
              📥 Export
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="flex gap-6">
          {/* Left: Chart Area */}
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-6">
              {/* Header with Toggle */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-gray-600 text-base font-medium">Total Income</div>
                  <div className="text-5xl font-bold text-emerald-600">{formatCurrency(incomeData.totalIncome)}</div>
                </div>
                
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('categories')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition ${viewMode === 'categories' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
                  >
                    Categories
                  </button>
                  <button
                    onClick={() => setViewMode('groups')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition ${viewMode === 'groups' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
                  >
                    Groups
                  </button>
                </div>
              </div>

              {/* Chart */}
              <div className="flex justify-center overflow-visible">
                {renderDonutChart()}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="text-gray-600 text-sm font-medium">Average Monthly Income</div>
                <div className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(incomeData.avgMonthly)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="text-gray-600 text-sm font-medium">Average Daily Income</div>
                <div className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(incomeData.avgDaily)}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="text-gray-600 text-sm font-medium">Most Frequent Category</div>
                <div className="text-xl font-bold text-gray-900 mt-2 truncate">{incomeData.mostFrequent.name}</div>
                <div className="text-sm text-gray-600 font-medium">{incomeData.mostFrequent.count} transactions</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="text-gray-600 text-sm font-medium">Largest Inflow</div>
                <div className="text-xl font-bold text-gray-900 mt-2 truncate">{incomeData.largestInflow.payee}</div>
                <div className="text-sm text-emerald-600 font-medium">+{formatCurrency(incomeData.largestInflow.amount)}</div>
              </div>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="w-96 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              <div className="flex justify-between items-center mb-4 pb-3 border-b">
                <h3 className="font-bold text-gray-900 text-lg">{viewMode === 'categories' ? 'Categories' : 'Groups'}</h3>
                <span className="text-sm font-medium text-gray-600">Total Income</span>
              </div>
              
              <div className="max-h-[calc(100vh-220px)] overflow-auto">
                {renderCategoryList()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {renderTransactionPopup()}
      {renderDatePicker()}
    </div>
  );
};

export default IncomeBreakdown;
