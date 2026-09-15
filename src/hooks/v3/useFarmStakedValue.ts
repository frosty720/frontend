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
}

const EMPTY_POOLS: Record<string, FarmPool> = {};
const quoted = (ids: string[]) => ids.map((id) => `"${id}"`).join(',');

/** Stake rows + pool prices from the V3 subgraph, then the staker's own `stakes` / `deposits` for each row. */
async function fetchStakedPositions(
	client: ReadClient,
	subgraphUrl: string,
	staker: `0x${string}`,
	incentives: V3Incentive[],
): Promise<StakedData> {
	const poolOf: Record<string, string> = {};
	for (const incentive of incentives) poolOf[incentive.incentiveId.toLowerCase()] = incentive.key.pool.toLowerCase();
	const incentiveIds = Object.keys(poolOf).filter(isIncentiveId);
	const poolIds = Array.from(new Set(Object.values(poolOf))).filter(isLowercaseAddress);
	if (incentiveIds.length === 0) return { positions: [], pools: EMPTY_POOLS };

	const data = await querySubgraph<{ stakes: SubgraphStakeRow[]; pools: SubgraphFarmPoolRow[] }>(
		subgraphUrl,
		`{ stakes(first: 1000, where: { incentive_in: [${quoted(incentiveIds)}] }) { deposit { id owner } incentive { id } } pools(where: { id_in: [${quoted(poolIds)}] }) { id sqrtPrice token0 { id symbol decimals } token1 { id symbol decimals } } }`,
	);
	const candidates = stakeCandidates(data.stakes, incentiveIds);
	const tokenIds = Array.from(new Set(candidates.map((candidate) => candidate.tokenId)));

	// The KalyChain transport batches these reads into one JSON-RPC request.
	const [stakes, deposits] = await Promise.all([
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
		positions: confirmStakedPositions(candidates, stakes.map(([, liquidity]) => liquidity), depositReads, poolOf),
		pools: toFarmPools(data.pools),
	};
}

/**
 * USD staked in each farm, overall and by `owner`. The subgraph is the only index of staked NFTs but its
 * stake rows outlive unstaking, so each row is confirmed against the staker before it is valued at the
 * pool's current price. Farms the staker reports as empty cost no request at all.
 */
export function useFarmStakedValue(incentives: V3Incentive[], owner: string | undefined, chainId: number): FarmStakedValue {
	const config = getV3Config(chainId);
	const client = usePublicClient({ chainId });
	const withStakes = incentives.filter((incentive) => incentive.numberOfStakes > 0);
	const stakeKey = withStakes.map((incentive) => `${incentive.incentiveId}:${incentive.numberOfStakes}`).join(',');

	const { data } = useQuery({
		queryKey: ['farm-staked-positions', chainId, stakeKey],
		enabled: Boolean(config && client) && withStakes.length > 0,
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: () => {
			if (!config || !client) throw new UserError('stakingUnavailable');
			return fetchStakedPositions(client, config.subgraphUrl, config.staker as `0x${string}`, withStakes);
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
	const prices = useTokenUsdPrices(tokens, chainId);

	const positions = withStakes.length === 0 ? [] : (data?.positions ?? null);
	const byIncentive = stakeValuesByIncentive(incentives, positions, pools, prices, owner);
	return { byIncentive, totalUsd: totalStakedUsd(byIncentive, positions ?? [], pools, prices) };
}

export default useFarmStakedValue;
