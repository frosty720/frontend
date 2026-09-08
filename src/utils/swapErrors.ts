/**
 * Enhanced error handling system for swap operations
 * Provides user-friendly error messages and recovery suggestions
 */

export enum SwapErrorType {
  // Network related errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Contract related errors
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
  PRICE_IMPACT_TOO_HIGH = 'PRICE_IMPACT_TOO_HIGH',
  
  // User related errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_ALLOWANCE = 'INSUFFICIENT_ALLOWANCE',
  USER_REJECTED = 'USER_REJECTED',
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  
  // Validation errors
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_TOKEN = 'INVALID_TOKEN',
  SAME_TOKEN = 'SAME_TOKEN',
  
  // Gas related errors
  INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR'
}

export enum SwapErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SwapError {
  type: SwapErrorType;
  severity: SwapErrorSeverity;
  title: string;
  message: string;
  suggestion?: string;
  actionLabel?: string;
  actionType?: 'retry' | 'reset' | 'adjust' | 'external';
  retryable: boolean;
  details?: string;
}

/**
 * Contract error patterns from KalySwap router
 */
const CONTRACT_ERROR_PATTERNS = {
  'INSUFFICIENT_OUTPUT_AMOUNT': SwapErrorType.SLIPPAGE_EXCEEDED,
  'EXCESSIVE_INPUT_AMOUNT': SwapErrorType.SLIPPAGE_EXCEEDED,
  'INSUFFICIENT_LIQUIDITY': SwapErrorType.INSUFFICIENT_LIQUIDITY,
  'INSUFFICIENT_A_AMOUNT': SwapErrorType.INSUFFICIENT_LIQUIDITY,
  'INSUFFICIENT_B_AMOUNT': SwapErrorType.INSUFFICIENT_LIQUIDITY,
  'EXPIRED': SwapErrorType.DEADLINE_EXCEEDED,
  'TRANSFER_FROM_FAILED': SwapErrorType.INSUFFICIENT_ALLOWANCE,
  'TRANSFER_FAILED': SwapErrorType.INSUFFICIENT_BALANCE,
} as const;

/**
 * User rejection error patterns
 */
const USER_REJECTION_PATTERNS = [
  'user rejected',
  'user denied',
  'rejected',
  'cancelled',
  'user cancelled',
  'action_rejected',
  'code 4001'
];

/**
 * Network error patterns
 */
const NETWORK_ERROR_PATTERNS = [
  'network error',
  'fetch failed',
  'connection failed',
  'timeout',
  'network request failed',
  'failed to fetch'
];

/**
 * Parse and classify an error from swap operations
 */
