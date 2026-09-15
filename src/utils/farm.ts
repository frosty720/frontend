import { formatUnits } from 'viem';
import type { V3Incentive } from '@/services/dex/v3-staking-types';
import type { UsdPriceMap } from '@/hooks/useTokenUsdPrices';
import { amountsUsd } from '@/utils/dashboard';
import { getPositionTokenAmounts } from '@/utils/v3-math';

export type IncentiveStatus = 'upcoming' | 'active' | 'ended';

/** Upcoming before startTime, ended from endTime on, active in between. */
export function incentiveStatus(incentive: Pick<V3Incentive, 'key'>, nowSeconds: number): IncentiveStatus {
	const start = Number(incentive.key.startTime);
	const end = Number(incentive.key.endTime);
	if (nowSeconds < start) return 'upcoming';
	if (nowSeconds >= end) return 'ended';
	return 'active';
}

export interface DurationUnits {
	day: string;
	hour: string;
	minute: string;
}

/** "3d 4h" / "5h 12m" / "40m" (units localised by the caller). Non-positive → null. */
export function formatDuration(seconds: number, units: DurationUnits): string | null {
	if (seconds <= 0) return null;
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	if (days > 0) return `${days}${units.day} ${hours}${units.hour}`;
	if (hours > 0) return `${hours}${units.hour} ${minutes}${units.minute}`;
	return `${minutes}${units.minute}`;
}

export interface TokenTotal {
	token: string;
	symbol: string;
	amount: number;
	usd: number | null;
}

/** Group raw reward amounts by token into display units, priced where possible. */
export function rewardTotals(
	entries: Array<{ token: string; raw: bigint; decimals: number; symbol: string }>,
	prices: UsdPriceMap,
): TokenTotal[] {
	const totals = new Map<string, TokenTotal>();
	for (const entry of entries) {
		if (entry.raw <= 0n) continue;
		const key = entry.token.toLowerCase();
		const amount = Number(formatUnits(entry.raw, entry.decimals));
		const price = prices[key] ?? null;
		const current = totals.get(key);
		if (current) {
			current.amount += amount;
			current.usd = current.usd !== null && price !== null ? current.usd + amount * price : null;
		} else {
			totals.set(key, { token: key, symbol: entry.symbol, amount, usd: price !== null ? amount * price : null });
		}
	}
	return Array.from(totals.values());
}

/** One USD figure when every total is priced, otherwise null (callers then list token amounts). */
export function totalUsd(totals: TokenTotal[]): number | null {
	if (totals.some((total) => total.usd === null)) return null;
	return totals.reduce((sum, total) => sum + (total.usd ?? 0), 0);
}

// --- Staked value -------------------------------------------------------------------------------

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** A keccak256 incentive id — the only shape inlined into a subgraph query. */
export function isIncentiveId(value: string): boolean {
	return /^0x[0-9a-f]{64}$/.test(value);
}

/** A V3 subgraph `Stake` row. Rows outlive unstake and withdraw, so each one is only a candidate. */
export interface SubgraphStakeRow {
	deposit: { id: string; owner: string };
	incentive: { id: string };
}

export interface StakeCandidate {
	tokenId: bigint;
	incentiveId: string;
}

/**
 * Stake rows worth checking on-chain: one per token + listed incentive, skipping withdrawn deposits
 * (owner 0x0 — the staker only lets a deposit be withdrawn once it holds no stakes).
 */
export function stakeCandidates(rows: SubgraphStakeRow[], incentiveIds: string[]): StakeCandidate[] {
	const wanted = new Set(incentiveIds.map((id) => id.toLowerCase()));
	const seen = new Set<string>();
	const candidates: StakeCandidate[] = [];
	for (const row of rows) {
		const incentiveId = row.incentive.id.toLowerCase();
		const tokenId = row.deposit.id;
		const key = `${tokenId}-${incentiveId}`;
		if (!wanted.has(incentiveId) || !/^\d+$/.test(tokenId) || row.deposit.owner.toLowerCase() === ZERO_ADDRESS || seen.has(key)) {
			continue;
		}
		seen.add(key);
		candidates.push({ tokenId: BigInt(tokenId), incentiveId });
	}
	return candidates;
}

