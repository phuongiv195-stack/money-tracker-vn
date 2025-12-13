import React, { useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import CategoriesTab from './components/Categories/CategoriesTab';
import AddTransactionModal from './components/Transactions/AddTransactionModal';
import TransactionsTab from './components/Transactions/TransactionsTab';
import AccountsTab from './components/Accounts/AccountsTab';
import ReportsTab from './components/Reports/ReportsTab';

function AppContent() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('categories');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Comment để dev nhanh
  // if (!currentUser) {
  //   return <Login />;
  // }

  const renderContent = () => {
    switch (activeTab) {
      case 'categories':
        return <CategoriesTab />;
      case 'transactions':
        return <TransactionsTab />;
      case 'accounts':
        return <AccountsTab />;
      case 'reports':
        return <ReportsTab />;
      default:
        return <CategoriesTab />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      
      {/* Main Content */}
      <main className="max-w-md mx-auto bg-white min-h-screen shadow-lg relative pb-20">
        {renderContent()}
      </main>

      {/* FAB Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-4 md:right-[calc(50%-200px)] bg-emerald-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
      >
        +
      </button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="max-w-md mx-auto flex justify-around">
          <NavButton 
            active={activeTab === 'categories'} 
            onClick={() => setActiveTab('categories')}
            icon="📊" 
            label="Categories" 
          />
          <NavButton 
            active={activeTab === 'transactions'} 
            onClick={() => setActiveTab('transactions')}
            icon="📝" 
            label="Transactions" 
          />
          <NavButton 
            active={activeTab === 'accounts'} 
            onClick={() => setActiveTab('accounts')}
            icon="🏦" 
            label="Accounts" 
          />
          <NavButton 
            active={activeTab === 'reports'} 
            onClick={() => setActiveTab('reports')}
            icon="📈" 
            label="Reports" 
          />
        </div>
      </nav>

      {/* Modal */}
      <AddTransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSave={() => {
          console.log("Transaction saved!");
        }}
      />
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
      active ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
    }`}
  >
    <span className="text-xl mb-1">{icon}</span>
    <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
  </button>
);

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;