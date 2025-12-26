import { useState, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';

export default function SettingsTab() {
  const { settings, updateFontSize } = useSettings();
  const { currentUser, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fontSizeOptions = [
    { value: 'normal', label: 'Normal', description: 'For larger screens' },
    { value: 'large', label: 'Large', description: 'For smaller screens' },
  ];

  const handleBack = () => {
    window.dispatchEvent(new CustomEvent('closeSettings'));
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-emerald-500 text-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleBack}
            className="p-1 hover:bg-emerald-600 rounded transition-colors"
          >
            ← 
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
          isOnline ? 'bg-emerald-600' : 'bg-orange-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-300' : 'bg-orange-300'} animate-pulse`}></div>
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Settings List */}
      <div className="p-4">
        {/* Account Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">Account</h2>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-800">{currentUser?.email}</div>
                <div className="text-sm text-gray-500">Logged in</div>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Font Size Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">Font Size</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Change text size in the app
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {fontSizeOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-800">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.description}</div>
                </div>
                <div className="ml-3">
                  <input
                    type="radio"
                    name="fontSize"
                    value={option.value}
                    checked={settings.fontSize === option.value}
                    onChange={() => updateFontSize(option.value)}
                    className="w-5 h-5 text-emerald-500 border-gray-300 focus:ring-emerald-500"
                  />
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Preview Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">Preview</h2>
          </div>
          <div className="p-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-800">🛒 Groceries</span>
                <span className="text-red-500 font-medium">-500,000</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-800">💰 December Salary</span>
                <span className="text-emerald-500 font-medium">+15,000,000</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-800">☕ Coffee</span>
                <span className="text-red-500 font-medium">-45,000</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <p className="text-center text-gray-400 text-sm mt-6">
          Money Tracker v1.2.5
        </p>
      </div>
    </div>
  );
}
