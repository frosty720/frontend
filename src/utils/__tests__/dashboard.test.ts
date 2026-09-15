import { describe, it, expect, vi } from 'vitest';
import {
	amountsUsd,
	buildAssetRows,
	claimableUsd,
	claimErrorMessage,
	countTraders,
	estimateDailyYieldUsd,
	planClaimSteps,
	portfolioChange24h,
	runClaimSteps,
	sumValues,
	type ClaimStep,
} from '../dashboard';
import { getEffectiveAddress } from '@/utils/tokens';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';

const tok = (symbol: string, address: string, extra: Partial<Token> = {}): Token => ({
	chainId: CHAIN_IDS.KALYCHAIN, address, decimals: 18, name: symbol, symbol, logoURI: '', ...extra,
});
const KMT = tok('KMT', '0x0000000000000000000000000000000000000000', { isNative: true });
const USDT = tok('USDT', '0x6318ecdbae6b469d39c38949edc671f4ba8a6172', { decimals: 6 });
const DUST = tok('DUST', '0x2222222222222222222222222222222222222222');
const WKMT = getEffectiveAddress(KMT).toLowerCase();

describe('buildAssetRows', () => {
	const balances: Record<string, number> = { KMT: 1000, USDT: 50, DUST: 5 };
	const rows = buildAssetRows(
		[DUST, USDT, KMT, tok('ZERO', '0x3333333333333333333333333333333333333333')],
		(token) => balances[token.symbol] ?? 0,
		{ [WKMT]: 0.2, [USDT.address]: 1 },
		{ [WKMT]: 5 },
	);

	it('keeps only held tokens, most valuable first, unpriced last', () => {
		expect(rows.map((row) => row.token.symbol)).toEqual(['KMT', 'USDT', 'DUST']);
	});

	it('prices the native token through its wrapped address and carries its 24 h change', () => {
		expect(rows[0].value).toBeCloseTo(200);
		expect(rows[0].change24h).toBe(5);
		expect(rows[2].price).toBeNull();
		expect(rows[2].value).toBeNull();
	});

	it('sums only priced rows and weights the 24 h change by value', () => {
		expect(sumValues(rows)).toBeCloseTo(250);
		// 200 × 5% + 50 × (no change) → only the KMT row carries a change
		expect(portfolioChange24h(rows)).toBeCloseTo(5);
		expect(portfolioChange24h([])).toBeNull();
	});
});

describe('amountsUsd', () => {
	it('adds both sides at their own decimals', () => {
		expect(amountsUsd(10n * 10n ** 18n, 5n * 10n ** 6n, 18, 6, 0.2, 1)).toBeCloseTo(7);
	});

	it('is null when a non-zero side has no price, but tolerates an unpriced empty side', () => {
		expect(amountsUsd(1n, 0n, 18, 6, null, 1)).toBeNull();
		expect(amountsUsd(0n, 2n * 10n ** 6n, 18, 6, null, 1)).toBeCloseTo(2);
	});
});

describe('estimateDailyYieldUsd', () => {
	const noStake = { stakedKmt: 0, kmtPrice: 0.2, aprPct: 10 };

	it('staking earns staked KMT × KMT price × APR / 365', () => {
		// 36,500 KMT × $0.20 = $7,300 × 10% = $730 / 365 = $2
		expect(estimateDailyYieldUsd({ staking: { stakedKmt: 36_500, kmtPrice: 0.2, aprPct: 10 }, vaults: [] })).toBeCloseTo(2);
	});

	it('a vault earns tier price × tier APR / 365, and a matured vault earns nothing', () => {
		const vaults = [
			{ priceUsd: 1_000, aprPct: 36.5, matured: false },
			{ priceUsd: 100_000, aprPct: 140, matured: true },
		];
		expect(estimateDailyYieldUsd({ staking: noStake, vaults })).toBeCloseTo(1);
	});

	it('adds staking and vaults together', () => {
		expect(
			estimateDailyYieldUsd({
				staking: { stakedKmt: 36_500, kmtPrice: 0.2, aprPct: 10 },
				vaults: [{ priceUsd: 1_000, aprPct: 36.5, matured: false }, { priceUsd: 50, aprPct: 73, matured: false }],
			}),
		).toBeCloseTo(2 + 1 + 0.1);
	});

	it('is null when nothing can be estimated', () => {
		expect(estimateDailyYieldUsd({ staking: noStake, vaults: [] })).toBeNull();
		expect(estimateDailyYieldUsd({ staking: { stakedKmt: 1_000, kmtPrice: null, aprPct: 10 }, vaults: [] })).toBeNull();
		expect(estimateDailyYieldUsd({ staking: { stakedKmt: 1_000, kmtPrice: 0.2, aprPct: 0 }, vaults: [] })).toBeNull();
		expect(estimateDailyYieldUsd({ staking: noStake, vaults: [{ priceUsd: 100, aprPct: 30, matured: true }] })).toBeNull();
	});
});

