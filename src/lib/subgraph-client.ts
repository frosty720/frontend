import { CHAIN_IDS } from '@/config/chains';
import { GraphQLClient } from 'graphql-request';
import { subgraphLogger as logger } from '@/lib/logger';
import { KALYSWAP_CONFIG } from '@/config/dex/kalyswap';
import { PANCAKESWAP_CONFIG } from '@/config/dex/pancakeswap';
import { UNISWAP_V2_CONFIG } from '@/config/dex/uniswap-v2';

// Chain-specific subgraph configurations
const CHAIN_SUBGRAPH_CONFIGS = {
  [CHAIN_IDS.KALYCHAIN]: KALYSWAP_CONFIG.subgraphUrl,     // KalyChain
  56: PANCAKESWAP_CONFIG.subgraphUrl,    // BSC
  42161: UNISWAP_V2_CONFIG.subgraphUrl,  // Arbitrum
} as const;

// Default subgraph URL for backward compatibility
const DEFAULT_SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || 'http://localhost:8000/subgraphs/name/kalyswap/dex-subgraph';

// Create chain-specific subgraph client
export function getSubgraphClient(chainId?: number): GraphQLClient {
  const subgraphUrl = chainId && CHAIN_SUBGRAPH_CONFIGS[chainId as keyof typeof CHAIN_SUBGRAPH_CONFIGS]
    ? CHAIN_SUBGRAPH_CONFIGS[chainId as keyof typeof CHAIN_SUBGRAPH_CONFIGS]
    : DEFAULT_SUBGRAPH_URL;

  logger.debug('🔗 Creating subgraph client:', {
    chainId,
    subgraphUrl,
    isMultichain: !!chainId && chainId !== CHAIN_IDS.KALYCHAIN
  });

  return new GraphQLClient(subgraphUrl, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// Default client for backward compatibility (KalyChain)
export const subgraphClient = getSubgraphClient(CHAIN_IDS.KALYCHAIN);

// Enhanced request wrapper with retry logic - now supports custom client
async function requestWithRetry<T>(
  query: string,
  variables?: any,
  retries = 2,
  client?: GraphQLClient
): Promise<T> {
  const graphqlClient = client || subgraphClient;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await graphqlClient.request<T>(query, variables);
      return result;
    } catch (error) {
      logger.warn(`Subgraph request attempt ${attempt + 1} failed:`, error);

      if (attempt === retries) {
        // Last attempt failed, throw the error
        throw error;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error('All retry attempts failed');
}

// Factory query with correct uppercase address
export const FACTORY_QUERY = `
  query GetFactory {
    kalyswapFactory(id: "0xD42Af909d323D88e0E933B6c50D3e91c279004ca") {
      id
      pairCount
      totalVolumeUSD
      totalLiquidityUSD
      totalVolumeKLC
      totalLiquidityKLC
      txCount
    }
  }
`;

// Pairs query for market data
export const PAIRS_QUERY = `
  query GetPairs($first: Int!, $orderBy: String!, $orderDirection: String!) {
    pairs(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      token0 { 
        id 
        symbol 
        name
        decimals 
      }
      token1 { 
        id 
        symbol 
        name
        decimals 
      }
      reserve0
      reserve1
      totalSupply
      reserveUSD
      token0Price
      token1Price
      volumeUSD
      txCount
      createdAtTimestamp
      createdAtBlockNumber
    }
  }
`;

// Specific pair query
export const PAIR_QUERY = `
  query GetPair($id: ID!) {
    pair(id: $id) {
      id
      token0 { 
        id 
        symbol 
        name
        decimals 
      }
      token1 { 
        id 
        symbol 
        name
        decimals 
      }
      reserve0
      reserve1
      totalSupply
      reserveUSD
      token0Price
      token1Price
      volumeUSD
      txCount
      createdAtTimestamp
      createdAtBlockNumber
    }
  }
`;

// Pair day data query for charts
export const PAIR_DAY_DATA_QUERY = `
  query GetPairDayData($pairAddress: Bytes!, $first: Int!, $skip: Int!) {
    pairDayDatas(
      where: { pairAddress: $pairAddress }
      first: $first
      skip: $skip
      orderBy: date
      orderDirection: desc
    ) {
      id
      date
      pairAddress
      dailyVolumeUSD
      dailyVolumeToken0
      dailyVolumeToken1
      dailyTxns
      reserve0
      reserve1
      reserveUSD
      totalSupply
    }
  }
`;

// Pair hour data query for more granular charts
export const PAIR_HOUR_DATA_QUERY = `
  query GetPairHourData($pairAddress: Bytes!, $first: Int!, $skip: Int!) {
    pairHourDatas(
      where: { pair: $pairAddress }
      first: $first
      skip: $skip
      orderBy: hourStartUnix
      orderDirection: desc
    ) {
      id
      hourStartUnix
      pair {
        id
      }
      hourlyVolumeUSD
      hourlyVolumeToken0
      hourlyVolumeToken1
      hourlyTxns
      reserve0
      reserve1
      reserveUSD
    }
  }
`;

// Kalyswap day data query
export const KALYSWAP_DAY_DATA_QUERY = `
  query GetKalyswapDayData($first: Int!, $skip: Int!) {
    kalyswapDayDatas(first: $first, skip: $skip, orderBy: date, orderDirection: desc) {
      id
      date
      dailyVolumeUSD
      dailyVolumeKLC
      totalVolumeUSD
      totalVolumeKLC
      totalLiquidityUSD
      totalLiquidityKLC
      txCount
    }
  }
`;

// Token query
export const TOKEN_QUERY = `
  query GetToken($id: ID!) {
    token(id: $id) {
      id
      symbol
      name
      decimals
      totalSupply
      tradeVolume
      tradeVolumeUSD
      txCount
      totalLiquidity
      derivedKLC
    }
  }
`;

// Swaps query for pair-specific transaction history
export const PAIR_SWAPS_QUERY = `
  query GetPairSwaps($pairAddress: Bytes!, $first: Int!, $skip: Int!) {
    swaps(
      where: { pair: $pairAddress }
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      timestamp
      transaction {
        id
        blockNumber
      }
      pair {
        id
        token0 {
          id
          symbol
          decimals
        }
        token1 {
          id
          symbol
          decimals
        }
      }
      sender
      from
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      amountUSD
    }
  }
`;

// Recent swaps query (all pairs)
export const RECENT_SWAPS_QUERY = `
  query GetRecentSwaps($first: Int!, $skip: Int!) {
    swaps(
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      timestamp
      transaction {
        id
        blockNumber
      }
      pair {
        id
        token0 {
          id
          symbol
          decimals
        }
        token1 {
          id
          symbol
          decimals
        }
      }
      sender
      from
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      amountUSD
    }
  }
`;

// Helper functions for direct subgraph calls
export async function getFactoryData() {
  try {
    const result = await requestWithRetry<any>(FACTORY_QUERY);
    return result.kalyswapFactory;
  } catch (error) {
    logger.error('Error fetching factory data:', error);
    return null;
  }
}

export async function getPairsData(first = 10000, orderBy = 'reserveUSD', orderDirection = 'desc') {
  try {
    const result = await requestWithRetry<any>(PAIRS_QUERY, {
      first,
      orderBy,
      orderDirection
    });
    return result.pairs;
  } catch (error) {
    logger.error('Error fetching pairs data:', error);
    return [];
  }
}

export async function getPairData(pairId: string, chainId?: number) {
  try {
    const client = chainId ? getSubgraphClient(chainId) : subgraphClient;
    const result = await client.request(PAIR_QUERY, { id: pairId }) as any;
    return result.pair;
  } catch (error) {
    logger.error('Error fetching pair data:', error);
    return null;
  }
}

export async function getPairDayData(pairAddress: string, first = 30, skip = 0, chainId?: number) {
  try {
    const client = chainId ? getSubgraphClient(chainId) : subgraphClient;
    const result = await client.request(PAIR_DAY_DATA_QUERY, {
      pairAddress,
      first,
      skip
    }) as any;
    return result.pairDayDatas;
  } catch (error) {
    logger.error('Error fetching pair day data:', error);
    return [];
  }
}

export async function getPairHourData(pairAddress: string, first = 168, skip = 0, chainId?: number) { // 168 hours = 7 days
  try {
    const client = chainId ? getSubgraphClient(chainId) : subgraphClient;

    logger.debug('🔍 getPairHourData request:', {
      pairAddress,
      chainId,
      subgraphUrl: chainId && CHAIN_SUBGRAPH_CONFIGS[chainId as keyof typeof CHAIN_SUBGRAPH_CONFIGS]
        ? CHAIN_SUBGRAPH_CONFIGS[chainId as keyof typeof CHAIN_SUBGRAPH_CONFIGS]
        : DEFAULT_SUBGRAPH_URL,
      first,
      skip
    });

    const result = await client.request(PAIR_HOUR_DATA_QUERY, {
      pairAddress,
      first,
      skip
    }) as any;

    logger.debug('✅ getPairHourData response:', {
      pairAddress,
      chainId,
      dataLength: result.pairHourDatas?.length || 0
    });

    return result.pairHourDatas;
  } catch (error) {
    logger.error('❌ Error fetching pair hour data:', {
      pairAddress,
      chainId,
      error: error instanceof Error ? error.message : error
    });

    // For external chains, suggest using CoinGecko instead
    if (chainId && (chainId === 56 || chainId === 42161)) {
      logger.debug('💡 Suggestion: Use CoinGecko API for external chains instead of subgraph');
    }

    return [];
  }
}

export async function getKalyswapDayData(first = 7, skip = 0) {
  try {
    const result = await subgraphClient.request(KALYSWAP_DAY_DATA_QUERY, {
      first,
      skip
    }) as any;
    return result.kalyswapDayDatas;
  } catch (error) {
    logger.error('Error fetching Kalyswap day data:', error);
    return [];
  }
}

export async function getTokenData(tokenId: string) {
  try {
    const result = await subgraphClient.request(TOKEN_QUERY, { id: tokenId }) as any;
    return result.token;
  } catch (error) {
    logger.error('Error fetching token data:', error);
    return null;
  }
}

export async function getPairSwaps(pairAddress: string, first = 20, skip = 0) {
  try {
    const result = await requestWithRetry<any>(PAIR_SWAPS_QUERY, {
      pairAddress: pairAddress.toLowerCase(),
      first,
      skip
    });
    return result.swaps;
  } catch (error) {
    logger.error('Error fetching pair swaps:', error);
    return [];
  }
}

export async function getRecentSwaps(first = 20, skip = 0) {
  try {
    const result = await requestWithRetry<any>(RECENT_SWAPS_QUERY, {
      first,
      skip
    });
    return result.swaps;
  } catch (error) {
    logger.error('Error fetching recent swaps:', error);
    return [];
  }
}

// Get pair-specific market stats
export async function getPairMarketStats(pairAddress: string, chainId?: number) {
  try {
    const [pairData, pairDayData] = await Promise.all([
      getPairData(pairAddress, chainId),
      getPairDayData(pairAddress, 2, 0, chainId) // Get last 2 days for 24h comparison
    ]);

    if (!pairData) {
      return null;
    }

    // Calculate 24h volume and price change
    let volume24h = 0;
    let priceChange24h = 0;

    if (pairDayData && pairDayData.length >= 2) {
      const today = pairDayData[0];
      const yesterday = pairDayData[1];

      volume24h = parseFloat(today.dailyVolumeUSD || '0');

      // Calculate price change based on reserves
      if (yesterday.reserve0 && yesterday.reserve1 && pairData.reserve0 && pairData.reserve1) {
        const yesterdayPrice = parseFloat(yesterday.reserve1) / parseFloat(yesterday.reserve0);
        const todayPrice = parseFloat(pairData.reserve1) / parseFloat(pairData.reserve0);
        priceChange24h = ((todayPrice - yesterdayPrice) / yesterdayPrice) * 100;
      }
    }

    return {
      pair: pairData,
      volume24h,
      priceChange24h,
      liquidity: parseFloat(pairData.reserveUSD || '0')
    };
  } catch (error) {
    logger.error('Error fetching pair market stats:', error);
    return null;
  }
}

// V3 Queries
export const V3_POOL_HOUR_DATA_QUERY = `
  query GetV3PoolHourData($poolAddress: String!, $first: Int!, $skip: Int!) {
    poolHourDatas(
      where: { pool: $poolAddress }
      first: $first
      skip: $skip
      orderBy: periodStartUnix
      orderDirection: desc
    ) {
      id
      periodStartUnix
      pool {
        id
      }
      volumeUSD
      volumeToken0
      volumeToken1
      txCount
      tvlUSD
      open
      high
      low
      close
    }
  }
`;

export async function getV3PoolHourData(poolAddress: string, subgraphUrl: string, first = 168, skip = 0) {
  try {
    const client = new GraphQLClient(subgraphUrl);
    const result = await client.request(V3_POOL_HOUR_DATA_QUERY, {
      poolAddress: poolAddress.toLowerCase(),
      first,
      skip
    }) as any;
    return result.poolHourDatas;
  } catch (error) {
    logger.error('Error fetching V3 pool hour data:', error);
    // Propagate so callers can distinguish "subgraph unreachable" from "pool has no data"
    throw new Error(`V3 subgraph query failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export const V3_POOL_FOR_PAIR_QUERY = `
  query GetV3PoolForPair($token0: String!, $token1: String!) {
    pools(
      where: { token0: $token0, token1: $token1 }
      orderBy: totalValueLockedUSD
      orderDirection: desc
      first: 1
    ) {
      id
      feeTier
      totalValueLockedUSD
      token0 {
        id
      }
      token1 {
        id
      }
    }
  }
`;

export interface V3PoolForPair {
  id: string;
  feeTier: string;
  totalValueLockedUSD: string;
  token0: { id: string };
  token1: { id: string };
}

export const V3_POOL_STATS_QUERY = `
  query GetV3PoolStats($poolId: ID!, $poolAddress: String!) {
    pool(id: $poolId) {
      id
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
      token0Price
      token1Price
      totalValueLockedUSD
    }
    poolHourDatas(
      where: { pool: $poolAddress }
      first: 24
      orderBy: periodStartUnix
      orderDirection: desc
    ) {
      volumeUSD
    }
  }
`;

export interface V3PoolStats {
  pool: {
    id: string;
    token0: { id: string; symbol: string };
    token1: { id: string; symbol: string };
    token0Price: string;
    token1Price: string;
    totalValueLockedUSD: string;
  };
  volume24h: number;
}

/**
 * Pool-level stats plus rolling-24h volume (sum of the last 24 hourly candles).
 * pool.token0Price is token0-per-token1; token1Price is token1-per-token0.
 */
export async function getV3PoolStats(poolAddress: string, subgraphUrl: string): Promise<V3PoolStats | null> {
  const id = poolAddress.toLowerCase();
  const client = new GraphQLClient(subgraphUrl);
  const result = await client.request(V3_POOL_STATS_QUERY, { poolId: id, poolAddress: id }) as any;

  if (!result.pool) return null;

  const volume24h = (result.poolHourDatas || []).reduce(
    (sum: number, hour: any) => sum + (parseFloat(hour.volumeUSD) || 0),
    0
  );

  return { pool: result.pool, volume24h };
}

export const V3_POOL_SWAPS_QUERY = `
  query GetV3PoolSwaps($poolAddress: String!, $first: Int!) {
    swaps(
      where: { pool: $poolAddress }
      first: $first
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      timestamp
      transaction {
        id
        blockNumber
      }
      pool {
        id
        token0 {
          id
          symbol
          decimals
        }
        token1 {
          id
          symbol
          decimals
        }
      }
      origin
      sender
      recipient
      amount0
      amount1
      amountUSD
    }
  }
`;

export async function getV3PoolSwaps(poolAddress: string, subgraphUrl: string, first = 50) {
  const client = new GraphQLClient(subgraphUrl);
  const result = await client.request(V3_POOL_SWAPS_QUERY, {
    poolAddress: poolAddress.toLowerCase(),
    first
  }) as any;
  return result.swaps || [];
}

/**
 * Find the deepest V3 pool for a token pair (any fee tier).
 * Token order is normalized to the V3 convention (token0 < token1 by address),
 * so callers can pass addresses in any order. Native tokens must already be
 * mapped to their wrapped address.
 */
export async function getV3PoolForPair(
  tokenAAddress: string,
  tokenBAddress: string,
  subgraphUrl: string
): Promise<V3PoolForPair | null> {
  const a = tokenAAddress.toLowerCase();
  const b = tokenBAddress.toLowerCase();
  const [token0, token1] = a < b ? [a, b] : [b, a];

  const client = new GraphQLClient(subgraphUrl);
  const result = await client.request(V3_POOL_FOR_PAIR_QUERY, { token0, token1 }) as any;
  return result.pools?.[0] ?? null;
}
