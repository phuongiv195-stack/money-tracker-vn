import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import AddNewLoanModal from './AddNewLoanModal';
import AddLoanTransactionModal from './AddLoanTransactionModal';
import LoanDetail from './LoanDetail';

const LoansTab = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddNewLoanOpen, setIsAddNewLoanOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);

  // Fetch loan transactions from Firebase
  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', 'test-user'),
      where('type', '==', 'loan')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(trans);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Calculate loan balances
  const loanData = useMemo(() => {
    const loans = {};

    transactions.forEach(t => {
      const loanName = t.loan;
      if (!loanName) return;

      if (!loans[loanName]) {
        loans[loanName] = {
          name: loanName,
          payee: t.payee,
          loanType: t.loanType, // 'borrow' or 'lend'
          totalAmount: 0,
          paidAmount: 0,
          transactions: []
        };
      }

      const amt = Number(t.amount);
      loans[loanName].totalAmount += amt;

      loans[loanName].transactions.push(t);
    });

    // Calculate balance
    Object.keys(loans).forEach(key => {
      loans[key].balance = loans[key].totalAmount;
      loans[key].paidAmount = 0; // Not used anymore
    });

    return loans;
  }, [transactions]);

  // Separate by loan type
  const { borrowed, lent } = useMemo(() => {
    const b = [];
    const l = [];

    Object.values(loanData).forEach(loan => {
      if (loan.loanType === 'borrow') {
        b.push(loan);
      } else if (loan.loanType === 'lend') {
        l.push(loan);
      }
    });

    // Sort by balance (highest first)
    b.sort((a, b) => b.balance - a.balance);
    l.sort((a, b) => b.balance - a.balance);

    return { borrowed: b, lent: l };
  }, [loanData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US').format(amount || 0);
  };

  const totalBorrowed = borrowed.reduce((sum, loan) => sum + loan.balance, 0);
  const totalLent = lent.reduce((sum, loan) => sum + loan.balance, 0);
  const netPosition = totalLent - totalBorrowed;

  if (loading) return <div className="p-4 text-center">Loading loans...</div>;

  return (
    <div className="pb-24">
      {/* Net Position Header */}
      <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-6 text-white text-center shadow-sm mb-4">
        <div className="text-sm opacity-80 uppercase tracking-wider">Net Position</div>
        <div className={`text-3xl font-bold mt-1 ${netPosition >= 0 ? 'text-green-200' : 'text-red-200'}`}>
          {netPosition >= 0 ? '+' : ''}{formatCurrency(netPosition)} VND
        </div>
        <div className="flex justify-center gap-6 mt-3 text-sm opacity-90">
          <div>
            <span className="opacity-70">I Owe: </span>
            <span className="font-semibold">{formatCurrency(totalBorrowed)}</span>
          </div>
          <div>
            <span className="opacity-70">Owed to Me: </span>
            <span className="font-semibold">{formatCurrency(totalLent)}</span>
          </div>
        </div>
      </div>

      {/* I BORROW MONEY Section */}
      <div className="px-4 mb-6">
        <div className="flex justify-between items-center mb-2 px-1">
          <span className="text-xs font-bold text-gray-500 uppercase">💰 I BORROW MONEY</span>
          <span className="text-xs font-bold text-green-600">{formatCurrency(totalBorrowed)}</span>
        </div>

        {borrowed.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm">
            No borrowed loans
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {borrowed.map(loan => (
              <div
                key={loan.name}
                onClick={() => setSelectedLoan(loan)}
                className="p-4 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800 flex items-center gap-2">
                      <span>💳</span>
                      <span>{loan.name}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      from {loan.payee}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-600">
                      {formatCurrency(loan.balance)}
                    </div>
                    <div className="text-xs text-gray-400">left</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Paid: {formatCurrency(loan.paidAmount)}</span>
                    <span>Total: {formatCurrency(loan.totalAmount)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${(loan.paidAmount / loan.totalAmount) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* I LEND MONEY Section */}
      <div className="px-4 mb-6">
        <div className="flex justify-between items-center mb-2 px-1">
          <span className="text-xs font-bold text-gray-500 uppercase">💸 I LEND MONEY</span>
          <span className="text-xs font-bold text-red-500">{formatCurrency(totalLent)}</span>
        </div>

        {lent.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm">
            No lent loans
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {lent.map(loan => (
              <div
                key={loan.name}
                onClick={() => setSelectedLoan(loan)}
                className="p-4 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800 flex items-center gap-2">
                      <span>💸</span>
                      <span>{loan.name}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      to {loan.payee}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-600">
                      {formatCurrency(loan.balance)}
                    </div>
                    <div className="text-xs text-gray-400">left</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Received: {formatCurrency(loan.paidAmount)}</span>
                    <span>Total: {formatCurrency(loan.totalAmount)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-300"
                      style={{ width: `${(loan.paidAmount / loan.totalAmount) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty State */}
      {borrowed.length === 0 && lent.length === 0 && (
        <div className="text-center text-gray-500 py-8 px-4">
          <div className="text-4xl mb-2">💰</div>
          <p className="mb-4">No loan records yet</p>
          <button
            onClick={() => setIsAddNewLoanOpen(true)}
            className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors"
          >
            + Record First Loan
          </button>
        </div>
      )}

      {/* Add Loan Button (Floating Top-Right) */}
      {(borrowed.length > 0 || lent.length > 0) && (
        <button
          onClick={() => setIsAddNewLoanOpen(true)}
          className="fixed top-4 right-4 md:right-[calc(50%-200px)] bg-white text-purple-600 border border-purple-200 w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-purple-50 transition-colors z-30"
        >
          +
        </button>
      )}

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