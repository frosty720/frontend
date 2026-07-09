'use client';

import { CHAIN_IDS } from '@/config/chains';
import { priceLogger as logger } from '@/lib/logger';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPairMarketStats, getPairsData, getV3PoolForPair, getV3PoolStats } from '@/lib/subgraph-client';
import { getV3Config } from '@/config/dex/v3-config';
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

// Helper: Convert native KLC to WKLC address
function getTokenAddress(token: Token): string {
  if (token.isNative || token.address === '0x0000000000000000000000000000000000000000') {
    return WKLC_ADDRESS;
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

// Helper: Find pair address dynamically
async function findPairAddress(tokenA: Token, tokenB: Token): Promise<string | null> {
  const addressA = getTokenAddress(tokenA).toLowerCase();
  const addressB = getTokenAddress(tokenB).toLowerCase();

  logger.debug(`🔍 Looking for pair: ${tokenA.symbol}/${tokenB.symbol}`);

  try {
    const pairs = await getPairsData(100, 'txCount', 'desc');
    const matchingPair = pairs.find((pair: any) => {
      const token0Addr = pair.token0.id.toLowerCase();
      const token1Addr = pair.token1.id.toLowerCase();
      return (token0Addr === addressA && token1Addr === addressB) ||
             (token0Addr === addressB && token1Addr === addressA);
    });

    if (matchingPair) {
      logger.debug(`✅ Found pair at ${matchingPair.id}`);
      return matchingPair.id;
    }
    return null;
  } catch (error) {
    logger.error('Error finding pair:', error);
    return null;
  }
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
export function usePairMarketStats(tokenA?: Token, tokenB?: Token, protocolVersion: 'v2' | 'v3' = 'v2'): PairMarketStats {
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
    queryKey: ['pairMarketStats', protocolVersion, normalizedTokenA?.address, normalizedTokenB?.address, chainId],
    queryFn: async (): Promise<PairStatsData> => {
      if (!normalizedTokenA || !normalizedTokenB) {
        return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
      }

      logger.debug(`📊 Fetching pair stats for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol} on chain ${chainId} (${protocolVersion})`);

      // For BSC and Arbitrum, use GeckoTerminal API
      if (chainId === 56 || chainId === 42161) {
        return fetchGeckoTerminalStats(chainId, normalizedTokenA, normalizedTokenB);
      }

      // For KalyChain, use the protocol's subgraph
      if (protocolVersion === 'v3') {
        return fetchKalyChainV3Stats(chainId, normalizedTokenA, normalizedTokenB);
      }
      return fetchKalyChainStats(normalizedTokenA, normalizedTokenB);
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

// Fetch market stats from KalyChain subgraph
async function fetchKalyChainStats(
  normalizedTokenA: Token,
  normalizedTokenB: Token
): Promise<PairStatsData> {
  const foundPairAddress = await findPairAddress(normalizedTokenA, normalizedTokenB);

  if (!foundPairAddress) {
    logger.debug(`⚠️ No pair found for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol}`);
    return { price: 0, volume24h: 0, liquidity: 0, pairAddress: null };
  }

  const stats = await getPairMarketStats(foundPairAddress, CHAIN_IDS.KALYCHAIN);
  if (!stats) {
    throw new Error('Failed to fetch pair stats');
  }

  // Parse reserves for use in calculations
  const reserve0 = parseFloat(stats.pair.reserve0);
  const reserve1 = parseFloat(stats.pair.reserve1);

  // Calculate price from reserves using centralized utility
  const token0Address = getTokenAddress(normalizedTokenA);
  const price = calculatePriceFromReservesRaw(token0Address, {
    token0: stats.pair.token0,
    token1: stats.pair.token1,
    reserve0: stats.pair.reserve0,
    reserve1: stats.pair.reserve1,
  });

  // Get real 24hr volume from backend
  let volume24h = 0;
  try {
    const klcPriceUSD = 0.0003; // Default fallback
    const volumeData = await fetchGraphQL<any>(
      'https://app.kalyswap.io/api/graphql',
      `query GetPairVolume($pairs: [PairInput!]!, $klcPriceUSD: Float!) {
        multiplePairs24hrVolume(pairs: $pairs, klcPriceUSD: $klcPriceUSD) {
          volume24hrUSD
        }
      }`,
      {
        pairs: [{
          address: foundPairAddress.toLowerCase(),
          token0Symbol: stats.pair.token0.symbol,
          token1Symbol: stats.pair.token1.symbol
        }],
        klcPriceUSD
      },
      { timeout: 8000, retries: 1 }
    );
    volume24h = parseFloat(volumeData?.multiplePairs24hrVolume?.[0]?.volume24hrUSD) || 0;
  } catch (volumeError) {
    if (isNetworkError(volumeError)) {
      logger.warn('Network error fetching volume, using fallback');
    }
    volume24h = stats.volume24h || 0;
  }

  // Calculate liquidity using ADDRESS matching (not symbol)
  let liquidity = 0;
  const token0Addr = stats.pair.token0?.id?.toLowerCase() || '';
  const token1Addr = stats.pair.token1?.id?.toLowerCase() || '';

  if (isStablecoinAddress(token0Addr)) {
    liquidity = reserve0 * 2;
  } else if (isStablecoinAddress(token1Addr)) {
    liquidity = reserve1 * 2;
  } else {
    liquidity = parseFloat(stats.pair.reserveUSD || '0');
  }

  logger.debug(`✅ KalyChain stats: price=${price.toFixed(8)}, volume=$${volume24h.toFixed(2)}`);

  return { price, volume24h, liquidity, pairAddress: foundPairAddress };
}
