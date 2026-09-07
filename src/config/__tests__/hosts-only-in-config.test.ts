/**
 * Cut-day hostname switch is env-only: the KalyChain RPC and explorer hosts may appear
 * as string literals ONLY in src/config/chains.ts (as the env-var defaults). Anywhere
 * else must import KALYCHAIN_RPC_URL / KALYCHAIN_EXPLORER_URL / CHAIN_METADATA.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { KALYCHAIN_EXPLORER_URL, KALYCHAIN_RPC_URL, kalychain, CHAIN_METADATA, CHAIN_IDS } from '@/config/chains';

const SRC = join(__dirname, '..', '..');
const HOST = /[a-z0-9.-]*(kalyscan\.io|kalychain\.io\/rpc)/;

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.tsx?$/.test(entry)) out.push(full);
	}
	return out;
}

describe('KalyChain hostnames', () => {
	it('are literals only in src/config/chains.ts', () => {
		const offenders = walk(SRC)
			.filter((f) => !f.endsWith('config/chains.ts'))
			.filter((f) => HOST.test(readFileSync(f, 'utf8')))
			.map((f) => f.replace(SRC, 'src'));
		expect(offenders).toEqual([]);
	});

	it('flow from the two env-backed constants into the chain definition and metadata', () => {
		expect(kalychain.rpcUrls.default.http[0]).toBe(KALYCHAIN_RPC_URL);
		expect(kalychain.blockExplorers?.default.url).toBe(KALYCHAIN_EXPLORER_URL);
		expect(CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].explorer).toBe(KALYCHAIN_EXPLORER_URL);
		expect(CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].explorerApi).toBe(`${KALYCHAIN_EXPLORER_URL}/api`);
	});
});
