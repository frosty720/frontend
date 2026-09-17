/**
 * Protocol-owned liquidity valuation (ported from kaly-vault lib/chain/pol.ts). Token amounts come
 * from KalySwap's own V3 math instead of @uniswap/v3-sdk.
 */
import { getPositionTokenAmounts } from '@/utils/v3-math';

/**
 * USD per KMT from a WKMT/stable V3 pool's slot0, with the stable at its $1 peg. All scaling is
 * done in bigint (×1e18) before the one float conversion so the huge sqrtPriceX96 keeps precision.
 */
export function kmtUsdFromSlot0(args: { sqrtPriceX96: bigint; stableIsToken0: boolean; stableDecimals: number }): number {
	if (args.sqrtPriceX96 <= 0n) return 0;
	const dec0 = args.stableIsToken0 ? args.stableDecimals : 18;
	const dec1 = args.stableIsToken0 ? 18 : args.stableDecimals;
	const Q96 = 2n ** 96n;
	const numerator = args.sqrtPriceX96 * args.sqrtPriceX96 * 10n ** BigInt(dec0) * 10n ** 18n;
	const denominator = Q96 * Q96 * 10n ** BigInt(dec1);
	const humanPrice = Number(numerator / denominator) / 1e18;
	if (!Number.isFinite(humanPrice) || humanPrice <= 0) return 0;
	// stable = token0: the price is KMT per stable, so invert; stable = token1: already USD per KMT.
	return args.stableIsToken0 ? 1 / humanPrice : humanPrice;
}

export interface PolPositionInput {
	liquidity: bigint;
	sqrtPriceX96: bigint;
	tickLower: number;
	tickUpper: number;
	stableIsToken0: boolean;
	stableDecimals: number;
}

/** Mark-to-market USD value of one WKMT/stable position at its own pool's spot price. */
export function polPositionUsd(p: PolPositionInput): number {
	const { amount0, amount1 } = getPositionTokenAmounts(p.liquidity, p.sqrtPriceX96, p.tickLower, p.tickUpper);
	const stableRaw = p.stableIsToken0 ? amount0 : amount1;
	const kmtRaw = p.stableIsToken0 ? amount1 : amount0;
	const kmtUsd = kmtUsdFromSlot0({ sqrtPriceX96: p.sqrtPriceX96, stableIsToken0: p.stableIsToken0, stableDecimals: p.stableDecimals });
	return Number(stableRaw) / 10 ** p.stableDecimals + (Number(kmtRaw) / 1e18) * kmtUsd;
}

export interface PolPoint {
	/** Unix seconds. */
	t: number;
	usd: number;
}

/** Cumulative POL added over time (USD at deposit): the POL share of every purchase, in order. */
export function cumulativePol(purchases: { paidUsd: number; t: number }[], polShare: number): PolPoint[] {
	let cum = 0;
	return purchases.map(({ paidUsd, t }) => {
		cum += paidUsd * polShare;
		return { t, usd: Math.round(cum * 100) / 100 };
	});
}