/** The fields of the staker's `deposits(tokenId)` the valuation needs. */
export interface DepositRead {
	owner: string;
	tickLower: number;
	tickUpper: number;
}

/** A position the V3 staker confirms is staked in an incentive right now. */
export interface StakedPosition {
	tokenId: bigint;
	incentiveId: string;
	pool: string;
	owner: string;
	liquidity: bigint;
	tickLower: number;
	tickUpper: number;
}

/**
 * The candidates the staker still holds: `stakes(tokenId, incentiveId)` liquidity is non-zero and the
 * deposit has an owner. `liquidities[i]` answers `candidates[i]`; `poolOf` maps incentive id → pool.
 */
export function confirmStakedPositions(
	candidates: StakeCandidate[],
	liquidities: bigint[],
	deposits: Map<bigint, DepositRead>,
	poolOf: Record<string, string>,
): StakedPosition[] {
	const positions: StakedPosition[] = [];
	candidates.forEach((candidate, index) => {
		const liquidity = liquidities[index] ?? 0n;
		const deposit = deposits.get(candidate.tokenId);
		const pool = poolOf[candidate.incentiveId];
		if (liquidity === 0n || !deposit || deposit.owner.toLowerCase() === ZERO_ADDRESS || !pool) return;
		positions.push({
			tokenId: candidate.tokenId,
			incentiveId: candidate.incentiveId,
			pool: pool.toLowerCase(),
			owner: deposit.owner.toLowerCase(),
			liquidity,
			tickLower: deposit.tickLower,
			tickUpper: deposit.tickUpper,
		});
	});
	return positions;
}

export interface FarmPoolToken {
	id: string;
	symbol: string;
	decimals: number;
}

export interface FarmPool {
	id: string;
	sqrtPrice: bigint;
	token0: FarmPoolToken;
	token1: FarmPoolToken;
}

/** A V3 subgraph `Pool` row (BigInt fields arrive as strings). */
export interface SubgraphFarmPoolRow {
	id: string;
	sqrtPrice: string;
	token0: { id: string; symbol: string; decimals: string };
	token1: { id: string; symbol: string; decimals: string };
}

const toPoolToken = (token: SubgraphFarmPoolRow['token0']): FarmPoolToken => ({
	id: token.id.toLowerCase(),
	symbol: token.symbol,
	decimals: Number(token.decimals),
});

/** Subgraph pool rows keyed by lowercase pool address. */
export function toFarmPools(rows: SubgraphFarmPoolRow[]): Record<string, FarmPool> {
	const pools: Record<string, FarmPool> = {};
	for (const row of rows) {
		const id = row.id.toLowerCase();
		pools[id] = { id, sqrtPrice: BigInt(row.sqrtPrice), token0: toPoolToken(row.token0), token1: toPoolToken(row.token1) };
	}
	return pools;
}

/** Current USD value of one staked position; null when its pool or a price it needs is unknown. */
export function stakedPositionUsd(position: StakedPosition, pool: FarmPool | undefined, prices: UsdPriceMap): number | null {
	if (!pool) return null;
	const { amount0, amount1 } = getPositionTokenAmounts(position.liquidity, pool.sqrtPrice, position.tickLower, position.tickUpper);
	return amountsUsd(
		amount0,
		amount1,
		pool.token0.decimals,
		pool.token1.decimals,
		prices[pool.token0.id] ?? null,
		prices[pool.token1.id] ?? null,
	);
}

const addUsd = (sum: number | null, value: number | null): number | null => (sum === null || value === null ? null : sum + value);

