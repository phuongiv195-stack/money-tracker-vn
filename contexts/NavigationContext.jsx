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
  const closeHandlersRef = useRef([]);
  const [, forceUpdate] = useState(0);
  const isHandlingBack = useRef(false);

  const registerCloseHandler = useCallback((id, handler) => {
    // Avoid duplicates
    if (closeHandlersRef.current.some(h => h.id === id)) return;
    closeHandlersRef.current = [...closeHandlersRef.current, { id, handler }];
    forceUpdate(n => n + 1);
    
    // Push history state khi có modal mới
    window.history.pushState({ appModal: true, id }, '');
  }, []);

  const unregisterCloseHandler = useCallback((id) => {
    closeHandlersRef.current = closeHandlersRef.current.filter(h => h.id !== id);
    forceUpdate(n => n + 1);
  }, []);

  const handleBack = useCallback(() => {
    if (closeHandlersRef.current.length > 0) {
      const lastHandler = closeHandlersRef.current[closeHandlersRef.current.length - 1];
      lastHandler.handler();
      return true;
    }
    return false;
  }, []);

  // Setup history management
  useEffect(() => {
    // Push base state để có cái gì đó để back về
    window.history.replaceState({ appBase: true }, '');
    window.history.pushState({ appBase: true }, '');

    const handlePopState = (e) => {
      // Prevent multiple rapid calls
      if (isHandlingBack.current) return;
      isHandlingBack.current = true;
      
      setTimeout(() => {
        isHandlingBack.current = false;
      }, 100);

      if (closeHandlersRef.current.length > 0) {
        // Close the topmost modal
        const lastHandler = closeHandlersRef.current[closeHandlersRef.current.length - 1];
        lastHandler.handler();
      } else {
        // No modals open - re-push to prevent exit
        // Dùng replaceState + pushState để đảm bảo luôn có history
        window.history.pushState({ appBase: true }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <NavigationContext.Provider value={{ 
      registerCloseHandler, 
      unregisterCloseHandler,
      handleBack,
      hasOpenModals: closeHandlersRef.current.length > 0
    }}>
      {children}
    </NavigationContext.Provider>
  );
};

export default NavigationContext;