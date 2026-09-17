import { describe, it, expect } from 'vitest';
import {
	fullRangeTicks,
	isTokenAToken0,
	MAX_SQRT_RATIO,
	MIN_SQRT_RATIO,
	minimumAmount,
	pairDeposit,
	priceBPerA,
	rangeTicks,
	startingSqrtPriceX96,
} from '../newPosition';
import { getSqrtRatioAtTick } from '../v3-math';

const Q96 = 2n ** 96n;
// Live 3890 pool: USDT (6 dec, token0) / WKMT (18 dec, token1).
const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172';
const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b';
const LIVE_SQRT = 175651280628475597865072411508591304n;

describe('isTokenAToken0', () => {
	it('orders by address, case-insensitively', () => {
		expect(isTokenAToken0(USDT, WKMT)).toBe(true);
		expect(isTokenAToken0(WKMT.toUpperCase(), USDT)).toBe(false);
	});
});

describe('startingSqrtPriceX96 / priceBPerA', () => {
	it('encodes price 1 between equal-decimal tokens as exactly 2^96, in either order', () => {
		expect(startingSqrtPriceX96('1', 18, 18, true)).toBe(Q96);
		expect(startingSqrtPriceX96('1', 18, 18, false)).toBe(Q96);
	});

	it('round-trips a price in both token orders and across decimals', () => {
		for (const aIsToken0 of [true, false]) {
			for (const [decA, decB] of [[6, 18], [18, 6], [18, 18]]) {
				const sqrt = startingSqrtPriceX96('0.2034', decA, decB, aIsToken0)!;
				expect(priceBPerA(sqrt, decA, decB, aIsToken0)).toBeCloseTo(0.2034, 8);
			}
		}
	});

	it('inverts when A sorts second: 4 B per A is price 1/4 token1 per token0', () => {
		// A is token1, B is token0 → token1/token0 = A per B = 0.25 → sqrt = 2^96 / 2.
		expect(startingSqrtPriceX96('4', 18, 18, false)).toBe(Q96 / 2n);
		expect(startingSqrtPriceX96('4', 18, 18, true)).toBe(Q96 * 2n);
	});

	it('reads the live USDT/WKMT pool as ~0.2 USDT per KMT and ~4.9 KMT per USDT', () => {
		const usdtPerKmt = priceBPerA(LIVE_SQRT, 18, 6, false); // A = WKMT (token1), B = USDT
		expect(usdtPerKmt).toBeGreaterThan(0.15);
		expect(usdtPerKmt).toBeLessThan(0.3);
		expect(priceBPerA(LIVE_SQRT, 6, 18, true)).toBeCloseTo(1 / usdtPerKmt, 6);
	});

	it('rejects non-numbers, zero and prices a pool cannot be initialised at', () => {
		for (const bad of ['', '.', 'abc', '-1', '0', '0.000', '1e5', '1,5']) {
			expect(startingSqrtPriceX96(bad, 18, 18, true)).toBeNull();
		}
		expect(startingSqrtPriceX96('1' + '0'.repeat(60), 18, 18, true)).toBeNull();
		expect(startingSqrtPriceX96('0.' + '0'.repeat(60) + '1', 18, 18, true)).toBeNull();
		const edge = startingSqrtPriceX96('0.000000000001', 18, 18, true)!;
		expect(edge >= MIN_SQRT_RATIO && edge < MAX_SQRT_RATIO).toBe(true);
	});
});

