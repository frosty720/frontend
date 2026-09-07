/**
 * The pools page listed KalyChain MAINNET's V3 pools (WKLC/USDT, KSWAP, KUSD…) while
 * the wallet was on 3890, because `getSubgraphUrl` defaulted an undefined chain to
 * CHAIN_IDS.KALYCHAIN. `useAccount().chainId` is undefined until a wallet reports in,
 * so that default fired routinely.
 *
 * These tests hold the two halves of the fix: one shared resolver, and no chain
 * falling back to another chain's subgraph.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CHAIN_IDS } from '@/config/chains';
import { getV3Config } from '@/config/dex/v3-config';

const SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.tsx?$/.test(entry)) out.push(full);
	}
	return out;
}

describe('V3 subgraph routing', () => {
	it('points KalyChain at its own subgraph', () => {
		const url = getV3Config(CHAIN_IDS.KALYCHAIN)!.subgraphUrl;
		expect(url).toBeTruthy();
		// the relaunch subgraph, not the dead 3888 one
		expect(url).toContain('v3-subgraph-kmt');
	});

	it('returns no config for an unknown chain rather than mainnet', () => {
		// The caller must render nothing, not another chain's pools.
		expect(getV3Config(1)).toBeNull();
		expect(getV3Config(999999)).toBeNull();
	});

	it('never re-introduces a mainnet default in the subgraph URL resolver', () => {
		const src = readFileSync(join(SRC, 'hooks', 'v3', 'useV3Subgraph.ts'), 'utf8');
		// the exact shape of the bug: `chainId ?? CHAIN_IDS.KALYCHAIN`
		expect(src).not.toMatch(/chainId\s*\?\?\s*CHAIN_IDS\./);
		expect(src).not.toMatch(/chainId\s*\|\|\s*CHAIN_IDS\./);
	});
});

describe('chain resolution is not copy-pasted', () => {
	it('only useResolvedChainId inlines the thirdweb/wagmi/default ladder', () => {
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			if (file.endsWith(join('hooks', 'useResolvedChainId.ts'))) continue;
			if (file.endsWith(join('connectors', 'thirdwebBridge.ts'))) continue; // the bridge itself
			const text = readFileSync(file, 'utf8');
			if (/const\s+thirdwebChain\s*=\s*useActiveWalletChain\(\)/.test(text) &&
				/useChainId\(\)/.test(text)) {
				offenders.push(file.replace(SRC, 'src'));
			}
		}
		expect(offenders).toEqual([]);
	});
});
