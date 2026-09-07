import { GraphQLClient } from 'graphql-request';
import { subgraphLogger as logger } from '@/lib/logger';

/**
 * V3 subgraph access.
 *
 * The V2 half of this module (the KalySwap V2 / PancakeSwap / Uniswap-V2 client,
 * its pair + factory + day-data queries and every getPair / getFactory helper) was
 * deleted on 2026-08-26: the relaunch chain (3890) has no V2 deployment, and
 * the V2 client factory silently fell back to the OLD 3888 V2 subgraph for any chain
 * it did not recognise — so every V2 helper leaked calls to the dead chain.
 *
 * Every function below takes an explicit `subgraphUrl` (from `getV3Config(chainId)`),
 * so there is no default client to fall back to and no way to hit the wrong chain.
 */

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
