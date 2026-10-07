/**
 * The browser's last-resort Polygon RPC must answer keyless requests: polygon-rpc.com started
 * refusing them (401 "API key disabled", 2026-10-07), which would leave cash-out limits and
 * Polygon swaps with no RPC whenever thirdweb is down.
 */
import { describe, expect, it } from 'vitest';
import { CHAIN_IDS, RPC_URLS_ALL } from '@/config/chains';

describe('Polygon RPC fallback', () => {
	it('ends with publicnode, never polygon-rpc.com', () => {
		const urls = RPC_URLS_ALL[CHAIN_IDS.POLYGON];
		expect(urls.at(-1)).toBe('https://polygon-bor-rpc.publicnode.com');
		expect(urls.join(' ')).not.toContain('polygon-rpc.com');
	});
});
