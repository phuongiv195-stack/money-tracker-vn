import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { DataProvider, useData } from './contexts/DataContext';
import Login from './pages/Login';
import CategoriesTab from './components/Categories/CategoriesTab';
import AddTransactionModal from './components/Transactions/AddTransactionModal';

// Lazy load tabs that aren't shown on initial load
const TransactionsTab = lazy(() => import('./components/Transactions/TransactionsTab'));
const AccountsTab = lazy(() => import('./components/Accounts/AccountsTab'));
const ReportsTab = lazy(() => import('./components/Reports/ReportsTab'));
const LoansTab = lazy(() => import('./components/Loans/LoansTab'));
const SettingsTab = lazy(() => import('./components/Settings/SettingsTab'));

// Loading fallback component
const TabLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-2"></div>
      <div className="text-gray-500 text-sm">Loading...</div>
    </div>
  </div>
);

function AppContent() {
  const { currentUser } = useAuth();
  const { registerCloseHandler, unregisterCloseHandler } = useNavigation();
  
  // Load activeTab from localStorage, default to 'categories'
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('activeTab');
    return saved || 'categories';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Check URL for PWA shortcut action (Add Transaction)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    
    if (action === 'add-transaction') {
      // Open Add Transaction modal immediately
      setIsModalOpen(true);
      // Clean up URL without reload
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Save activeTab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Listen for openSettings event from CategoriesTab
  useEffect(() => {
    const handleOpenSettings = () => setActiveTab('settings');
    const handleCloseSettings = () => setActiveTab('categories');
    window.addEventListener('openSettings', handleOpenSettings);
    window.addEventListener('closeSettings', handleCloseSettings);
    return () => {
      window.removeEventListener('openSettings', handleOpenSettings);
      window.removeEventListener('closeSettings', handleCloseSettings);
    };
  }, []);

  // Register back handler để về Categories khi không ở Categories
  const backToCategories = useCallback(() => {
    setActiveTab('categories');
  }, []);

  useEffect(() => {
    if (activeTab !== 'categories') {
      registerCloseHandler('app-tab-back', backToCategories);
    } else {
      unregisterCloseHandler('app-tab-back');
    }
    
    return () => {
      unregisterCloseHandler('app-tab-back');
    };
  }, [activeTab, registerCloseHandler, unregisterCloseHandler, backToCategories]);

  // Check if user is logged in
  if (!currentUser) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'categories':
        return <CategoriesTab />;
      case 'transactions':
        return (
          <Suspense fallback={<TabLoader />}>
            <TransactionsTab />
          </Suspense>
        );
      case 'accounts':
        return (
          <Suspense fallback={<TabLoader />}>
            <AccountsTab />
          </Suspense>
        );
      case 'loans':
        return (
          <Suspense fallback={<TabLoader />}>
            <LoansTab />
          </Suspense>
        );
      case 'reports':
        return (
          <Suspense fallback={<TabLoader />}>
            <ReportsTab />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<TabLoader />}>
            <SettingsTab />
          </Suspense>
        );
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

      {/* FAB Button - Hidden in Loans and Settings tabs */}
      {activeTab !== 'loans' && activeTab !== 'settings' && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-24 right-4 md:right-[calc(50%-200px)] bg-emerald-500 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-emerald-600 transition-transform active:scale-95 z-30"
        >
          +
        </button>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="max-w-md mx-auto flex justify-around">
         <NavButton 
  active={activeTab === 'categories'} 
  onClick={() => setActiveTab('categories')}
  icon="/icons/cat.png" 
  label="Categories" 
/>
<NavButton 
  active={activeTab === 'transactions'} 
  onClick={() => setActiveTab('transactions')}
  icon="/icons/trans.png" 
  label="Trans." 
/>
<NavButton 
  active={activeTab === 'accounts'} 
  onClick={() => setActiveTab('accounts')}
  icon="/icons/acc.png" 
  label="Accounts" 
/>
<NavButton 
  active={activeTab === 'loans'} 
  onClick={() => setActiveTab('loans')}
  icon="/icons/loan.png" 
  label="Loans" 
/>
<NavButton 
  active={activeTab === 'reports'} 
  onClick={() => setActiveTab('reports')}
  icon="/icons/rep.png" 
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
    className="flex-1 py-2 flex flex-col items-center justify-center transition-all"
  >
    <div className={`p-2 rounded-xl transition-all ${active ? 'bg-emerald-100' : ''}`}>
      <img 
        src={icon} 
        alt={label} 
        className="w-7 h-7"
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      />
    </div>
    <span className={`text-[11px] font-semibold uppercase tracking-wide mt-0.5 ${active ? 'text-emerald-600' : 'text-gray-500'}`}>{label}</span>
  </button>
);

function App() {
  return (
    <Router>
      <NavigationProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </NavigationProvider>
    </Router>
  );
}

export default App;