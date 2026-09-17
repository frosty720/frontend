import { describe, it, expect } from 'vitest';
import { DEFAULT_FEE_SPLIT, type FeeSplit } from '../vaults';
import {
	activityStatus,
	AFFILIATE_GRAPH_QUERY,
	affiliateStats,
	leaderboard,
	loyaltyMultiplier,
	paidLegs,
	parseAffiliateGraph,
	rankFor,
	type AffiliateGraphData,
	type FeeLeg,
} from '../vaultAffiliate';

// A purchase of `usd` at `dec` decimals with the given levels rolled to the DAO, as
// VaultManager._routeFees emits it: every leg amount is emitted, only the DAO amount absorbs unpaid legs.
function event(usd: number, dec: number, unpaid: (1 | 2 | 3)[], split: FeeSplit = DEFAULT_FEE_SPLIT) {
	const amount = BigInt(usd) * 10n ** BigInt(dec);
	const bps = (b: number) => (amount * BigInt(b)) / 10000n;
	const amounts: [bigint, bigint, bigint] = [bps(split.n1Bps), bps(split.n2Bps), bps(split.n3Bps)];
	const rolled = unpaid.reduce((s, l) => s + amounts[l - 1], 0n);
	return { amounts, devAmt: bps(split.devBps), daoAmt: bps(split.daoBps) + rolled };
}

describe('paidLegs', () => {
	it('marks every leg paid when nothing rolled to the DAO', () => {
		const e = event(100, 6, []);
		expect(paidLegs(e.amounts, e.devAmt, e.daoAmt)).toEqual([true, true, true]);
	});

	it.each([
		[[1], [false, true, true]],
		[[2], [true, false, true]],
		[[3], [true, true, false]],
		[[2, 3], [true, false, false]],
		[[1, 2, 3], [false, false, false]],
	] as [(1 | 2 | 3)[], boolean[]][])('identifies exactly which legs rolled to the DAO: %j', (unpaid, expected) => {
		const e = event(1000, 6, unpaid);
		expect(paidLegs(e.amounts, e.devAmt, e.daoAmt)).toEqual(expected);
	});

	it('works at 6 and 18 decimals, smallest and largest tier', () => {
		for (const [usd, dec] of [[50, 18], [50, 6], [100000, 18], [100000, 6]] as [number, number][]) {
			const e = event(usd, dec, [2]);
			expect(paidLegs(e.amounts, e.devAmt, e.daoAmt)).toEqual([true, false, true]);
		}
	});

	it('honours a non-default split', () => {
		const split: FeeSplit = { n1Bps: 800, n2Bps: 400, n3Bps: 100, devBps: 300, daoBps: 400 };
		const e = event(1000, 6, [1, 3], split);
		expect(paidLegs(e.amounts, e.devAmt, e.daoAmt, split)).toEqual([false, true, false]);
	});

	it('returns null rather than guessing when reconciled with the wrong split', () => {
		const e = event(1000, 6, [2], { ...DEFAULT_FEE_SPLIT, daoBps: 400 });
		expect(paidLegs(e.amounts, e.devAmt, e.daoAmt, DEFAULT_FEE_SPLIT)).toBeNull();
	});

	it('returns null when two legs share an amount (ambiguous)', () => {
		const split: FeeSplit = { ...DEFAULT_FEE_SPLIT, n3Bps: 250 };
		const e = event(1000, 6, [2], split);
		expect(paidLegs(e.amounts, e.devAmt, e.daoAmt, split)).toBeNull();
	});

	it('returns null when devBps is zero', () => {
		const e = event(1000, 6, []);
		expect(paidLegs(e.amounts, e.devAmt, e.daoAmt, { ...DEFAULT_FEE_SPLIT, devBps: 0 })).toBeNull();
	});

	it('tolerates rounding drift from the two floor divisions', () => {
		const amount = 1_234_567n;
		const bps = (b: number) => (amount * BigInt(b)) / 10000n;
		const amounts: [bigint, bigint, bigint] = [bps(600), bps(250), bps(150)];
		expect(paidLegs(amounts, bps(200), bps(800) + amounts[1])).toEqual([true, false, true]);
	});

	// Mainnet tx 0xf3ca68e3…ba19e: $1000 pack, level2 named but held no vault → its $25 went to the DAO.
	it('reproduces the verified mainnet phantom-leg case', () => {
		expect(paidLegs([60_000_000n, 25_000_000n, 15_000_000n], 20_000_000n, 120_000_000n)).toEqual([true, false, false]);
	});
});

