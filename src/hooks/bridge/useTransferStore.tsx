// Transfer Store Hook - Transaction status tracking for bridge transfers
// Adapted from Hyperlane transfer store with simplified state management

'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { ErrorCode, ErrorParams } from '@/lib/userError';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { interpolate } from '@/i18n/interpolate';

export enum TransferStatus {
  Preparing = 'preparing',
  CreatingTxs = 'creating-txs',
  SigningApproval = 'signing-approval',
  ConfirmingApproval = 'confirming-approval',
  SigningTransfer = 'signing-transfer',
  ConfirmingTransfer = 'confirming-transfer',
  ConfirmedTransfer = 'confirmed-transfer',
  Delivered = 'delivered',
  Failed = 'failed',
}

/**
 * A translatable bridge failure: either a shared dictionary error code (optionally with
 * interpolation params, e.g. `switchChain` needs `{chain}`) or the generic message for the
 * transfer stage the failure happened in. Rendered via `describeBridgeFailure`.
 */
export type BridgeFailure = { code: ErrorCode; params?: ErrorParams } | { code: 'stage'; stage: TransferStatus };

export interface TransferContext {
  timestamp: number;
  status: TransferStatus;
  origin: string;
  destination: string;
  originTokenAddressOrDenom: string;
  destTokenAddressOrDenom: string;
  sender: string;
  recipient: string;
  amount: string;
  txHash?: string;
  msgId?: string;
  /**
   * `string` is only possible for records written before this field carried a translation key
   * (kept so old in-memory records still render instead of crashing) — `describeBridgeFailure`
   * falls back to the generic stage text for that case rather than showing raw English.
   */
  failure?: BridgeFailure | string;
}

interface TransferState {
  transfers: TransferContext[];
}

type TransferAction =
  | { type: 'ADD_TRANSFER'; payload: TransferContext }
  | { type: 'UPDATE_TRANSFER_STATUS'; payload: { index: number; status: TransferStatus; txHash?: string; msgId?: string; failure?: BridgeFailure | string } }
  | { type: 'CLEAR_TRANSFERS' };

interface TransferStoreContextType {
  transfers: TransferContext[];
  addTransfer: (transfer: TransferContext) => number;
  updateTransferStatus: (index: number, status: TransferStatus, txHash?: string, msgId?: string, failure?: BridgeFailure | string) => void;
  clearTransfers: () => void;
  getLatestTransfer: () => TransferContext | null;
}

const TransferStoreContext = createContext<TransferStoreContextType | null>(null);

const initialState: TransferState = {
  transfers: [],
};

function transferReducer(state: TransferState, action: TransferAction): TransferState {
  switch (action.type) {
    case 'ADD_TRANSFER':
      return {
        ...state,
        transfers: [...state.transfers, action.payload],
      };
    case 'UPDATE_TRANSFER_STATUS':
      return {
        ...state,
        transfers: state.transfers.map((transfer, index) =>
          index === action.payload.index
            ? {
                ...transfer,
                status: action.payload.status,
                ...(action.payload.txHash && { txHash: action.payload.txHash }),
                ...(action.payload.msgId && { msgId: action.payload.msgId }),
                ...(action.payload.failure !== undefined && { failure: action.payload.failure }),
              }
            : transfer
        ),
      };
    case 'CLEAR_TRANSFERS':
      return {
        ...state,
        transfers: [],
      };
    default:
      return state;
  }
}

export function TransferStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(transferReducer, initialState);

  const addTransfer = (transfer: TransferContext): number => {
    dispatch({ type: 'ADD_TRANSFER', payload: transfer });
    return state.transfers.length; // Return the index of the new transfer
  };

  const updateTransferStatus = (
    index: number,
    status: TransferStatus,
    txHash?: string,
    msgId?: string,
    failure?: BridgeFailure | string
  ) => {
    dispatch({
      type: 'UPDATE_TRANSFER_STATUS',
      payload: { index, status, txHash, msgId, failure },
    });
  };

  const clearTransfers = () => {
    dispatch({ type: 'CLEAR_TRANSFERS' });
  };

  const getLatestTransfer = (): TransferContext | null => {
    return state.transfers.length > 0 ? state.transfers[state.transfers.length - 1] : null;
  };

  return (
    <TransferStoreContext.Provider
      value={{
        transfers: state.transfers,
        addTransfer,
        updateTransferStatus,
        clearTransfers,
        getLatestTransfer,
      }}
    >
      {children}
    </TransferStoreContext.Provider>
  );
}

