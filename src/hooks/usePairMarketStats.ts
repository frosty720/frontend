'use client';

import { CHAIN_IDS } from '@/config/chains';
import { priceLogger as logger } from '@/lib/logger';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getV3PoolForPair, getV3PoolStats } from '@/lib/subgraph-client';
import { getV3Config } from '@/config/dex/v3-config';
import { getDexConfig } from '@/config/dex';
import { usePriceDataContext } from '@/contexts/PriceDataContext';
import { fetchGraphQL, isNetworkError } from '@/utils/networkUtils';
import { Token } from '@/config/dex/types';
import { calculatePriceFromReservesRaw } from '@/utils/price';
import { MAINNET_CONTRACTS, isStablecoinAddress } from '@/config/contracts';

export interface PairMarketStats {
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  pairAddress: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// WKLC address for native KLC conversion
const WKLC_ADDRESS = MAINNET_CONTRACTS.WKLC;

/**
 * The wrapped-native address for a given chain. Subgraphs only ever know the WRAPPED
 * token, so a native selection has to be mapped before any pool lookup.
 *
 * This used to return MAINNET_CONTRACTS.WKLC unconditionally, which meant that on any
 * other chain the pool lookup searched for a 3888 address in that chain's subgraph, found
 * nothing, and silently returned zeros — the symptom being Price/Volume/Liquidity all
 * showing as "—".
 */
function wrappedNativeFor(chainId?: number): string {
  const v3 = chainId ? getV3Config(chainId) : null;
  if (v3?.wethAddress) return v3.wethAddress;
  const dex = chainId ? getDexConfig(chainId) : null;
  if (dex?.wethAddress) return dex.wethAddress;
  return WKLC_ADDRESS;
}

// Helper: Convert native KLC to WKLC address
function getTokenAddress(token: Token): string {
  if (token.isNative || token.address === '0x0000000000000000000000000000000000000000') {
    return wrappedNativeFor(token.chainId);
  }
  return token.address;
}

// Helper: Normalize token order for consistent pair lookup
// IMPORTANT: Uses ADDRESS matching, not symbol matching
function normalizeTokenPair(tokenA?: Token, tokenB?: Token): [Token | undefined, Token | undefined] {
  if (!tokenA || !tokenB) return [tokenA, tokenB];

  // Check stablecoin status by ADDRESS (not symbol)
  const tokenAAddr = getTokenAddress(tokenA).toLowerCase();
  const tokenBAddr = getTokenAddress(tokenB).toLowerCase();
  const isTokenAStable = isStablecoinAddress(tokenAAddr);
  const isTokenBStable = isStablecoinAddress(tokenBAddr);

  // Stablecoin should always be the quote (second token)
  if (isTokenAStable && !isTokenBStable) {
    return [tokenB, tokenA];
  }
  if (isTokenBStable && !isTokenAStable) {
    return [tokenA, tokenB];
  }

  // Sort by address for consistency
  return tokenAAddr < tokenBAddr ? [tokenA, tokenB] : [tokenB, tokenA];
}

interface PairStatsData {
  price: number;
  volume24h: number;
  liquidity: number;
  pairAddress: string | null;
}

/**
 * Hook to get market stats for a specific trading pair.
 * Uses TanStack Query for caching and automatic refetching.
 * Industry standard: Always shows the same price/stats regardless of token order.
 */
export function usePairMarketStats(tokenA?: Token, tokenB?: Token): PairMarketStats {
  // Use shared price change from context
  const { priceChange24h } = usePriceDataContext();

  // Normalize token order
  const [normalizedTokenA, normalizedTokenB] = useMemo(
    () => normalizeTokenPair(tokenA, tokenB),
    [tokenA?.address, tokenA?.symbol, tokenB?.address, tokenB?.symbol]
  );

  const hasValidTokens = Boolean(normalizedTokenA && normalizedTokenB);
  const chainId = normalizedTokenA?.chainId || normalizedTokenB?.chainId || CHAIN_IDS.KALYCHAIN;

  // Main query for pair stats
  const statsQuery = useQuery<PairStatsData, Error>({
    queryKey: ['pairMarketStats', normalizedTokenA?.address, normalizedTokenB?.address, chainId],
    queryFn: async (): Promise<PairStatsData> => {
      if (!normalizedTokenA || !normalizedTokenB) {
        return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
      }

      logger.debug(`📊 Fetching pair stats for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol} on chain ${chainId}`);

      // For BSC and Arbitrum, use GeckoTerminal API
      if (chainId === 56 || chainId === 42161) {
        return fetchGeckoTerminalStats(chainId, normalizedTokenA, normalizedTokenB);
      }

      // KalyChain-family chains: V3 only. The V2 branch was deleted with the V2
      // subgraph on 2026-08-26.
      return fetchKalyChainV3Stats(chainId, normalizedTokenA, normalizedTokenB);
    },
    enabled: hasValidTokens,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  });

  const data = statsQuery.data ?? { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };

  return {
    price: data.price,
    priceChange24h,
    volume24h: data.volume24h,
    liquidity: data.liquidity,
    pairAddress: data.pairAddress,
    isLoading: statsQuery.isLoading,
    error: statsQuery.error?.message ?? null,
    refetch: () => { statsQuery.refetch(); },
  };
}

// Fetch market stats from GeckoTerminal for BSC and Arbitrum
async function fetchGeckoTerminalStats(
  chainId: number,
  tokenA: Token,
  tokenB: Token
): Promise<PairStatsData> {
  try {
    logger.debug(`🦎 Fetching GeckoTerminal stats for ${tokenA.symbol}/${tokenB.symbol} on chain ${chainId}`);

    const { findPoolAddress: findGeckoPool, getPoolInfo } = await import('@/lib/geckoterminal-client');
    const poolAddress = await findGeckoPool(chainId, tokenA, tokenB);

    if (!poolAddress) {
      logger.debug(`⚠️ No GeckoTerminal pool found for ${tokenA.symbol}/${tokenB.symbol}`);
      return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
    }

    const poolInfo = await getPoolInfo(chainId, poolAddress);
    if (!poolInfo?.attributes) {
      logger.warn('⚠️ No pool attributes found');
      return { price: 0, volume24h: 0, liquidity: 0, pairAddress: poolAddress };
    }

    const attrs = poolInfo.attributes;
    const price = parseFloat(attrs.base_token_price_usd || '0');
    const volume24h = parseFloat(attrs.volume_usd?.h24 || '0');
    const liquidity = parseFloat(attrs.reserve_in_usd || '0');

    logger.debug(`📊 GeckoTerminal stats: price=$${price.toFixed(2)}, volume=$${volume24h.toLocaleString()}`);

    return { price, volume24h, liquidity, pairAddress: poolAddress };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('404')) {
      logger.error('❌ Error fetching GeckoTerminal stats:', error);
    }
    return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
  }
}

