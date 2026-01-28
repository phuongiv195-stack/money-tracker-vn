// Performance Monitoring Utilities
// SAFE: These utilities never break your app even if Performance Monitoring fails

import { trace } from 'firebase/performance';
import { perf } from './firebase';

/**
 * Safely trace an async operation
 * If Performance Monitoring is unavailable or fails, operation continues normally
 * 
 * @param {string} traceName - Name of the trace (e.g., 'load_transactions')
 * @param {Function} operation - Async function to trace
 * @param {Object} attributes - Optional attributes to attach to trace
 * @returns {Promise} Result of the operation
 * 
 * @example
 * const transactions = await traceOperation('load_transactions', async () => {
 *   const snapshot = await getDocs(query(...));
 *   return snapshot.docs.map(doc => doc.data());
 * }, { user_id: userId });
 */
export async function traceOperation(traceName, operation, attributes = {}) {
  let t = null;
  
  try {
    // Only create trace if Performance Monitoring is available
    if (perf) {
      t = trace(perf, traceName);
      
      // Add attributes
      Object.entries(attributes).forEach(([key, value]) => {
        try {
          t.putAttribute(key, String(value));
        } catch (e) {
          // Silently ignore attribute errors
        }
      });
      
      t.start();
    }
  } catch (error) {
    // Silently ignore trace initialization errors
    // App continues normally
  }
  
  try {
    // Execute the actual operation
    const result = await operation();
    
    // Mark as successful
    if (t) {
      try {
        t.putAttribute('success', 'true');
      } catch (e) {
        // Ignore
      }
    }
    
    return result;
  } catch (error) {
    // Mark as failed
    if (t) {
      try {
        t.putAttribute('success', 'false');
        t.putAttribute('error', error.message || 'unknown');
      } catch (e) {
        // Ignore
      }
    }
    
    // Re-throw the original error so your app can handle it
    throw error;
  } finally {
    // Always stop trace (if it was started)
    if (t) {
      try {
        t.stop();
      } catch (e) {
        // Silently ignore stop errors
      }
    }
  }
}

/**
 * Create a manual trace for more control
 * Returns an object with start() and stop() methods
 * Safe to use even if Performance Monitoring fails
 * 
 * @param {string} traceName - Name of the trace
 * @returns {Object} Trace controller with start(), stop(), and setAttribute() methods
 * 
 * @example
 * const trace = createTrace('process_transactions');
 * trace.start();
 * // ... do work ...
 * trace.setAttribute('count', transactions.length);
 * trace.stop();
 */
export function createTrace(traceName) {
  let t = null;
  let started = false;
  
  try {
    if (perf) {
      t = trace(perf, traceName);
    }
  } catch (error) {
    // Silently ignore initialization errors
  }
  
  return {
    start: () => {
      if (t && !started) {
        try {
          t.start();
          started = true;
        } catch (e) {
          // Ignore
        }
      }
    },
    
    stop: () => {
      if (t && started) {
        try {
          t.stop();
          started = false;
        } catch (e) {
          // Ignore
        }
      }
    },
    
    setAttribute: (key, value) => {
      if (t) {
        try {
          t.putAttribute(key, String(value));
        } catch (e) {
          // Ignore
        }
      }
    },
    
    setMetric: (key, value) => {
      if (t) {
        try {
          t.putMetric(key, Number(value));
        } catch (e) {
          // Ignore
        }
      }
    }
  };
}

/**
 * Log performance metrics (for debugging)
 * Safe to call even if Performance Monitoring is disabled
 */
export function logPerformanceStatus() {
  if (perf) {
    console.log('📊 Performance Monitoring: ACTIVE');
  } else {
    console.log('📊 Performance Monitoring: INACTIVE (app works normally)');
  }
}
