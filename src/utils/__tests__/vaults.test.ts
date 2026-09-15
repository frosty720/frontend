import { describe, it, expect } from 'vitest';
import { countByTier, sumDeposited } from '../vaults';

describe('countByTier / sumDeposited', () => {
	it('counts live vaults per tier', () => {
		const counts = countByTier([0, 1, 1, 7, 1]);
		expect(counts.get(0)).toBe(1);
		expect(counts.get(1)).toBe(3);
		expect(counts.get(7)).toBe(1);
	});

	it('prices each tier by its own price', () => {
		const prices = new Map([[0, 50], [1, 100], [7, 100_000]]);
		expect(sumDeposited(countByTier([0, 1, 1, 7]), prices)).toBe(50 + 200 + 100_000);
	});

	it('ignores tiers it has no price for instead of guessing', () => {
		expect(sumDeposited(countByTier([3, 3]), new Map([[0, 50]]))).toBe(0);
		expect(sumDeposited(new Map(), new Map([[0, 50]]))).toBe(0);
	});
});
