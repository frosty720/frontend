/**
 * Maths for opening a V3 position from the add-liquidity page, where the user picks tokens in any
 * order (A, B) and reads prices as "B per A", while the pool orders tokens by address (token0 <
 * token1) and prices token1 per token0 in raw units. Every conversion here goes through that mapping.
 */
import { getPairedAmount, encodeSqrtRatioX96 } from '@/utils/v3-math';
import { MAX_TICK, MIN_TICK } from '@/config/dex/v3-constants';

/** TickMath bounds: a pool can only be initialised strictly inside these. */
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

const Q192 = 2n ** 192n;

/** Whether token A sorts first in the pool. Pass effective (wrapped-native) addresses. */
export function isTokenAToken0(addressA: string, addressB: string): boolean {
	return addressA.toLowerCase() < addressB.toLowerCase();
}

/** A positive decimal string as N / 10^d, or null if it isn't one. */
function parseDecimal(value: string): { n: bigint; d: number } | null {
	const trimmed = value.trim();
	if (!/^\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return null;
	const [whole = '', fraction = ''] = trimmed.split('.');
	const n = BigInt(`${whole}${fraction}` || '0');
	return n > 0n ? { n, d: fraction.length } : null;
}

/**
 * sqrtPriceX96 for a starting price of `price` B per A, exact (no floats). Null when the price is not
 * a positive number or lies outside what a pool can be initialised at.
 */
export function startingSqrtPriceX96(price: string, decimalsA: number, decimalsB: number, aIsToken0: boolean): bigint | null {
	const parsed = parseDecimal(price);
	if (!parsed) return null;
	// price = n / 10^d B per A → raw A side = 10^d · 10^decA, raw B side = n · 10^decB.
	const rawA = 10n ** BigInt(parsed.d + decimalsA);
	const rawB = parsed.n * 10n ** BigInt(decimalsB);
	const sqrtPriceX96 = aIsToken0 ? encodeSqrtRatioX96(rawA, rawB) : encodeSqrtRatioX96(rawB, rawA);
	return sqrtPriceX96 >= MIN_SQRT_RATIO && sqrtPriceX96 < MAX_SQRT_RATIO ? sqrtPriceX96 : null;
}

/** The pool's price as B per A in human units. */
export function priceBPerA(sqrtPriceX96: bigint, decimalsA: number, decimalsB: number, aIsToken0: boolean): number {
	if (sqrtPriceX96 <= 0n) return 0;
	const [decimals0, decimals1] = aIsToken0 ? [decimalsA, decimalsB] : [decimalsB, decimalsA];
	const scale = 10n ** 36n;
	// token1 per token0, human = raw · 10^(dec0 − dec1), scaled by 1e36 before the one float conversion.
	const numerator = sqrtPriceX96 * sqrtPriceX96 * 10n ** BigInt(decimals0) * scale;
	const denominator = Q192 * 10n ** BigInt(decimals1);
	const token1PerToken0 = Number(numerator / denominator) / 1e36;
	if (!Number.isFinite(token1PerToken0) || token1PerToken0 <= 0) return 0;
	return aIsToken0 ? token1PerToken0 : 1 / token1PerToken0;
}

/** Lowest and highest ticks usable at this spacing (a full-range position). */
export function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
	return { tickLower: Math.ceil(MIN_TICK / tickSpacing) * tickSpacing, tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing };
}

/** Nearest usable tick for a B-per-A price, clamped to the full range. */
function tickForPrice(price: number, decimalsA: number, decimalsB: number, aIsToken0: boolean, tickSpacing: number): number {
	const [decimals0, decimals1] = aIsToken0 ? [decimalsA, decimalsB] : [decimalsB, decimalsA];
	const token1PerToken0 = aIsToken0 ? price : 1 / price;
	const raw = token1PerToken0 * 10 ** (decimals1 - decimals0);
	const tick = Math.round(Math.log(raw) / Math.log(1.0001) / tickSpacing) * tickSpacing;
	const { tickLower, tickUpper } = fullRangeTicks(tickSpacing);
	return Math.min(Math.max(tick, tickLower), tickUpper);
}

/**
 * Ticks for a custom range given as min/max B per A. When A is token1 the price axis is inverted, so
 * the max price sets the lower tick. Null when either price is not positive or the range is empty.
 */
export function rangeTicks(
	minPrice: string,
	maxPrice: string,
	decimalsA: number,
	decimalsB: number,
	aIsToken0: boolean,
	tickSpacing: number,
): { tickLower: number; tickUpper: number } | null {
	const min = Number(minPrice);
	const max = Number(maxPrice);
	if (!(min > 0) || !(max > 0) || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
	const a = tickForPrice(min, decimalsA, decimalsB, aIsToken0, tickSpacing);
	const b = tickForPrice(max, decimalsA, decimalsB, aIsToken0, tickSpacing);
	const [tickLower, tickUpper] = a < b ? [a, b] : [b, a];
	return tickLower < tickUpper ? { tickLower, tickUpper } : null;
}

export type DepositSides = 'both' | 'onlyA' | 'onlyB';

/**
 * The other side's amount for a deposit typed on `side`, at the pool price and range, plus which
 * tokens the position takes: out of range it is single-sided and the other side is 0.
 */
export function pairDeposit(args: {
	sqrtPriceX96: bigint;
	tickLower: number;
	tickUpper: number;
	aIsToken0: boolean;
	side: 'A' | 'B';
	amount: bigint;
}): { paired: bigint; sides: DepositSides } {
	const inputIsToken0 = (args.side === 'A') === args.aIsToken0;
	const { pairedAmount, rangeStatus } = getPairedAmount({
		sqrtPriceX96: args.sqrtPriceX96,
		tickLower: args.tickLower,
		tickUpper: args.tickUpper,
		inputSide: inputIsToken0 ? 'token0' : 'token1',
		inputAmount: args.amount,
	});
	if (rangeStatus === 'in-range') return { paired: pairedAmount, sides: 'both' };
	// Below the range the position is all token0; above it, all token1.
	const onlyToken0 = rangeStatus === 'below';
	return { paired: 0n, sides: onlyToken0 === args.aIsToken0 ? 'onlyA' : 'onlyB' };
}

/** `amount` less a slippage allowance in basis points, rounded down. */
export function minimumAmount(amount: bigint, slippageBps: number): bigint {
	return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}
