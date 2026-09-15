import type { V3Position as ServicePosition } from '@/services/dex/IV3DexService';
import type { UsdPriceMap } from '@/hooks/useTokenUsdPrices';
import { amountsUsd } from '@/utils/dashboard';
import { getPositionTokenAmounts } from '@/utils/v3-math';

interface PoolTokenRef {
	id: string;
	decimals: string;
}

interface PoolPriceRef {
	sqrtPrice: string;
	token0: PoolTokenRef;
	token1: PoolTokenRef;
}

/** Fee APR from the last 24 h: fees annualised over current TVL, in percent. Null when TVL is 0. */
export function poolApr(fees24hUsd: number, tvlUsd: number): number | null {
	if (!(tvlUsd > 0)) return null;
	return (fees24hUsd * 365 * 100) / tvlUsd;
}

/** Current USD value of one of the wallet's positions (on-chain position + subgraph pool price). */
export function servicePositionUsd(position: ServicePosition, pool: PoolPriceRef, prices: UsdPriceMap): number | null {
	if (!pool.sqrtPrice) return null;
	const { amount0, amount1 } = getPositionTokenAmounts(position.liquidity, BigInt(pool.sqrtPrice), position.tickLower, position.tickUpper);
	return amountsUsd(
		amount0,
		amount1,
		Number(pool.token0.decimals),
		Number(pool.token1.decimals),
		prices[pool.token0.id.toLowerCase()] ?? null,
		prices[pool.token1.id.toLowerCase()] ?? null,
	);
}

/** Pool fields the wallet LP summary needs (a `V3PoolData` from `useV3PoolDiscovery` fits). */
interface WalletLpPool extends PoolPriceRef {
	id: string;
	feeTier: string;
	token0: PoolTokenRef & { symbol: string };
	token1: PoolTokenRef & { symbol: string };
	userPositions: ServicePosition[];
}

export interface WalletLpRow {
	poolId: string;
	pair: string;
	feeTier: number;
	valueUsd: number;
	unclaimedFeesUsd: number;
}

/**
 * The wallet's liquidity per pool, from its on-chain positions valued at the pool's current price, plus
 * the fees it can collect now (`tokensOwed`). Positions with no liquidity and nothing owed are skipped;
 * like the Pools table, an unpriced token counts as 0.
 */
export function walletLpRows(pools: WalletLpPool[], prices: UsdPriceMap): WalletLpRow[] {
	return pools.flatMap((pool) => {
		const held = pool.userPositions.filter((position) => position.liquidity > 0n || position.tokensOwed0 > 0n || position.tokensOwed1 > 0n);
		if (held.length === 0) return [];
		const price0 = prices[pool.token0.id.toLowerCase()] ?? null;
		const price1 = prices[pool.token1.id.toLowerCase()] ?? null;
		const decimals0 = Number(pool.token0.decimals);
		const decimals1 = Number(pool.token1.decimals);
		return [{
			poolId: pool.id,
			pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
			feeTier: Number(pool.feeTier),
			valueUsd: held.reduce((sum, position) => sum + (servicePositionUsd(position, pool, prices) ?? 0), 0),
			unclaimedFeesUsd: held.reduce(
				(sum, position) => sum + (amountsUsd(position.tokensOwed0, position.tokensOwed1, decimals0, decimals1, price0, price1) ?? 0),
				0,
			),
		}];
	});
}

export type PositionState = 'closed' | 'open' | 'inRange' | 'outOfRange';

/** Where a position sits: withdrawn (may still owe fees), or in/out of range at the current tick. */
export function positionState(position: ServicePosition, currentTick: number | null): PositionState {
	if (position.liquidity === 0n) return 'closed';
	if (currentTick === null || Number.isNaN(currentTick)) return 'open';
	return currentTick >= position.tickLower && currentTick < position.tickUpper ? 'inRange' : 'outOfRange';
}

export type PoolSortKey = 'tvl' | 'apr' | 'volume';
export type PoolSortOrder = 'asc' | 'desc';

interface SortablePool {
	id: string;
	totalValueLockedUSD: string;
}

export interface Pool24hStatsMap {
	[poolId: string]: { volumeUsd: number; feesUsd: number };
}

/**
 * Sort pools by TVL, 24 h fee APR or 24 h volume. A pool with zero TVL has no defined APR
 * (dividing by zero) and values at -1, so it always ranks below a real 0% pool.
 */
export function sortPools<T extends SortablePool>(pools: T[], key: PoolSortKey, order: PoolSortOrder, stats24h: Pool24hStatsMap): T[] {
	const valueOf = (pool: T): number => {
		const tvl = Number(pool.totalValueLockedUSD) || 0;
		const stats = stats24h[pool.id.toLowerCase()];
		if (key === 'volume') return stats?.volumeUsd ?? 0;
		if (key === 'apr') return poolApr(stats?.feesUsd ?? 0, tvl) ?? -1;
		return tvl;
	};
	const sign = order === 'asc' ? 1 : -1;
	return [...pools].sort((a, b) => (valueOf(a) - valueOf(b)) * sign);
}

export type PoolFilterMode = 'all' | 'mine';

interface OwnedPool {
	userHasPosition: boolean;
}

/** "My pools" keeps only pools the wallet holds a position in; "all" passes the list through unchanged. */
export function filterPoolsByOwnership<T extends OwnedPool>(pools: T[], mode: PoolFilterMode): T[] {
	return mode === 'mine' ? pools.filter((pool) => pool.userHasPosition) : pools;
}

interface CompositionPool {
	token0: { symbol: string };
	token1: { symbol: string };
	totalValueLockedToken0: string;
	totalValueLockedToken1: string;
	txCount: string;
}

export interface PoolComposition {
	amount0: number;
	symbol0: string;
	amount1: number;
	symbol1: string;
	txCount: number;
}

/** Parsed, display-ready numbers for a pool's composition line — guards against non-numeric subgraph strings. */
export function poolComposition(pool: CompositionPool): PoolComposition {
	const num = (value: string): number => {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	};
	return {
		amount0: num(pool.totalValueLockedToken0),
		symbol0: pool.token0.symbol,
		amount1: num(pool.totalValueLockedToken1),
		symbol1: pool.token1.symbol,
		txCount: num(pool.txCount),
	};
}
