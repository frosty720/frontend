'use client';

/**
 * useV3StakingSubgraph - Hook for querying V3 staking data from the subgraph
 * Provides incentive listings, user stakes, and reward claim history.
 *
 * Note: These queries depend on the V3 staking subgraph schema being deployed (Phase 6).
 * The hook gracefully handles errors when the subgraph entities don't exist yet.
 */

import { useState, useEffect, useCallback } from 'react';
import { request, gql } from 'graphql-request';
import { useAccount, useChainId } from 'wagmi';
import { getV3Config } from '@/config/dex/v3-config';
import { CHAIN_IDS } from '@/config/chains';
import { dexLogger as logger } from '@/lib/logger';

// ========== Subgraph Types ==========

export interface SubgraphIncentive {
    id: string;
    rewardToken: {
        id: string;
        symbol: string;
        decimals: string;
    };
    pool: {
        id: string;
        token0: { symbol: string };
        token1: { symbol: string };
        feeTier: string;
    };
    startTime: string;
    endTime: string;
    refundee: string;
    reward: string;
    numberOfStakes: string;
}

export interface SubgraphStake {
    incentive: {
        id: string;
        rewardToken: { symbol: string };
    };
    liquidity: string;
}

export interface SubgraphDeposit {
    id: string;
    numberOfStakes: string;
    stakes: SubgraphStake[];
}

export interface SubgraphRewardClaim {
    id: string;
    rewardToken: { id: string; symbol: string };
    amount: string;
    timestamp: string;
}

// ========== GraphQL Queries ==========

// NOTE: in the deployed schema `Incentive.rewardToken` and `Incentive.pool` are Bytes
// (plain addresses), NOT entity references. Selecting sub-fields on them returns the bare
// address instead of an object, which silently produced `rewardToken.symbol === undefined`
// and an IncentiveKey with undefined addresses — the farm list then rendered nothing.
// Fetch the scalars here and enrich pool/token metadata with a second query below.
const GET_INCENTIVES = gql`
    query GetIncentives {
        incentives(first: 100, where: { ended: false }) {
            id
            rewardToken
            pool
            startTime
            endTime
            refundee
            reward
            numberOfStakes
        }
    }
`;

/** Pool + token metadata for the pools referenced by the incentives above. */
const GET_INCENTIVE_POOLS = gql`
    query GetIncentivePools($poolIds: [ID!], $tokenIds: [ID!]) {
        pools(where: { id_in: $poolIds }) {
            id
            feeTier
            token0 { id symbol decimals }
            token1 { id symbol decimals }
        }
        tokens(where: { id_in: $tokenIds }) {
            id
            symbol
            decimals
        }
    }
`;

const GET_USER_STAKES = gql`
    query GetUserStakes($owner: Bytes!) {
        stakerDeposits(where: { owner: $owner }) {
            id
            numberOfStakes
            stakes {
                incentive {
                    id
                    rewardToken { symbol }
                }
                liquidity
            }
        }
    }
`;

const GET_REWARD_CLAIMS = gql`
    query GetRewardClaims($owner: Bytes!) {
        rewardClaims(
            where: { owner: $owner }
            orderBy: timestamp
            orderDirection: desc
            first: 50
        ) {
            id
            rewardToken {
                id
                symbol
            }
            amount
            timestamp
        }
    }
`;

// ========== Hook ==========

/**
 * @param chainIdOverride force a specific chain; omit to follow the CONNECTED wallet chain.
 * Defaulting to a hardcoded chain made staking data silently read the wrong subgraph.
 */
