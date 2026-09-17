import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { BUNDLED_LOGOS, resolveTokenLogo } from '@/utils/tokenLogos';
import type { Token } from '@/config/dex/types';

const list: Token[] = [
	{ chainId: 3890, address: '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b', decimals: 18, name: 'Wrapped KMT', symbol: 'wKMT', logoURI: '/tokens/klc.png' },
	{ chainId: 3890, address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', decimals: 6, name: 'Tether USD', symbol: 'USDT', logoURI: '/tokens/usdt.png' },
	{ chainId: 3890, address: '0x0000000000000000000000000000000000000001', decimals: 18, name: 'No Logo', symbol: 'NOLOGO', logoURI: '' },
];

describe('resolveTokenLogo', () => {
	it('prefers the logo the caller already has', () => {
		expect(resolveTokenLogo({ symbol: 'USDT', address: list[1].address, logoURI: '/custom.png' }, list)).toBe('/custom.png');
	});

	it('resolves a subgraph token (symbol + address only) from the list', () => {
		expect(resolveTokenLogo({ symbol: 'wKMT', address: list[0].address }, list)).toBe('/tokens/klc.png');
	});

	it('matches the address even when the symbol differs from the listed one', () => {
		// The subgraph reports raw on-chain symbols, which drift from the list's casing/aliases.
		expect(resolveTokenLogo({ symbol: 'WKMT', address: list[0].address.toUpperCase() }, list)).toBe('/tokens/klc.png');
	});

	it('falls back to the symbol when the address is unknown', () => {
		expect(resolveTokenLogo({ symbol: 'usdt', address: '0x00000000000000000000000000000000000000ff' }, list)).toBe('/tokens/usdt.png');
	});

	it('serves the KalyChain mark for the native coin, which has no /tokens/kmt.png', () => {
		// The bug the boss reported: KMT and wKMT drew a letter because the file is named klc.png.
		expect(resolveTokenLogo({ symbol: 'KMT' }, [])).toBe('/tokens/klc.png');
		expect(resolveTokenLogo({ symbol: 'wKMT' }, [])).toBe('/tokens/klc.png');
	});

	it('serves bundled logos for tokens the list never declares', () => {
		// KUSD and KSWAP are not in the bundled KalyChain list but do have pools.
		expect(resolveTokenLogo({ symbol: 'KUSD' }, list)).toBe('/tokens/kusd.png');
		expect(resolveTokenLogo({ symbol: 'KSWAP' }, list)).toBe('/tokens/kswap.png');
	});

	it('returns nothing for an unknown token so the caller draws initials', () => {
		expect(resolveTokenLogo({ symbol: 'PEPE', address: '0x0000000000000000000000000000000000000002' }, list)).toBeUndefined();
	});

	it('does not return a listed entry with an empty logoURI', () => {
		expect(resolveTokenLogo({ symbol: 'NOLOGO', address: list[2].address }, list)).toBeUndefined();
	});

	it('works with no list at all', () => {
		expect(resolveTokenLogo({ symbol: 'USDC' })).toBe('/tokens/usdc.png');
	});
});

describe('BUNDLED_LOGOS', () => {
	it('points only at files that exist in public/', () => {
		// Guards the map against drift: a renamed or deleted file must fail here, not in the browser.
		const missing = Object.entries(BUNDLED_LOGOS).filter(
			([, file]) => !existsSync(path.join(process.cwd(), 'public', file)),
		);
		expect(missing).toEqual([]);
	});
});
