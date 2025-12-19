import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddNewLoanModal from './AddNewLoanModal';
import LoanDetail from './LoanDetail';

const LoansTab = () => {
  const [loanTransactions, setLoanTransactions] = useState([]);
  const [splitTransactions, setSplitTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddNewLoanOpen, setIsAddNewLoanOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);

  // Load loan transactions
  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', 'test-user'),
      where('type', '==', 'loan')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLoanTransactions(trans);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load split transactions (may contain loan splits)
  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', 'test-user'),
      where('type', '==', 'split')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSplitTransactions(trans);
    });

    return () => unsubscribe();
  }, []);

  // Calculate loan data including splits
  const loanData = useMemo(() => {
    const loans = {};

    // Process regular loan transactions
    loanTransactions.forEach(t => {
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
      if (!t.splits) return;
      
      t.splits.forEach(split => {
        if (!split.isLoan || !split.loan) return;
        
        const loanName = split.loan;
        
        // If this loan doesn't exist yet, we need to figure out its type
        // For splits in income transaction = money coming in to loan
        // For splits in expense transaction = money going out from loan
        if (!loans[loanName]) {
          // Try to determine loan type from existing loan transactions
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

        // For split transaction:
        // If parent is income (positive totalAmount) = money IN
        // If parent is expense (negative totalAmount) = money OUT
        const isIncomeParent = Number(t.totalAmount) > 0;
        const splitAmt = Number(split.amount) || 0;
        
        // Calculate the signed amount for balance
        const signedAmt = isIncomeParent ? splitAmt : -splitAmt;
        loans[loanName].balance += signedAmt;

        // Track paid back / received
        if (loans[loanName].loanType === 'borrow' && signedAmt < 0) {
          loans[loanName].paidBack += Math.abs(signedAmt);
        } else if (loans[loanName].loanType === 'lend' && signedAmt > 0) {
          loans[loanName].received += signedAmt;
        }

        // Add a virtual transaction for display
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

  const handleLoanClick = (loan) => {
    setSelectedLoan(loan);
  };

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
      </div>

      {/* Borrowed Section */}
      {borrowed.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase mb-2">
            I Borrowed ({borrowed.length})
          </h2>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {borrowed.map((loan, index) => (
              <div
                key={loan.name}
                onClick={() => handleLoanClick(loan)}
                className={`p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 ${
                  index !== borrowed.length - 1 ? 'border-b' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-gray-800">{loan.name}</div>
                  <div className="text-xs text-gray-500">
                    Paid back: {formatCurrency(loan.paidBack)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${loan.balance >= 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                    {loan.balance >= 0 ? '+' : '-'}{formatCurrency(loan.balance)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {loan.transactions.length} txn
                  </div>
                </div>
              </div>
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
              <div
                key={loan.name}
                onClick={() => handleLoanClick(loan)}
                className={`p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 ${
                  index !== lent.length - 1 ? 'border-b' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-gray-800">{loan.name}</div>
                  <div className="text-xs text-gray-500">
                    Received: {formatCurrency(loan.received)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">
                    -{formatCurrency(loan.balance)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {loan.transactions.length} txn
                  </div>
                </div>
              </div>
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
    </div>
  );
};

export default LoansTab;