export interface IncentiveStakeValue {
	/** USD of every position staked in the farm; null while unknown, incomplete or unpriced. */
	totalUsd: number | null;
	/** USD of the owner's staked positions in the farm; 0 when they have none, null when unknown or unpriced. */
	userUsd: number | null;
	/** Token IDs of the owner's positions staked in the farm. */
	userTokenIds: bigint[];
}

/**
 * Staked value per farm, keyed by lowercase incentive id. `positions` is null until the on-chain check
 * answers. A farm whose confirmed positions don't match the staker's own `numberOfStakes` (the subgraph
 * is still indexing) gets a null total instead of an understated one.
 */
export function stakeValuesByIncentive(
	incentives: Array<Pick<V3Incentive, 'incentiveId' | 'numberOfStakes'>>,
	positions: StakedPosition[] | null,
	pools: Record<string, FarmPool>,
	prices: UsdPriceMap,
	owner?: string,
): Record<string, IncentiveStakeValue> {
	const me = owner?.toLowerCase();
	const values: Record<string, IncentiveStakeValue> = {};
	for (const incentive of incentives) {
		const id = incentive.incentiveId.toLowerCase();
		if (incentive.numberOfStakes === 0) {
			values[id] = { totalUsd: 0, userUsd: 0, userTokenIds: [] };
			continue;
		}
		if (positions === null) {
			values[id] = { totalUsd: null, userUsd: null, userTokenIds: [] };
			continue;
		}
		const staked = positions.filter((position) => position.incentiveId === id);
		const mine = me ? staked.filter((position) => position.owner === me) : [];
		const sum = (list: StakedPosition[]) =>
			list.reduce<number | null>((total, position) => addUsd(total, stakedPositionUsd(position, pools[position.pool], prices)), 0);
		values[id] = {
			totalUsd: staked.length === incentive.numberOfStakes ? sum(staked) : null,
			userUsd: sum(mine),
			userTokenIds: mine.map((position) => position.tokenId),
		};
	}
	return values;
}

/**
 * Order in which to look for a wallet's staked position: the token IDs already known to be staked
 * first (de-duplicated), then 1..maxCheck without repeating any of them.
 */
export function tokenIdScanOrder(knownTokenIds: bigint[], maxCheck: number): bigint[] {
	const seen = new Set<bigint>();
	const order: bigint[] = [];
	const add = (tokenId: bigint) => {
		if (tokenId <= 0n || seen.has(tokenId)) return;
		seen.add(tokenId);
		order.push(tokenId);
	};
	knownTokenIds.forEach(add);
	for (let i = 1; i <= maxCheck; i++) add(BigInt(i));
	return order;
}

/**
 * USD of every distinct staked NFT across farms — one NFT staked in two farms counts once. Null when
 * any farm's total is unknown or any position is unpriced.
 */
export function totalStakedUsd(
	byIncentive: Record<string, IncentiveStakeValue>,
	positions: StakedPosition[],
	pools: Record<string, FarmPool>,
	prices: UsdPriceMap,
): number | null {
	if (Object.values(byIncentive).some((value) => value.totalUsd === null)) return null;
	const unique = new Map<bigint, StakedPosition>();
	for (const position of positions) unique.set(position.tokenId, position);
	let sum: number | null = 0;
	for (const position of unique.values()) sum = addUsd(sum, stakedPositionUsd(position, pools[position.pool], prices));
	return sum;
}

/** Staked-value-weighted APR of the farms that have an APR and a positive staked value; null when none do. */
export function weightedAverageApr(farms: Array<{ apr: number | null; stakedUsd: number | null }>): number | null {
	let weight = 0;
	let weighted = 0;
	for (const farm of farms) {
		if (farm.apr === null || farm.stakedUsd === null || farm.stakedUsd <= 0) continue;
		weight += farm.stakedUsd;
		weighted += farm.apr * farm.stakedUsd;
	}
	return weight > 0 ? weighted / weight : null;
}
