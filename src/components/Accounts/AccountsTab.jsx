import React, { useState, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useData } from '../../contexts/DataContext';
import AddAccountModal from './AddAccountModal';
import AccountDetail from './AccountDetail';
import ReorderAccountsModal from './ReorderAccountsModal';
import { useToast } from '../Toast/ToastProvider';

const AccountsTab = () => {
  const toast = useToast();
  const { accounts, transactions, accountBalances, isLoading } = useData();
  
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);

  // Use cached balances from DataContext
  const balances = accountBalances;

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
      
      let balance;
      if (isMarketValue) {
        // Tính: startingBalance + tất cả transactions (bao gồm unrealized_gain)
        const accTransactions = transactions.filter(t => {
          if (t.type === 'transfer') return t.fromAccount === acc.name || t.toAccount === acc.name;
          if (t.type === 'split') return t.account === acc.name;
          return t.account === acc.name;
        });
        
        const startingBalance = acc.startingBalance || 0;
        
        // Cộng tất cả transactions
        balance = startingBalance;
        accTransactions.forEach(t => {
          if (t.type === 'transfer') {
            const amt = Math.abs(Number(t.amount) || 0);
            balance += t.fromAccount === acc.name ? -amt : amt;
          } else if (t.type === 'split') {
            // Split transactions use totalAmount
            balance += Number(t.totalAmount) || 0;
          } else {
            // Bao gồm unrealized_gain, expense, income...
            balance += Number(t.amount) || 0;
          }
        });
      } else {
        // Transaction-based account: startingBalance + transactions
        const startingBalance = acc.startingBalance || 0;
        balance = startingBalance + (balances[acc.name] || 0);
      }

      groups[acc.group].push({
        ...acc,
        balance
      });
    });

    // Sort by order within each group (use ?? to handle order = 0)
    Object.keys(groups).forEach(group => {
      groups[group].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    });

    return groups;
  }, [accounts, balances, transactions]);

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

  // Get archived accounts (isActive = false)
  const archivedAccounts = useMemo(() => {
    return accounts.filter(acc => !acc.isActive && acc.group !== 'LOANS');
  }, [accounts]);

  // Restore archived account
  const handleRestoreAccount = async (account) => {
    try {
      await updateDoc(doc(db, 'accounts', account.id), { isActive: true });
      toast.success('Account restored!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  if (isLoading) return <div className="p-4 text-center">Loading accounts...</div>;

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
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{acc.icon}</span>
                        <div>
                          <div className="font-medium text-gray-800">{acc.name}</div>
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
      {accounts.filter(a => a.isActive && a.group !== 'LOANS').length === 0 && archivedAccounts.length === 0 && (
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

      {/* Archived Accounts Section */}
      {archivedAccounts.length > 0 && (
        <div className="px-4 mt-6 mb-4">
          <button
            onClick={() => setShowArchivedAccounts(!showArchivedAccounts)}
            className="w-full flex items-center justify-between text-sm font-bold text-gray-400 uppercase mb-2 py-2"
          >
            <span>📦 Archived Accounts ({archivedAccounts.length})</span>
            <span className="text-lg">{showArchivedAccounts ? '▲' : '▼'}</span>
          </button>
          
          {showArchivedAccounts && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              {archivedAccounts.map((acc, index) => (
                <div
                  key={acc.id}
                  className={`p-4 flex justify-between items-center ${index !== archivedAccounts.length - 1 ? 'border-b border-gray-200' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl opacity-50">{acc.icon}</span>
                    <div>
                      <div className="font-medium text-gray-500">{acc.name}</div>
                      <div className="text-xs text-gray-400">{acc.group}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreAccount(acc)}
                    className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-200"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Buttons (Top-Right) */}
      {accounts.length > 0 && (
        <div className="fixed top-4 right-4 md:right-[calc(50%-200px)] flex gap-2 z-30">
          {/* Gear/Settings Button */}
          <button
            onClick={() => setIsReorderModalOpen(true)}
            className="bg-white text-gray-600 border border-gray-200 w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
          >
            ⚙️
          </button>
          {/* Add Account Button */}
          <button
            onClick={() => {
              setEditingAccount(null);
              setIsAddModalOpen(true);
            }}
            className="bg-white text-emerald-600 border border-emerald-200 w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-emerald-50 transition-colors"
          >
            +
          </button>
        </div>
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

      <ReorderAccountsModal
        isOpen={isReorderModalOpen}
        onClose={() => setIsReorderModalOpen(false)}
        accounts={accounts}
        onSave={() => setIsReorderModalOpen(false)}
      />

      {selectedAccount && (() => {
        const currentAccount = accounts.find(a => a.id === selectedAccount.id) || selectedAccount;
        return (
          <AccountDetail
            key={`${currentAccount.id}-${currentAccount.valueHistory?.length || 0}`}
            account={currentAccount}
            transactions={transactions}
            onClose={() => setSelectedAccount(null)}
            onAccountUpdated={() => {}}
          />
        );
      })()}
    </div>
  );
};

export default AccountsTab;