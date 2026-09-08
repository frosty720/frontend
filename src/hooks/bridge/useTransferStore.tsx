// Transfer Store Hook - Transaction status tracking for bridge transfers
// Adapted from Hyperlane transfer store with simplified state management

'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';

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
  errorMessage?: string;
}

interface TransferState {
  transfers: TransferContext[];
}

type TransferAction =
  | { type: 'ADD_TRANSFER'; payload: TransferContext }
  | { type: 'UPDATE_TRANSFER_STATUS'; payload: { index: number; status: TransferStatus; txHash?: string; msgId?: string; errorMessage?: string } }
  | { type: 'CLEAR_TRANSFERS' };

interface TransferStoreContextType {
  transfers: TransferContext[];
  addTransfer: (transfer: TransferContext) => number;
  updateTransferStatus: (index: number, status: TransferStatus, txHash?: string, msgId?: string, errorMessage?: string) => void;
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
                ...(action.payload.errorMessage && { errorMessage: action.payload.errorMessage }),
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
    errorMessage?: string
  ) => {
    dispatch({
      type: 'UPDATE_TRANSFER_STATUS',
      payload: { index, status, txHash, msgId, errorMessage },
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
  // Get user-friendly status message
  getStatusMessage: (status: TransferStatus): string => {
    switch (status) {
      case TransferStatus.Preparing:
        return 'Preparing transfer...';
      case TransferStatus.CreatingTxs:
        return 'Creating transactions...';
      case TransferStatus.SigningApproval:
        return 'Sign approval in your wallet';
      case TransferStatus.ConfirmingApproval:
        return 'Confirming approval...';
      case TransferStatus.SigningTransfer:
        return 'Sign transfer in your wallet';
      case TransferStatus.ConfirmingTransfer:
        return 'Confirming transfer...';
      case TransferStatus.ConfirmedTransfer:
        return 'Transfer confirmed!';
      case TransferStatus.Delivered:
        return 'Transfer delivered!';
      case TransferStatus.Failed:
        return 'Transfer failed';
      default:
        return 'Unknown status';
    }
  },

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
    if (transferStatusHelpers.isSuccess(status)) return 'text-green-600';
    if (transferStatusHelpers.isFailed(status)) return 'text-red-600';
    return 'text-blue-600';
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

// Error messages for different transfer stages
export const errorMessages = {
  [TransferStatus.Preparing]: 'Failed to prepare transfer. Please check your inputs and try again.',
  [TransferStatus.CreatingTxs]: 'Failed to create transfer transactions. Please try again.',
  [TransferStatus.SigningApproval]: 'Failed to sign approval transaction. Please try again.',
  [TransferStatus.ConfirmingApproval]: 'Approval transaction failed. Please try again.',
  [TransferStatus.SigningTransfer]: 'Failed to sign transfer transaction. Please try again.',
  [TransferStatus.ConfirmingTransfer]: 'Transfer transaction failed. Please check the transaction and try again.',
} as const;

// Map a raw error to a user-facing message for the stage it occurred in.
// Raw errors are logged by the caller; users only ever see these.
export function humanizeBridgeError(error: unknown, stage: TransferStatus): string {
  const details = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|rejected the request/i.test(details)) {
    return 'Transaction rejected in wallet.';
  }
  if (details.includes('ChainMismatchError')) {
    return 'Wallet must be connected to the origin chain.';
  }
  if (details.includes('block height exceeded') || details.includes('timeout')) {
    return 'Transaction timed out, the network may be busy. Please try again.';
  }
  // The wallet could not REACH the chain at all (dead/wrong RPC host, offline, DNS failure) —
  // distinct from the chain replying with an error. Without this the failure fell through to
  // "Failed to sign transfer transaction", which points the user at their signature when the
  // real fault is their network config. Seen 2026-09-08: a holder whose wallet RPC still pointed
  // at the retired testnetrpc host was told his signing had failed.
  if (/HttpRequestError|Failed to fetch|fetch failed|NetworkError|ERR_NAME_NOT_RESOLVED|ENOTFOUND|ECONNREFUSED/i.test(details)) {
    return 'Could not reach the network. Check your wallet is connected to KalyChain (chain 3890) with a working RPC, then try again.';
  }
  return (
    errorMessages[stage as keyof typeof errorMessages] ||
    'Unable to transfer tokens. Please try again.'
  );
}
