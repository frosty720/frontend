import { formatUnits, parseUnits } from 'viem';
import type { Formatter } from '@/i18n/format';

/**
 * A typed amount in a token's decimals, or null when the field is empty or not a plain positive
 * decimal with at most `decimals` fraction digits (a USDT amount cannot carry a 7th decimal).
 */
export function parseAmount(input: string, decimals: number): bigint | null {
	const value = input.trim();
	if (!/^\d*\.?\d*$/.test(value) || value === '' || value === '.') return null;
	const fraction = value.split('.')[1] ?? '';
	if (fraction.length > decimals) return null;
	return parseUnits(value, decimals);
}

/** Display a token amount in the reader's number format. */
export function showAmount(value: bigint, decimals: number, fmt: Formatter, maxFraction = 4): string {
	return fmt.number(Number(formatUnits(value, decimals)), { maximumFractionDigits: maxFraction });
}

/** The exact decimal string of an amount, for filling an input with "Max" without rounding. */
export function exactAmount(value: bigint, decimals: number): string {
	return formatUnits(value, decimals);
}
