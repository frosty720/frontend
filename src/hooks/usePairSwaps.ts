import { CHAIN_IDS } from '@/config/chains';
import { swapLogger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { getV3PoolSwaps } from '@/lib/subgraph-client';
import { getV3Config } from '@/config/dex/v3-config';
import { isStablecoinAddress } from '@/config/contracts';
import { getPoolTrades } from '@/lib/geckoterminal-client';
import { safeApiCall, isNetworkError } from '@/utils/networkUtils';

// Swap transaction interface
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
}

interface UsePairSwapsResult {
  swaps: FormattedSwap[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function formatV3Swap(swap: V3SubgraphSwap): FormattedSwap {
  const amount0 = parseFloat(swap.amount0);
  const amount1 = parseFloat(swap.amount1);

  // The base token is the non-stablecoin side. If both or neither are stables, fall back
  // to token0 as the base so behaviour is unchanged for those pairs.
  const token0IsStable = isStablecoinAddress(swap.pool.token0.id);
  const token1IsStable = isStablecoinAddress(swap.pool.token1.id);
  const baseIsToken0 = token0IsStable && !token1IsStable ? false : true;

  const baseAmount = baseIsToken0 ? amount0 : amount1;
  // base entered the pool => the user sold the base token
  const type: 'BUY' | 'SELL' = baseAmount > 0 ? 'SELL' : 'BUY';

  // Display signs still follow the raw pool amounts, independent of the label.
  const isSellToken0 = amount0 > 0;
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

      // KalyChain-family chains read the V3 subgraph (pool-scoped only). The V2
      // branch was deleted with the V2 subgraph on 2026-08-26.
      const v3Config = getV3Config(chainId);
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

      // No V3 deployment on this chain and not a GeckoTerminal chain: nothing to show.
      swapLogger.debug('No swap source for this chain', { chainId, pairAddress });
      setSwaps([]);

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
  }, [pairAddress, limit, userAddress, chainId]);

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
