import React, { useState, useMemo, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useData } from '../../contexts/DataContext';
import AddAccountModal from './AddAccountModal';
import AccountDetail from './AccountDetail';
import ReorderAccountsModal from './ReorderAccountsModal';
import { useToast } from '../Toast/ToastProvider';

const AccountsTab = () => {
  const toast = useToast();
  const { accounts, transactions, accountBalances, isLoading, hiddenAccounts, setHiddenAccounts } = useData();
  
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);
  
  // Account Settings Menu
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showQuickSelectModal, setShowQuickSelectModal] = useState(false);
  
  // Long press handling
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const triggerHaptic = () => {
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const handleLongPressStart = (account, e) => {
    longPressTriggered.current = false;
    
    if (e?.touches?.[0]) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e) {
      touchStartPos.current = { x: e.clientX, y: e.clientY };
    }
    
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      triggerHaptic();
      // Open Edit Account modal
      setEditingAccount(account);
      setIsAddModalOpen(true);
    }, 400);
  };

  const handleLongPressMove = (e) => {
    if (!longPressTimer.current) return;
    
    let currentX, currentY;
    if (e?.touches?.[0]) {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    const deltaX = Math.abs(currentX - touchStartPos.current.x);
    const deltaY = Math.abs(currentY - touchStartPos.current.y);
    
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleAccountClick = (account) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setSelectedAccount(account);
  };
  
  // Toggle account visibility
  const toggleAccountVisibility = (accountName) => {
    setHiddenAccounts(prev => {
      if (prev.includes(accountName)) {
        return prev.filter(name => name !== accountName);
      } else {
        return [...prev, accountName];
      }
    });
  };

  // Use cached balances from DataContext
  const balances = accountBalances;

  // Group accounts and calculate balances
  const accountGroups = useMemo(() => {
    const groups = {
      'SPENDING': [],
      'SAVINGS': [],
      'INVESTMENTS': [],
      'ASSETS': []
    };

    accounts.forEach(acc => {
      if (!acc.isActive) return;
      if (!groups[acc.group]) return; // Skip LOANS group

      const isMarketValue = ['investment', 'property', 'vehicle', 'asset'].includes(acc.type);
      
      let balance;
      if (isMarketValue) {
        // Tính: startingBalance + tất cả transactions (bao gồm unrealized_gain)
        const accTransactions = [];
        
        transactions.forEach(t => {
          if (t.type === 'transfer') {
            if (t.fromAccount === acc.name || t.toAccount === acc.name) {
              accTransactions.push(t);
            }
          } else if (t.type === 'split') {
            // Include if main account matches
            if (t.account === acc.name) {
              accTransactions.push(t);
            }
            // Also check if any split has this account as transferAccount
            if (t.splits && Array.isArray(t.splits)) {
              t.splits.forEach((s, idx) => {
                if (s.isTransfer && s.transferAccount === acc.name) {
                  // Create a virtual transaction entry
                  accTransactions.push({
                    ...t,
                    _isSplitTransfer: true,
                    _splitAmount: s.amount,
                    _parentSplitType: t.splitType
                  });
                }
              });
            }
          } else {
            if (t.account === acc.name) {
              accTransactions.push(t);
            }
          }
        });
        
        const startingBalance = acc.startingBalance || 0;
        
        // Cộng tất cả transactions
        balance = startingBalance;
        accTransactions.forEach(t => {
          if (t._isSplitTransfer) {
            // For income split: money comes FROM this account (negative)
            // For expense split: money goes TO this account (positive)
            const splitAmt = Math.abs(Number(t._splitAmount) || 0);
            balance += t._parentSplitType === 'income' ? -splitAmt : splitAmt;
          } else if (t.type === 'transfer') {
            balance += t.fromAccount === acc.name ? -Number(t.amount) : Number(t.amount);
          } else if (t.type === 'split') {
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

  // Calculate Net Worth and Breakdown
  const netWorthData = useMemo(() => {
    const totalAccounts = Object.values(accountGroups)
      .flat()
      .reduce((sum, acc) => sum + acc.balance, 0);
    
    let lendTotal = 0;
    let borrowTotal = 0;
    
    // Calculate loan totals from transactions
    transactions.forEach(t => {
      if (t.type === 'loan') {
        const amt = Number(t.amount) || 0;
        if (t.loanType === 'lend') {
          lendTotal += amt;
        } else if (t.loanType === 'borrow') {
          borrowTotal += amt;
        }
      }
    });
    
    const netWorth = totalAccounts + lendTotal + borrowTotal; // borrowTotal is already negative
    
    return {
      totalAccounts,
      lendTotal,
      borrowTotal,
      netWorth
    };
  }, [accountGroups, transactions]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(Math.abs(amount) || 0);
  };

  // Format with +/- sign, but show just "0" for zero values
  const formatWithSign = (amount) => {
    const num = amount || 0;
    const formatted = new Intl.NumberFormat('en-US').format(Math.abs(num));
    if (num === 0) return '0';
    return num > 0 ? `+${formatted}` : `-${formatted}`;
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

  // Wait for both accounts AND transactions to load before showing balance
  // This prevents showing incorrect starting balance before transactions sync
  if (isLoading || (accounts.length > 0 && transactions.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-3"></div>
          <div className="text-gray-600">Loading account data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header with buttons */}
      <div className="bg-emerald-600 p-6 text-white shadow-sm mb-4 relative">
        {/* Total Balance - No longer clickable */}
        <div className="text-center mx-auto max-w-[200px]">
          <div className="text-sm opacity-80 uppercase tracking-wider font-bold">Total Balance</div>
          <div className="text-3xl font-bold mt-1">
            {netWorthData.totalAccounts >= 0 ? '' : '-'}{formatCurrency(netWorthData.totalAccounts)}
          </div>
        </div>
        
        {/* Buttons - Top Right Corner - higher z-index */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsMenu(true);
            }}
            className="bg-white/20 hover:bg-white/30 rounded-lg w-10 h-10 flex items-center justify-center text-lg"
          >
            ⚙️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingAccount(null);
              setIsAddModalOpen(true);
            }}
            className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-2 text-sm font-medium"
          >
            + New
          </button>
        </div>
      </div>

      {/* Account Groups */}
      <div className="px-4 space-y-6">
        {['SPENDING', 'SAVINGS', 'INVESTMENTS', 'ASSETS'].map(groupName => {
          const accountList = accountGroups[groupName] || [];
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
                      onTouchStart={(e) => handleLongPressStart(acc, e)}
                      onTouchMove={handleLongPressMove}
                      onTouchEnd={handleLongPressEnd}
                      onMouseDown={(e) => handleLongPressStart(acc, e)}
                      onMouseMove={handleLongPressMove}
                      onMouseUp={handleLongPressEnd}
                      onMouseLeave={handleLongPressEnd}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        triggerHaptic();
                        setEditingAccount(acc);
                        setIsAddModalOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{acc.icon}</span>
                        <div>
                          <div className="font-medium text-gray-800">{acc.name}</div>
                        </div>
                      </div>
                      <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {formatWithSign(acc.balance)}
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

      {/* Account Settings Menu */}
      {showSettingsMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowSettingsMenu(false)}>
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-600 p-4 text-white text-center">
              <div className="text-2xl mb-1">⚙️</div>
              <div className="font-bold text-lg">Account Settings</div>
            </div>
            <div className="divide-y divide-gray-100">
              <button
                onClick={() => {
                  setShowSettingsMenu(false);
                  setIsReorderModalOpen(true);
                }}
                className="w-full p-4 flex items-center gap-3 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
              >
                <span className="text-xl">↕️</span>
                <span className="text-gray-800 font-medium">Reorder Accounts</span>
              </button>
              <button
                onClick={() => {
                  setShowSettingsMenu(false);
                  setShowQuickSelectModal(true);
                }}
                className="w-full p-4 flex items-center gap-3 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
              >
                <span className="text-xl">⚡</span>
                <span className="text-gray-800 font-medium">Quick Select Accounts</span>
              </button>
            </div>
            <div className="p-3 border-t border-gray-100">
              <button
                onClick={() => setShowSettingsMenu(false)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Select Accounts Modal */}
      {showQuickSelectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowQuickSelectModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-2xl mb-1">⚡</div>
              <div className="font-bold">Quick Select Accounts</div>
              <div className="text-amber-100 text-xs mt-1">Local setting for this device</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(() => {
                // Group and sort accounts like in AccountsTab
                const groupOrder = { 'SPENDING': 0, 'SAVINGS': 1, 'INVESTMENTS': 2, 'ASSETS': 3 };
                const groupLabels = { 'SPENDING': '💳 Spending', 'SAVINGS': '🏦 Savings', 'INVESTMENTS': '📈 Investments', 'ASSETS': '🏠 Assets' };
                
                const sortedAccounts = accounts
                  .filter(a => a.isActive && a.type !== 'loan')
                  .sort((a, b) => {
                    const groupA = groupOrder[a.group] ?? 99;
                    const groupB = groupOrder[b.group] ?? 99;
                    if (groupA !== groupB) return groupA - groupB;
                    return (a.order ?? 999) - (b.order ?? 999);
                  });
                
                // Group accounts
                const grouped = {};
                sortedAccounts.forEach(acc => {
                  const group = acc.group || 'OTHER';
                  if (!grouped[group]) grouped[group] = [];
                  grouped[group].push(acc);
                });
                
                return ['SPENDING', 'SAVINGS', 'INVESTMENTS', 'ASSETS'].map(groupKey => {
                  if (!grouped[groupKey] || grouped[groupKey].length === 0) return null;
                  return (
                    <div key={groupKey}>
                      <div className="px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase">
                        {groupLabels[groupKey]}
                      </div>
                      {grouped[groupKey].map(acc => (
                        <button
                          key={acc.id}
                          onClick={() => toggleAccountVisibility(acc.name)}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{acc.icon}</span>
                            <span className="text-gray-700">{acc.name}</span>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            !hiddenAccounts.includes(acc.name) 
                              ? 'bg-emerald-500 border-emerald-500 text-white' 
                              : 'border-gray-300'
                          }`}>
                            {!hiddenAccounts.includes(acc.name) && '✓'}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="p-3 border-t bg-gray-50">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => {
                    // Select All - remove all from hiddenAccounts
                    setHiddenAccounts([]);
                  }}
                  className="flex-1 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200"
                >
                  ✓ Select All
                </button>
                <button
                  onClick={() => {
                    // Unselect All - add all account names to hiddenAccounts
                    const allAccountNames = accounts
                      .filter(a => a.isActive && a.type !== 'loan')
                      .map(a => a.name);
                    setHiddenAccounts(allAccountNames);
                  }}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
                >
                  ✕ Unselect All
                </button>
              </div>
              <div className="text-xs text-gray-500 text-center mb-2">
                ℹ️ Unchecked accounts won't appear in transaction dropdown
              </div>
              <button
                onClick={() => setShowQuickSelectModal(false)}
                className="w-full py-2 bg-emerald-500 text-white rounded-lg font-medium"
              >
                Done
              </button>
            </div>
          </div>
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