/**
 * Guards the 2026-08-26 removal of the old 3888 V2 subgraph.
 *
 * The V2 client defaulted to the KalyChain-mainnet V2 subgraph and fell back to it for
 * ANY unrecognised chain, so passing chainId 3890 still queried the dead chain. Rather
 * than gate it, the V2 half was deleted. These tests fail if any of it comes back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as subgraphClient from '../subgraph-client';

const REMOVED_V2_EXPORTS = [
	'getSubgraphClient',
	'subgraphClient',
	'getFactoryData',
	'getPairsData',
	'getPairData',
	'getPairDayData',
	'getPairHourData',
	'getKalyswapDayData',
	'getTokenData',
	'getPairSwaps',
	'getRecentSwaps',
	'getPairMarketStats',
	'FACTORY_QUERY',
	'PAIRS_QUERY',
	'PAIR_QUERY',
	'PAIR_DAY_DATA_QUERY',
	'PAIR_HOUR_DATA_QUERY',
	'KALYSWAP_DAY_DATA_QUERY',
	'TOKEN_QUERY',
	'PAIR_SWAPS_QUERY',
	'RECENT_SWAPS_QUERY',
];

const SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.next') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.tsx?$/.test(entry)) out.push(full);
	}
	return out;
}

describe('V2 subgraph removal', () => {
	it('exports no V2 helpers from subgraph-client', () => {
		for (const name of REMOVED_V2_EXPORTS) {
			expect(subgraphClient, `${name} was re-added to subgraph-client`).not.toHaveProperty(name);
		}
	});

	it('still exports the V3 helpers', () => {
		expect(typeof subgraphClient.getV3PoolHourData).toBe('function');
		expect(typeof subgraphClient.getV3PoolStats).toBe('function');
		expect(typeof subgraphClient.getV3PoolSwaps).toBe('function');
		expect(typeof subgraphClient.getV3PoolForPair).toBe('function');
	});

	it('has no source file calling a V2 subgraph helper', () => {
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			if (file.endsWith('no-v2-subgraph.test.ts')) continue;
			const text = readFileSync(file, 'utf8');
			for (const name of REMOVED_V2_EXPORTS) {
				// Call sites only — a bare word in prose/comments is fine.
				if (new RegExp(`\\b${name}\\s*\\(`).test(text)) {
					offenders.push(`${file.replace(SRC, 'src')} → ${name}()`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
