import { describe, it, expect } from 'vitest';
import { cumulativePol, kmtUsdFromSlot0, polPositionUsd } from '../vaultPol';
import { getSqrtRatioAtTick } from '../v3-math';

const Q96 = 2n ** 96n;

describe('kmtUsdFromSlot0', () => {
	it('returns 1.0 at price 1 with the stable as token0', () => {
		expect(kmtUsdFromSlot0({ sqrtPriceX96: Q96, stableIsToken0: true, stableDecimals: 18 })).toBeCloseTo(1, 9);
	});

	it('handles USDT(6, token0)/WKMT(18, token1): 1000 KMT per USDT → $0.001', () => {
		// raw price = 1e21 / 1e6 = 1e15 → sqrtPriceX96 = sqrt(1e15) · 2^96
		expect(kmtUsdFromSlot0({ sqrtPriceX96: 2505414483750479185640894519903780864n, stableIsToken0: true, stableDecimals: 6 })).toBeCloseTo(0.001, 6);
	});

	it('reads USD per KMT directly when the stable is token1', () => {
		expect(kmtUsdFromSlot0({ sqrtPriceX96: 2n ** 97n, stableIsToken0: false, stableDecimals: 18 })).toBeCloseTo(4, 6);
	});

	it('returns 0 for an empty pool', () => {
		expect(kmtUsdFromSlot0({ sqrtPriceX96: 0n, stableIsToken0: true, stableDecimals: 6 })).toBe(0);
	});
});

describe('polPositionUsd', () => {
	it('values a full-range position as stable at $1 plus KMT at its pool spot', () => {
		// 18/18 decimals at price 1 (sqrt = 2^96): a full-range position holds ~equal raw amounts of each,
		// both worth $1 each, so the value is 2 × the stable side.
		const usd = polPositionUsd({ liquidity: 10n ** 18n, sqrtPriceX96: Q96, tickLower: -887220, tickUpper: 887220, stableIsToken0: true, stableDecimals: 18 });
		expect(usd).toBeGreaterThan(1.99);
		expect(usd).toBeLessThan(2.01);
	});

	it('counts only the stable side for a position entirely below the price (stable token1)', () => {
		// Current tick 0, range [-1200, -600]: all liquidity sits in token1 (the stable).
		const lower = -1200;
		const upper = -600;
		const liquidity = 10n ** 20n;
		const expectedStable = Number((liquidity * (getSqrtRatioAtTick(upper) - getSqrtRatioAtTick(lower))) / Q96) / 1e18;
		const usd = polPositionUsd({ liquidity, sqrtPriceX96: Q96, tickLower: lower, tickUpper: upper, stableIsToken0: false, stableDecimals: 18 });
		expect(usd).toBeCloseTo(expectedStable, 9);
	});

	it('is zero for a closed position', () => {
		expect(polPositionUsd({ liquidity: 0n, sqrtPriceX96: Q96, tickLower: -60, tickUpper: 60, stableIsToken0: true, stableDecimals: 6 })).toBe(0);
	});
});

describe('cumulativePol', () => {
	it('accumulates the POL share of each purchase in order', () => {
		expect(cumulativePol([{ paidUsd: 100, t: 1 }, { paidUsd: 50, t: 2 }, { paidUsd: 1_000, t: 3 }], 0.8)).toEqual([
			{ t: 1, usd: 80 },
			{ t: 2, usd: 120 },
			{ t: 3, usd: 920 },
		]);
	});
});
