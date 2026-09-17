import { describe, it, expect } from 'vitest';
import { countByTier, DEFAULT_FEE_SPLIT, purchaseAmount, splitPurchase, sumDeposited, vaultMaturity } from '../vaults';

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

describe('purchaseAmount', () => {
	it('scales the whole-USD price to the stable decimals exactly', () => {
		expect(purchaseAmount(50, 6)).toBe(50_000_000n);
		expect(purchaseAmount(100_000, 6)).toBe(100_000_000_000n);
		expect(purchaseAmount(1_000, 18)).toBe(1_000n * 10n ** 18n);
	});
});

describe('splitPurchase', () => {
	it('routes the default split: 80% POL, 10% affiliate, 2% dev, 8% DAO', () => {
		const split = splitPurchase(1_000, DEFAULT_FEE_SPLIT);
		expect(split).toEqual({ pol: 800, fees: 200, affiliate: 100, dev: 20, dao: 80, polPct: 80, feesPct: 20 });
	});

	it('follows a governed split change instead of assuming 80/20', () => {
		const split = splitPurchase(100, { n1Bps: 800, n2Bps: 400, n3Bps: 100, devBps: 300, daoBps: 400 });
		expect(split.fees).toBe(20);
		expect(split.affiliate).toBe(13);
		expect(split.pol).toBe(80);
		expect(split.pol + split.fees).toBe(100);
		expect(split.affiliate + split.dev + split.dao).toBeCloseTo(split.fees, 10);
	});
});

describe('vaultMaturity', () => {
	const E18 = 10n ** 18n;

	it('adds the unclaimed KMT at the contract price to the checkpointed USD', () => {
		// $30 checkpointed + 100 KMT unclaimed at $0.20 = $50 of a $200 cap → 25%.
		const m = vaultMaturity({ earnedUsd: 30n * E18, earnedKmtWei: 100n * E18, klcUsdPrice: E18 / 5n, capUsd: 200n * E18, maturedFlag: false });
		expect(m).toEqual({ pct: 25, matured: false });
	});

	it('is matured once live earnings reach the cap, before the on-chain flag flips', () => {
		const m = vaultMaturity({ earnedUsd: 150n * E18, earnedKmtWei: 1_000n * E18, klcUsdPrice: E18 / 5n, capUsd: 200n * E18, maturedFlag: false });
		expect(m).toEqual({ pct: 100, matured: true });
	});

	it('trusts the on-chain matured flag and reads 0% without a cap', () => {
		expect(vaultMaturity({ earnedUsd: 0n, earnedKmtWei: 0n, klcUsdPrice: E18, capUsd: 0n, maturedFlag: true })).toEqual({ pct: 0, matured: true });
		expect(vaultMaturity({ earnedUsd: 5n * E18, earnedKmtWei: 0n, klcUsdPrice: E18, capUsd: 0n, maturedFlag: false })).toEqual({ pct: 0, matured: false });
	});

	it('keeps two decimals of progress', () => {
		const m = vaultMaturity({ earnedUsd: 1n * E18, earnedKmtWei: 0n, klcUsdPrice: E18, capUsd: 3n * E18, maturedFlag: false });
		expect(m.pct).toBe(33.33);
	});
});