describe('parseAffiliateGraph', () => {
	const USDT = '0x6318ecdbae6b469d39c38949edc671f4ba8a6172';
	const UNKNOWN_STABLE = '0xfdb3307a16442ed5a7c040ae1600a3b3d3c8e7d9';
	const AFF1 = '0x1F425B0F95f939Df6f2a977ea38Cb93FDd91f012';
	const AFF2 = '0xEd60426bF457B1625F3C04ecE1548bF5F7792fe2';
	const BUYER = '0xFcC1D8b5F4B9DAbc954b914A065A8a9128fb3c04';
	const decimalsOf = (stable: string) => (stable === USDT ? 6 : undefined);
	const graph = (commissions: AffiliateGraphData['commissions'], accounts: AffiliateGraphData['accounts'] = []): AffiliateGraphData => ({
		_meta: { block: { number: 51784563, timestamp: 1783980000 } },
		accounts,
		commissions,
	});

	it('values legs with each stable’s decimals (unknown stables at 18) and keeps only paid legs', () => {
		const { edges, legs, head } = parseAffiliateGraph(
			graph(
				[
					{
						// $100 USDT pack: DAO $8 base + unpaid L3 $1.50 = $9.50.
						buyer: { address: BUYER }, stable: USDT,
						level1: { address: AFF2 }, level2: { address: AFF1 }, level3: null,
						amount1: '6000000', amount2: '2500000', amount3: '1500000',
						devAmount: '2000000', daoAmount: '9500000', timestamp: '1782852408',
					},
					{
						// $50 in an 18-dec stable: DAO $4 base + unpaid L2 $1.25 + L3 $0.75 = $6.
						buyer: { address: BUYER }, stable: UNKNOWN_STABLE,
						level1: { address: AFF1 }, level2: null, level3: null,
						amount1: '3000000000000000000', amount2: '1250000000000000000', amount3: '750000000000000000',
						devAmount: '1000000000000000000', daoAmount: '6000000000000000000', timestamp: '1782852540',
					},
				],
				[{ address: BUYER, sponsor: { address: AFF2 } }, { address: AFF1, sponsor: null }],
			),
			decimalsOf,
		);
		expect(head).toBe(51784563n);
		expect(edges).toEqual([{ buyer: BUYER.toLowerCase(), sponsor: AFF2.toLowerCase() }]);
		expect(legs).toHaveLength(3);
		expect(legs[0]).toMatchObject({ affiliate: AFF2.toLowerCase(), level: 1, usd: 6, buyer: BUYER.toLowerCase() });
		expect(legs[1]).toMatchObject({ affiliate: AFF1.toLowerCase(), level: 2, usd: 2.5 });
		expect(legs[2]).toMatchObject({ affiliate: AFF1.toLowerCase(), level: 1, usd: 3 });
	});

	it('excludes a named-but-unqualified level whose commission rolled to the DAO', () => {
		const L1 = '0x44a0c354add28225c8722f4f0e5f59ab552b56d5';
		const UNQUALIFIED = '0xff3c9793ef3996bbb5f9b811d31c12ff3c99e287';
		const { legs } = parseAffiliateGraph(
			graph([
				{
					buyer: { address: BUYER }, stable: USDT,
					level1: { address: L1 }, level2: { address: UNQUALIFIED }, level3: null,
					amount1: '60000000', amount2: '25000000', amount3: '15000000',
					devAmount: '20000000', daoAmount: '120000000', timestamp: '1783442209',
				},
			]),
			decimalsOf,
		);
		expect(legs).toHaveLength(1);
		expect(legs[0]).toMatchObject({ affiliate: L1, level: 1, usd: 60 });
	});

	it('excludes zero-address and zero-amount legs', () => {
		const { legs } = parseAffiliateGraph(
			graph([
				{
					buyer: { address: BUYER }, stable: USDT,
					level1: { address: '0x0000000000000000000000000000000000000000' }, level2: { address: AFF1 }, level3: null,
					amount1: '6000000', amount2: '0', amount3: '0',
					devAmount: '2000000', daoAmount: '8000000', timestamp: '1782852408',
				},
			]),
			decimalsOf,
		);
		expect(legs).toEqual([]);
	});

	it('queries account references with a selection set (scalar refs are silently omitted by graph-node)', () => {
		for (const field of ['buyer { address }', 'level1 { address }', 'level2 { address }', 'level3 { address }', 'sponsor { address }']) {
			expect(AFFILIATE_GRAPH_QUERY).toContain(field);
		}
	});
});

