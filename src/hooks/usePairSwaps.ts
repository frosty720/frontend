import { CHAIN_IDS } from '@/config/chains';
import { swapLogger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { getPairSwaps, getRecentSwaps, getV3PoolSwaps } from '@/lib/subgraph-client';
import { getV3Config } from '@/config/dex/v3-config';
import { getPoolTrades } from '@/lib/geckoterminal-client';
import { safeApiCall, isNetworkError } from '@/utils/networkUtils';

// Swap transaction interface
export interface SubgraphSwap {
  id: string;
  timestamp: string;
  transaction: {
    id: string;
    blockNumber: string;
  };
  pair: {
    id: string;
    token0: {
      id: string;
      symbol: string;
      decimals: string;
    };
    token1: {
      id: string;
      symbol: string;
      decimals: string;
    };
  };
  sender: string;
  from: string;
  to: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  amountUSD: string;
}

// V3 subgraph swap entity (signed amounts: positive = into the pool)
export interface V3SubgraphSwap {
  id: string;
  timestamp: string;
  transaction: {
    id: string;
    blockNumber: string;
  };
  pool: {
    id: string;
    token0: {
      id: string;
      symbol: string;
      decimals: string;
    };
    token1: {
      id: string;
      symbol: string;
      decimals: string;
    };
  };
  origin: string;
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  amountUSD: string;
}

// Formatted swap for UI display
export interface FormattedSwap {
  id: string;
  hash: string;
  timestamp: Date;
  blockNumber: number;
  pairAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Amount: string;
  token1Amount: string;
  amountUSD: number;
  sender: string;
  from: string;
  to: string;
  type: 'BUY' | 'SELL';
}

interface UsePairSwapsProps {
  pairAddress?: string | null;
  limit?: number;
  userAddress?: string | null;
  chainId?: number; // Chain ID to determine data source
  protocolVersion?: 'v2' | 'v3'; // Which subgraph to read on KalyChain
}

interface UsePairSwapsResult {
  swaps: FormattedSwap[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Helper function to determine swap type and format amounts
function formatSwap(swap: SubgraphSwap, userAddress?: string | null): FormattedSwap {
  const amount0In = parseFloat(swap.amount0In);
  const amount1In = parseFloat(swap.amount1In);
  const amount0Out = parseFloat(swap.amount0Out);
  const amount1Out = parseFloat(swap.amount1Out);

  // Determine swap direction based on which amounts are non-zero
  let type: 'BUY' | 'SELL' = 'BUY';
  let token0Amount = '';
  let token1Amount = '';

  if (amount0In > 0 && amount1Out > 0) {
    // Selling token0 for token1
    type = 'SELL';
    token0Amount = `-${amount0In.toFixed(6)}`;
    token1Amount = `+${amount1Out.toFixed(6)}`;
  } else if (amount1In > 0 && amount0Out > 0) {
    // Selling token1 for token0 (buying token0)
    type = 'BUY';
    token0Amount = `+${amount0Out.toFixed(6)}`;
    token1Amount = `-${amount1In.toFixed(6)}`;
  }

  return {
    id: swap.id,
    hash: swap.transaction.id,
    timestamp: new Date(parseInt(swap.timestamp) * 1000),
    blockNumber: parseInt(swap.transaction.blockNumber),
    pairAddress: swap.pair.id,
    token0Symbol: swap.pair.token0.symbol,
    token1Symbol: swap.pair.token1.symbol,
    token0Amount,
    token1Amount,
    amountUSD: parseFloat(swap.amountUSD),
    sender: swap.sender,
    from: swap.from,
    to: swap.to,
    type
  };
}

// Format a V3 swap: amount0 > 0 means token0 entered the pool (user sold token0)
export function formatV3Swap(swap: V3SubgraphSwap): FormattedSwap {
  const amount0 = parseFloat(swap.amount0);
  const amount1 = parseFloat(swap.amount1);

  const isSellToken0 = amount0 > 0;
  const type: 'BUY' | 'SELL' = isSellToken0 ? 'SELL' : 'BUY';
  const token0Amount = isSellToken0
    ? `-${Math.abs(amount0).toFixed(6)}`
    : `+${Math.abs(amount0).toFixed(6)}`;
  const token1Amount = isSellToken0
    ? `+${Math.abs(amount1).toFixed(6)}`
    : `-${Math.abs(amount1).toFixed(6)}`;

  return {
    id: swap.id,
    hash: swap.transaction.id,
    timestamp: new Date(parseInt(swap.timestamp) * 1000),
    blockNumber: parseInt(swap.transaction.blockNumber),
    pairAddress: swap.pool.id,
    token0Symbol: swap.pool.token0.symbol,
    token1Symbol: swap.pool.token1.symbol,
    token0Amount,
    token1Amount,
    amountUSD: parseFloat(swap.amountUSD),
    sender: swap.sender,
    // origin is the user wallet; sender/recipient are usually the router
    from: swap.origin,
    to: swap.recipient,
    type
  };
}

// Helper function to format GeckoTerminal trades
function formatGeckoTerminalTrade(trade: any, pairAddress: string): FormattedSwap {
  const attrs = trade.attributes;

  // Determine trade type based on kind
  const type = attrs.kind === 'buy' ? 'BUY' : 'SELL';

  // Get token symbols from the trade
  const fromToken = attrs.from_token_amount ?
    { symbol: 'Token', amount: attrs.from_token_amount } :
    { symbol: 'Token', amount: '0' };
  const toToken = attrs.to_token_amount ?
    { symbol: 'Token', amount: attrs.to_token_amount } :
    { symbol: 'Token', amount: '0' };

  return {
    id: trade.id || `gecko-${attrs.block_number}-${attrs.tx_hash}`,
    hash: attrs.tx_hash || '',
    timestamp: new Date(attrs.block_timestamp),
    blockNumber: attrs.block_number || 0,
    pairAddress: pairAddress,
    token0Symbol: fromToken.symbol,
    token1Symbol: toToken.symbol,
    token0Amount: parseFloat(fromToken.amount).toFixed(6),
    token1Amount: parseFloat(toToken.amount).toFixed(6),
    amountUSD: parseFloat(attrs.volume_in_usd || '0'),
    sender: attrs.tx_from_address || '',
    from: attrs.tx_from_address || '',
    to: attrs.tx_to_address || '',
    type
  };
}

export function usePairSwaps({
  pairAddress,
  limit = 20,
  userAddress,
  chainId = CHAIN_IDS.KALYCHAIN,
  protocolVersion = 'v2'
}: UsePairSwapsProps): UsePairSwapsResult {
  const [swaps, setSwaps] = useState<FormattedSwap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSwaps = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // For BSC and Arbitrum, use GeckoTerminal for recent trades only
      // User trades are not supported (will show explorer link instead)
      if ((chainId === 56 || chainId === 42161) && !userAddress) {
        swapLogger.debug('Fetching swaps from GeckoTerminal...', { chainId, pairAddress, limit });

        if (!pairAddress) {
          swapLogger.warn('⚠️ GeckoTerminal requires pairAddress for trades');
          setSwaps([]);
          setLoading(false);
          return;
        }

        // Fetch trades from GeckoTerminal
        const geckoTrades = await getPoolTrades(chainId, pairAddress, limit);

        // Format trades for UI
        const formattedSwaps = geckoTrades.map(trade =>
          formatGeckoTerminalTrade(trade, pairAddress)
        );

        swapLogger.debug(`✅ Fetched ${formattedSwaps.length} trades from GeckoTerminal`);
        setSwaps(formattedSwaps);
        setLoading(false);
        return;
      }

      // V3 mode on KalyChain reads the V3 subgraph (pool-scoped only)
      const v3Config = protocolVersion === 'v3' ? getV3Config(chainId) : null;
      if (v3Config) {
        if (!pairAddress) {
          setSwaps([]);
          setLoading(false);
          return;
        }

        swapLogger.debug('Fetching swaps from V3 subgraph...', { chainId, pairAddress, limit, userAddress });
        const rawV3Swaps: V3SubgraphSwap[] = await safeApiCall(
          () => getV3PoolSwaps(pairAddress, v3Config.subgraphUrl, limit),
          [],
          `V3 pool swaps for ${pairAddress}`
        );

        let formattedV3Swaps = rawV3Swaps.map(formatV3Swap);
        if (userAddress) {
          const userAddressLower = userAddress.toLowerCase();
          formattedV3Swaps = formattedV3Swaps.filter(swap =>
            swap.from.toLowerCase() === userAddressLower ||
            swap.to.toLowerCase() === userAddressLower
          );
        }

        setSwaps(formattedV3Swaps);
        setLoading(false);
        return;
      }

      // For KalyChain or when userAddress is provided, use subgraph
      swapLogger.debug('Fetching swaps from subgraph...', { chainId, pairAddress, limit, userAddress });

      let rawSwaps: SubgraphSwap[] = [];

      if (pairAddress) {
        // Fetch swaps for specific pair with safe API call
        rawSwaps = await safeApiCall(
          () => getPairSwaps(pairAddress, limit),
          [],
          `Pair swaps for ${pairAddress}`
        );
        swapLogger.debug(`✅ Fetched ${rawSwaps.length} swaps for pair ${pairAddress}`);
      } else {
        // Fetch recent swaps across all pairs with safe API call
        rawSwaps = await safeApiCall(
          () => getRecentSwaps(limit),
          [],
          'Recent swaps'
        );
        swapLogger.debug(`✅ Fetched ${rawSwaps.length} recent swaps`);
      }

      // Format swaps for UI
      let formattedSwaps = rawSwaps.map(swap => formatSwap(swap, userAddress));

      // Filter by user address if provided
      if (userAddress) {
        const userAddressLower = userAddress.toLowerCase();
        formattedSwaps = formattedSwaps.filter(swap =>
          swap.from.toLowerCase() === userAddressLower ||
          swap.to.toLowerCase() === userAddressLower
        );
        swapLogger.debug(`Filtered to ${formattedSwaps.length} swaps for user ${userAddress}`);
      }

      setSwaps(formattedSwaps);

    } catch (err) {
      swapLogger.error('Error fetching swaps:', err);

      // Handle network errors gracefully
      if (isNetworkError(err)) {
        setError('Network connection issue. Please check your connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch swaps');
      }

      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [pairAddress, limit, userAddress, chainId, protocolVersion]);

  // Fetch swaps when dependencies change
  useEffect(() => {
    fetchSwaps();
  }, [fetchSwaps]);

  return {
    swaps,
    loading,
    error,
    refetch: fetchSwaps
  };
}