// Fetch market stats from the KalyChain V3 subgraph
async function fetchKalyChainV3Stats(
  chainId: number,
  normalizedTokenA: Token,
  normalizedTokenB: Token
): Promise<PairStatsData> {
  const v3Config = getV3Config(chainId);
  if (!v3Config) {
    return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
  }

  const baseAddress = getTokenAddress(normalizedTokenA);
  const pool = await getV3PoolForPair(
    baseAddress,
    getTokenAddress(normalizedTokenB),
    v3Config.subgraphUrl
  );

  if (!pool) {
    logger.debug(`⚠️ No V3 pool found for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol}`);
    return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
  }

  const stats = await getV3PoolStats(pool.id, v3Config.subgraphUrl);
  if (!stats) {
    throw new Error('Failed to fetch V3 pool stats');
  }

  // token1Price = token1 per token0; price shown is the base token in quote terms
  const baseIsToken0 = stats.pool.token0.id.toLowerCase() === baseAddress.toLowerCase();
  const price = parseFloat(baseIsToken0 ? stats.pool.token1Price : stats.pool.token0Price) || 0;

  logger.debug(`✅ KalyChain V3 stats: price=${price}, volume=$${stats.volume24h.toFixed(2)}`);

  return {
    price,
    volume24h: stats.volume24h,
    liquidity: parseFloat(stats.pool.totalValueLockedUSD) || 0,
    pairAddress: pool.id,
  };
}

