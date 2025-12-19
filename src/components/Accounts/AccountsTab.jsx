import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddAccountModal from './AddAccountModal';
import AccountDetail from './AccountDetail';

const AccountsTab = () => {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Fetch Accounts from Firebase
  useEffect(() => {
    const q = query(collection(db, 'accounts'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const accs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(accs);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Transactions
  useEffect(() => {
    const q = query(collection(db, 'transactions'), where('userId', '==', 'test-user'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(trans);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Calculate balances for transaction-based accounts
  const balances = useMemo(() => {
    const bal = {};

    transactions.forEach(t => {
      const amt = Number(t.amount);
      
      if (t.type === 'transfer') {
        if (t.fromAccount) bal[t.fromAccount] = (bal[t.fromAccount] || 0) - amt;
        if (t.toAccount) bal[t.toAccount] = (bal[t.toAccount] || 0) + amt;
      } else {
        const acc = t.account;
        if (acc) bal[acc] = (bal[acc] || 0) + amt;
      }
    });
    
    return bal;
  }, [transactions]);

  // Group accounts and calculate balances
  const accountGroups = useMemo(() => {
    const groups = {
      'SPENDING': [],
      'SAVINGS': [],
      'INVESTMENTS': []
    };

    accounts.forEach(acc => {
      if (!acc.isActive) return;
      if (!groups[acc.group]) return; // Skip LOANS group

      const isMarketValue = ['investment', 'property', 'vehicle', 'asset'].includes(acc.type);
      
      const balance = isMarketValue 
        ? (acc.currentValue || 0) 
        : (balances[acc.name] || 0);

      groups[acc.group].push({
        ...acc,
        balance
      });
    });

    // Sort by order within each group
    Object.keys(groups).forEach(group => {
      groups[group].sort((a, b) => (a.order || 999) - (b.order || 999));
    });

    return groups;
  }, [accounts, balances]);

  // Calculate Net Worth
  const netWorth = useMemo(() => {
    return Object.values(accountGroups)
      .flat()
      .reduce((sum, acc) => sum + acc.balance, 0);
  }, [accountGroups]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(Math.abs(amount) || 0);
  };

  const handleAccountClick = (account) => {
    setSelectedAccount(account);
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setIsAddModalOpen(true);
  };

  if (loading) return <div className="p-4 text-center">Loading accounts...</div>;

  return (
    <div className="pb-24">
      {/* Net Worth Header */}
      <div className="bg-emerald-600 p-6 text-white text-center shadow-sm mb-4">
        <div className="text-sm opacity-80 uppercase tracking-wider">Net Worth</div>
        <div className={`text-3xl font-bold mt-1`}>
          {netWorth >= 0 ? '' : '-'}{formatCurrency(netWorth)} VND
        </div>
      </div>

      {/* Account Groups */}
      <div className="px-4 space-y-6">
        {Object.entries(accountGroups).map(([groupName, accountList]) => {
          if (accountList.length === 0) return null;
          
          const groupTotal = accountList.reduce((sum, acc) => sum + acc.balance, 0);

          return (
            <div key={groupName}>
              {/* Group Header */}
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-xs font-bold text-gray-500 uppercase">{groupName}</span>
                <span className={`text-xs font-bold ${groupTotal >= 0 ? 'text-gray-700' : 'text-gray-900'}`}>
                  {groupTotal >= 0 ? '' : '-'}{formatCurrency(groupTotal)}
                </span>
              </div>
              
              {/* Account List */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {accountList.map(acc => {
                  const isMarketValue = ['investment', 'property', 'vehicle', 'asset'].includes(acc.type);
                  const isPositive = acc.balance >= 0;
                  
                  return (
                    <div 
                      key={acc.id} 
                      className="p-4 flex justify-between items-center hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                      onClick={() => handleAccountClick(acc)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleEditAccount(acc);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{acc.icon}</span>
                        <div>
                          <div className="font-medium text-gray-800">{acc.name}</div>
                          {isMarketValue && (
                            <div className="text-xs text-blue-600 flex items-center gap-1">
                              📊 Manual value
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {isPositive ? '+' : '-'}{formatCurrency(acc.balance)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {accounts.filter(a => a.isActive && a.group !== 'LOANS').length === 0 && (
        <div className="text-center text-gray-500 py-8 px-4">
          <div className="text-4xl mb-2">🏦</div>
          <p className="mb-4">No accounts yet</p>
          <button
            onClick={() => {
              setEditingAccount(null);
              setIsAddModalOpen(true);
            }}
            className="bg-emerald-500 text-white px-6 py-2 rounded-lg hover:bg-emerald-600 transition-colors"
          >
            + Add First Account
          </button>
        </div>
      )}

      {/* Add Account Button (Floating Top-Right) */}
      {accounts.length > 0 && (
        <button
          onClick={() => {
            setEditingAccount(null);
            setIsAddModalOpen(true);
          }}
          className="fixed top-4 right-4 md:right-[calc(50%-200px)] bg-white text-emerald-600 border border-emerald-200 w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-emerald-50 transition-colors z-30"
        >
          +
        </button>
      )}

      {/* Modals */}
      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingAccount(null);
        }}
        onSave={() => {
          setIsAddModalOpen(false);
          setEditingAccount(null);
        }}
        editAccount={editingAccount}
      />

      {selectedAccount && (
        <AccountDetail
          account={selectedAccount}
          transactions={transactions}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
};

export default AccountsTab;