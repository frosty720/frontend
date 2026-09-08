/**
 * KMT (3890) warp routes.
 *
 * A route the UI offers but the chain has not enrolled — or one whose two sides disagree
 * on decimals — destroys funds rather than moving them. That is exactly how ~2,740 USDC
 * was burned in 2026 (a stale BSC route plus an 18-vs-6 mismatch). These tests hold the
 * config to what was read off both chains on 2026-08-26.
 */
import { describe, it, expect } from 'vitest';
import { warpRouteConfigs } from '@/config/bridge/warpRoutes';
import { bridgeChains } from '@/config/bridge/chains';
import { CHAIN_IDS } from '@/config/chains';

const tokens = warpRouteConfigs.tokens;
const kmtTokens = tokens.filter((t) => t.chainName === 'kalychain');

/** Enrolment read from chain 3890 on 2026-08-26; BSC (DAI, ETH) and Polygon (USDC, DAI, ETH, WBTC) added 2026-09-08. */
const ON_CHAIN = {
	USDT: { address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', decimals: 6, remotes: ['arbitrum', 'polygon'] },
	USDC: { address: '0xf00A4b733093C21b0892eae0578F0a926f9370b3', decimals: 6, remotes: ['arbitrum', 'polygon'] },
	DAI: { address: '0x8fbff791fCcF596DEf2e788549d0275557F95A21', decimals: 18, remotes: ['arbitrum', 'bsc', 'polygon'] },
	WBTC: { address: '0xE3f1A8Af16d2Dcd0B6F1F813C449375f85C9d97F', decimals: 8, remotes: ['arbitrum', 'polygon'] },
	ETH: { address: '0x73b8fBACFF08DafD9a0a6cB8699C64a488d9EA2a', decimals: 18, remotes: ['arbitrum', 'bsc', 'polygon'] },
} as const;

describe('KalyChain bridge chain', () => {
	it('is registered with the right chain and domain id', () => {
		const kmt = bridgeChains.kalychain;
		expect(kmt).toBeTruthy();
		expect(kmt.chainId).toBe(CHAIN_IDS.KALYCHAIN);
		expect(kmt.domainId).toBe(CHAIN_IDS.KALYCHAIN);
	});

	it('names its native token KMT, not KLC', () => {
		expect(bridgeChains.kalychain.nativeToken?.symbol).toBe('KMT');
	});
});

describe('KalyChain warp routes', () => {
	it('lists exactly the five enrolled tokens', () => {
		expect(kmtTokens.map((t) => t.symbol).sort()).toEqual(['DAI', 'ETH', 'USDC', 'USDT', 'WBTC']);
	});

	it.each(Object.entries(ON_CHAIN))('%s matches the address and decimals on chain', (symbol, expected) => {
		const t = kmtTokens.find((x) => x.symbol === symbol)!;
		expect(t.addressOrDenom).toBe(expected.address);
		expect(t.decimals).toBe(expected.decimals);
	});

	it.each(Object.entries(ON_CHAIN))('%s offers only routes the chain has enrolled', (symbol, expected) => {
		const t = kmtTokens.find((x) => x.symbol === symbol)!;
		const remotes = (t.connections ?? []).map((c) => c.token.split('|')[1]).sort();
		expect(remotes).toEqual([...expected.remotes].sort());
	});

	it('every kmt connection points at a token that exists in the config', () => {
		const known = new Set(tokens.map((t) => `${t.chainName}|${t.addressOrDenom!.toLowerCase()}`));
		for (const t of kmtTokens) {
			for (const c of t.connections ?? []) {
				const [, chain, addr] = c.token.split('|');
				expect(known.has(`${chain}|${addr.toLowerCase()}`), `${t.symbol} -> ${c.token}`).toBe(true);
			}
		}
	});

	it('is symmetric — every remote KalyChain names, names it back', () => {
		for (const t of kmtTokens) {
			for (const c of t.connections ?? []) {
				const [, chain, addr] = c.token.split('|');
				const remote = tokens.find(
					(x) => x.chainName === chain && x.addressOrDenom!.toLowerCase() === addr.toLowerCase()
				)!;
				const back = (remote.connections ?? []).some(
					(rc) => rc.token.toLowerCase() === `ethereum|kalychain|${t.addressOrDenom!.toLowerCase()}`
				);
				expect(back, `${chain} ${remote.symbol} does not route back to kalychain`).toBe(true);
			}
		}
	});

	it('agrees on decimals with the remote side of every route', () => {
		for (const t of kmtTokens) {
			for (const c of t.connections ?? []) {
				const [, chain, addr] = c.token.split('|');
				const remote = tokens.find(
					(x) => x.chainName === chain && x.addressOrDenom!.toLowerCase() === addr.toLowerCase()
				)!;
				expect(remote.decimals, `${t.symbol} ${chain} decimals`).toBe(t.decimals);
			}
		}
	});
});

describe('the route graph is closed', () => {
	// A route with no reachable counterpart is a bridge that cannot complete. KLC, BNB
	// and POL all ended up in that state when KalyChain's 3888 leg was replaced.
	it('has no orphaned route — every token can reach somewhere', () => {
		const orphans = tokens
			.filter((t) => (t.connections ?? []).length === 0)
			.map((t) => `${t.chainName}/${t.symbol}`);
		expect(orphans).toEqual([]);
	});

	it('has no dangling connection — every destination exists in the config', () => {
		const known = new Set(tokens.map((t) => `${t.chainName}|${t.addressOrDenom!.toLowerCase()}`));
		const dangling: string[] = [];
		for (const t of tokens) {
			for (const c of t.connections ?? []) {
				const [, chain, addr] = c.token.split('|');
				if (!known.has(`${chain}|${addr.toLowerCase()}`)) {
					dangling.push(`${t.chainName}/${t.symbol} -> ${chain}|${addr}`);
				}
			}
		}
		expect(dangling).toEqual([]);
	});

	// The relayer only relays to/from KalyChain. A remote<->remote connection is a route the
	// UI can start but nothing can finish: 514 DAI was stranded on Polygon -> BSC that way.
	it('every connection has KalyChain on one side', () => {
		const offenders: string[] = [];
		for (const t of tokens) {
			for (const c of t.connections ?? []) {
				const [, chain] = c.token.split('|');
				if (t.chainName !== 'kalychain' && chain !== 'kalychain') offenders.push(`${t.chainName}/${t.symbol} -> ${chain}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('no longer offers the retired KLC', () => {
		// KalyChain relaunched as KMT; synthetic KLC on other chains has no home to return to.
		expect(tokens.map((t) => t.symbol)).not.toContain('KLC');
	});

	it('offers only assets that are actually enrolled on KalyChain', () => {
		const kalychainAssets = new Set(kmtTokens.map((t) => t.symbol));
		for (const t of tokens) {
			expect(kalychainAssets.has(t.symbol!), `${t.chainName}/${t.symbol} has no KalyChain leg`).toBe(true);
		}
	});
});
