import { describe, it, expect } from 'vitest';
import {
	confirmStakedPositions,
	formatDuration,
	incentiveStatus,
	rewardTotals,
	stakeCandidates,
	stakedPositionUsd,
	stakeValuesByIncentive,
	toFarmPools,
	tokenIdScanOrder,
	totalStakedUsd,
	totalUsd,
	weightedAverageApr,
	type StakedPosition,
} from '../farm';

const key = (start: number, end: number) => ({ key: { startTime: BigInt(start), endTime: BigInt(end) } }) as never;
const UNITS = { day: 'd', hour: 'h', minute: 'm' };
const KMT = '0xf90f0bd56558ac12f7fc285571d38181d2fed69b';
const USDT = '0x6318ecdbae6b469d39c38949edc671f4ba8a6172';

describe('incentiveStatus', () => {
	it('is upcoming before start, active until end, ended from end on', () => {
		expect(incentiveStatus(key(100, 200), 99)).toBe('upcoming');
		expect(incentiveStatus(key(100, 200), 100)).toBe('active');
		expect(incentiveStatus(key(100, 200), 199)).toBe('active');
		expect(incentiveStatus(key(100, 200), 200)).toBe('ended');
	});
});

describe('formatDuration', () => {
	it('uses the two largest units', () => {
		expect(formatDuration(3 * 86_400 + 4 * 3_600 + 59, UNITS)).toBe('3d 4h');
		expect(formatDuration(5 * 3_600 + 12 * 60, UNITS)).toBe('5h 12m');
		expect(formatDuration(40 * 60 + 5, UNITS)).toBe('40m');
	});

	it('takes localised unit letters and returns null when nothing is left', () => {
		expect(formatDuration(86_400, { day: 'j', hour: 'h', minute: 'min' })).toBe('1j 0h');
		expect(formatDuration(0, UNITS)).toBeNull();
	});
});

describe('rewardTotals / totalUsd', () => {
	it('groups by token (case-insensitive) and prices each total', () => {
		const totals = rewardTotals(
			[
				{ token: KMT.toUpperCase().replace('0X', '0x'), raw: 10n * 10n ** 18n, decimals: 18, symbol: 'WKMT' },
				{ token: KMT, raw: 5n * 10n ** 18n, decimals: 18, symbol: 'WKMT' },
				{ token: USDT, raw: 0n, decimals: 6, symbol: 'USDT' },
			],
			{ [KMT]: 0.2 },
		);
		expect(totals).toHaveLength(1);
		expect(totals[0].amount).toBeCloseTo(15);
		expect(totals[0].usd).toBeCloseTo(3);
		expect(totalUsd(totals)).toBeCloseTo(3);
	});

	it('refuses a single USD figure when any token is unpriced', () => {
		const totals = rewardTotals([{ token: USDT, raw: 2_000_000n, decimals: 6, symbol: 'USDT' }], {});
		expect(totals[0].usd).toBeNull();
		expect(totalUsd(totals)).toBeNull();
		expect(totalUsd([])).toBe(0);
	});
});

// --- Staked value -------------------------------------------------------------------------------

const INC_A = `0x${'a'.repeat(64)}`;
const INC_B = `0x${'b'.repeat(64)}`;
const POOL = '0xa9ac6d3c75a883cc5d6efe7ebb973c68174ba61f';
const OWNER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const OTHER = '0x2222222222222222222222222222222222222222';
const ZERO = '0x0000000000000000000000000000000000000000';
// The live USDT/WKMT 0.3 % pool on 3890: USDT is token0 (6 dp), WKMT token1 (18 dp), current tick 292503.
const SQRT_PRICE = 177907308208110579741574738375800429n;
const LIQUIDITY = 58_230_031_824_456n;
const POOLS = toFarmPools([
	{
		id: '0xA9AC6D3C75A883CC5D6EFE7EBB973C68174BA61F',
		sqrtPrice: SQRT_PRICE.toString(),
		token0: { id: USDT, symbol: 'USDT', decimals: '6' },
		token1: { id: KMT.toUpperCase().replace('0X', '0x'), symbol: 'WKMT', decimals: '18' },
	},
]);
const PRICES = { [USDT]: 1, [KMT]: 0.2 };

