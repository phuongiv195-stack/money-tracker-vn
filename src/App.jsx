import { useState } from 'react';
import './index.css';
import { useAuth } from './contexts/AuthContext';
function App() {
  const [activeTab, setActiveTab] = useState('categories');
const { logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Money Tracker</h1>
            <div className="flex gap-3">
              <button className="text-gray-600 hover:text-gray-900">
                👁️
              </button>
              <button className="text-gray-600 hover:text-gray-900">
                <button 
                onClick={logout}
                className="text-gray-600 hover:text-gray-900"
                title="Logout"
                >
                🚪
                </button>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'categories'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              CATEGORIES
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'transactions'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              TRANSACTIONS
            </button>
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'accounts'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              ACCOUNTS
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'reports'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              REPORTS
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="text-center text-gray-600">
          <p className="text-lg mb-2">Welcome to Money Tracker! 🎉</p>
          <p className="text-sm">Active Tab: <strong>{activeTab.toUpperCase()}</strong></p>
          <p className="text-xs mt-4 text-gray-400">
            Firebase connected ✅ | Ready to build components
          </p>
        </div>
      </main>

      {/* FAB Button */}
      <button className="fixed bottom-6 right-6 w-14 h-14 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors">
        +
      </button>
    </div>
  );
}

export default App;
