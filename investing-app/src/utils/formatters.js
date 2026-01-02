/**
 * Format number as currency (US format with commas)
 * @param {number} amount 
 * @returns {string}
 */
export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '0';
  return new Intl.NumberFormat('en-US').format(Math.round(amount));
};

/**
 * Format number with commas (US format)
 * @param {number} num 
 * @returns {string}
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('en-US').format(num);
};

/**
 * Format date as YYYY-MM-DD for both input and display
 * @param {Date|string} date 
 * @returns {string}
 */
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Parse currency input (remove commas)
 * @param {string} value 
 * @returns {number}
 */
export const parseCurrency = (value) => {
  if (!value) return 0;
  return Number(String(value).replace(/,/g, ''));
};

/**
 * Format currency input as user types
 * @param {HTMLInputElement} input 
 */
export const formatCurrencyInput = (input) => {
  let value = input.value.replace(/,/g, '');
  if (value && !isNaN(value)) {
    input.value = formatNumber(Number(value));
  }
};

/**
 * Calculate percentage change
 * @param {number} current 
 * @param {number} previous 
 * @returns {number}
 */
export const calculatePercentChange = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Get color class based on value (positive/negative)
 * @param {number} value 
 * @returns {string}
 */
export const getColorClass = (value) => {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
};

/**
 * Get background color class based on value
 * @param {number} value 
 * @returns {string}
 */
export const getBgColorClass = (value) => {
  if (value > 0) return 'bg-green-100';
  if (value < 0) return 'bg-red-100';
  return 'bg-gray-100';
};