const position = (overrides: Partial<StakedPosition>): StakedPosition => ({
	tokenId: 1n,
	incentiveId: INC_A,
	pool: POOL,
	owner: OWNER,
	liquidity: LIQUIDITY,
	tickLower: -887220,
	tickUpper: 887220,
	...overrides,
});
const valueOf = (p: StakedPosition) => stakedPositionUsd(p, POOLS[POOL], PRICES) as number;

describe('stakeCandidates', () => {
	it('keeps one candidate per token + listed incentive and skips withdrawn deposits', () => {
		const rows = [
			{ deposit: { id: '7', owner: OWNER }, incentive: { id: `0x${'A'.repeat(64)}` } },
			{ deposit: { id: '7', owner: OWNER }, incentive: { id: INC_A } },
			// The row the live subgraph still returns after tokenId 2 was unstaked and withdrawn.
			{ deposit: { id: '2', owner: ZERO }, incentive: { id: INC_A } },
			{ deposit: { id: '9', owner: OTHER }, incentive: { id: INC_B } },
			{ deposit: { id: 'x', owner: OTHER }, incentive: { id: INC_A } },
		];
		expect(stakeCandidates(rows, [INC_A])).toEqual([{ tokenId: 7n, incentiveId: INC_A }]);
	});
});

describe('confirmStakedPositions', () => {
	it('keeps only what the staker still holds, attributed to the deposit owner', () => {
		const candidates = [
			{ tokenId: 1n, incentiveId: INC_A },
			{ tokenId: 2n, incentiveId: INC_A },
			{ tokenId: 3n, incentiveId: INC_B },
		];
		const deposits = new Map([
			[1n, { owner: OWNER.toUpperCase().replace('0X', '0x'), tickLower: -60, tickUpper: 60 }],
			[2n, { owner: OWNER, tickLower: -60, tickUpper: 60 }],
		]);
		const confirmed = confirmStakedPositions(candidates, [500n, 0n, 900n], deposits, { [INC_A]: POOL, [INC_B]: POOL });
		// 2 was unstaked (liquidity 0); 3 has no deposit read.
		expect(confirmed).toEqual([{ tokenId: 1n, incentiveId: INC_A, pool: POOL, owner: OWNER, liquidity: 500n, tickLower: -60, tickUpper: 60 }]);
	});

	it('drops a withdrawn deposit even if a stale liquidity comes back', () => {
		const deposits = new Map([[1n, { owner: ZERO, tickLower: -60, tickUpper: 60 }]]);
		expect(confirmStakedPositions([{ tokenId: 1n, incentiveId: INC_A }], [500n], deposits, { [INC_A]: POOL })).toEqual([]);
	});
});

describe('stakedPositionUsd', () => {
	it('values a full-range position at the pool price', () => {
		const sqrtP = Number(SQRT_PRICE) / 2 ** 96;
		const liquidity = Number(LIQUIDITY);
		// Full range: amount0 = L / √P (USDT, 6 dp), amount1 = L · √P (WKMT, 18 dp).
		const expected = (liquidity / sqrtP / 1e6) * 1 + ((liquidity * sqrtP) / 1e18) * 0.2;
		const usd = valueOf(position({}));
		expect(Math.abs(usd - expected) / expected).toBeLessThan(1e-6);
		expect(valueOf(position({ liquidity: 2n * LIQUIDITY }))).toBeCloseTo(2 * usd, 6);
	});

	it('needs a price only for the side the position holds', () => {
		// Range above the current tick: the position is all USDT, so WKMT's price is irrelevant.
		const above = position({ tickLower: 300_000, tickUpper: 300_060 });
		expect(stakedPositionUsd(above, POOLS[POOL], { [USDT]: 1 })).toBeGreaterThan(0);
		expect(stakedPositionUsd(position({}), POOLS[POOL], { [USDT]: 1 })).toBeNull();
		expect(stakedPositionUsd(position({}), undefined, PRICES)).toBeNull();
	});
});