export function useTransferStore() {
  const context = useContext(TransferStoreContext);
  if (!context) {
    throw new Error('useTransferStore must be used within a TransferStoreProvider');
  }
  return context;
}

// Helper functions for status management
export const transferStatusHelpers = {
  // Check if status is in progress
  isInProgress: (status: TransferStatus): boolean => {
    return ![TransferStatus.ConfirmedTransfer, TransferStatus.Delivered, TransferStatus.Failed].includes(status);
  },

  // Check if status is final (success or failure)
  isFinal: (status: TransferStatus): boolean => {
    return [TransferStatus.ConfirmedTransfer, TransferStatus.Delivered, TransferStatus.Failed].includes(status);
  },

  // Check if status is successful
  isSuccess: (status: TransferStatus): boolean => {
    return [TransferStatus.ConfirmedTransfer, TransferStatus.Delivered].includes(status);
  },

  // Check if status is failed
  isFailed: (status: TransferStatus): boolean => {
    return status === TransferStatus.Failed;
  },

  // Get status color for UI
  getStatusColor: (status: TransferStatus): string => {
    if (transferStatusHelpers.isSuccess(status)) return 'text-success';
    if (transferStatusHelpers.isFailed(status)) return 'text-danger';
    return 'text-info';
  },

  // Get status icon
  getStatusIcon: (status: TransferStatus): string => {
    if (transferStatusHelpers.isSuccess(status)) return '✅';
    if (transferStatusHelpers.isFailed(status)) return '❌';
    if (transferStatusHelpers.isInProgress(status)) return '⏳';
    return '📋';
  },
};

// Transaction category to status mapping (from original Hyperlane implementation)
export const txCategoryToStatuses = {
  approval: [TransferStatus.SigningApproval, TransferStatus.ConfirmingApproval],
  transfer: [TransferStatus.SigningTransfer, TransferStatus.ConfirmingTransfer],
} as const;

// Map a raw error to a translatable bridge failure for the stage it occurred in. Raw errors are
// logged by the caller; users only ever see the dictionary text `describeBridgeFailure` renders
// for the returned code, in their own language.
export function humanizeBridgeError(error: unknown, stage: TransferStatus): BridgeFailure {
  const details = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|rejected the request/i.test(details)) {
    return { code: 'userRejected' };
  }
  if (details.includes('ChainMismatchError')) {
    return { code: 'chainMismatch' };
  }
  if (details.includes('block height exceeded') || details.includes('timeout')) {
    return { code: 'timeout' };
  }
  // The wallet could not REACH the chain at all (dead/wrong RPC host, offline, DNS failure) —
  // distinct from the chain replying with an error. Without this the failure fell through to
  // "Failed to sign transfer transaction", which points the user at their signature when the
  // real fault is their network config. Seen 2026-09-08: a holder whose wallet RPC still pointed
  // at the retired testnetrpc host was told his signing had failed.
  if (/HttpRequestError|Failed to fetch|fetch failed|NetworkError|ERR_NAME_NOT_RESOLVED|ENOTFOUND|ECONNREFUSED/i.test(details)) {
    return { code: 'networkUnreachable' };
  }
  return { code: 'stage', stage };
}

/**
 * Render a stored `BridgeFailure` in the reader's language. A plain `string` (a record stored
 * before this field carried a translation key) falls back to the generic stage message — see the
 * `failure` field doc on `TransferContext` for why raw English is never shown instead.
 */
export function describeBridgeFailure(failure: BridgeFailure | string | undefined, dict: Dictionary): string {
  const stages = dict.errors.bridgeStages;
  if (!failure || typeof failure === 'string') return stages.fallback;
  if (failure.code === 'stage') {
    const key = failure.stage as keyof typeof stages;
    return key in stages ? stages[key] : stages.fallback;
  }
  return interpolate(dict.errors[failure.code], failure.params ?? {});
}
