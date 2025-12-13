import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AddTransactionModal({ isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('expense'); // expense, income, transfer
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('Cash');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!amount || parseFloat(amount) === 0) {
      alert('Nhập số tiền!');
      return;
    }

    setLoading(true);
    try {
      const transactionData = {
        userId: 'test-user',
        date: date,
        memo: memo || ''
      };

      if (activeTab === 'transfer') {
        if (!fromAccount || !toAccount) {
          alert('Chọn account!');
          setLoading(false);
          return;
        }
        transactionData.type = 'transfer';
        transactionData.amount = parseFloat(amount);
        transactionData.fromAccount = fromAccount;
        transactionData.toAccount = toAccount;
      } else {
        if (!category) {
          alert('Nhập category!');
          setLoading(false);
          return;
        }
        transactionData.type = activeTab;
        transactionData.amount = activeTab === 'expense' 
          ? -Math.abs(parseFloat(amount))
          : Math.abs(parseFloat(amount));
        transactionData.payee = payee || '';
        transactionData.category = category;
        transactionData.account = account;
      }

      await addDoc(collection(db, 'transactions'), transactionData);
      
      // Reset form
      setAmount('');
      setPayee('');
      setCategory('');
      setMemo('');
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Lỗi! Thử lại.');
    }
    setLoading(false);
  };

  const changeDate = (days) => {
    const currentDate = new Date(date);
    currentDate.setDate(currentDate.setDate() + days);
    setDate(currentDate.toISOString().split('T')[0]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Add Transaction</h2>
          <button onClick={onClose} className="text-gray-500 text-2xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('expense')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'expense'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-gray-500'
            }`}
          >
            Expense
          </button>
          <button
            onClick={() => setActiveTab('income')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'income'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-500'
            }`}
          >
            Income
          </button>
          <button
            onClick={() => setActiveTab('transfer')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'transfer'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500'
            }`}
          >
            Transfer
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Amount */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={activeTab === 'expense' ? '-0' : activeTab === 'income' ? '+0' : '0'}
              className={`w-full px-4 py-3 text-2xl font-bold border rounded-lg focus:outline-none focus:ring-2 ${
                activeTab === 'expense'
                  ? 'text-red-600 focus:ring-red-500'
                  : activeTab === 'income'
                  ? 'text-green-600 focus:ring-green-500'
                  : 'text-gray-900 focus:ring-blue-500'
              }`}
              autoFocus
            />
          </div>

          {/* Expense/Income Fields */}
          {activeTab !== 'transfer' && (
            <>
              {/* Payee */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Payee</label>
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="Enter payee name"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Enter category"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Account */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Account</label>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>
            </>
          )}

          {/* Transfer Fields */}
          {activeTab === 'transfer' && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-1">From Account</label>
                <select
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">To Account</label>
                <select
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>
            </>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Date</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeDate(-1)}
                className="px-3 py-2 border rounded-lg hover:bg-gray-50"
              >
                ←
              </button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => changeDate(1)}
                className="px-3 py-2 border rounded-lg hover:bg-gray-50"
              >
                →
              </button>
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Memo (Optional)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Add note"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}