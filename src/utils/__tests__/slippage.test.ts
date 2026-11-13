import { describe, expect, it } from 'vitest';
import { parseUnits } from 'viem';
import { minimumOut, minimumOutDecimal } from '../slippage';

describe('minimumOut', () => {
	it('takes slippage off in basis points, rounding down', () => {
		expect(minimumOut('2.5', 18, 0.5)).toBe(2_487_500_000_000_000_000n);
		expect(minimumOut('100', 6, 1)).toBe(99_000_000n);
		expect(minimumOut('0.000001', 6, 0.5)).toBe(0n);
		expect(minimumOut('0.000003', 6, 50)).toBe(1n);
	});

	it('handles outputs too small for a float string, with no noise', () => {
		expect(minimumOut('0.000000000000000123', 18, 0.5)).toBe(122n);
		expect(minimumOut('1', 18, 0)).toBe(10n ** 18n);
	});
});

describe('minimumOutDecimal', () => {
	it('matches the float result for ordinary amounts', () => {
		expect(minimumOutDecimal('100', 5)).toBe('95');
		expect(minimumOutDecimal('100.0', 0.5)).toBe('99.5');
		expect(minimumOutDecimal('150', 0.5)).toBe('149.25');
	});

	it('never returns an exponent string for tiny outputs', () => {
		const min = minimumOutDecimal('0.0000001', 0.5);
		expect(min).toBe('0.0000000995');
		expect(() => parseUnits(min, 18)).not.toThrow();
	});

	it('keeps precision beyond 18 places when the amount carries it', () => {
		expect(minimumOutDecimal('0.00000000000000000020', 50)).toBe('0.0000000000000000001');
	});
});
