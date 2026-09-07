'use client';

import { useState, useEffect } from 'react';
import { request, gql, ClientError } from 'graphql-request';
import { getV3Config } from '@/config/dex/v3-config';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';

/**
 * V3 subgraph URL for an EXPLICIT chain.
 *
 * This used to default to KalyChain mainnet whenever the chain was undefined, which is
 * what `useAccount().chainId` reports until a wallet reports in — so the pools page
 * listed 3888's pools (WKLC/USDT, KSWAP, KUSD…) while connected to 3890. There is no
 * fallback now: an unknown chain returns '' and the caller shows nothing rather than
 * another chain's data.
 */
function getSubgraphUrl(chainId: number): string {
    return getV3Config(chainId)?.subgraphUrl || '';
}

export interface V3Pool {
    id: string;
    token0: {
        id: string;
        symbol: string;
        name: string;
        decimals: string;
    };
    token1: {
        id: string;
        symbol: string;
        name: string;
        decimals: string;
    };
    feeTier: string;
    liquidity: string;
    sqrtPrice: string;
    tick: string | null;
    token0Price: string;
    token1Price: string;
    volumeUSD: string;
    txCount: string;
    totalValueLockedUSD: string;
    totalValueLockedToken0: string;
    totalValueLockedToken1: string;
}

export interface V3Position {
    id: string;
    owner: string;
    pool: {
        id: string;
        token0: {
            symbol: string;
            decimals: string;
        };
        token1: {
            symbol: string;
            decimals: string;
        };
        feeTier: string;
        sqrtPriceX96: string;
        tick: string;
    };
    liquidity: string;
    tickLower: string;
    tickUpper: string;
    depositedToken0: string;
    depositedToken1: string;
    withdrawnToken0: string;
    withdrawnToken1: string;
    collectedFeesToken0: string;
    collectedFeesToken1: string;
}

export function useV3Pools() {
    const chainId = useResolvedChainId();
    const [pools, setPools] = useState<V3Pool[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const refetch = () => setReloadKey((k) => k + 1);

    useEffect(() => {
        const subgraphUrl = getSubgraphUrl(chainId);

        const fetchPools = async () => {
            if (!subgraphUrl) {
                setError('V3 subgraph URL not configured for this chain');
                setPools([]);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                // `subgraphError: allow` lets us read pool data even while the
                // subgraph is flagged unhealthy (e.g. USD pricing derivation
                // errors). Without it Graph Node returns `indexing_error` and no
                // data. Fields selected are limited to those the subgraph serves
                // reliably — broken USD/liquidity fields are omitted on purpose.
                const query = gql`
          {
            pools(
              first: 100
              subgraphError: allow
              orderBy: txCount
              orderDirection: desc
            ) {
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
              feeTier
              liquidity
              sqrtPrice
              tick
              token0Price
              token1Price
              volumeUSD
              txCount
              totalValueLockedUSD
              totalValueLockedToken0
              totalValueLockedToken1
            }
          }
        `;

                const data = await request<{ pools: V3Pool[] }>(subgraphUrl, query);
                setPools(data.pools);
            } catch (err) {
                // graphql-request throws when the response carries ANY GraphQL
                // errors, even alongside valid data. While the subgraph is
                // unhealthy it returns `indexing_error` together with the pool
                // data, so salvage that partial data from the ClientError.
                if (err instanceof ClientError) {
                    const salvaged = err.response?.data as { pools?: V3Pool[] } | undefined;
                    if (salvaged?.pools) {
                        setPools(salvaged.pools);
                        setError(null);
                        return;
                    }
                }
                console.error('Failed to fetch V3 pools:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch V3 pools');
            } finally {
                setLoading(false);
            }
        };

        fetchPools();
    }, [chainId, reloadKey]);

    return { pools, loading, error, refetch };
}

export function useUserV3Positions(userAddress: string | undefined | null) {
    const chainId = useResolvedChainId();
    const [positions, setPositions] = useState<V3Position[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userAddress) {
            setPositions([]);
            return;
        }

        const subgraphUrl = getSubgraphUrl(chainId);

        const fetchPositions = async () => {
            if (!subgraphUrl) {
                setError('V3 subgraph URL not configured for this chain');
                setPositions([]);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const query = gql`
          {
            positions(
              where: { owner: "${userAddress.toLowerCase()}" }
              subgraphError: allow
              orderBy: liquidity
              orderDirection: desc
            ) {
              id
              owner
              pool {
                id
                token0 {
                    symbol
                    decimals
                }
                token1 {
                    symbol
                    decimals
                }
                feeTier
                sqrtPriceX96
                tick
              }
              liquidity
              tickLower
              tickUpper
              depositedToken0
              depositedToken1
              withdrawnToken0
              withdrawnToken1
              collectedFeesToken0
              collectedFeesToken1
            }
          }
        `;

                const data = await request<{ positions: V3Position[] }>(subgraphUrl, query);
                setPositions(data.positions);
            } catch (err) {
                console.error('Failed to fetch V3 positions:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch V3 positions');
            } finally {
                setLoading(false);
            }
        };

        fetchPositions();
    }, [userAddress, chainId]);

    return { positions, loading, error };
}
