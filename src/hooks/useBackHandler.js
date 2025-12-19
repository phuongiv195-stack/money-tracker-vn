import { useEffect, useRef } from 'react';
import { useNavigation } from '../contexts/NavigationContext';

/**
 * Hook to register a close handler for hardware back button
 * @param {boolean} isOpen - Whether the modal/view is open
 * @param {function} onClose - Function to close the modal/view
 */
const useBackHandler = (isOpen, onClose) => {
  const { registerCloseHandler, unregisterCloseHandler } = useNavigation();
  const idRef = useRef(`back-handler-${Date.now()}-${Math.random()}`);

  useEffect(() => {
    if (isOpen) {
      registerCloseHandler(idRef.current, onClose);
    } else {
      unregisterCloseHandler(idRef.current);
    }

    return () => {
      unregisterCloseHandler(idRef.current);
    };
  }, [isOpen, onClose, registerCloseHandler, unregisterCloseHandler]);
};

export default useBackHandler;