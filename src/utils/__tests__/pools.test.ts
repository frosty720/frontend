import { describe, it, expect, vi, afterEach } from 'vitest';
import { filterPoolsByOwnership, poolApr, poolComposition, positionState, servicePositionUsd, sortPools, walletLpRows } from '../pools';
import { fetchPool24hStats } from '@/hooks/usePool24hStats';
import type { V3Position } from '@/services/dex/IV3DexService';

const USDT = '0x6318ecdbae6b469d39c38949edc671f4ba8a6172';
const WKMT = '0xf90f0bd56558ac12f7fc285571d38181d2fed69b';

const position = (over: Partial<V3Position> = {}): V3Position => ({
	tokenId: 1n, owner: '0xdead', token0: USDT, token1: WKMT, fee: 3000,
	tickLower: -887220, tickUpper: 887220, liquidity: 1000n,
	feeGrowthInside0LastX128: 0n, feeGrowthInside1LastX128: 0n, tokensOwed0: 0n, tokensOwed1: 0n,
	...over,
});

describe('poolApr', () => {
	it('annualises 24 h fees over TVL', () => {
		expect(poolApr(1, 365)).toBeCloseTo(100);
		expect(poolApr(0.12, 50_000)).toBeCloseTo(0.0876);
	});

	it('is null for an empty pool instead of dividing by zero', () => {
		expect(poolApr(5, 0)).toBeNull();
	});
});

describe('positionState', () => {
	it('labels closed, in-range, out-of-range and unknown-tick positions', () => {
		expect(positionState(position({ liquidity: 0n }), 10)).toBe('closed');
		expect(positionState(position(), 292_450)).toBe('inRange');
		expect(positionState(position({ tickLower: 0, tickUpper: 1000 }), 292_450)).toBe('outOfRange');
		expect(positionState(position(), null)).toBe('open');
	});

	it('treats the upper tick as exclusive, like the pool does', () => {
		expect(positionState(position({ tickLower: 0, tickUpper: 1000 }), 1000)).toBe('outOfRange');
		expect(positionState(position({ tickLower: 0, tickUpper: 1000 }), 0)).toBe('inRange');
	});
});

describe('servicePositionUsd', () => {
	const pool = { sqrtPrice: '79228162514264337593543950336', token0: { id: USDT, decimals: '6' }, token1: { id: WKMT, decimals: '18' } };

	it('is zero for a withdrawn position and null without a pool price', () => {
		expect(servicePositionUsd(position({ liquidity: 0n }), pool, { [USDT]: 1, [WKMT]: 0.2 })).toBe(0);
		expect(servicePositionUsd(position(), { ...pool, sqrtPrice: '' }, { [USDT]: 1, [WKMT]: 0.2 })).toBeNull();
	});

	it('is null when a held token has no price', () => {
		expect(servicePositionUsd(position({ liquidity: 10n ** 12n }), pool, { [USDT]: 1 })).toBeNull();
	});
});

describe('fetchPool24hStats', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sums hour buckets per pool', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				data: {
					poolHourDatas: [
						{ volumeUSD: '10', feesUSD: '0.03', pool: { id: '0xAAA' } },
						{ volumeUSD: '5', feesUSD: '0.015', pool: { id: '0xaaa' } },
						{ volumeUSD: '1', feesUSD: '0.003', pool: { id: '0xbbb' } },
					],
				},
			}),
		})));
		const stats = await fetchPool24hStats('https://subgraph.test', 1_789_050_000);
		expect(stats['0xaaa'].volumeUsd).toBeCloseTo(15);
		expect(stats['0xaaa'].feesUsd).toBeCloseTo(0.045);
		expect(stats['0xbbb'].volumeUsd).toBeCloseTo(1);
	});
});

describe('sortPools', () => {
	const pools = [
		{ id: '0xAAA', totalValueLockedUSD: '100' }, // no stats -> apr null, volume 0
		{ id: '0xBBB', totalValueLockedUSD: '1000' }, // apr = (5*365*100)/1000 = 182.5
		{ id: '0xCCC', totalValueLockedUSD: '0' }, // empty pool -> apr null
	];
	const stats = {
		'0xbbb': { volumeUsd: 50, feesUsd: 5 },
		'0xccc': { volumeUsd: 200, feesUsd: 0 },
	};

	it('sorts by TVL descending by default', () => {
		expect(sortPools(pools, 'tvl', 'desc', stats).map((p) => p.id)).toEqual(['0xBBB', '0xAAA', '0xCCC']);
	});

	it('sorts by TVL ascending', () => {
		expect(sortPools(pools, 'tvl', 'asc', stats).map((p) => p.id)).toEqual(['0xCCC', '0xAAA', '0xBBB']);
	});

	it('sorts by 24h volume, missing stats treated as zero', () => {
		expect(sortPools(pools, 'volume', 'desc', stats).map((p) => p.id)).toEqual(['0xCCC', '0xBBB', '0xAAA']);
	});

	it('sorts by APR, treating an empty pool (no TVL) as lower than a 0% pool', () => {
		expect(sortPools(pools, 'apr', 'desc', stats).map((p) => p.id)).toEqual(['0xBBB', '0xAAA', '0xCCC']);
		expect(sortPools(pools, 'apr', 'asc', stats).map((p) => p.id)).toEqual(['0xCCC', '0xAAA', '0xBBB']);
	});

	it('does not mutate the input array', () => {
		const copy = [...pools];
		sortPools(pools, 'tvl', 'asc', stats);
		expect(pools).toEqual(copy);
	});
});