describe('stakeValuesByIncentive', () => {
	const incentives = [
		{ incentiveId: INC_A, numberOfStakes: 2 },
		{ incentiveId: INC_B, numberOfStakes: 0 },
	];
	const mine = position({ tokenId: 1n, owner: OWNER });
	const theirs = position({ tokenId: 2n, owner: OTHER, liquidity: 3n * LIQUIDITY });

	it('sums every staked position per farm and splits out the owner (case-insensitive)', () => {
		const values = stakeValuesByIncentive(incentives, [mine, theirs], POOLS, PRICES, OWNER.toUpperCase().replace('0X', '0x'));
		expect(values[INC_A].totalUsd).toBeCloseTo(valueOf(mine) + valueOf(theirs), 6);
		expect(values[INC_A].userUsd).toBeCloseTo(valueOf(mine), 6);
		expect(values[INC_A].userTokenIds).toEqual([1n]);
		expect(values[INC_B]).toEqual({ totalUsd: 0, userUsd: 0, userTokenIds: [] });
	});

	it('shows no total while unknown, incomplete or unpriced', () => {
		expect(stakeValuesByIncentive(incentives, null, POOLS, PRICES, OWNER)[INC_A]).toEqual({ totalUsd: null, userUsd: null, userTokenIds: [] });

		// The staker counts 2 stakes but only 1 was found: no understated total, the owner's own value still shows.
		const partial = stakeValuesByIncentive(incentives, [mine], POOLS, PRICES, OWNER)[INC_A];
		expect(partial.totalUsd).toBeNull();
		expect(partial.userUsd).toBeCloseTo(valueOf(mine), 6);

		const unpriced = stakeValuesByIncentive(incentives, [mine, theirs], POOLS, { [USDT]: 1 }, OWNER)[INC_A];
		expect(unpriced.totalUsd).toBeNull();
		expect(unpriced.userUsd).toBeNull();
	});

	it('gives a disconnected viewer nothing of their own', () => {
		const values = stakeValuesByIncentive(incentives, [mine, theirs], POOLS, PRICES);
		expect(values[INC_A].userUsd).toBe(0);
		expect(values[INC_A].userTokenIds).toEqual([]);
	});
});

describe('tokenIdScanOrder', () => {
	it('checks known staked IDs first, de-duplicated, then the 1..maxCheck scan without repeats', () => {
		expect(tokenIdScanOrder([120n, 3n, 120n], 5)).toEqual([120n, 3n, 1n, 2n, 4n, 5n]);
	});

	it('falls back to the plain scan with no known IDs and ignores non-positive IDs', () => {
		expect(tokenIdScanOrder([], 3)).toEqual([1n, 2n, 3n]);
		expect(tokenIdScanOrder([0n, 77n], 0)).toEqual([77n]);
	});
});

describe('totalStakedUsd', () => {
	it('counts an NFT staked in two farms once', () => {
		const farms = [
			{ incentiveId: INC_A, numberOfStakes: 1 },
			{ incentiveId: INC_B, numberOfStakes: 2 },
		];
		const inA = position({ tokenId: 5n, incentiveId: INC_A });
		const inB = position({ tokenId: 5n, incentiveId: INC_B });
		const otherInB = position({ tokenId: 6n, incentiveId: INC_B, owner: OTHER });
		const positions = [inA, inB, otherInB];
		const byIncentive = stakeValuesByIncentive(farms, positions, POOLS, PRICES);
		expect(totalStakedUsd(byIncentive, positions, POOLS, PRICES)).toBeCloseTo(valueOf(inA) + valueOf(otherInB), 6);
	});

	it('is null when any farm total is unknown, 0 when nothing is staked', () => {
		const byIncentive = stakeValuesByIncentive([{ incentiveId: INC_A, numberOfStakes: 1 }], null, POOLS, PRICES);
		expect(totalStakedUsd(byIncentive, [], POOLS, PRICES)).toBeNull();
		expect(totalStakedUsd({ [INC_A]: { totalUsd: 0, userUsd: 0, userTokenIds: [] } }, [], POOLS, PRICES)).toBe(0);
	});
});

describe('weightedAverageApr', () => {
	it('weights each farm by staked value and ignores farms missing either', () => {
		const apr = weightedAverageApr([
			{ apr: 10, stakedUsd: 100 },
			{ apr: 40, stakedUsd: 300 },
			{ apr: null, stakedUsd: 1_000 },
			{ apr: 99, stakedUsd: null },
			{ apr: 50, stakedUsd: 0 },
		]);
		// (10·100 + 40·300) / 400 — a plain mean of the APRs would give 25.
		expect(apr).toBeCloseTo(32.5);
	});

	it('is null when no farm has an APR', () => {
		expect(weightedAverageApr([{ apr: null, stakedUsd: 10 }])).toBeNull();
		expect(weightedAverageApr([])).toBeNull();
	});
});
