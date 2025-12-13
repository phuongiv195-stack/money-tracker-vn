import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import CategoriesTab from './components/Categories/CategoriesTab';
import AddTransactionModal from './components/Transactions/AddTransactionModal';

function ProtectedApp() {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('categories');
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // if (!currentUser) {
  //   return <Navigate to="/login" />;
  // }

  const handleTransactionSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Money Tracker</h1>
          <button
            onClick={logout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 pb-24">
        {activeTab === 'categories' && <CategoriesTab key={refreshKey} />}
        {activeTab === 'transactions' && (
          <div className="text-center py-20 text-gray-500">Transactions Tab - Coming Soon</div>
        )}
        {activeTab === 'accounts' && (
          <div className="text-center py-20 text-gray-500">Accounts Tab - Coming Soon</div>
        )}
        {activeTab === 'reports' && (
          <div className="text-center py-20 text-gray-500">Reports Tab - Coming Soon</div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-around items-center h-16">
            <button
              onClick={() => setActiveTab('categories')}
              className={`flex flex-col items-center justify-center flex-1 ${
                activeTab === 'categories' ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xs font-medium">CATEGORIES</span>
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`flex flex-col items-center justify-center flex-1 ${
                activeTab === 'transactions' ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xs font-medium">TRANSACTIONS</span>
            </button>
            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex flex-col items-center justify-center flex-1 ${
                activeTab === 'accounts' ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xs font-medium">ACCOUNTS</span>
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex flex-col items-center justify-center flex-1 ${
                activeTab === 'reports' ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xs font-medium">REPORTS</span>
            </button>
          </div>
        </div>
      </nav>

      {/* FAB Button */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-emerald-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-emerald-600 z-20"
      >
        +
      </button>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleTransactionSuccess}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;