import { describe, it, expect } from 'vitest';
import {
	buildPortfolioSeries,
	chartPaths,
	hasEnoughHistory,
	mergeHoldings,
	priceAt,
	rangeSpec,
	timeGrid,
	type PriceHistory,
} from '../portfolioHistory';

const WKMT = '0xf90f0bd56558ac12f7fc285571d38181d2fed69b';
const USDT = '0x6318ecdbae6b469d39c38949edc671f4ba8a6172';
const DUST = '0x2222222222222222222222222222222222222222';
const HOUR = 3_600;
const DAY = 86_400;

describe('timeGrid', () => {
	it('1D is 25 hour buckets ending at the bucket that contains now', () => {
		const now = 1_789_391_349; // 2026-09-14 13:09:09 UTC
		const grid = timeGrid('1D', now);
		expect(grid).toHaveLength(25);
		expect(grid[24]).toBe(Math.floor(now / HOUR) * HOUR);
		expect(grid[24] % HOUR).toBe(0);
		expect(grid[24] - grid[0]).toBe(24 * HOUR);
		expect(grid[1] - grid[0]).toBe(HOUR);
	});

	it('daily ranges start on UTC day boundaries, like tokenDayDatas.date', () => {
		const now = 1_789_391_349;
		for (const [range, days] of [['1W', 7], ['1M', 30], ['1Y', 365]] as const) {
			const grid = timeGrid(range, now);
			expect(grid).toHaveLength(days + 1);
			expect(grid[days]).toBe(1_789_344_000); // 2026-09-14 00:00 UTC
			expect(grid[0]).toBe(1_789_344_000 - days * DAY);
			expect(grid.every((t) => t % DAY === 0)).toBe(true);
		}
		expect(rangeSpec('1D').granularity).toBe('hour');
		expect(rangeSpec('1Y').granularity).toBe('day');
	});
});

describe('mergeHoldings / priceAt', () => {
	it('sums the same token across rows (native KMT + WKMT + staked) and drops empty rows', () => {
		const merged = mergeHoldings([
			{ id: WKMT.toUpperCase().replace('0X', '0x'), amount: 100 },
			{ id: WKMT, amount: 50 },
			{ id: USDT, amount: 0 },
			{ id: DUST, amount: -1 },
		]);
		expect(merged).toEqual([{ id: WKMT, amount: 150 }]);
	});

	it('returns the latest price at or before t, null before the first point', () => {
		const points = [{ t: 10, price: 1 }, { t: 20, price: 2 }, { t: 30, price: 3 }];
		expect(priceAt(points, 5)).toBeNull();
		expect(priceAt(points, 10)).toBe(1);
		expect(priceAt(points, 25)).toBe(2);
		expect(priceAt(points, 99)).toBe(3);
	});
});

describe('buildPortfolioSeries', () => {
	const grid = [0, HOUR, 2 * HOUR, 3 * HOUR];

	it('aligns hourly prices to the grid and multiplies by current amounts', () => {
		const history: PriceHistory = {
			[WKMT]: [{ t: 0, price: 0.2 }, { t: HOUR, price: 0.25 }, { t: 2 * HOUR, price: 0.1 }, { t: 3 * HOUR, price: 0.2 }],
			[USDT]: [{ t: 0, price: 1 }, { t: 3 * HOUR, price: 1 }],
		};
		const { points, unpriced } = buildPortfolioSeries([{ id: WKMT, amount: 1000 }, { id: USDT, amount: 50 }], history, grid);
		expect(unpriced).toEqual([]);
		expect(points.map((p) => p.t)).toEqual(grid);
		expect(points.map((p) => p.value)).toEqual([250, 300, 150, 250]);
	});

	it('carries the last price across buckets with no trade, including one from before the window', () => {
		const history: PriceHistory = {
			// -HOUR is the "last record before the window" lookup; 2 h has a trade, 1 h and 3 h do not.
			[WKMT]: [{ t: 2 * HOUR, price: 0.4 }, { t: -HOUR, price: 0.2 }],
		};
		const { points } = buildPortfolioSeries([{ id: WKMT, amount: 10 }], history, grid);
		expect(points.map((p) => p.value)).toEqual([2, 2, 4, 4]);
	});

	it('uses daily buckets the same way', () => {
		const days = [0, DAY, 2 * DAY];
		const history: PriceHistory = { [WKMT]: [{ t: DAY, price: 0.5 }, { t: 0, price: 0.25 }] };
		const { points } = buildPortfolioSeries([{ id: WKMT, amount: 4 }], history, days);
		expect(points).toEqual([{ t: 0, value: 1 }, { t: DAY, value: 2 }, { t: 2 * DAY, value: 2 }]);
	});

	it('leaves out holdings with no price at all and reports them', () => {
		const history: PriceHistory = { [USDT]: [{ t: 0, price: 1 }] };
		const { points, unpriced } = buildPortfolioSeries(
			[{ id: USDT, amount: 5 }, { id: DUST, amount: 1_000_000 }],
			history,
			grid,
		);
		expect(unpriced).toEqual([DUST]);
		expect(points.every((p) => p.value === 5)).toBe(true);
	});

	it('treats zero, non-finite and after-the-range prices as no price', () => {
		const history: PriceHistory = {
			[DUST]: [{ t: 0, price: 0 }, { t: HOUR, price: Number.NaN }, { t: 10 * HOUR, price: 3 }],
		};
		const { points, unpriced } = buildPortfolioSeries([{ id: DUST, amount: 1 }], history, grid);
		expect(unpriced).toEqual([DUST]);
		expect(points).toEqual([]);
	});

	it('drops leading buckets until every charted holding has a price, instead of charting a fake dip', () => {
		const history: PriceHistory = {
			[USDT]: [{ t: 0, price: 1 }],
			[WKMT]: [{ t: 2 * HOUR, price: 0.2 }],
		};
		const { points } = buildPortfolioSeries([{ id: USDT, amount: 100 }, { id: WKMT, amount: 1000 }], history, grid);
		expect(points).toEqual([{ t: 2 * HOUR, value: 300 }, { t: 3 * HOUR, value: 300 }]);
	});

	it('returns nothing for an empty wallet', () => {
		expect(buildPortfolioSeries([], { [USDT]: [{ t: 0, price: 1 }] }, grid)).toEqual({ points: [], unpriced: [] });
	});
});

describe('hasEnoughHistory / chartPaths', () => {
	it('needs two points to draw', () => {
		expect(hasEnoughHistory([{ t: 0, value: 1 }])).toBe(false);
		expect(hasEnoughHistory([{ t: 0, value: 1 }, { t: 1, value: 2 }])).toBe(true);
		expect(chartPaths([{ t: 0, value: 1 }], 100, 50)).toBeNull();
	});

	it('maps time to x and value to y (higher value = higher on screen) and closes the area at the bottom', () => {
		const paths = chartPaths([{ t: 0, value: 10 }, { t: 50, value: 30 }, { t: 100, value: 20 }], 200, 100, 10);
		expect(paths).not.toBeNull();
		expect(paths!.line).toBe('M0.00,90.00 L100.00,10.00 L200.00,50.00');
		expect(paths!.area).toBe('M0.00,90.00 L100.00,10.00 L200.00,50.00 L200.00,100 L0.00,100 Z');
	});

	it('draws a flat series through the middle', () => {
		expect(chartPaths([{ t: 0, value: 5 }, { t: 10, value: 5 }], 100, 40)!.line).toBe('M0.00,20.00 L100.00,20.00');
	});
});
