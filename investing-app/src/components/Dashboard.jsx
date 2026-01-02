import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { LogOut } from 'lucide-react';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('portfolio');
  const { user, logout } = useAuth();
  const toast = useToast();

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      toast.success('Logged out successfully');
    } else {
      toast.error('Logout failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                Investment Portfolio
              </h1>
              <p className="text-sm text-gray-600 mt-1">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b mb-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'portfolio'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📊 Portfolio
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'transactions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📜 Transactions
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'reports'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📈 Reports
            </button>
          </div>

          {/* Content */}
          <div>
            {activeTab === 'portfolio' && (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">Portfolio tab - Coming soon</p>
                <p className="text-sm text-gray-400">
                  Add your investments and track their performance
                </p>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">Transactions tab - Coming soon</p>
                <p className="text-sm text-gray-400">
                  View and manage your transaction history
                </p>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">Reports tab - Coming soon</p>
                <p className="text-sm text-gray-400">
                  Analyze your investment performance
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
