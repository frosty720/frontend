'use client';

/**
 * useV3Staking - Primary hook for V3 staking operations
 * Wraps V3StakingService with TanStack Query for data fetching and wagmi for wallet interaction
 */

import { useCallback, useMemo } from 'react';
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAIN_IDS } from '@/config/chains';
import { getV3StakingService } from '@/services/dex/V3StakingService';
import { useV3StakingSubgraph } from '@/hooks/v3/useV3StakingSubgraph';
import { dexLogger as logger } from '@/lib/logger';
import type { IncentiveKey, V3Incentive, V3Deposit } from '@/services/dex/v3-staking-types';
import { assertTxSucceeded } from '@/utils/transactions';

/** UI metadata for an incentive, derived from the subgraph (pool/reward token). */
interface IncentiveMeta {
    poolToken0Symbol?: string;
    poolToken1Symbol?: string;
    poolFee?: number;
    rewardTokenSymbol?: string;
    rewardTokenDecimals?: number;
}

/**
 * Fetch on-chain info for the given incentives (list sourced from the subgraph).
 * Live numbers (totalRewardUnclaimed, numberOfStakes, active window) are read
 * on-chain so they are always accurate; the subgraph only supplies the list +
 * display metadata.
 */
async function fetchIncentives(
    chainId: number,
    incentiveList: { key: IncentiveKey; meta: IncentiveMeta }[],
): Promise<V3Incentive[]> {
    const service = getV3StakingService(chainId);
    const now = Math.floor(Date.now() / 1000);

    const results: V3Incentive[] = [];

    for (const { key, meta: config } of incentiveList) {
        try {
            const info = await service.getIncentiveInfo(key);
            const incentiveId = service.encodeIncentiveKey(key);
            const endTime = Number(key.endTime);
            const startTime = Number(key.startTime);

            results.push({
                key,
                incentiveId,
                totalRewardUnclaimed: info.totalRewardUnclaimed,
                totalSecondsClaimedX128: info.totalSecondsClaimedX128,
                numberOfStakes: info.numberOfStakes,
                isActive: now >= startTime && now < endTime,
                timeRemaining: Math.max(0, endTime - now),
                // UI metadata from config
                poolToken0Symbol: config?.poolToken0Symbol,
                poolToken1Symbol: config?.poolToken1Symbol,
                poolFee: config?.poolFee,
                rewardTokenSymbol: config?.rewardTokenSymbol,
                rewardTokenDecimals: config?.rewardTokenDecimals,
            });
        } catch (err) {
            logger.error('Failed to fetch incentive info:', err);
        }
    }

    return results;
}

/**
 * Fetch pending rewards for the connected user across all reward tokens
 */
async function fetchPendingRewards(
    chainId: number,
    address: string,
    rewardTokens: string[],
): Promise<Record<string, bigint>> {
    const service = getV3StakingService(chainId);
    const rewards: Record<string, bigint> = {};

    for (const token of rewardTokens) {
        try {
            const amount = await service.getAccumulatedRewards(token, address);
            if (amount > 0n) {
                rewards[token] = amount;
            }
        } catch (err) {
            logger.error(`Failed to fetch rewards for token ${token}:`, err);
        }
    }

    return rewards;
}

/**
 * @param chainIdOverride force a specific chain; omit to follow the CONNECTED wallet chain.
 *
 * This previously defaulted to CHAIN_IDS.KALYCHAIN, so every caller that omitted the
 * argument (including the Farm page) queried the 3888 subgraph no matter which chain the
 * user was on — incentives created on any other chain were invisible.
 */
export function useV3Staking(chainIdOverride?: number) {
    const connectedChainId = useChainId();
    const chainId = chainIdOverride ?? connectedChainId ?? CHAIN_IDS.KALYCHAIN;
    const { address } = useAccount();
    const publicClient = usePublicClient({ chainId });
    const { data: walletClient } = useWalletClient({ chainId });
    const queryClient = useQueryClient();

    const service = useMemo(() => getV3StakingService(chainId), [chainId]);

    // Incentive list comes from the subgraph (dynamic) rather than a hardcoded
    // config. The subgraph tracks the V3 staker's IncentiveCreated events.
    const { incentives: subgraphIncentives } = useV3StakingSubgraph(chainId);

    const incentiveList = useMemo(
        () =>
            subgraphIncentives.map((si) => ({
                key: {
                    rewardToken: si.rewardToken.id,
                    pool: si.pool.id,
                    startTime: BigInt(si.startTime),
                    endTime: BigInt(si.endTime),
                    refundee: si.refundee,
                } as IncentiveKey,
                meta: {
                    poolToken0Symbol: si.pool.token0.symbol,
                    poolToken1Symbol: si.pool.token1.symbol,
                    poolFee: Number(si.pool.feeTier),
                    rewardTokenSymbol: si.rewardToken.symbol,
                    rewardTokenDecimals: Number(si.rewardToken.decimals),
                } as IncentiveMeta,
            })),
        [subgraphIncentives],
    );

    // Unique reward-token addresses (lowercased) to check for claimable rewards.
    const rewardTokens = useMemo(
        () => Array.from(new Set(subgraphIncentives.map((si) => si.rewardToken.id.toLowerCase()))),
        [subgraphIncentives],
    );

    // Map reward-token address -> symbol for UI labelling (no hardcoded list).
    const rewardTokenSymbols = useMemo(
        () =>
            subgraphIncentives.reduce<Record<string, string>>((acc, si) => {
                acc[si.rewardToken.id.toLowerCase()] = si.rewardToken.symbol;
                return acc;
            }, {}),
        [subgraphIncentives],
    );

    // Stable key fragment so the query refetches when the incentive set changes.
    const incentiveListKey = incentiveList
        .map((i) => `${i.key.pool}-${i.key.rewardToken}-${i.key.startTime.toString()}`)
        .join(',');

    // ========== Queries ==========

    const incentivesQuery = useQuery({
        queryKey: ['v3-staking-incentives', chainId, incentiveListKey],
        queryFn: () => fetchIncentives(chainId, incentiveList),
        enabled: incentiveList.length > 0,
        staleTime: 60 * 1000, // 1 minute
        refetchInterval: 5 * 60 * 1000, // 5 minutes
    });

    const rewardsQuery = useQuery({
        queryKey: ['v3-staking-rewards', chainId, address, rewardTokens.join(',')],
        queryFn: () => fetchPendingRewards(chainId, address!, rewardTokens),
        enabled: !!address && rewardTokens.length > 0,
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
    });

    // ========== Actions ==========

    /**
     * Refresh a specific deposit by tokenId
     */
    const refreshDeposit = useCallback(async (tokenId: bigint): Promise<V3Deposit> => {
        const deposit = await service.getDepositInfo(tokenId);
        return deposit;
    }, [service]);

    /**
     * Get reward info for a specific position in an incentive
     */
    const getPositionReward = useCallback(async (
        incentiveKey: IncentiveKey,
        tokenId: bigint,
    ): Promise<{ reward: bigint; secondsInsideX128: bigint }> => {
        return service.getRewardInfo(incentiveKey, tokenId);
    }, [service]);

    /**
     * Combined deposit + stake flow:
     * 1. Transfer NFT to staker contract (deposit)
     * 2. Stake the deposited NFT in the incentive
     */
    const depositAndStake = useCallback(async (
        incentiveKey: IncentiveKey,
        tokenId: bigint,
    ): Promise<{ depositHash: string; stakeHash: string }> => {
        if (!walletClient) throw new Error('Wallet not connected');
        if (!publicClient) throw new Error('Public client not available');

        logger.debug('V3 Staking: Starting deposit + stake flow', {
            tokenId: tokenId.toString(),
        });

        // Step 1: Deposit NFT into staker
        const depositHash = await service.depositToken(tokenId, walletClient);
        await assertTxSucceeded(publicClient, depositHash, 'Deposit position');
        logger.debug('V3 Staking: Deposit confirmed', { depositHash });

        // Step 2: Stake the deposited NFT
        const stakeHash = await service.stakeToken(incentiveKey, tokenId, walletClient);
        await assertTxSucceeded(publicClient, stakeHash, 'Stake');
        logger.debug('V3 Staking: Stake confirmed', { stakeHash });

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['v3-staking-incentives', chainId] });
        queryClient.invalidateQueries({ queryKey: ['v3-staking-rewards', chainId, address] });

        return { depositHash, stakeHash };
    }, [walletClient, publicClient, service, queryClient, chainId, address]);

    /**
     * Combined unstake + withdraw flow:
     * 1. Unstake from incentive (accumulates rewards)
     * 2. Withdraw NFT back to owner
     */
    const unstakeAndWithdraw = useCallback(async (
        incentiveKey: IncentiveKey,
        tokenId: bigint,
    ): Promise<{ unstakeHash: string; withdrawHash: string }> => {
        if (!walletClient) throw new Error('Wallet not connected');
        if (!publicClient) throw new Error('Public client not available');
        if (!address) throw new Error('No account address');

        logger.debug('V3 Staking: Starting unstake + withdraw flow', {
            tokenId: tokenId.toString(),
        });

        // Step 1: Unstake from incentive
        const unstakeHash = await service.unstakeToken(incentiveKey, tokenId, walletClient);
        await assertTxSucceeded(publicClient, unstakeHash, 'Unstake');
        logger.debug('V3 Staking: Unstake confirmed', { unstakeHash });

        // Step 2: Withdraw NFT back to owner
        const withdrawHash = await service.withdrawToken(tokenId, address, walletClient);
        await assertTxSucceeded(publicClient, withdrawHash, 'Withdraw position');
        logger.debug('V3 Staking: Withdraw confirmed', { withdrawHash });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['v3-staking-incentives', chainId] });
        queryClient.invalidateQueries({ queryKey: ['v3-staking-rewards', chainId, address] });

        return { unstakeHash, withdrawHash };
    }, [walletClient, publicClient, address, service, queryClient, chainId]);

    /**
     * Claim accumulated rewards for a given reward token
     */
    const claimReward = useCallback(async (
        rewardToken: string,
        amount: bigint,
    ): Promise<string> => {
        if (!walletClient) throw new Error('Wallet not connected');
        if (!publicClient) throw new Error('Public client not available');
        if (!address) throw new Error('No account address');

        logger.debug('V3 Staking: Claiming rewards', {
            rewardToken,
            amount: amount.toString(),
        });

        const hash = await service.claimReward(rewardToken, address, amount, walletClient);
        await assertTxSucceeded(publicClient, hash, 'Claim reward');
        logger.debug('V3 Staking: Claim confirmed', { hash });

        // Invalidate rewards query
        queryClient.invalidateQueries({ queryKey: ['v3-staking-rewards', chainId, address] });

        return hash;
    }, [walletClient, publicClient, address, service, queryClient, chainId]);

    /**
     * Harvest rewards: unstake → claim → re-stake (position stays deposited in staker)
     * This is the only way to claim rewards while keeping the position earning.
     */
    const harvestRewards = useCallback(async (
        incentiveKey: IncentiveKey,
        tokenId: bigint,
    ): Promise<string> => {
        if (!walletClient) throw new Error('Wallet not connected');
        if (!publicClient) throw new Error('Public client not available');
        if (!address) throw new Error('No account address');

        logger.debug('V3 Staking: Starting harvest (unstake → claim → restake)', {
            tokenId: tokenId.toString(),
        });

        // Step 1: Unstake (moves accumulated rewards to rewards mapping)
        const unstakeHash = await service.unstakeToken(incentiveKey, tokenId, walletClient);
        await assertTxSucceeded(publicClient, unstakeHash, 'Unstake');
        logger.debug('V3 Staking: Unstake confirmed for harvest', { unstakeHash });

        // Step 2: Claim the accumulated rewards
        const accumulated = await service.getAccumulatedRewards(incentiveKey.rewardToken, address);
        if (accumulated > 0n) {
            const claimHash = await service.claimReward(incentiveKey.rewardToken, address, accumulated, walletClient);
            await assertTxSucceeded(publicClient, claimHash, 'Claim reward');
            logger.debug('V3 Staking: Claim confirmed for harvest', { claimHash, amount: accumulated.toString() });
        }

        // Step 3: Re-stake (position is still deposited in staker, just needs restaking)
        const restakeHash = await service.stakeToken(incentiveKey, tokenId, walletClient);
        await assertTxSucceeded(publicClient, restakeHash, 'Restake');
        logger.debug('V3 Staking: Re-stake confirmed for harvest', { restakeHash });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['v3-staking-incentives', chainId] });
        queryClient.invalidateQueries({ queryKey: ['v3-staking-rewards', chainId, address] });

        return unstakeHash;
    }, [walletClient, publicClient, address, service, queryClient, chainId]);

    // ========== Refetch helper ==========

    const refetch = useCallback(() => {
        incentivesQuery.refetch();
        rewardsQuery.refetch();
    }, [incentivesQuery, rewardsQuery]);

    return {
        // Data
        incentives: incentivesQuery.data ?? [],
        pendingRewards: rewardsQuery.data ?? {},
        rewardTokenSymbols,

        // Actions
        depositAndStake,
        unstakeAndWithdraw,
        harvestRewards,
        claimReward,
        refreshDeposit,
        getPositionReward,

        // State
        isLoading: incentivesQuery.isLoading || rewardsQuery.isLoading,
        error: incentivesQuery.error?.message ?? rewardsQuery.error?.message ?? null,
        refetch,

        // Service access for advanced usage
        service,
    };
}

export default useV3Staking;
