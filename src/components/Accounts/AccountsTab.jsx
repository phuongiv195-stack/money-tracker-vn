import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

const AccountsTab = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cấu hình nhóm tài khoản (Hardcode theo Design)
  const accountGroups = {
    'SPENDING': ['Cash', 'Vietcombank', 'Techcombank', 'BV Checking'],
    'SAVINGS': ['VCB Savings 6M', 'Heo đất'],
    'INVESTMENTS': ['D-Cash SSI', 'Coin', 'Chứng khoán'],
    'LOANS': ['Loan to Minh', 'Bố gửi tiền']
  };

  // Fetch Transactions
  useEffect(() => {
    const q = query(collection(db, 'transactions'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => doc.data());
      setTransactions(trans);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // TÍNH TOÁN SỐ DƯ (Logic cốt lõi)
  const balances = useMemo(() => {
    const bal = {};

    transactions.forEach(t => {
      const amt = Number(t.amount);
      
      if (t.type === 'transfer') {
        // Transfer: Trừ nơi đi, cộng nơi đến
        if (t.fromAccount) bal[t.fromAccount] = (bal[t.fromAccount] || 0) - amt;
        if (t.toAccount) bal[t.toAccount] = (bal[t.toAccount] || 0) + amt;
      } else {
        // Income/Expense: Cộng/Trừ trực tiếp vào account
        // Lưu ý: Expense trong DB đang lưu số ÂM, nên cứ cộng vào là được
        const acc = t.account;
        if (acc) bal[acc] = (bal[acc] || 0) + amt;
      }
    });
    return bal;
  }, [transactions]);

  // Tính Net Worth (Tổng tài sản)
  const netWorth = Object.values(balances).reduce((a, b) => a + b, 0);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(amount || 0);
  };

  if (loading) return <div className="p-4 text-center">Loading accounts...</div>;

  return (
    <div className="pb-24">
      {/* 1. Net Worth Header */}
      <div className="bg-emerald-600 p-6 text-white text-center shadow-sm mb-4">
        <div className="text-sm opacity-80 uppercase tracking-wider">Net Worth</div>
        <div className="text-3xl font-bold mt-1">{formatCurrency(netWorth)} VND</div>
      </div>

      {/* 2. Account Groups */}
      <div className="px-4 space-y-6">
        {Object.entries(accountGroups).map(([groupName, accountList]) => {
            // Lọc ra những account có số dư hoặc có trong list
            // Logic: Hiện tất cả account trong list mẫu + account lạ (nếu có tiền)
            const accountsToShow = accountList.filter(acc => true); // Hiện hết list mẫu
            
            // Tính tổng group
            const groupTotal = accountsToShow.reduce((sum, acc) => sum + (balances[acc] || 0), 0);

            return (
                <div key={groupName}>
                    <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-xs font-bold text-gray-500 uppercase">{groupName}</span>
                        <span className="text-xs font-bold text-gray-500">{formatCurrency(groupTotal)}</span>
                    </div>
                    
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                        {accountsToShow.map(accName => (
                            <div key={accName} className="p-4 flex justify-between items-center hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    {/* Icon placeholder theo Group */}
                                    <span className="text-xl">
                                        {groupName === 'SPENDING' ? '💳' : 
                                         groupName === 'SAVINGS' ? '🐷' :
                                         groupName === 'INVESTMENTS' ? '📈' : '💸'}
                                    </span>
                                    <span className="font-medium text-gray-800">{accName}</span>
                                </div>
                                <div className={`font-bold ${(balances[accName] || 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                                    {formatCurrency(balances[accName])}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        })}
      </div>

      {/* 3. Transfer Button (Fixed Bottom) */}
      <div className="fixed bottom-24 left-4 z-30">
        <button 
            className="bg-white text-emerald-600 border border-emerald-200 px-4 py-2 rounded-full shadow-lg font-bold text-sm flex items-center gap-2 active:bg-emerald-50"
            // Sau này sẽ mở Modal Transfer tại đây
            onClick={() => alert("Chức năng Quick Transfer đang phát triển!")}
        >
            <span>⇄</span> Transfer
        </button>
      </div>
    </div>
  );
};

export default AccountsTab;