describe('planClaimSteps', () => {
	it('plans staking, one claim per pending farm token, then every earning vault in one claimMany', () => {
		expect(
			planClaimSteps({
				stakingRewards: 5n,
				farmRewards: { '0xaaaa': 3n, '0xbbbb': 0n, '0xcccc': 7n },
				vaults: [{ id: 1n, earned: 10n }, { id: 2n, earned: 0n }, { id: 9n, earned: 1n }],
			}),
		).toEqual([
			{ kind: 'staking' },
			{ kind: 'farm', token: '0xaaaa', amount: 3n },
			{ kind: 'farm', token: '0xcccc', amount: 7n },
			{ kind: 'vaults', ids: [1n, 9n] },
		]);
	});

	it('skips every source with nothing to claim', () => {
		expect(planClaimSteps({ stakingRewards: 0n, farmRewards: { '0xaaaa': 0n }, vaults: [{ id: 1n, earned: 0n }] })).toEqual([]);
		expect(planClaimSteps({ stakingRewards: 0n, farmRewards: {}, vaults: [{ id: 4n, earned: 2n }] })).toEqual([{ kind: 'vaults', ids: [4n] }]);
		expect(planClaimSteps({ stakingRewards: 1n, farmRewards: {}, vaults: [] })).toEqual([{ kind: 'staking' }]);
	});
});

describe('runClaimSteps', () => {
	const steps: ClaimStep[] = [{ kind: 'staking' }, { kind: 'farm', token: '0xaaaa', amount: 1n }, { kind: 'vaults', ids: [3n] }];

	it('runs every step in order, announcing each before it starts', async () => {
		const log: string[] = [];
		const result = await runClaimSteps(
			steps,
			async (step) => {
				log.push(`run:${step.kind}`);
			},
			(index) => log.push(`start:${index}`),
		);
		expect(result).toEqual({ ok: true });
		expect(log).toEqual(['start:0', 'run:staking', 'start:1', 'run:farm', 'start:2', 'run:vaults']);
	});

	it('stops at the first failure and never sends the later steps', async () => {
		const failure = new Error('reverted');
		const execute = vi.fn(async (step: ClaimStep) => {
			if (step.kind === 'farm') throw failure;
		});
		const result = await runClaimSteps(steps, execute);
		expect(result).toEqual({ ok: false, index: 1, step: steps[1], error: failure });
		expect(execute).toHaveBeenCalledTimes(2);
		expect(execute).not.toHaveBeenCalledWith(steps[2]);
	});
});

describe('claimableUsd / claimErrorMessage', () => {
	it('sums priced claimables and ignores empty ones', () => {
		expect(claimableUsd([{ amount: 10, price: 0.2 }, { amount: 5, price: 1 }, { amount: 0, price: null }])).toBeCloseTo(7);
	});

	it('is null when any non-zero claimable has no price, rather than under-reporting', () => {
		expect(claimableUsd([{ amount: 10, price: 0.2 }, { amount: 3, price: null }])).toBeNull();
	});

	it('prefers the short wallet message, then the error message', () => {
		expect(claimErrorMessage(Object.assign(new Error('long details…'), { shortMessage: 'User rejected the request.' }))).toBe('User rejected the request.');
		expect(claimErrorMessage(new Error('Claim vault rewards failed'))).toBe('Claim vault rewards failed');
		expect(claimErrorMessage('nope')).toBeUndefined();
	});
});

describe('countTraders', () => {
	const swaps = (origins: string[]) => origins.map((origin, i) => ({ id: `0xs${String(i).padStart(3, '0')}`, origin }));

	/** Behaves like the subgraph: ordered by id, id > cursor, at most pageSize rows. */
	function subgraph(all: Array<{ id: string; origin: string }>, pageSize: number) {
		const cursors: string[] = [];
		const fetchPage = async (cursor: string) => {
			cursors.push(cursor);
			return all.filter((swap) => swap.id > cursor).slice(0, pageSize);
		};
		return { fetchPage, cursors };
	}

	it('dedupes origins case-insensitively across pages and stops on a short page', async () => {
		const all = swaps(['0xAAA', '0xaaa', '0xbbb', '0xccc', '0xBBB']);
		const { fetchPage, cursors } = subgraph(all, 2);
		expect(await countTraders(fetchPage, 2, 10)).toEqual({ count: 3, capped: false });
		expect(cursors).toEqual(['', all[1].id, all[3].id]);
	});

	it('reads one more (empty) page when the last page is exactly full', async () => {
		const all = swaps(['0x1', '0x2', '0x3', '0x4']);
		const { fetchPage, cursors } = subgraph(all, 2);
		expect(await countTraders(fetchPage, 2, 10)).toEqual({ count: 4, capped: false });
		expect(cursors).toHaveLength(3);
	});

	it('stops at the page cap and marks the count as a lower bound', async () => {
		const all = swaps(['0x1', '0x2', '0x3', '0x4', '0x5', '0x6']);
		const { fetchPage, cursors } = subgraph(all, 2);
		expect(await countTraders(fetchPage, 2, 2)).toEqual({ count: 4, capped: true });
		expect(cursors).toHaveLength(2);
	});
});
