/**
 * KUSD must be in the bundled 3890 token list — the published GitHub list only carries 3888
 * tokens, so this list IS KalyChain's list — with the same address and decimals the KUSD pages
 * use; otherwise pools show "USDT/???" and the token picker has no KUSD (2026-09-28).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { KALYCHAIN_TOKENS } from '@/config/dex/tokens/kalychain';
import { KUSD_TOKEN } from '@/config/kusd';

describe('KUSD in the KalyChain token list', () => {
	const kusd = KALYCHAIN_TOKENS.find((t) => t.address.toLowerCase() === KUSD_TOKEN.address.toLowerCase());

	it('is listed on 3890 with the KUSD pages’ address, symbol and decimals', () => {
		expect(kusd).toBeDefined();
		expect(kusd?.chainId).toBe(CHAIN_IDS.KALYCHAIN);
		expect(kusd?.symbol).toBe(KUSD_TOKEN.symbol);
		expect(kusd?.decimals).toBe(KUSD_TOKEN.decimals);
	});

	it('has a logo that exists', () => {
		expect(kusd?.logoURI).toBe('/tokens/kusd.png');
		expect(existsSync(join(__dirname, '..', '..', '..', 'public', 'tokens', 'kusd.png'))).toBe(true);
	});
});
