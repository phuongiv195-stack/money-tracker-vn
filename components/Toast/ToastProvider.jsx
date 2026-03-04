import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';

// Toast Context
const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

// Toast types with icons and colors
const toastStyles = {
  success: {
    bg: 'bg-emerald-500',
    icon: '✓',
  },
  error: {
    bg: 'bg-red-500',
    icon: '✕',
  },
  warning: {
    bg: 'bg-amber-500',
    icon: '⚠',
  },
  info: {
    bg: 'bg-blue-500',
    icon: 'ℹ',
  },
};

// Single Toast Component
const Toast = ({ message, type = 'info', onClose }) => {
  const style = toastStyles[type] || toastStyles.info;

  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className={`${style.bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[200px] max-w-[90vw] animate-slide-up`}
      onClick={onClose}
    >
      <span className="text-xl font-bold">{style.icon}</span>
      <span className="flex-1 text-sm font-medium">{message}</span>
    </div>
  );
};

// Confirm Modal Component
const ConfirmModal = ({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger', onConfirm, onCancel }) => {
  const bgColor = type === 'danger' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-emerald-500';
  const icon = type === 'danger' ? '🗑️' : type === 'warning' ? '⚠️' : '❓';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden animate-scale-in">
        <div className={`${bgColor} p-4 text-white text-center`}>
          <div className="text-3xl mb-1">{icon}</div>
          <div className="font-bold text-lg">{title}</div>
        </div>
        <div className="p-4">
          <p className="text-gray-700 text-center mb-4 whitespace-pre-line">{message}</p>
          <div className="flex gap-2">
            <button 
              onClick={onCancel} 
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              {cancelText}
            </button>
            <button 
              onClick={onConfirm} 
              className={`flex-1 ${bgColor} text-white py-3 rounded-lg font-medium hover:opacity-90 transition-colors`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Toast Provider
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirm({
        ...options,
        onConfirm: () => {
          setConfirm(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirm(null);
          resolve(false);
        },
      });
    });
  }, []);

  // Shorthand methods
  const toast = {
    success: (msg) => showToast(msg, 'success'),
    error: (msg) => showToast(msg, 'error'),
    warning: (msg) => showToast(msg, 'warning'),
    info: (msg) => showToast(msg, 'info'),
    confirm: showConfirm,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-24 left-0 right-0 z-[99] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast 
              message={t.message} 
              type={t.type} 
              onClose={() => removeToast(t.id)} 
            />
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirm && <ConfirmModal {...confirm} />}
    </ToastContext.Provider>
  );
}

export default ToastProvider;
