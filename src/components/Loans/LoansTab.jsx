import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import AddNewLoanModal from './AddNewLoanModal';
import LoanDetail from './LoanDetail';
import { useToast } from '../Toast/ToastProvider';

const LoansTab = () => {
  const toast = useToast();
  const userId = useUserId();
  const [loanTransactions, setLoanTransactions] = useState([]);
  const [splitTransactions, setSplitTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddNewLoanOpen, setIsAddNewLoanOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);

  // Long press & action state
  const [actionLoan, setActionLoan] = useState(null); // loan being edited/deleted/archived
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [editLoanName, setEditLoanName] = useState('');
  const [successMessage, setSuccessMessage] = useState(null);

  // Long press refs
  const longPressTriggered = useRef(false);
  const longPressTimer = useRef(null);
  const touchStartPos = useRef({ x: 0, y: 0 });

  // Load loan transactions
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      where('type', '==', 'loan')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLoanTransactions(trans);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Load split transactions (may contain loan splits)
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      where('type', '==', 'split')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSplitTransactions(trans);
    });

    return () => unsubscribe();
  }, [userId]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  // Calculate loan data including splits
  const loanData = useMemo(() => {
    const loans = {};

    // Process regular loan transactions
    loanTransactions.forEach(t => {
      // Skip archived transactions
      if (t.archived) return;
      
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

    // Process split transactions with loan splits
    splitTransactions.forEach(t => {
      if (!t.splits || t.archived) return;
      
      t.splits.forEach(split => {
        if (!split.isLoan || !split.loan) return;
        
        const loanName = split.loan;
        
        if (!loans[loanName]) {
          const existingLoan = loanTransactions.find(lt => lt.loan === loanName);
          loans[loanName] = {
            name: loanName,
            loanType: existingLoan?.loanType || 'borrow',
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
          id: `${t.id}-split-${split.loan}`,
          type: 'loan',
          loan: loanName,
          loanType: loans[loanName].loanType,
          amount: signedAmt,
          date: t.date,
          memo: split.memo || `From split: ${t.payee || 'Split transaction'}`,
          account: t.account,
          isSplitPart: true,
          parentId: t.id
        });
      });
    });

    // Sort transactions by date desc
    Object.values(loans).forEach(loan => {
      loan.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return loans;
  }, [loanTransactions, splitTransactions]);

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

  // Long press handlers
  const triggerHaptic = () => {
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const handleLongPressStart = (loan, e) => {
    longPressTriggered.current = false;
    
    if (e?.touches?.[0]) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e) {
      touchStartPos.current = { x: e.clientX, y: e.clientY };
    }
    
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      triggerHaptic();
      setActionLoan(loan);
      setEditLoanName(loan.name);
      setShowEditModal(true);
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

  const handleLoanClick = (loan) => {
    console.log('handleLoanClick called', loan.name);
    console.log('longPressTriggered:', longPressTriggered.current);
    
    // Nếu long press đã triggered thì không mở detail
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      console.log('Blocked by longPressTriggered');
      return;
    }
    // Nếu timer vẫn đang chạy (chưa đủ 400ms) thì clear và mở detail
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    console.log('Setting selectedLoan');
    setSelectedLoan(loan);
  };

  // Loan action handlers
  const handleRenameLoan = async () => {
    if (!actionLoan || !editLoanName.trim()) return;
    try {
      const batch = writeBatch(db);
      actionLoan.transactions.forEach(t => {
        if (!t.isSplitPart) {
          batch.update(doc(db, 'transactions', t.id), { loan: editLoanName.trim() });
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
      setSuccessMessage('Loan deleted!');
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

  // Render loan item
  const LoanItem = ({ loan, index, total, isBorrow }) => (
    <div
      onClick={() => handleLoanClick(loan)}
      onTouchStart={(e) => handleLongPressStart(loan, e)}
      onTouchMove={handleLongPressMove}
      onTouchEnd={handleLongPressEnd}
      onContextMenu={(e) => { e.preventDefault(); triggerHaptic(); setActionLoan(loan); setEditLoanName(loan.name); setShowEditModal(true); }}
      className={`p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 active:bg-gray-100 select-none ${
        index !== total - 1 ? 'border-b' : ''
      }`}
    >
      <div>
        <div className="font-medium text-gray-800">{loan.name}</div>
        <div className="text-xs text-gray-500">
          {isBorrow ? `Paid back: ${formatCurrency(loan.paidBack)}` : `Received: ${formatCurrency(loan.received)}`}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-bold ${isBorrow ? (loan.balance >= 0 ? 'text-emerald-600' : 'text-gray-900') : 'text-gray-900'}`}>
          {isBorrow ? (loan.balance >= 0 ? '+' : '-') : '-'}{formatCurrency(loan.balance)}
        </div>
        <div className="text-xs text-gray-400">
          {loan.transactions.length} txn
        </div>
      </div>
    </div>
  );

  if (loading) return <div className="p-4 text-center">Loading loans...</div>;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-emerald-600 p-6 text-white">
        <h1 className="text-xl font-bold text-center mb-4">Loans</h1>
        
        <div className="flex justify-around">
          <div className="text-center">
            <div className="text-sm opacity-80">I Borrowed</div>
            <div className="text-2xl font-bold">
              {totals.borrowed >= 0 ? '+' : '-'}{formatCurrency(totals.borrowed)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm opacity-80">I Lent</div>
            <div className="text-2xl font-bold">
              -{formatCurrency(totals.lent)}
            </div>
          </div>
        </div>
        
        <div className="text-xs text-center mt-3 opacity-70">
          Tap to view • Hold to edit
        </div>
      </div>

      {/* Borrowed Section */}
      {borrowed.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase mb-2">
            I Borrowed ({borrowed.length})
          </h2>
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
          <h2 className="text-sm font-bold text-gray-500 uppercase mb-2">
            I Lent ({lent.length})
          </h2>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {lent.map((loan, index) => (
              <LoanItem key={loan.name} loan={loan} index={index} total={lent.length} isBorrow={false} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {borrowed.length === 0 && lent.length === 0 && (
        <div className="text-center text-gray-500 py-12 px-4">
          <div className="text-4xl mb-3">💰</div>
          <p className="mb-4">No loans yet</p>
        </div>
      )}

      {/* Add New Loan Button */}
      <button
        onClick={() => setIsAddNewLoanOpen(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-emerald-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-emerald-600 z-30"
      >
        +
      </button>

      {/* Modals */}
      <AddNewLoanModal
        isOpen={isAddNewLoanOpen}
        onClose={() => setIsAddNewLoanOpen(false)}
        onSave={() => setIsAddNewLoanOpen(false)}
      />

      {selectedLoan && (
        <LoanDetail
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
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
    </div>
  );
};

export default LoansTab;
