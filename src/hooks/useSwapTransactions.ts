'use client';

import { swapLogger } from '@/lib/logger';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { KALYCHAIN_EXPLORER_URL } from '@/config/chains';

export interface SwapTransaction {
  id: string;
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  type: 'SWAP';
  fromToken: {
    symbol: string;
    address: string;
    decimals: number;
    logoURI?: string;
  };
  toToken: {
    symbol: string;
    address: string;
    decimals: number;
    logoURI?: string;
  };
  fromAmount: string;
  toAmount: string;
  fromAmountFormatted: string;
  toAmountFormatted: string;
  slippage: string;
  priceImpact?: string;
  gasUsed?: string;
  gasFee?: string;
  timestamp: Date;
  blockNumber?: number;
  userAddress: string;
  walletId?: string;
  explorerUrl: string;
}

interface UseSwapTransactionsOptions {
  userAddress?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useSwapTransactions(options: UseSwapTransactionsOptions = {}) {
  const { userAddress, autoRefresh = true, refreshInterval = 10000 } = options;
  const { address } = useAccount();
  const publicClient = usePublicClient();
  
  const [transactions, setTransactions] = useState<SwapTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentUserAddress = userAddress || address;

  /**
   * Add a new transaction to the local state
   */
  const addTransaction = useCallback((transaction: Omit<SwapTransaction, 'id' | 'timestamp' | 'explorerUrl'>) => {
    const newTransaction: SwapTransaction = {
      ...transaction,
      id: `${transaction.hash}-${Date.now()}`,
      timestamp: new Date(),
      explorerUrl: `${KALYCHAIN_EXPLORER_URL}/tx/${transaction.hash}`
    };

    setTransactions(prev => [newTransaction, ...prev]);

    return newTransaction;
  }, []);

  /**
   * Update transaction status
   */
  const updateTransactionStatus = useCallback((hash: string, status: SwapTransaction['status'], blockNumber?: number) => {
    setTransactions(prev =>
      prev.map(tx =>
        tx.hash === hash
          ? { ...tx, status, blockNumber }
          : tx
      )
    );
  }, []);







  /**
   * Monitor pending transactions for status updates
   */
  const monitorPendingTransactions = useCallback(async () => {
    if (!publicClient) return;

    const pendingTxs = transactions.filter(tx => tx.status === 'pending');
    
    for (const tx of pendingTxs) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash as `0x${string}` });
        if (receipt) {
          const status = receipt.status === 'success' ? 'confirmed' : 'failed';
          updateTransactionStatus(tx.hash, status, Number(receipt.blockNumber));
        }
      } catch (error) {
        // Transaction might still be pending
        swapLogger.debug(`Transaction ${tx.hash} still pending`);
      }
    }
  }, [transactions, publicClient, updateTransactionStatus]);

  /**
   * Get filtered transactions
   */
  const getFilteredTransactions = useCallback((filter: 'all' | 'pending' | 'confirmed' | 'failed' = 'all') => {
    if (filter === 'all') return transactions;
    return transactions.filter(tx => tx.status === filter);
  }, [transactions]);

  /**
   * Get recent transactions (last 24 hours)
   */
  const getRecentTransactions = useCallback(() => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return transactions.filter(tx => tx.timestamp > oneDayAgo);
  }, [transactions]);

  // Auto-refresh setup for monitoring pending transactions
  useEffect(() => {
    if (!autoRefresh) return;

    refreshIntervalRef.current = setInterval(() => {
      monitorPendingTransactions();
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, monitorPendingTransactions]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  return {
    transactions,
    loading,
    error,
    addTransaction,
    updateTransactionStatus,
    getFilteredTransactions,
    getRecentTransactions,
    pendingCount: transactions.filter(tx => tx.status === 'pending').length,
    confirmedCount: transactions.filter(tx => tx.status === 'confirmed').length,
    failedCount: transactions.filter(tx => tx.status === 'failed').length
  };
}
