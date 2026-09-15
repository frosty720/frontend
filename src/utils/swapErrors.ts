/**
 * Enhanced error handling system for swap operations
 * Provides user-friendly error messages and recovery suggestions
 *
 * Classification (type/severity/retryable/actionType/details) happens here, in English-pattern
 * matching against whatever text the wallet/RPC/contract returned. The user-facing text itself is
 * NOT stored on the classified object — `getSwapErrorText` looks it up from `dict.errors.swap` at
 * render time, so the same classification renders in whichever language the reader has selected.
 */

import type { Dictionary } from '@/i18n/dictionaries/en';
import { interpolate } from '@/i18n/interpolate';
import type { ErrorParams } from '@/lib/userError';

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
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  /** The router reverted with a reason we don't have a specific pattern for. */
  CONTRACT_REJECTED = 'CONTRACT_REJECTED'
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
  retryable: boolean;
  actionType?: 'retry' | 'reset' | 'adjust' | 'external';
  /** Raw diagnostic text (English, whatever the wallet/RPC/contract said) shown only behind
   * "Show details" — never the primary title/message a reader sees. */
  details?: string;
  /** Extra values for the dictionary text at this error's type, e.g. INSUFFICIENT_BALANCE's
   * required/available/symbol. */
  params?: ErrorParams;
}

/** Localized title/message/suggestion/action label for a classified `SwapError`. */
export interface SwapErrorText {
  title: string;
  message: string;
  suggestion?: string;
  action?: string;
}

type SwapErrorDictEntry = { title: string; message: string; suggestion: string; action: string };

function swapErrorDictEntry(type: SwapErrorType, dict: Dictionary): SwapErrorDictEntry {
  const table = dict.errors.swap;
  switch (type) {
    case SwapErrorType.USER_REJECTED: return table.USER_REJECTED;
    case SwapErrorType.NETWORK_ERROR: return table.NETWORK_ERROR;
    case SwapErrorType.INSUFFICIENT_BALANCE: return table.INSUFFICIENT_BALANCE;
    case SwapErrorType.INSUFFICIENT_GAS: return table.INSUFFICIENT_GAS;
    case SwapErrorType.GAS_ESTIMATION_FAILED: return table.GAS_ESTIMATION_FAILED;
    case SwapErrorType.CONTRACT_ERROR: return table.CONTRACT_ERROR;
    case SwapErrorType.CONTRACT_REJECTED: return table.CONTRACT_REJECTED;
    case SwapErrorType.SLIPPAGE_EXCEEDED: return table.SLIPPAGE_EXCEEDED;
    case SwapErrorType.INSUFFICIENT_LIQUIDITY: return table.INSUFFICIENT_LIQUIDITY;
    case SwapErrorType.DEADLINE_EXCEEDED: return table.DEADLINE_EXCEEDED;
    case SwapErrorType.INSUFFICIENT_ALLOWANCE: return table.INSUFFICIENT_ALLOWANCE;
    case SwapErrorType.WALLET_NOT_CONNECTED: return table.WALLET_NOT_CONNECTED;
    case SwapErrorType.INVALID_AMOUNT: return table.INVALID_AMOUNT;
    case SwapErrorType.SAME_TOKEN: return table.SAME_TOKEN;
    // RPC_ERROR, TIMEOUT_ERROR, PRICE_IMPACT_TOO_HIGH and INVALID_TOKEN are never assigned as a
    // final `type` by parseSwapError/createValidationError below — kept for API completeness only.
    default: return table.UNKNOWN_ERROR;
  }
}

/** The text to render for a classified swap error, in the dictionary's language. */
export function getSwapErrorText(error: SwapError, dict: Dictionary): SwapErrorText {
  const entry = swapErrorDictEntry(error.type, dict);
  const message = error.type === SwapErrorType.INSUFFICIENT_BALANCE && error.params
    ? interpolate(dict.errors.swap.insufficientBalanceDetail, error.params)
    : entry.message;

  return { title: entry.title, message, suggestion: entry.suggestion, action: entry.action };
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
      retryable: true,
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
      retryable: true,
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
      retryable: false,
      actionType: 'adjust'
    };
  }

  // Genuinely out of gas money. Deliberately narrow: only phrases that mean the wallet could
  // not PAY. ("insufficient funds…" is already caught by the balance branch above.)
  if (/out of gas|gas required exceeds allowance|insufficient funds for gas|intrinsic transaction cost/i.test(errorMessage)) {
    return {
      type: SwapErrorType.INSUFFICIENT_GAS,
      severity: SwapErrorSeverity.MEDIUM,
      retryable: true,
      actionType: 'retry'
    };
  }

  // Any OTHER gas-shaped error is an estimation failure — almost always an unreachable RPC or a
  // call that would revert, NOT an empty wallet. This used to match the bare substring "gas", so
  // "failed to estimate gas" told a holder with 7,807 KMT to "add more KMT": the advice was wrong
  // and it hid the real fault (their wallet RPC was pointing at a dead host).
  if (/gas/i.test(errorMessage)) {
    return {
      type: SwapErrorType.GAS_ESTIMATION_FAILED,
      severity: SwapErrorSeverity.MEDIUM,
      retryable: true,
      actionType: 'retry'
    };
  }

  // Generic contract error
  if (errorMessage.includes('execution reverted') ||
      errorMessage.includes('transaction failed')) {
    return {
      type: SwapErrorType.CONTRACT_ERROR,
      severity: SwapErrorSeverity.HIGH,
      retryable: true,
      actionType: 'adjust',
      details: errorMessage
    };
  }

  // Default unknown error
  return {
    type: SwapErrorType.UNKNOWN_ERROR,
    severity: SwapErrorSeverity.CRITICAL,
    retryable: true,
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
        retryable: true,
        actionType: 'adjust'
      };

    case SwapErrorType.INSUFFICIENT_LIQUIDITY:
      return {
        type: errorType,
        severity: SwapErrorSeverity.HIGH,
        retryable: false,
        actionType: 'adjust'
      };

    case SwapErrorType.DEADLINE_EXCEEDED:
      return {
        type: errorType,
        severity: SwapErrorSeverity.MEDIUM,
        retryable: true,
        actionType: 'retry'
      };

    case SwapErrorType.INSUFFICIENT_ALLOWANCE:
      return {
        type: errorType,
        severity: SwapErrorSeverity.MEDIUM,
        retryable: true,
        actionType: 'retry'
      };

    default:
      // The router reverted for a reason we don't have a specific pattern for (e.g. TRANSFER_FAILED,
      // or any future require() string) — the dictionary's CONTRACT_REJECTED entry is the generic
      // "the contract said no" copy, distinct from CONTRACT_ERROR's "the transaction reverted" copy.
      return {
        type: SwapErrorType.CONTRACT_REJECTED,
        severity: SwapErrorSeverity.HIGH,
        retryable: true,
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
        retryable: false,
        actionType: 'external'
      };

    case SwapErrorType.INVALID_AMOUNT:
      return {
        type,
        severity: SwapErrorSeverity.MEDIUM,
        retryable: false,
        actionType: 'adjust'
      };

    case SwapErrorType.SAME_TOKEN:
      return {
        type,
        severity: SwapErrorSeverity.MEDIUM,
        retryable: false,
        actionType: 'adjust'
      };

    case SwapErrorType.INSUFFICIENT_BALANCE: {
      const { required, available, symbol } = context || {};
      return {
        type,
        severity: SwapErrorSeverity.HIGH,
        retryable: false,
        actionType: 'adjust',
        params: required && available && symbol ? { required, available, symbol } : undefined
      };
    }

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
