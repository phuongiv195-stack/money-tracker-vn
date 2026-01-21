import React, { useState, useMemo, useEffect } from 'react';
import { writeBatch, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useData } from '../../contexts/DataContext';
import AddNewLoanModal from './AddNewLoanModal';
import LoanDetail from './LoanDetail';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import { useToast } from '../Toast/ToastProvider';

const LoansTab = () => {
  const toast = useToast();
  const { loanTransactions, splitTransactions, futureTransactions, groupedAccounts, isLoading } = useData();
  
  const [isAddNewLoanOpen, setIsAddNewLoanOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [activatingTransaction, setActivatingTransaction] = useState(null);
  const [activateAccount, setActivateAccount] = useState('');
  const [activateDate, setActivateDate] = useState('');
  const [isAddFutureOpen, setIsAddFutureOpen] = useState(false);

  // Action state
  const [actionLoan, setActionLoan] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [editLoanName, setEditLoanName] = useState('');
  const [successMessage, setSuccessMessage] = useState(null);
  const [showArchivedLoans, setShowArchivedLoans] = useState(false);

  // Listen for openLoanDetail event to navigate directly to a specific loan
  useEffect(() => {
    const handleOpenLoanDetail = (e) => {
      const loanName = e.detail?.loanName;
      if (loanName) {
        // selectedLoan needs to be an object with 'name' property
        setSelectedLoan({ name: loanName });
      }
    };
    window.addEventListener('openLoanDetail', handleOpenLoanDetail);
    return () => window.removeEventListener('openLoanDetail', handleOpenLoanDetail);
  }, []);

  // Calculate loan data including splits
  const loanData = useMemo(() => {
    const loans = {};
    
    // First, get list of archived loan names from loan transactions
    const archivedLoanNames = new Set();
    loanTransactions.forEach(t => {
      if (t.archived && t.loan) {
        archivedLoanNames.add(t.loan);
      }
    });

    // Process regular loan transactions
    loanTransactions.forEach(t => {
      // Skip archived transactions
      if (t.archived) return;
      
      const loanName = t.loan;
      if (!loanName) return;
      
      // Skip if this loan name is archived (some transactions might not have archived flag yet)
      if (archivedLoanNames.has(loanName)) return;

      if (!loans[loanName]) {
        loans[loanName] = {
          name: loanName,
          loanType: t.loanType,
          balance: 0,
          paidBack: 0,
          received: 0,
          transactions: []
        };
      }

      const amt = Number(t.amount);
      loans[loanName].balance += amt;
      
      if (t.loanType === 'borrow' && amt < 0) {
        loans[loanName].paidBack += Math.abs(amt);
      } else if (t.loanType === 'lend' && amt > 0) {
        loans[loanName].received += amt;
      }

      loans[loanName].transactions.push(t);
    });

    // Process split transactions with loan splits
    splitTransactions.forEach(t => {
      if (!t.splits || t.archived) return;
      
      t.splits.forEach((split, splitIndex) => {
        if (!split.isLoan || !split.loan) return;
        
        const loanName = split.loan;
        
        // Skip if this loan name is archived
        if (archivedLoanNames.has(loanName)) return;
        
        if (!loans[loanName]) {
          // Check if there's an existing loan transaction with this name
          const existingLoan = loanTransactions.find(lt => lt.loan === loanName);
          
          // Determine loanType: 
          // 1. From split.loanType if available
          // 2. From existing loan transaction
          // 3. Infer from loan name (Lend to X = lend, Borrow from X = borrow)
          // 4. Default to 'borrow'
          let determinedLoanType = split.loanType || existingLoan?.loanType;
          if (!determinedLoanType) {
            if (loanName.toLowerCase().startsWith('lend to')) {
              determinedLoanType = 'lend';
            } else if (loanName.toLowerCase().startsWith('borrow from')) {
              determinedLoanType = 'borrow';
            } else {
              determinedLoanType = 'borrow'; // default
            }
          }
          
          loans[loanName] = {
            name: loanName,
            loanType: determinedLoanType,
            balance: 0,
            paidBack: 0,
            received: 0,
            transactions: []
          };
        }

        const isIncomeParent = Number(t.totalAmount) > 0;
        const splitAmt = Number(split.amount) || 0;
        const signedAmt = isIncomeParent ? splitAmt : -splitAmt;
        loans[loanName].balance += signedAmt;

        if (loans[loanName].loanType === 'borrow' && signedAmt < 0) {
          loans[loanName].paidBack += Math.abs(signedAmt);
        } else if (loans[loanName].loanType === 'lend' && signedAmt > 0) {
          loans[loanName].received += signedAmt;
        }

        loans[loanName].transactions.push({
          id: `${t.id}-split-${splitIndex}-${split.loan}`,
          type: 'loan',
          loan: loanName,
          loanType: loans[loanName].loanType,
          amount: signedAmt,
          date: t.date,
          payee: t.payee || null,
          memo: split.memo || null,
          account: t.account,
          isSplitPart: true,
          parentSplitId: t.id,
          clearStatus: t.clearStatus || 'uncleared'
        });
      });
    });

    // Sort transactions by date desc
    Object.values(loans).forEach(loan => {
      loan.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return loans;
  }, [loanTransactions, splitTransactions]);

  // Calculate ARCHIVED loan data
  const archivedLoanData = useMemo(() => {
    const loans = {};
    
    // Get list of archived loan names
    const archivedLoanNames = new Set();
    loanTransactions.forEach(t => {
      if (t.archived && t.loan) {
        archivedLoanNames.add(t.loan);
      }
    });

    // Process archived loan transactions
    loanTransactions.forEach(t => {
      if (!t.archived) return; // Only archived
      
      const loanName = t.loan;
      if (!loanName) return;

      if (!loans[loanName]) {
        loans[loanName] = {
          name: loanName,
          loanType: t.loanType,
          balance: 0,
          paidBack: 0,
          received: 0,
          transactions: []
        };
      }

      const amt = Number(t.amount);
      loans[loanName].balance += amt;
      
      if (t.loanType === 'borrow' && amt < 0) {
        loans[loanName].paidBack += Math.abs(amt);
      } else if (t.loanType === 'lend' && amt > 0) {
        loans[loanName].received += amt;
      }

      loans[loanName].transactions.push(t);
    });
    
    // Also include split transactions for archived loans
    splitTransactions.forEach(t => {
      if (!t.splits || t.archived) return;
      
      t.splits.forEach((split, splitIndex) => {
        if (!split.isLoan || !split.loan) return;
        
        const loanName = split.loan;
        
        // Only include if this loan name is archived
        if (!archivedLoanNames.has(loanName)) return;
        
        if (!loans[loanName]) {
          // Get loanType from existing archived loan transaction
          const existingLoan = loanTransactions.find(lt => lt.loan === loanName && lt.archived);
          
          loans[loanName] = {
            name: loanName,
            loanType: existingLoan?.loanType || split.loanType || 'borrow',
            balance: 0,
            paidBack: 0,
            received: 0,
            transactions: []
          };
        }

        const isIncomeParent = Number(t.totalAmount) > 0;
        const splitAmt = Number(split.amount) || 0;
        const signedAmt = isIncomeParent ? splitAmt : -splitAmt;
        loans[loanName].balance += signedAmt;

        if (loans[loanName].loanType === 'borrow' && signedAmt < 0) {
          loans[loanName].paidBack += Math.abs(signedAmt);
        } else if (loans[loanName].loanType === 'lend' && signedAmt > 0) {
          loans[loanName].received += signedAmt;
        }

        loans[loanName].transactions.push({
          id: `${t.id}-split-${splitIndex}-${split.loan}`,
          type: 'loan',
          loan: loanName,
          loanType: loans[loanName].loanType,
          amount: signedAmt,
          date: t.date,
          payee: t.payee || null,
          memo: split.memo || null,
          account: t.account,
          isSplitPart: true,
          parentSplitId: t.id,
          clearStatus: t.clearStatus || 'uncleared'
        });
      });
    });

    // Sort transactions by date desc
    Object.values(loans).forEach(loan => {
      loan.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return loans;
  }, [loanTransactions, splitTransactions]);

  // Get archived loans as array
  const archivedLoans = useMemo(() => {
    return Object.values(archivedLoanData);
  }, [archivedLoanData]);

  // Separate by loan type
  const { borrowed, lent } = useMemo(() => {
    const b = [];
    const l = [];

    Object.values(loanData).forEach(loan => {
      if (loan.loanType === 'borrow') {
        b.push(loan);
      } else {
        l.push(loan);
      }
    });

    return { borrowed: b, lent: l };
  }, [loanData]);

  // Calculate totals
  const totals = useMemo(() => {
    const borrowedTotal = borrowed.reduce((sum, l) => sum + l.balance, 0);
    const lentTotal = lent.reduce((sum, l) => sum + Math.abs(l.balance), 0);
    return { borrowed: borrowedTotal, lent: lentTotal };
  }, [borrowed, lent]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(Math.abs(amount));
  };

  // Helper để format balance (tránh hiển thị -0)
  const formatBalance = (amount, showSign = true) => {
    if (amount === 0) return '0';
    const formatted = formatCurrency(amount);
    if (!showSign) return formatted;
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  // Long press handlers
  const triggerHaptic = () => {
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const handleLoanClick = (loan) => {
    setSelectedLoan(loan);
  };

  // Loan action handlers
  const handleRenameLoan = async () => {
    if (!actionLoan || !editLoanName.trim()) return;
    const oldName = actionLoan.name;
    const newName = editLoanName.trim();
    
    if (oldName === newName) {
      setShowEditModal(false);
      return;
    }
    
    try {
      const batch = writeBatch(db);
      
      // Update regular loan transactions
      actionLoan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { loan: newName });
        }
      });
      
      // Update split transactions that contain this loan
      // Find parent split transactions and update the loan name in splits array
      const splitParentIds = new Set();
      actionLoan.transactions.forEach(t => {
        if (t.isSplitPart && t.parentSplitId) {
          splitParentIds.add(t.parentSplitId);
        }
      });
      
      // Get parent split transactions and update their splits array
      splitParentIds.forEach(parentId => {
        const parentTx = splitTransactions.find(st => st.id === parentId);
        if (parentTx && parentTx.splits) {
          const updatedSplits = parentTx.splits.map(split => {
            if (split.loan === oldName) {
              return { ...split, loan: newName };
            }
            return split;
          });
          batch.update(doc(db, 'transactions', parentId), { splits: updatedSplits });
        }
      });
      
      await batch.commit();
      setShowEditModal(false);
      setActionLoan(null);
      setSuccessMessage('Loan renamed!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeleteLoan = async () => {
    if (!actionLoan) return;
    
    // Check if loan has split parts - cannot delete directly
    const splitParts = actionLoan.transactions.filter(t => t.isSplitPart);
    const regularParts = actionLoan.transactions.filter(t => !t.isSplitPart);
    
    if (splitParts.length > 0 && regularParts.length === 0) {
      // All transactions are from splits - cannot delete
      toast.error('Cannot delete: All transactions are from split transactions. Delete the original split transactions first.');
      setShowDeleteModal(false);
      setActionLoan(null);
      return;
    }
    
    try {
      const batch = writeBatch(db);
      actionLoan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.delete(doc(db, 'transactions', t.id));
        }
      });
      await batch.commit();
      setShowDeleteModal(false);
      setActionLoan(null);
      
      if (splitParts.length > 0) {
        toast.info(`Deleted ${regularParts.length} transaction(s). ${splitParts.length} split transaction(s) remain - delete them from the original split.`);
      } else {
        setSuccessMessage('Loan deleted!');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleArchiveLoan = async () => {
    if (!actionLoan) return;
    try {
      const batch = writeBatch(db);
      actionLoan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { archived: true });
        }
      });
      await batch.commit();
      setShowArchiveModal(false);
      setActionLoan(null);
      setSuccessMessage('Loan archived!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleRestoreLoan = async (loan) => {
    try {
      const batch = writeBatch(db);
      loan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { archived: false });
        }
      });
      await batch.commit();
      toast.success('Loan restored!');
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  // Render loan item
  const LoanItem = ({ loan, index, total, isBorrow }) => (
    <div
      onClick={() => handleLoanClick(loan)}
      onContextMenu={(e) => { e.preventDefault(); triggerHaptic(); setActionLoan(loan); setEditLoanName(loan.name); setShowEditModal(true); }}
      className={`p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 active:bg-gray-100 select-none ${
        index !== total - 1 ? 'border-b' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800">{loan.name}</div>
        <div className="text-xs text-gray-500">
          {isBorrow ? `Paid back: ${formatCurrency(loan.paidBack)}` : `Received: ${formatCurrency(loan.received)}`}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-bold ${isBorrow ? (loan.balance >= 0 ? 'text-emerald-600' : 'text-gray-900') : 'text-gray-900'}`}>
          {loan.balance === 0 ? '0' : (isBorrow ? formatBalance(loan.balance) : `-${formatCurrency(loan.balance)}`)}
        </div>
      </div>
    </div>
  );

  if (isLoading) return <div className="p-4 text-center">Loading loans...</div>;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-emerald-600 p-6 text-white">
        <div className="flex justify-between items-center mb-4">
          <div className="w-20"></div>
          <h1 className="text-xl font-bold tracking-wide">LOANS</h1>
          <button
            onClick={() => setIsAddNewLoanOpen(true)}
            className="bg-white/20 hover:bg-white/30 rounded-lg px-4 py-2 text-base font-medium"
          >
            + New
          </button>
        </div>
        
        <div className="flex justify-around mt-2">
          <div className="text-center">
            <div className="text-sm opacity-80">I Borrowed</div>
            <div className="text-xl font-bold">
              {formatBalance(totals.borrowed)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm opacity-80">I Lent</div>
            <div className="text-xl font-bold">
              {totals.lent === 0 ? '0' : `-${formatCurrency(totals.lent)}`}
            </div>
          </div>
        </div>
      </div>

      {/* Borrowed Section */}
      {borrowed.length > 0 && (
        <div className="px-4 mt-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-gray-500 uppercase">
              💸 I borrowed
            </h2>
            <span className="text-sm text-gray-500 font-bold">
              {formatBalance(totals.borrowed)}
            </span>
          </div>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {borrowed.map((loan, index) => (
              <LoanItem key={loan.name} loan={loan} index={index} total={borrowed.length} isBorrow={true} />
            ))}
          </div>
        </div>
      )}

      {/* Lent Section */}
      {lent.length > 0 && (
        <div className="px-4 mt-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-gray-500 uppercase">
              💰 I lent
            </h2>
            <span className="text-sm text-gray-500 font-bold">
              {totals.lent === 0 ? '0' : `-${formatCurrency(totals.lent)}`}
            </span>
          </div>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {lent.map((loan, index) => (
              <LoanItem key={loan.name} loan={loan} index={index} total={lent.length} isBorrow={false} />
            ))}
          </div>
        </div>
      )}

      {/* Future Transactions Section - Always show */}
      <div className="px-4 mt-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-bold text-gray-500 uppercase">
            📅 Future Transactions {futureTransactions.length > 0 && `(${futureTransactions.length})`}
          </h2>
          <button
            onClick={() => setIsAddFutureOpen(true)}
            className="bg-amber-500 text-white px-4 py-2 rounded-lg text-base font-medium hover:bg-amber-600"
          >
            + Schedule
          </button>
        </div>
        
        {futureTransactions.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {futureTransactions.map((t, index) => {
              const amount = t.type === 'split' ? Number(t.totalAmount) : Number(t.amount);
              const isPositive = amount > 0;
              const displayDate = t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Unknown';
              
              return (
                <div
                  key={t.id || index}
                  onClick={() => {
                    setActivatingTransaction(t);
                    setActivateAccount('');
                    setActivateDate(t.date || '');
                  }}
                  className={`p-4 flex justify-between items-center cursor-pointer hover:bg-amber-50 ${
                    index !== futureTransactions.length - 1 ? 'border-b' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500 text-lg">📅</span>
                      <div>
                        <div className="font-medium text-gray-800">
                          {t.payee || t.category || 'Future Transaction'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {displayDate} • {t.category}
                          {t.tag && <span className="text-emerald-600"> • 🏷️ {t.tag}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{new Intl.NumberFormat('en-US').format(amount)}
                    </div>
                    <div className="text-xs text-amber-500">Tap to activate</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
            <div className="text-amber-500 text-2xl mb-2">📅</div>
            <p className="text-sm text-amber-700">No scheduled transactions</p>
            <p className="text-xs text-amber-600 mt-1">
              Schedule expenses for when someone pays for you
            </p>
          </div>
        )}
      </div>

      {/* Archived Loans Section */}
      {archivedLoans.length > 0 && (
        <div className="px-4 mt-4 mb-4">
          <button
            onClick={() => setShowArchivedLoans(!showArchivedLoans)}
            className="w-full flex items-center justify-between text-sm font-bold text-gray-400 uppercase mb-2 py-2"
          >
            <span>📦 Archived Loans ({archivedLoans.length})</span>
            <span className="text-lg">{showArchivedLoans ? '▲' : '▼'}</span>
          </button>
          
          {showArchivedLoans && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              {archivedLoans.map((loan, index) => (
                <div
                  key={loan.name}
                  className={`p-4 flex justify-between items-center ${index !== archivedLoans.length - 1 ? 'border-b border-gray-200' : ''}`}
                >
                  <div>
                    <div className="font-medium text-gray-600">{loan.name}</div>
                    <div className="text-xs text-gray-400">
                      {loan.loanType === 'borrow' ? 'Borrowed' : 'Lent'} • {loan.transactions.length} txn
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-gray-500">
                        {loan.balance === 0 ? '0' : formatBalance(loan.balance)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreLoan(loan)}
                      className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-200"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {borrowed.length === 0 && lent.length === 0 && archivedLoans.length === 0 && (
        <div className="text-center text-gray-500 py-12 px-4">
          <div className="text-4xl mb-3">💰</div>
          <p className="mb-4">No loans yet</p>
        </div>
      )}

      {/* Add New Loan Button - in header area, not FAB */}

      {/* Modals */}
      <AddNewLoanModal
        isOpen={isAddNewLoanOpen}
        onClose={() => setIsAddNewLoanOpen(false)}
        onSave={() => setIsAddNewLoanOpen(false)}
      />

      {/* Add Future Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddFutureOpen}
        onClose={() => setIsAddFutureOpen(false)}
        onSave={() => setIsAddFutureOpen(false)}
        forceFuture={true}
      />

      {selectedLoan && loanData[selectedLoan.name] && (
        <LoanDetail
          loan={loanData[selectedLoan.name]}
          onClose={() => setSelectedLoan(null)}
          onLoanRenamed={(newName) => setSelectedLoan(prev => ({ ...prev, name: newName }))}
        />
      )}

      {/* Edit Loan Modal - Action Sheet Style */}
      {showEditModal && actionLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl shadow-xl overflow-hidden animate-slide-up">
            <div className="p-4 border-b">
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3"></div>
              <div className="text-center font-bold text-lg">{actionLoan.name}</div>
              <div className="text-center text-sm text-gray-500">
                Balance: {actionLoan.balance >= 0 ? '+' : '-'}{formatCurrency(actionLoan.balance)}
              </div>
            </div>
            
            {/* Rename Section */}
            <div className="p-4 border-b">
              <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Rename</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editLoanName}
                  onChange={(e) => setEditLoanName(e.target.value)}
                  className="flex-1 p-3 border rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="Loan name"
                />
                <button 
                  onClick={handleRenameLoan}
                  disabled={!editLoanName.trim() || editLoanName === actionLoan.name}
                  className="px-4 bg-indigo-500 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 space-y-2">
              <button 
                onClick={() => { setShowEditModal(false); setShowArchiveModal(true); }}
                className="w-full p-4 text-left rounded-lg bg-amber-50 text-amber-700 font-medium flex items-center gap-3"
              >
                <span className="text-xl">📦</span>
                Archive Loan
                <span className="text-xs text-amber-500 ml-auto">Hide from list</span>
              </button>
              
              <button 
                onClick={() => { setShowEditModal(false); setShowDeleteModal(true); }}
                className="w-full p-4 text-left rounded-lg bg-red-50 text-red-600 font-medium flex items-center gap-3"
              >
                <span className="text-xl">🗑️</span>
                Delete Loan
                <span className="text-xs text-red-400 ml-auto">Remove all transactions</span>
              </button>
            </div>

            {/* Cancel Button */}
            <div className="p-4 border-t">
              <button 
                onClick={() => { setShowEditModal(false); setActionLoan(null); }}
                className="w-full p-3 bg-gray-100 text-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && actionLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-red-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">🗑️</div>
              <div className="font-bold text-lg">Delete Loan</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Delete <span className="font-bold">{actionLoan.name}</span> and all {actionLoan.transactions.filter(t => !t.isSplitPart).length} transactions?
                <br/><span className="text-red-500 text-sm">This cannot be undone.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setShowDeleteModal(false); setActionLoan(null); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteLoan}
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && actionLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">📦</div>
              <div className="font-bold text-lg">Archive Loan</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">
                Archive <span className="font-bold">{actionLoan.name}</span>?
                <br/><span className="text-gray-500 text-sm">It will be hidden from the loan list.</span>
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setShowArchiveModal(false); setActionLoan(null); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleArchiveLoan}
                  className="flex-1 bg-amber-500 text-white py-3 rounded-lg font-medium"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl overflow-hidden">
            <div className="bg-emerald-500 p-4 text-white text-center">
              <div className="text-4xl mb-1">✓</div>
              <div className="font-bold text-lg">Success</div>
            </div>
            <div className="p-4">
              <p className="text-gray-700 text-center mb-4">{successMessage}</p>
              <button 
                onClick={() => setSuccessMessage(null)}
                className="w-full bg-emerald-500 text-white py-3 rounded-lg font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate Future Transaction Modal */}
      {activatingTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:w-[450px] sm:rounded-xl rounded-t-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-amber-500 p-4 text-white">
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => { setActivatingTransaction(null); setActivateAccount(''); setActivateDate(''); }}
                  className="text-white/80 hover:text-white"
                >
                  ✕
                </button>
                <h3 className="font-bold text-lg">Activate Transaction</h3>
                <div className="w-6"></div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Transaction Summary */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-800">
                      {activatingTransaction.payee || activatingTransaction.category || 'Transaction'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {activatingTransaction.category}
                      {activatingTransaction.tag && (
                        <span className="text-emerald-600"> • 🏷️ {activatingTransaction.tag}</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-xl font-bold ${
                    (activatingTransaction.type === 'split' ? Number(activatingTransaction.totalAmount) : Number(activatingTransaction.amount)) > 0 
                      ? 'text-emerald-600' 
                      : 'text-red-600'
                  }`}>
                    {new Intl.NumberFormat('en-US').format(
                      activatingTransaction.type === 'split' 
                        ? Number(activatingTransaction.totalAmount) 
                        : Number(activatingTransaction.amount)
                    )}
                  </div>
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">Date</label>
                <div className="relative mt-1">
                  <div className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between pointer-events-none">
                    <span className="text-gray-800">
                      {activateDate ? new Date(activateDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                    </span>
                    <span className="text-gray-400">📅</span>
                  </div>
                  <input 
                    type="date" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    value={activateDate}
                    onChange={(e) => setActivateDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Account Selection */}
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold">Account</label>
                <select 
                  className="w-full p-3 bg-gray-50 rounded-lg mt-1 outline-none border border-gray-200"
                  value={activateAccount}
                  onChange={(e) => setActivateAccount(e.target.value)}
                >
                  <option value="">-- Choose account --</option>
                  {groupedAccounts.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.accounts.map(acc => (
                        <option key={acc.name} value={acc.name}>
                          {acc.icon} {acc.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!activateAccount) {
                      toast.error('Please select an account');
                      return;
                    }
                    if (!activateDate) {
                      toast.error('Please select a date');
                      return;
                    }
                    try {
                      await updateDoc(doc(db, 'transactions', activatingTransaction.id), {
                        account: activateAccount,
                        date: activateDate,
                        isFuture: false
                      });
                      toast.success('Transaction activated!');
                      setActivatingTransaction(null);
                      setActivateAccount('');
                      setActivateDate('');
                    } catch (error) {
                      toast.error('Error: ' + error.message);
                    }
                  }}
                  disabled={!activateAccount || !activateDate}
                  className="flex-1 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✓ Activate
                </button>
                <button
                  onClick={async () => {
                    const confirmed = await toast.confirm({
                      title: 'Delete Transaction',
                      message: 'Delete this future transaction?',
                      confirmText: 'Delete',
                      type: 'danger'
                    });
                    if (confirmed) {
                      try {
                        await deleteDoc(doc(db, 'transactions', activatingTransaction.id));
                        toast.success('Transaction deleted');
                        setActivatingTransaction(null);
                        setActivateAccount('');
                        setActivateDate('');
                      } catch (error) {
                        toast.error('Error: ' + error.message);
                      }
                    }
                  }}
                  className="px-4 py-3 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoansTab;