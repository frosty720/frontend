'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { V3StakerABI } from '@/config/abis';
import type { Token } from '@/config/dex/types';
import { getV3Config } from '@/config/dex/v3-config';
import { useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { isLowercaseAddress, querySubgraph } from '@/lib/subgraph-query';
import type { V3Incentive } from '@/services/dex/v3-staking-types';
import { UserError } from '@/lib/userError';
import {
	confirmStakedPositions,
	farmApr,
	isIncentiveId,
	stakeCandidates,
	stakeValuesByIncentive,
	toFarmPools,
	totalStakedUsd,
	type DepositRead,
	type FarmPool,
	type IncentiveStakeValue,
	type StakedPosition,
	type SubgraphFarmPoolRow,
	type SubgraphStakeRow,
} from '@/utils/farm';

type ReadClient = NonNullable<ReturnType<typeof usePublicClient>>;

interface StakedData {
	positions: StakedPosition[];
	pools: Record<string, FarmPool>;
}

export interface FarmStakedValue {
	/** Keyed by lowercase incentive id. */
	byIncentive: Record<string, IncentiveStakeValue>;
	/** USD of every distinct staked position across farms; null while unknown or unpriced. */
	totalUsd: number | null;
	/** Estimated APR per farm (lowercase incentive id); null where it can't be estimated. */
	aprByIncentive: Record<string, number | null>;
}

const EMPTY_POOLS: Record<string, FarmPool> = {};
const quoted = (ids: string[]) => ids.map((id) => `"${id}"`).join(',');

/**
 * Pool state for every farm plus stake rows for the farms the staker says hold stakes, from the V3
 * subgraph; then the staker's own `stakes` / `getRewardInfo` / `deposits` for each row. Pools of empty
 * farms are still read: their APR estimate needs the pool's liquidity and price.
 */
async function fetchStakedPositions(
	client: ReadClient,
	subgraphUrl: string,
	staker: `0x${string}`,
	incentives: V3Incentive[],
): Promise<StakedData> {
	const poolOf: Record<string, string> = {};
	const keyOf: Record<string, V3Incentive['key']> = {};
	for (const incentive of incentives) {
		poolOf[incentive.incentiveId.toLowerCase()] = incentive.key.pool.toLowerCase();
		keyOf[incentive.incentiveId.toLowerCase()] = incentive.key;
	}
	const incentiveIds = incentives
		.filter((incentive) => incentive.numberOfStakes > 0)
		.map((incentive) => incentive.incentiveId.toLowerCase())
		.filter(isIncentiveId);
	const poolIds = Array.from(new Set(Object.values(poolOf))).filter(isLowercaseAddress);
	if (poolIds.length === 0) return { positions: [], pools: EMPTY_POOLS };

	const data = await querySubgraph<{ stakes: SubgraphStakeRow[]; pools: SubgraphFarmPoolRow[] }>(
		subgraphUrl,
		`{ stakes(first: 1000, where: { incentive_in: [${quoted(incentiveIds)}] }) { deposit { id owner } incentive { id } } pools(where: { id_in: [${quoted(poolIds)}] }) { id sqrtPrice liquidity tick token0 { id symbol decimals } token1 { id symbol decimals } } }`,
	);
	const candidates = stakeCandidates(data.stakes, incentiveIds);
	const tokenIds = Array.from(new Set(candidates.map((candidate) => candidate.tokenId)));

	// The KalyChain transport batches these reads into one JSON-RPC request.
	const [stakes, rewards, deposits] = await Promise.all([
		Promise.all(
			candidates.map(
				async (candidate) =>
					(await client.readContract({
						address: staker,
						abi: V3StakerABI,
						functionName: 'stakes',
						args: [candidate.tokenId, candidate.incentiveId],
					})) as readonly [bigint, bigint],
			),
		),
		// getRewardInfo reverts for a candidate that is no longer staked; confirmStakedPositions drops those anyway.
		Promise.all(
			candidates.map(async (candidate) => {
				const key = keyOf[candidate.incentiveId];
				try {
					const [reward] = (await client.readContract({
						address: staker,
						abi: V3StakerABI,
						functionName: 'getRewardInfo',
						args: [
							{
								rewardToken: key.rewardToken as `0x${string}`,
								pool: key.pool as `0x${string}`,
								startTime: key.startTime,
								endTime: key.endTime,
								refundee: key.refundee as `0x${string}`,
							},
							candidate.tokenId,
						],
					})) as readonly [bigint, bigint];
					return reward;
				} catch {
					return 0n;
				}
			}),
		),
		Promise.all(
			tokenIds.map(
				async (tokenId) =>
					(await client.readContract({
						address: staker,
						abi: V3StakerABI,
						functionName: 'deposits',
						args: [tokenId],
					})) as readonly [string, number, number, number],
			),
		),
	]);

	const depositReads = new Map<bigint, DepositRead>(
		tokenIds.map((tokenId, index): [bigint, DepositRead] => {
			const [owner, , tickLower, tickUpper] = deposits[index];
			return [tokenId, { owner, tickLower: Number(tickLower), tickUpper: Number(tickUpper) }];
		}),
	);
	return {
		positions: confirmStakedPositions(candidates, stakes.map(([, liquidity]) => liquidity), rewards, depositReads, poolOf),
		pools: toFarmPools(data.pools),
	};
}

/**
 * USD staked in each farm, overall and by `owner`. The subgraph is the only index of staked NFTs but its
 * stake rows outlive unstaking, so each row is confirmed against the staker before it is valued at the
 * pool's current price. Farms the staker reports as empty get no stake reads, only their pool (for the APR estimate).
 */
export function useFarmStakedValue(incentives: V3Incentive[], owner: string | undefined, chainId: number): FarmStakedValue {
	const config = getV3Config(chainId);
	const client = usePublicClient({ chainId });
	const withStakes = incentives.filter((incentive) => incentive.numberOfStakes > 0);
	const stakeKey = incentives.map((incentive) => `${incentive.incentiveId}:${incentive.numberOfStakes}`).join(',');

	const { data } = useQuery({
		queryKey: ['farm-staked-positions', chainId, stakeKey],
		enabled: Boolean(config && client) && incentives.length > 0,
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: () => {
			if (!config || !client) throw new UserError('stakingUnavailable');
			return fetchStakedPositions(client, config.subgraphUrl, config.staker as `0x${string}`, incentives);
		},
	});

	const pools = data?.pools ?? EMPTY_POOLS;
	const tokens = useMemo<Token[]>(
		() =>
			Object.values(pools).flatMap((pool) =>
				[pool.token0, pool.token1].map((token) => ({
					chainId,
					address: token.id,
					decimals: token.decimals,
					name: token.symbol,
					symbol: token.symbol,
					logoURI: '',
				})),
			),
		[pools, chainId],
	);
	// Reward tokens are priced too: a farm may pay in a token its pool doesn't hold.
	const rewardTokens = incentives.map<Token>((incentive) => ({
		chainId,
		address: incentive.key.rewardToken,
		decimals: incentive.rewardTokenDecimals ?? 18,
		name: incentive.rewardTokenSymbol ?? '',
		symbol: incentive.rewardTokenSymbol ?? '',
		logoURI: '',
	}));
	const prices = useTokenUsdPrices([...tokens, ...rewardTokens], chainId);

	const positions = withStakes.length === 0 ? [] : (data?.positions ?? null);
	const byIncentive = stakeValuesByIncentive(incentives, positions, pools, prices, owner);
	const now = Math.floor(Date.now() / 1000);
	const aprByIncentive: Record<string, number | null> = {};
	for (const incentive of incentives) {
		aprByIncentive[incentive.incentiveId.toLowerCase()] = farmApr(incentive, positions ?? [], pools, prices, now);
	}
	return { byIncentive, totalUsd: totalStakedUsd(byIncentive, positions ?? [], pools, prices), aprByIncentive };
}

export default useFarmStakedValue;
