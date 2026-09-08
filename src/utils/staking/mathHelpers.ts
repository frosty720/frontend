/**
 * Mathematical Helper Functions for Staking
 * Copied from production KalyCoinStaking implementation
 * These functions handle APR calculations, time formatting, and number formatting
 */

const oneDay = 86400;

/**
 * Convert Wei to Ether (divide by 10^18)
 * @param numb - Number in Wei
 * @returns Number in Ether
 */
export const fromWei = (numb: number): number => {
  return numb / 10 ** 18;
};

/**
 * Calculate APR percentage from rewards and total staked amount
 * @param numberOfRewards - Total rewards for the period (in Wei)
 * @param totalAmount - Total staked amount (in Wei)
 * @returns APR percentage as a number
 */
export const calcPercent = (
  numberOfRewards: bigint,
  totalAmount: bigint
): number => {
  if (totalAmount === BigInt(0)) return 0;
  return Math.round((Number(numberOfRewards) * 100) / Number(totalAmount));
};

/**
 * Calculate days remaining until timestamp
 * @param timeStamp - End timestamp (in seconds)
 * @returns Number of days remaining (0 if already passed)
 */
export const calcEndingTime = (timeStamp: bigint): number => {
  const currentStamp = Date.now() / 1000; // Calculate current time dynamically
  const days = Math.round((Number(timeStamp) - currentStamp) / oneDay);
  if (days > 0) {
    return days;
  } else return 0;
};

/**
 * Format number to appropriate decimal places (max 6 decimals)
 * @param value - Number to format
 * @returns Formatted string with appropriate decimals (max 6)
 */
export const toFixedDigits = (value: number): string => {
  if (value >= 10) {
    return value.toFixed(6);
  } else if (value < 10 && value >= 1) {
    return value.toFixed(6);
  } else return value.toFixed(6);
};

/**
 * Format address for display (truncate middle)
 * @param address - Full address string
 * @returns Truncated address string
 */
export const formatAddress = (address: string): string => {
  if (!address) return '';
  return address.slice(0, 6) + '...' + address.slice(-4);
};

/**
 * Calculate APR from reward rate and total supply
 * @param rewardRate - Reward rate per second
 * @param totalSupply - Total staked amount
 * @returns APR percentage
 */
export const calculateAPR = (rewardRate: bigint, totalSupply: bigint): number => {
  if (totalSupply === BigInt(0) || rewardRate === BigInt(0)) return 0;
  
  // Calculate annual rewards (rewardRate * seconds in year)
  const secondsInYear = BigInt(365 * 24 * 60 * 60);
  const annualRewards = rewardRate * secondsInYear;
  
  // Calculate APR percentage
  return Number((annualRewards * BigInt(100)) / totalSupply);
};

/**
 * Format KMT amount for display
 * @param amount - Amount in Wei (bigint)
 * @returns Formatted string with KMT suffix
 */
export const formatKLCAmount = (amount: bigint): string => {
  const ethAmount = Number(amount) / 10 ** 18;
  return `${toFixedDigits(ethAmount)} KMT`;
};

/**
 * Parse KMT amount from string to Wei
 * @param amount - Amount string (e.g., "1.5")
 * @returns Amount in Wei (bigint)
 */
export const parseKLCAmount = (amount: string): bigint => {
  try {
    const ethAmount = parseFloat(amount);
    if (isNaN(ethAmount)) return BigInt(0);

    // Avoid scientific notation by using string manipulation for large numbers
    const [integerPart, decimalPart = ''] = amount.split('.');
    const paddedDecimal = decimalPart.padEnd(18, '0').slice(0, 18);
    const weiString = integerPart + paddedDecimal;

    return BigInt(weiString);
  } catch {
    return BigInt(0);
  }
};

/**
 * Check if amount is valid for staking
 * @param amount - Amount string
 * @param balance - Available balance in Wei
 * @returns Validation result
 */
export const validateStakeAmount = (amount: string, balance: bigint): {
  isValid: boolean;
  error?: string;
} => {
  if (!amount || amount === '0') {
    return { isValid: false, error: 'Amount is required' };
  }
  
  const amountWei = parseKLCAmount(amount);
  if (amountWei === BigInt(0)) {
    return { isValid: false, error: 'Invalid amount' };
  }
  
  if (amountWei > balance) {
    return { isValid: false, error: 'Insufficient balance' };
  }
  
  return { isValid: true };
};