describe('rangeTicks', () => {
	it('maps min/max price to lower/upper ticks when A is token0', () => {
		const ticks = rangeTicks('0.5', '2', 18, 18, true, 60)!;
		expect(ticks.tickLower).toBeLessThan(0);
		expect(ticks.tickUpper).toBeGreaterThan(0);
		expect(Math.abs(ticks.tickLower % 60)).toBe(0);
		expect(Math.abs(ticks.tickUpper % 60)).toBe(0);
		// 1.0001^tick ≈ price
		expect(1.0001 ** ticks.tickLower).toBeCloseTo(0.5, 1);
		expect(1.0001 ** ticks.tickUpper).toBeCloseTo(2, 1);
	});

	it('flips the axis when A is token1: the max B-per-A price sets the lower tick', () => {
		const ticks = rangeTicks('0.5', '2', 18, 18, false, 60)!;
		// token1/token0 = 1/price → range [0.5, 2] inverts to [0.5, 2] again; check with an asymmetric one.
		expect(ticks.tickLower).toBeLessThan(ticks.tickUpper);
		const asym = rangeTicks('1', '4', 18, 18, false, 60)!;
		expect(1.0001 ** asym.tickLower).toBeCloseTo(0.25, 1);
		expect(1.0001 ** asym.tickUpper).toBeCloseTo(1, 1);
	});

	it('accounts for decimals: 0.1–0.3 USDT per KMT brackets the live pool price', () => {
		const ticks = rangeTicks('0.1', '0.3', 18, 6, false, 60)!; // A = WKMT (token1)
		expect(getSqrtRatioAtTick(ticks.tickLower) < LIVE_SQRT).toBe(true);
		expect(getSqrtRatioAtTick(ticks.tickUpper) > LIVE_SQRT).toBe(true);
	});

	it('rejects empty, inverted and non-positive ranges and clamps to the usable bounds', () => {
		expect(rangeTicks('2', '1', 18, 18, true, 60)).toBeNull();
		expect(rangeTicks('1', '1', 18, 18, true, 60)).toBeNull();
		expect(rangeTicks('0', '1', 18, 18, true, 60)).toBeNull();
		expect(rangeTicks('x', '1', 18, 18, true, 60)).toBeNull();
		// Two prices inside one tick spacing collapse to the same tick.
		expect(rangeTicks('1', '1.00001', 18, 18, true, 200)).toBeNull();
		// 1e-45 … 1e45 lies beyond the tick bounds (1.0001^±887272 ≈ 1e±38.5).
		const wide = rangeTicks('0.' + '0'.repeat(44) + '1', '1' + '0'.repeat(45), 18, 18, true, 60)!;
		expect(wide).toEqual(fullRangeTicks(60));
	});
});

describe('fullRangeTicks', () => {
	it('snaps inward to the tier spacing', () => {
		expect(fullRangeTicks(60)).toEqual({ tickLower: -887220, tickUpper: 887220 });
		expect(fullRangeTicks(200)).toEqual({ tickLower: -887200, tickUpper: 887200 });
		expect(fullRangeTicks(1)).toEqual({ tickLower: -887272, tickUpper: 887272 });
	});
});

describe('pairDeposit', () => {
	const full = fullRangeTicks(60);

	it('pairs 1:1 at price 1 over the full range whichever side is typed', () => {
		const one = 10n ** 18n;
		for (const aIsToken0 of [true, false]) {
			for (const side of ['A', 'B'] as const) {
				const { paired, sides } = pairDeposit({ sqrtPriceX96: Q96, ...full, aIsToken0, side, amount: one });
				expect(sides).toBe('both');
				expect(Number(paired) / 1e18).toBeCloseTo(1, 6);
			}
		}
	});

	it('pairs in the typed token’s own units when A sorts second', () => {
		// A = WKMT (token1), B = USDT (token0). 100 KMT at ~0.2 USDT should need ~20 USDT (6 dec).
		const { paired, sides } = pairDeposit({ sqrtPriceX96: LIVE_SQRT, ...full, aIsToken0: false, side: 'A', amount: 100n * 10n ** 18n });
		expect(sides).toBe('both');
		const usdt = Number(paired) / 1e6;
		const expected = 100 * priceBPerA(LIVE_SQRT, 18, 6, false);
		expect(usdt).toBeCloseTo(expected, 2);
	});

	it('is single-sided out of range and names the token that is deposited', () => {
		// Price 1 (tick 0). Range above the price → position is all token0.
		const above = { tickLower: 600, tickUpper: 1200 };
		expect(pairDeposit({ sqrtPriceX96: Q96, ...above, aIsToken0: true, side: 'A', amount: 5n })).toEqual({ paired: 0n, sides: 'onlyA' });
		expect(pairDeposit({ sqrtPriceX96: Q96, ...above, aIsToken0: false, side: 'A', amount: 5n })).toEqual({ paired: 0n, sides: 'onlyB' });
		// Range below the price → all token1.
		const below = { tickLower: -1200, tickUpper: -600 };
		expect(pairDeposit({ sqrtPriceX96: Q96, ...below, aIsToken0: true, side: 'B', amount: 5n })).toEqual({ paired: 0n, sides: 'onlyB' });
	});
});

describe('minimumAmount', () => {
	it('takes the slippage off in basis points, rounding down', () => {
		expect(minimumAmount(1_000_000n, 50)).toBe(995_000n);
		expect(minimumAmount(999n, 50)).toBe(994n);
		expect(minimumAmount(0n, 50)).toBe(0n);
	});
});
