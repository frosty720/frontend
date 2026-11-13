import { formatUnits, parseUnits } from 'viem';

/**
 * The least a swap may deliver: `amountOut` (a decimal string) less `slippagePct`, in base units.
 * Integer basis-point math, so tiny outputs never turn into exponent strings and no float noise creeps in.
 */
export function minimumOut(amountOut: string, decimals: number, slippagePct: number): bigint {
	const slippageBps = BigInt(Math.round(slippagePct * 100));
	return (parseUnits(amountOut, decimals) * (10_000n - slippageBps)) / 10_000n;
}

/** Scale used when the token's decimals are unknown: at least 18 places, more if `amountOut` carries more. */
function decimalScale(amountOut: string): number {
	const fraction = amountOut.split('.')[1] ?? '';
	return Math.max(fraction.length, 18);
}

/** `minimumOut` as a plain decimal string, for callers that only have the amount, not the token's decimals. */
export function minimumOutDecimal(amountOut: string, slippagePct: number): string {
	const scale = decimalScale(amountOut);
	return formatUnits(minimumOut(amountOut, scale, slippagePct), scale);
}
