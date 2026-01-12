import { GraphQLClient } from 'graphql-request';
import { KALYSWAP_CONFIG } from '@/config/dex/kalyswap';
import { PANCAKESWAP_CONFIG } from '@/config/dex/pancakeswap';
import { UNISWAP_V2_CONFIG } from '@/config/dex/uniswap-v2';

// Chain-specific subgraph configurations
const CHAIN_SUBGRAPH_CONFIGS = {
  3888: KALYSWAP_CONFIG.subgraphUrl,     // KalyChain
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

  console.log('🔗 Creating subgraph client:', {
    chainId,
    subgraphUrl,
    isMultichain: !!chainId && chainId !== 3888
  });

  return new GraphQLClient(subgraphUrl, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// Default client for backward compatibility (KalyChain)
export const subgraphClient = getSubgraphClient(3888);

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
      console.warn(`Subgraph request attempt ${attempt + 1} failed:`, error);

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
    console.error('Error fetching factory data:', error);
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
    console.error('Error fetching pairs data:', error);
    return [];
  }
}

export async function getPairData(pairId: string, chainId?: number) {
  try {
    const client = chainId ? getSubgraphClient(chainId) : subgraphClient;
    const result = await client.request(PAIR_QUERY, { id: pairId }) as any;
    return result.pair;
  } catch (error) {
    console.error('Error fetching pair data:', error);
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
    console.error('Error fetching pair day data:', error);
    return [];
  }
}

export async function getPairHourData(pairAddress: string, first = 168, skip = 0, chainId?: number) { // 168 hours = 7 days
  try {
    const client = chainId ? getSubgraphClient(chainId) : subgraphClient;

    console.log('🔍 getPairHourData request:', {
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

    console.log('✅ getPairHourData response:', {
      pairAddress,
      chainId,
      dataLength: result.pairHourDatas?.length || 0
    });

    return result.pairHourDatas;
  } catch (error) {
    console.error('❌ Error fetching pair hour data:', {
      pairAddress,
      chainId,
      error: error instanceof Error ? error.message : error
    });

    // For external chains, suggest using CoinGecko instead
    if (chainId && (chainId === 56 || chainId === 42161)) {
      console.log('💡 Suggestion: Use CoinGecko API for external chains instead of subgraph');
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
    console.error('Error fetching Kalyswap day data:', error);
    return [];
  }
}

export async function getTokenData(tokenId: string) {
  try {
    const result = await subgraphClient.request(TOKEN_QUERY, { id: tokenId }) as any;
    return result.token;
  } catch (error) {
    console.error('Error fetching token data:', error);
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
    console.error('Error fetching pair swaps:', error);
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
    console.error('Error fetching recent swaps:', error);
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
    console.error('Error fetching pair market stats:', error);
    return null;
  }
}
