import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import CategoriesTab from './components/Categories/CategoriesTab';
import './index.css';

function App() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('categories');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Money Tracker</h1>
            <div className="flex gap-3">
              <button className="text-gray-600 hover:text-gray-900">👁️</button>
              <button 
                onClick={logout}
                className="text-gray-600 hover:text-gray-900"
                title="Logout"
              >
                🚪
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {['categories', 'transactions', 'accounts', 'reports'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {activeTab === 'categories' && <CategoriesTab />}
        {activeTab === 'transactions' && (
          <div className="text-center text-gray-500 py-12">
            Transactions tab - Coming soon
          </div>
        )}
        {activeTab === 'accounts' && (
          <div className="text-center text-gray-500 py-12">
            Accounts tab - Coming soon
          </div>
        )}
        {activeTab === 'reports' && (
          <div className="text-center text-gray-500 py-12">
            Reports tab - Coming soon
          </div>
        )}
      </main>

      {/* FAB Button */}
      <button className="fixed bottom-6 right-6 w-14 h-14 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors">
        +
      </button>
    </div>
  );
}

export default App;