describe('standing', () => {
	const DAY = 43200n;

	it('ranks by direct sales with the distance to the next rank', () => {
		expect(rankFor(0)).toMatchObject({ current: null, next: { name: 'Bronze' }, toNext: 15 });
		expect(rankFor(45)).toMatchObject({ current: { name: 'Silver', bonusPct: 12 }, next: { name: 'Gold' }, toNext: 45 });
		expect(rankFor(200)).toMatchObject({ current: { name: 'Diamond' }, next: null, toNext: 0 });
	});

	it('grows loyalty 0.1 per full month, capped at ×1.5', () => {
		expect(loyaltyMultiplier(29n * DAY)).toBe(1);
		expect(loyaltyMultiplier(60n * DAY)).toBeCloseTo(1.2, 10);
		expect(loyaltyMultiplier(3650n * DAY)).toBe(1.5);
	});

	it('buckets activity by days since the last direct sale', () => {
		const head = 1000n * DAY;
		expect(activityStatus(head, null)).toBe('none');
		expect(activityStatus(head, head - 90n * DAY)).toBe('active');
		expect(activityStatus(head, head - 91n * DAY)).toBe('reduced');
		expect(activityStatus(head, head - 181n * DAY)).toBe('suspended');
	});
});

describe('affiliateStats / leaderboard', () => {
	const leg = (affiliate: string, level: 1 | 2 | 3, usd: number, block: bigint): FeeLeg => ({ affiliate, level, usd, buyer: 'x', block });
	// a → b → c → d → e: a's downline stops at three levels (b, c, d).
	const edges = [
		{ buyer: 'b', sponsor: 'a' },
		{ buyer: 'c', sponsor: 'b' },
		{ buyer: 'd', sponsor: 'c' },
		{ buyer: 'e', sponsor: 'd' },
		{ buyer: 'f', sponsor: 'a' },
	];
	const legs = [leg('a', 1, 6, 100n), leg('a', 2, 2.5, 200n), leg('a', 3, 1.5, 300n), leg('b', 1, 60, 400n)];

	it('sums commissions by level and walks the downline three levels deep', () => {
		const stats = affiliateStats('A', edges, legs, 500n);
		expect(stats.directReferrals).toEqual(['b', 'f']);
		expect(stats.downlineCount).toBe(4);
		expect(stats.byLevel).toEqual({ l1: 6, l2: 2.5, l3: 1.5 });
		expect(stats.commissionUsd).toBe(10);
		expect(stats.activity).toBe('active');
	});

	it('shows a fresh address with nothing earned', () => {
		const stats = affiliateStats('z', edges, legs, 500n);
		expect(stats).toMatchObject({ directReferrals: [], downlineCount: 0, commissionUsd: 0, loyalty: 1, activity: 'none' });
	});

	it('orders by commission, then referrals', () => {
		const rows = leaderboard(edges, legs);
		expect(rows.map((row) => row.address).slice(0, 3)).toEqual(['b', 'a', 'c']);
		expect(rows[1]).toEqual({ address: 'a', referrals: 2, commissionUsd: 10 });
		expect(leaderboard(edges, legs, 2)).toHaveLength(2);
	});
});
