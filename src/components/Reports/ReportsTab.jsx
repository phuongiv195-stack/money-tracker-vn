import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

const ReportsTab = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Màu sắc cho biểu đồ (Top 5 + Others)
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#9ca3af'];

  useEffect(() => {
    const q = query(collection(db, 'transactions'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => doc.data());
      setTransactions(trans);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- LOGIC TÍNH TOÁN (LOẠI TRỪ LOAN TRANSACTIONS) ---
  const { summary, categoryData, totalExpense } = useMemo(() => {
    const monthStr = currentDate.toISOString().slice(0, 7);
    
    // Filter out loan transactions from reports
    const monthlyTrans = transactions.filter(t => 
      t.date && 
      t.date.startsWith(monthStr) &&
      t.type !== 'loan'
    );

    let inc = 0, exp = 0;
    const catMap = {};

    monthlyTrans.forEach(t => {
      const amt = Number(t.amount);
      if (t.type === 'income') inc += amt;
      if (t.type === 'expense') {
        exp += Math.abs(amt);
        if (t.category) {
          catMap[t.category] = (catMap[t.category] || 0) + Math.abs(amt);
        }
      }
    });

    // Xử lý data cho biểu đồ (Sort và lấy Top 5)
    let sortedCats = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Tính % cho từng mục
    sortedCats = sortedCats.map(item => ({
      ...item,
      percent: exp > 0 ? (item.value / exp) * 100 : 0
    }));

    return {
      summary: { income: inc, expense: exp, net: inc - exp },
      categoryData: sortedCats,
      totalExpense: exp
    };
  }, [transactions, currentDate]);

  // --- LOGIC VẼ BIỂU ĐỒ SVG (DONUT CHART) ---
  const renderPieChart = () => {
    if (totalExpense === 0) return <div className="text-gray-400 text-sm py-10 text-center">No data to display</div>;

    let cumulativePercent = 0;
    
    // Chỉ lấy Top 5, còn lại gom vào Others
    const chartData = categoryData.slice(0, 5);
    const otherValue = categoryData.slice(5).reduce((sum, item) => sum + item.value, 0);
    if (otherValue > 0) {
      chartData.push({ name: 'Others', value: otherValue, percent: (otherValue / totalExpense) * 100 });
    }

    return (
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
        {/* Số tổng ở giữa */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs text-gray-500 font-medium">Total Expense</span>
          <span className="text-sm font-bold text-gray-800">-{formatCurrencyCompact(totalExpense)}</span>
        </div>
      </div>
    );
  };

  // Helpers
  const changeMonth = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const formatCurrency = (val) => new Intl.NumberFormat('en-US').format(Math.abs(val));
  
  const formatCurrencyCompact = (val) => {
    const absVal = Math.abs(val);
    if (absVal >= 1000000) return (absVal / 1000000).toFixed(1) + 'M';
    if (absVal >= 1000) return (absVal / 1000).toFixed(0) + 'k';
    return absVal;
  };

  const getMonthLabel = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (loading) return <div className="p-4 text-center">Loading reports...</div>;

  return (
    <div className="pb-24">
      {/* 1. Month Selector */}
      <div className="bg-white p-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
        <button onClick={() => changeMonth(-1)} className="p-2 bg-gray-100 rounded hover:bg-gray-200">←</button>
        <span className="font-bold text-lg">{getMonthLabel(currentDate)}</span>
        <button onClick={() => changeMonth(1)} className="p-2 bg-gray-100 rounded hover:bg-gray-200">→</button>
      </div>

      {/* Loan Exclusion Notice */}
      <div className="mx-4 mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 text-blue-700">
          <span>ℹ️</span>
          <div>
            <span className="font-semibold">Note:</span> Loan transactions are excluded from these reports. 
            Check the Loans tab for loan details.
          </div>
        </div>
      </div>

      {/* 2. Overview Cards */}
      <div className="p-4 grid grid-cols-3 gap-2 text-center">
        <div className="bg-white p-2 rounded-lg shadow-sm border border-emerald-100">
          <div className="text-[10px] text-gray-500 uppercase">Income</div>
          <div className="text-sm font-bold text-emerald-600">+{formatCurrencyCompact(summary.income)}</div>
        </div>
        <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
          <div className="text-[10px] text-gray-500 uppercase">Expense</div>
          <div className="text-sm font-bold text-gray-900">-{formatCurrencyCompact(summary.expense)}</div>
        </div>
        <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100">
          <div className="text-[10px] text-gray-500 uppercase">Net</div>
          <div className={`text-sm font-bold ${summary.net >= 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
            {summary.net >= 0 ? '+' : '-'}{formatCurrencyCompact(summary.net)}
          </div>
        </div>
      </div>

      {/* 3. CHART SECTION */}
      <div className="bg-white mx-4 rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <h3 className="font-bold text-gray-700 text-sm mb-2">Spending Structure</h3>
        {renderPieChart()}
        
        {/* Legend / List */}
        <div className="space-y-3 mt-4">
          {categoryData.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 flex-1">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                ></div>
                <span className="text-gray-700 truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">-{formatCurrency(item.value)}</span>
                <span className="text-xs text-gray-400 w-8 text-right">{item.percent.toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReportsTab;