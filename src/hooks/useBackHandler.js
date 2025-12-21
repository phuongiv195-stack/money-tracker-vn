import { useEffect, useRef, useCallback } from 'react';
import { useNavigation } from '../contexts/NavigationContext';

/**
 * Hook to register a close handler for hardware back button
 * @param {boolean} isOpen - Whether the modal/view is open
 * @param {function} onClose - Function to close the modal/view
 */
const useBackHandler = (isOpen, onClose) => {
  const { registerCloseHandler, unregisterCloseHandler } = useNavigation();
  const idRef = useRef(`back-handler-${Date.now()}-${Math.random()}`);
  const onCloseRef = useRef(onClose);

  // Update ref when onClose changes
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Stable callback that reads from ref
  const stableOnClose = useCallback(() => {
    if (onCloseRef.current) {
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      registerCloseHandler(idRef.current, stableOnClose);
    } else {
      unregisterCloseHandler(idRef.current);
    }

    return () => {
      unregisterCloseHandler(idRef.current);
    };
  }, [isOpen, stableOnClose, registerCloseHandler, unregisterCloseHandler]);
};

export default useBackHandler;