describe('filterPoolsByOwnership', () => {
	const pools = [
		{ id: '1', userHasPosition: true },
		{ id: '2', userHasPosition: false },
		{ id: '3', userHasPosition: true },
	];

	it('passes everything through for "all"', () => {
		expect(filterPoolsByOwnership(pools, 'all')).toEqual(pools);
	});

	it('keeps only owned pools for "mine"', () => {
		expect(filterPoolsByOwnership(pools, 'mine').map((p) => p.id)).toEqual(['1', '3']);
	});
});

describe('poolComposition', () => {
	const basePool = {
		token0: { symbol: 'USDT' },
		token1: { symbol: 'WKMT' },
		totalValueLockedToken0: '16296.48',
		totalValueLockedToken1: '81741.66',
		txCount: '5',
	};

	it('parses the token amounts, symbols and tx count', () => {
		expect(poolComposition(basePool)).toEqual({
			amount0: 16296.48,
			symbol0: 'USDT',
			amount1: 81741.66,
			symbol1: 'WKMT',
			txCount: 5,
		});
	});

	it('defends against non-numeric subgraph strings by falling back to zero', () => {
		expect(poolComposition({ ...basePool, totalValueLockedToken0: '', totalValueLockedToken1: 'NaN', txCount: 'garbage' })).toEqual({
			amount0: 0,
			symbol0: 'USDT',
			amount1: 0,
			symbol1: 'WKMT',
			txCount: 0,
		});
	});
});

describe('walletLpRows', () => {
	const pool = {
		id: '0xpool',
		feeTier: '3000',
		sqrtPrice: String(2n ** 96n),
		token0: { id: USDT, symbol: 'USDT', decimals: '18' },
		token1: { id: WKMT, symbol: 'WKMT', decimals: '18' },
	};
	const position = (overrides: Partial<V3Position>): V3Position => ({
		tokenId: 1n,
		owner: '0xowner',
		token0: USDT,
		token1: WKMT,
		fee: 3000,
		tickLower: -887220,
		tickUpper: 887220,
		liquidity: 0n,
		feeGrowthInside0LastX128: 0n,
		feeGrowthInside1LastX128: 0n,
		tokensOwed0: 0n,
		tokensOwed1: 0n,
		...overrides,
	});
	const prices = { [USDT]: 1, [WKMT]: 0.2 };

	it('skips pools where the wallet has no liquidity and nothing to collect', () => {
		expect(walletLpRows([{ ...pool, userPositions: [] }, { ...pool, id: '0xother', userPositions: [position({})] }], prices)).toEqual([]);
	});

	it('values live liquidity at the pool price exactly as the Pools table does', () => {
		const live = position({ liquidity: 10n ** 18n });
		const [row] = walletLpRows([{ ...pool, userPositions: [live] }], prices);
		expect(row).toMatchObject({ poolId: '0xpool', pair: 'USDT/WKMT', feeTier: 3000, unclaimedFeesUsd: 0 });
		expect(row.valueUsd).toBe(servicePositionUsd(live, pool, prices));
		// Full range at price 1: about one of each token, so ≈ 1 × $1 + 1 × $0.20.
		expect(row.valueUsd).toBeGreaterThan(1.19);
		expect(row.valueUsd).toBeLessThan(1.21);
	});

	it('adds up every position in the pool, including a withdrawn one that still has fees to collect', () => {
		const withdrawn = position({ tokenId: 2n, tokensOwed0: 2n * 10n ** 18n, tokensOwed1: 10n * 10n ** 18n });
		const live = position({ tokenId: 3n, liquidity: 10n ** 18n, tokensOwed0: 10n ** 18n });
		const rows = walletLpRows([{ ...pool, userPositions: [withdrawn, live] }], prices);
		expect(rows).toHaveLength(1);
		expect(rows[0].unclaimedFeesUsd).toBeCloseTo(3 * 1 + 10 * 0.2);
		expect(rows[0].valueUsd).toBe(servicePositionUsd(live, pool, prices));
	});

	it('uses each token’s own decimals for the fees', () => {
		const sixDecimalPool = { ...pool, token0: { id: USDT, symbol: 'USDT', decimals: '6' } };
		const [row] = walletLpRows([{ ...sixDecimalPool, userPositions: [position({ tokensOwed0: 2_500_000n })] }], prices);
		expect(row.unclaimedFeesUsd).toBeCloseTo(2.5);
	});
});
