import { describe, it, expect } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { chainsForPage, isChainOkForPage } from '../pageChains';

describe('chainsForPage', () => {
	it('lets the bridge run on every network it moves funds between', () => {
		expect([...chainsForPage('bridge')].sort()).toEqual([CHAIN_IDS.BSC, CHAIN_IDS.POLYGON, CHAIN_IDS.KALYCHAIN, CHAIN_IDS.ARBITRUM].sort());
	});

	it('lets swaps run on every chain with a DEX, Polygon included', () => {
		expect(isChainOkForPage('swap', CHAIN_IDS.ARBITRUM)).toBe(true);
		expect(isChainOkForPage('swap', CHAIN_IDS.BSC)).toBe(true);
		expect(isChainOkForPage('swap', CHAIN_IDS.KALYCHAIN)).toBe(true);
		expect(isChainOkForPage('swap', CHAIN_IDS.POLYGON)).toBe(true);
		expect(isChainOkForPage('swap', 1)).toBe(false);
	});

	it('keeps every KalyChain-contract page on KalyChain', () => {
		for (const page of ['vaults', 'pools', 'farm', 'stake', 'launchpad', 'dashboard', null] as const) {
			expect(chainsForPage(page)).toEqual([CHAIN_IDS.KALYCHAIN]);
			expect(isChainOkForPage(page, CHAIN_IDS.ARBITRUM)).toBe(false);
			expect(isChainOkForPage(page, CHAIN_IDS.KALYCHAIN)).toBe(true);
		}
	});

	it('treats an unknown or missing chain as not usable', () => {
		expect(isChainOkForPage('swap', 1)).toBe(false);
		expect(isChainOkForPage('bridge', undefined)).toBe(false);
	});
});
