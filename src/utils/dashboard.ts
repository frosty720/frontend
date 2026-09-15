import type { Token } from '@/config/dex/types';
import type { UsdPriceMap } from '@/hooks/useTokenUsdPrices';
import type { ChangeMap } from '@/hooks/useToken24hChanges';
import { getEffectiveAddress } from '@/utils/tokens';
import { getPositionTokenAmounts } from '@/utils/v3-math';

export interface AssetRow {
	token: Token;
	balance: number;
	price: number | null;
	value: number | null;
	change24h: number | null;
}

/** Wallet rows for "My assets": held tokens only, most valuable first, unpriced tokens last. */
export function buildAssetRows(
	tokens: Token[],
	balanceOf: (token: Token) => number,
	prices: UsdPriceMap,
	changes: ChangeMap,
): AssetRow[] {
	return tokens
		.map((token) => {
			const key = getEffectiveAddress(token).toLowerCase();
			const balance = balanceOf(token);
			const price = prices[key] ?? null;
			return { token, balance, price, value: price !== null ? balance * price : null, change24h: changes[key] ?? null };
		})
		.filter((row) => row.balance > 0)
		.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.balance - a.balance);
}

export function sumValues(rows: AssetRow[]): number {
	return rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
}

/** Value-weighted 24 h change of the rows that have both a value and a change; null when none do. */
export function portfolioChange24h(rows: AssetRow[]): number | null {
	let total = 0;
	let weighted = 0;
	for (const row of rows) {
		if (row.value !== null && row.change24h !== null) {
			total += row.value;
			weighted += row.value * row.change24h;
		}
	}
	return total > 0 ? weighted / total : null;
}

/** USD value of two raw token amounts; null when a non-zero side has no price. */
export function amountsUsd(
	amount0: bigint,
	amount1: bigint,
	decimals0: number,
	decimals1: number,
	price0: number | null,
	price1: number | null,
): number | null {
	if ((amount0 > 0n && price0 === null) || (amount1 > 0n && price1 === null)) return null;
	return (Number(amount0) / 10 ** decimals0) * (price0 ?? 0) + (Number(amount1) / 10 ** decimals1) * (price1 ?? 0);
}


export interface DailyYieldInput {
	staking: { stakedKmt: number; kmtPrice: number | null; aprPct: number };
	/** Configured tier APRs; a matured vault has reached its ROI cap and earns nothing more. */
	vaults: Array<{ priceUsd: number; aprPct: number; matured: boolean }>;
}

/**
 * Estimated USD earned per day by positions with a known APR: staked KMT × KMT price × APR / 365,
 * plus each earning vault's tier price × tier APR / 365. Farms and LP fees have no APR here and are
 * not counted. Null when nothing can be estimated.
 */
export function estimateDailyYieldUsd({ staking, vaults }: DailyYieldInput): number | null {
	const parts: number[] = [];
	if (staking.stakedKmt > 0 && staking.kmtPrice !== null && staking.aprPct > 0) {
		parts.push((staking.stakedKmt * staking.kmtPrice * staking.aprPct) / 100 / 365);
	}
	for (const vault of vaults) {
		if (!vault.matured && vault.priceUsd > 0 && vault.aprPct > 0) parts.push((vault.priceUsd * vault.aprPct) / 100 / 365);
	}
	return parts.length > 0 ? parts.reduce((sum, part) => sum + part, 0) : null;
}

export type ClaimStep =
	| { kind: 'staking' }
	| { kind: 'farm'; token: string; amount: bigint }
	| { kind: 'vaults'; ids: bigint[] };

export interface ClaimPlanInput {
	stakingRewards: bigint;
	/** Pending farm rewards by reward-token address. */
	farmRewards: Record<string, bigint>;
	vaults: Array<{ id: bigint; earned: bigint }>;
}

/** Claim-all, in order: KMT staking, one claim per farm reward token, then every earning vault in one claimMany. */
export function planClaimSteps({ stakingRewards, farmRewards, vaults }: ClaimPlanInput): ClaimStep[] {
	const steps: ClaimStep[] = [];
	if (stakingRewards > 0n) steps.push({ kind: 'staking' });
	for (const [token, amount] of Object.entries(farmRewards)) {
		if (amount > 0n) steps.push({ kind: 'farm', token, amount });
	}
	const ids = vaults.filter((vault) => vault.earned > 0n).map((vault) => vault.id);
	if (ids.length > 0) steps.push({ kind: 'vaults', ids });
	return steps;
}

export type ClaimRunResult = { ok: true } | { ok: false; index: number; step: ClaimStep; error: unknown };

/** Runs the steps one after another and stops at the first one that throws. */
export async function runClaimSteps(
	steps: ClaimStep[],
	execute: (step: ClaimStep) => Promise<void>,
	onStep?: (index: number) => void,
): Promise<ClaimRunResult> {
	for (const [index, step] of steps.entries()) {
		onStep?.(index);
		try {
			await execute(step);
		} catch (error) {
			return { ok: false, index, step, error };
		}
	}
	return { ok: true };
}

/** USD value of what would be claimed; null when any non-zero part has no price. */
export function claimableUsd(parts: Array<{ amount: number; price: number | null }>): number | null {
	let total = 0;
	for (const { amount, price } of parts) {
		if (!(amount > 0)) continue;
		if (price === null) return null;
		total += amount * price;
	}
	return total;
}

/** A short, readable reason from a wallet / viem error (viem puts the one-liner in `shortMessage`). */
export function claimErrorMessage(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null && 'shortMessage' in error && typeof error.shortMessage === 'string') {
		return error.shortMessage;
	}
	return error instanceof Error ? error.message : undefined;
}

/**
 * Distinct swap origins across paginated pages. `fetchPage(cursor)` returns up to `pageSize` swaps
 * ordered by id with id > cursor. Stops on a short page, or after `maxPages` — then `capped` is
 * true and the count is a lower bound.
 */
export async function countTraders(
	fetchPage: (cursor: string) => Promise<Array<{ id: string; origin: string }>>,
	pageSize: number,
	maxPages: number,
): Promise<{ count: number; capped: boolean }> {
	const origins = new Set<string>();
	let cursor = '';
	for (let page = 0; page < maxPages; page++) {
		const swaps = await fetchPage(cursor);
		for (const swap of swaps) origins.add(swap.origin.toLowerCase());
		if (swaps.length < pageSize) return { count: origins.size, capped: false };
		cursor = swaps[swaps.length - 1].id;
	}
	return { count: origins.size, capped: true };
}
