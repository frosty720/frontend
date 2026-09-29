/**
 * The wallet panel's "View Assets" list (thirdweb supportedTokens). It shows about five rows with
 * no visible scrollbar, so KUSD must come first on KalyChain or users never find it — and moving
 * it must not drop or reshuffle any other token.
 */
import { describe, it, expect, vi } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { KALYCHAIN_TOKENS } from '@/config/dex/tokens/kalychain';
import { KUSD_TOKEN } from '@/config/kusd';

vi.mock('thirdweb/react', () => ({ ConnectButton: () => null, darkTheme: () => ({}) }));
vi.mock('@/config/thirdweb', () => ({ thirdwebClient: {}, allWallets: [], twKalychain: {}, thirdwebChains: [] }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({}) }));
vi.mock('@/i18n/hooks', () => ({ useDict: () => ({}) }));

import { supportedTokens } from '../ConnectWallet';

const lower = (a: string) => a.toLowerCase();

describe('ConnectWallet supportedTokens', () => {
	const kaly = supportedTokens[CHAIN_IDS.KALYCHAIN];

	it('lists KUSD first on KalyChain', () => {
		expect(lower(kaly[0].address)).toBe(lower(KUSD_TOKEN.address));
		expect(kaly[0].symbol).toBe('KUSD');
	});

	it('keeps every other KalyChain token once, in its configured order', () => {
		const expected = KALYCHAIN_TOKENS.filter(
			(t) => t.chainId === CHAIN_IDS.KALYCHAIN && !t.isNative && lower(t.address) !== lower(KUSD_TOKEN.address)
		).map((t) => t.symbol);
		expect(expected.length).toBeGreaterThan(0);
		expect(kaly.slice(1).map((t) => t.symbol)).toEqual(expected);
	});

	it('does not add KUSD to the other chains', () => {
		for (const chainId of [CHAIN_IDS.BSC, CHAIN_IDS.ARBITRUM]) {
			expect(supportedTokens[chainId].some((t) => lower(t.address) === lower(KUSD_TOKEN.address))).toBe(false);
		}
	});
});