export function useV3StakingSubgraph(chainIdOverride?: number) {
    const connectedChainId = useChainId();
    const chainId = chainIdOverride ?? connectedChainId ?? CHAIN_IDS.KALYCHAIN;
    const { address } = useAccount();
    const [incentives, setIncentives] = useState<SubgraphIncentive[]>([]);
    const [userStakes, setUserStakes] = useState<SubgraphDeposit[]>([]);
    const [rewardClaims, setRewardClaims] = useState<SubgraphRewardClaim[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    let subgraphUrl: string;
    try {
        const config = getV3Config(chainId);
        subgraphUrl = config ? config.subgraphUrl : '';
    } catch {
        subgraphUrl = '';
    }

    // Fetch active incentives
    const fetchIncentives = useCallback(async () => {
        if (!subgraphUrl) return;

        try {
            const data = await request<{ incentives: any[] }>(subgraphUrl, GET_INCENTIVES);
            const raw = data.incentives ?? [];
            if (raw.length === 0) {
                setIncentives([]);
                return;
            }

            // Enrich the scalar pool/rewardToken addresses into the nested shape the rest
            // of the staking code expects.
            const poolIds = Array.from(new Set(raw.map((i) => String(i.pool).toLowerCase())));
            const tokenIds = Array.from(new Set(raw.map((i) => String(i.rewardToken).toLowerCase())));
            const meta = await request<{ pools: any[]; tokens: any[] }>(
                subgraphUrl,
                GET_INCENTIVE_POOLS,
                { poolIds, tokenIds },
            ).catch(() => ({ pools: [], tokens: [] }));

            const poolById = new Map((meta.pools ?? []).map((p) => [String(p.id).toLowerCase(), p]));
            const tokenById = new Map((meta.tokens ?? []).map((tk) => [String(tk.id).toLowerCase(), tk]));

            const enriched = raw.map((i) => {
                const poolId = String(i.pool).toLowerCase();
                const rewardId = String(i.rewardToken).toLowerCase();
                const p = poolById.get(poolId);
                const rt = tokenById.get(rewardId);
                return {
                    ...i,
                    rewardToken: {
                        id: rewardId,
                        symbol: rt?.symbol ?? 'TOKEN',
                        decimals: rt?.decimals ?? '18',
                    },
                    pool: {
                        id: poolId,
                        feeTier: p?.feeTier ?? '3000',
                        token0: { symbol: p?.token0?.symbol ?? '?' },
                        token1: { symbol: p?.token1?.symbol ?? '?' },
                    },
                } as SubgraphIncentive;
            });
            setIncentives(enriched);
        } catch (err) {
            // Expected to fail if staking entities aren't in the subgraph yet
            logger.debug('V3 Staking subgraph: incentives query failed (schema may not be deployed yet):', err);
            setIncentives([]);
        }
    }, [subgraphUrl]);

    // Fetch user stakes
    const fetchUserStakes = useCallback(async () => {
        if (!subgraphUrl || !address) {
            setUserStakes([]);
            return;
        }

        try {
            const data = await request<{ stakerDeposits: SubgraphDeposit[] }>(
                subgraphUrl,
                GET_USER_STAKES,
                { owner: address.toLowerCase() },
            );
            setUserStakes(data.stakerDeposits);
        } catch (err) {
            logger.debug('V3 Staking subgraph: user stakes query failed:', err);
            setUserStakes([]);
        }
    }, [subgraphUrl, address]);

    // Fetch reward claims history
    const fetchRewardClaims = useCallback(async () => {
        if (!subgraphUrl || !address) {
            setRewardClaims([]);
            return;
        }

        try {
            const data = await request<{ rewardClaims: SubgraphRewardClaim[] }>(
                subgraphUrl,
                GET_REWARD_CLAIMS,
                { owner: address.toLowerCase() },
            );
            setRewardClaims(data.rewardClaims);
        } catch (err) {
            logger.debug('V3 Staking subgraph: reward claims query failed:', err);
            setRewardClaims([]);
        }
    }, [subgraphUrl, address]);

    // Fetch all data on mount and when dependencies change
    useEffect(() => {
        const fetchAll = async () => {
            if (!subgraphUrl) {
                setError('Subgraph URL not configured');
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                await Promise.all([
                    fetchIncentives(),
                    fetchUserStakes(),
                    fetchRewardClaims(),
                ]);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to fetch staking subgraph data';
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAll();
    }, [subgraphUrl, address, fetchIncentives, fetchUserStakes, fetchRewardClaims]);

    const refetch = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await Promise.all([
                fetchIncentives(),
                fetchUserStakes(),
                fetchRewardClaims(),
            ]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to refetch staking data';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [fetchIncentives, fetchUserStakes, fetchRewardClaims]);

    return {
        incentives,
        userStakes,
        rewardClaims,
        isLoading,
        error,
        refetch,
    };
}

export default useV3StakingSubgraph;