export function parseSwapError(error: any): SwapError {
  const errorMessage = error?.message || error?.reason || String(error);
  const errorCode = error?.code;
  
  // User rejection errors
  if (errorCode === 4001 || USER_REJECTION_PATTERNS.some(pattern => 
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return {
      type: SwapErrorType.USER_REJECTED,
      severity: SwapErrorSeverity.LOW,
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction in your wallet.',
      suggestion: 'Click "Swap" again when you\'re ready to proceed.',
      retryable: true,
      actionLabel: 'Try Again',
      actionType: 'retry'
    };
  }
  
  // Network errors
  if (NETWORK_ERROR_PATTERNS.some(pattern => 
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return {
      type: SwapErrorType.NETWORK_ERROR,
      severity: SwapErrorSeverity.MEDIUM,
      title: 'Network Connection Issue',
      message: 'Unable to connect to the blockchain network.',
      suggestion: 'Check your internet connection and try again.',
      retryable: true,
      actionLabel: 'Retry',
      actionType: 'retry'
    };
  }
  
  // Contract-specific errors
  for (const [pattern, errorType] of Object.entries(CONTRACT_ERROR_PATTERNS)) {
    if (errorMessage.includes(pattern)) {
      return getContractErrorDetails(errorType, errorMessage);
    }
  }
  
  // Insufficient balance (check for balance-related keywords)
  if (errorMessage.toLowerCase().includes('insufficient') && 
      (errorMessage.toLowerCase().includes('balance') || 
       errorMessage.toLowerCase().includes('funds'))) {
    return {
      type: SwapErrorType.INSUFFICIENT_BALANCE,
      severity: SwapErrorSeverity.HIGH,
      title: 'Insufficient Balance',
      message: 'You don\'t have enough tokens to complete this swap.',
      suggestion: 'Reduce the swap amount or add more tokens to your wallet.',
      retryable: false,
      actionLabel: 'Adjust Amount',
      actionType: 'adjust'
    };
  }
  
  // Gas estimation errors
  if (errorMessage.toLowerCase().includes('gas') || 
      errorMessage.toLowerCase().includes('out of gas')) {
    return {
      type: SwapErrorType.INSUFFICIENT_GAS,
      severity: SwapErrorSeverity.MEDIUM,
      title: 'Insufficient Gas',
      message: 'Not enough KMT to pay for transaction fees.',
      suggestion: 'Add more KMT to your wallet to cover gas fees.',
      retryable: true,
      actionLabel: 'Retry',
      actionType: 'retry'
    };
  }
  
  // Generic contract error
  if (errorMessage.includes('execution reverted') || 
      errorMessage.includes('transaction failed')) {
    return {
      type: SwapErrorType.CONTRACT_ERROR,
      severity: SwapErrorSeverity.HIGH,
      title: 'Transaction Failed',
      message: 'The swap transaction was rejected by the smart contract.',
      suggestion: 'Try adjusting your slippage tolerance or swap amount.',
      retryable: true,
      actionLabel: 'Adjust Settings',
      actionType: 'adjust',
      details: errorMessage
    };
  }
  
  // Default unknown error
  return {
    type: SwapErrorType.UNKNOWN_ERROR,
    severity: SwapErrorSeverity.CRITICAL,
    title: 'Unexpected Error',
    message: 'An unexpected error occurred during the swap.',
    suggestion: 'Please try again or contact support if the problem persists.',
    retryable: true,
    actionLabel: 'Try Again',
    actionType: 'retry',
    details: errorMessage
  };
}

/**
 * Get detailed error information for contract-specific errors
 */
function getContractErrorDetails(errorType: SwapErrorType, errorMessage: string): SwapError {
  switch (errorType) {
    case SwapErrorType.SLIPPAGE_EXCEEDED:
      return {
        type: errorType,
        severity: SwapErrorSeverity.MEDIUM,
        title: 'Slippage Tolerance Exceeded',
        message: 'The price moved too much during your transaction.',
        suggestion: 'Increase your slippage tolerance in settings or try a smaller amount.',
        retryable: true,
        actionLabel: 'Adjust Slippage',
        actionType: 'adjust'
      };
      
    case SwapErrorType.INSUFFICIENT_LIQUIDITY:
      return {
        type: errorType,
        severity: SwapErrorSeverity.HIGH,
        title: 'Insufficient Liquidity',
        message: 'Not enough liquidity available for this swap amount.',
        suggestion: 'Try a smaller swap amount or choose a different token pair.',
        retryable: false,
        actionLabel: 'Reduce Amount',
        actionType: 'adjust'
      };
      
    case SwapErrorType.DEADLINE_EXCEEDED:
      return {
        type: errorType,
        severity: SwapErrorSeverity.MEDIUM,
        title: 'Transaction Deadline Exceeded',
        message: 'The transaction took too long to process.',
        suggestion: 'Increase the deadline in settings or try again.',
        retryable: true,
        actionLabel: 'Try Again',
        actionType: 'retry'
      };
      
    case SwapErrorType.INSUFFICIENT_ALLOWANCE:
      return {
        type: errorType,
        severity: SwapErrorSeverity.MEDIUM,
        title: 'Token Approval Required',
        message: 'You need to approve the token for swapping first.',
        suggestion: 'Complete the token approval transaction, then try swapping again.',
        retryable: true,
        actionLabel: 'Approve Token',
        actionType: 'retry'
      };
      
    default:
      return {
        type: SwapErrorType.CONTRACT_ERROR,
        severity: SwapErrorSeverity.HIGH,
        title: 'Contract Error',
        message: 'The smart contract rejected the transaction.',
        suggestion: 'Try adjusting your swap parameters.',
        retryable: true,
        actionLabel: 'Try Again',
        actionType: 'retry',
        details: errorMessage
      };
  }
}

/**
 * Validation errors for pre-transaction checks
 */
export function createValidationError(type: SwapErrorType, context?: any): SwapError {
  switch (type) {
    case SwapErrorType.WALLET_NOT_CONNECTED:
      return {
        type,
        severity: SwapErrorSeverity.HIGH,
        title: 'Wallet Not Connected',
        message: 'Please connect your wallet to perform swaps.',
        suggestion: 'Click the "Connect Wallet" button to get started.',
        retryable: false,
        actionLabel: 'Connect Wallet',
        actionType: 'external'
      };

    case SwapErrorType.INVALID_AMOUNT:
      return {
        type,
        severity: SwapErrorSeverity.MEDIUM,
        title: 'Invalid Amount',
        message: 'Please enter a valid swap amount.',
        suggestion: 'Enter a positive number greater than zero.',
        retryable: false,
        actionLabel: 'Fix Amount',
        actionType: 'adjust'
      };

    case SwapErrorType.SAME_TOKEN:
      return {
        type,
        severity: SwapErrorSeverity.MEDIUM,
        title: 'Same Token Selected',
        message: 'You cannot swap a token for itself.',
        suggestion: 'Select different tokens for the swap.',
        retryable: false,
        actionLabel: 'Change Token',
        actionType: 'adjust'
      };

    case SwapErrorType.INSUFFICIENT_BALANCE:
      const { required, available, symbol } = context || {};
      return {
        type,
        severity: SwapErrorSeverity.HIGH,
        title: 'Insufficient Balance',
        message: required && available && symbol
          ? `You need ${required} ${symbol} but only have ${available} ${symbol}.`
          : 'You don\'t have enough tokens for this swap.',
        suggestion: 'Reduce the swap amount or add more tokens to your wallet.',
        retryable: false,
        actionLabel: 'Adjust Amount',
        actionType: 'adjust'
      };

    default:
      return parseSwapError(new Error('Validation failed'));
  }
}

/**
 * Check if an error is retryable automatically
 */
export function isAutoRetryable(error: SwapError): boolean {
  return error.retryable && (
    error.type === SwapErrorType.NETWORK_ERROR ||
    error.type === SwapErrorType.RPC_ERROR ||
    error.type === SwapErrorType.TIMEOUT_ERROR
  );
}

/**
 * Get retry delay for automatic retries (exponential backoff)
 */
export function getRetryDelay(attemptNumber: number): number {
  return Math.min(1000 * Math.pow(2, attemptNumber), 10000); // Max 10 seconds
}
