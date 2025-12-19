import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const NavigationContext = createContext();

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    return {
      registerCloseHandler: () => {},
      unregisterCloseHandler: () => {},
      handleBack: () => false,
      hasOpenModals: false
    };
  }
  return context;
};

export const NavigationProvider = ({ children }) => {
  const [closeHandlers, setCloseHandlers] = useState([]);
  const historyPushed = useRef(false);

  const registerCloseHandler = useCallback((id, handler) => {
    setCloseHandlers(prev => {
      // Avoid duplicates
      if (prev.some(h => h.id === id)) return prev;
      return [...prev, { id, handler }];
    });
  }, []);

  const unregisterCloseHandler = useCallback((id) => {
    setCloseHandlers(prev => prev.filter(h => h.id !== id));
  }, []);

  const handleBack = useCallback(() => {
    if (closeHandlers.length > 0) {
      const lastHandler = closeHandlers[closeHandlers.length - 1];
      lastHandler.handler();
      return true;
    }
    return false;
  }, [closeHandlers]);

  // Setup history management
  useEffect(() => {
    // Push initial state once
    if (!historyPushed.current) {
      window.history.pushState({ app: true, depth: 0 }, '');
      historyPushed.current = true;
    }

    const handlePopState = (e) => {
      if (closeHandlers.length > 0) {
        // Close the topmost modal
        const lastHandler = closeHandlers[closeHandlers.length - 1];
        lastHandler.handler();
        // Re-push state to stay in app
        window.history.pushState({ app: true, depth: closeHandlers.length - 1 }, '');
      } else {
        // No modals - re-push to prevent exit
        window.history.pushState({ app: true, depth: 0 }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeHandlers]);

  // Push new history entry when modal opens
  useEffect(() => {
    if (closeHandlers.length > 0) {
      window.history.pushState({ app: true, depth: closeHandlers.length }, '');
    }
  }, [closeHandlers.length]);

  return (
    <NavigationContext.Provider value={{ 
      registerCloseHandler, 
      unregisterCloseHandler,
      handleBack,
      hasOpenModals: closeHandlers.length > 0
    }}>
      {children}
    </NavigationContext.Provider>
  );
};

export default NavigationContext;