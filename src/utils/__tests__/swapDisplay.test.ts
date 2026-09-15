import { describe, it, expect } from 'vitest';
import { routeHops, swapDirection, relativeTime, pairBaseToken, pairOrder } from '../swapDisplay';
import { getEffectiveAddress } from '@/utils/tokens';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import type { FormattedSwap } from '@/hooks/usePairSwaps';

const tok = (symbol: string, address: string, extra: Partial<Token> = {}): Token => ({
	chainId: CHAIN_IDS.KALYCHAIN,
	address,
	decimals: 18,
	name: symbol,
	symbol,
	logoURI: `/tokens/${symbol.toLowerCase()}.png`,
	...extra,
});
const KMT = tok('KMT', '0x0000000000000000000000000000000000000000', { isNative: true });
const USDT = tok('USDT', '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172');
const USDC = tok('USDC', '0x1111111111111111111111111111111111111111');
const WKMT = getEffectiveAddress(KMT);

describe('routeHops', () => {
	it('shows the picked tokens for a direct route, native KMT included', () => {
		expect(routeHops(KMT, USDT, [WKMT, USDT.address], [KMT, USDT]).map((h) => h.symbol)).toEqual(['KMT', 'USDT']);
	});

	it('looks intermediate hops up by address, case-insensitively', () => {
		const hops = routeHops(KMT, USDT, [WKMT, USDC.address.toUpperCase().replace('0X', '0x'), USDT.address], [KMT, USDT, USDC]);
		expect(hops.map((h) => h.symbol)).toEqual(['KMT', 'USDC', 'USDT']);
		expect(hops[1].logoURI).toBe('/tokens/usdc.png');
	});

	it('shortens an unknown intermediate address instead of dropping the hop', () => {
		const unknown = '0x9999999999999999999999999999999999999999';
		expect(routeHops(KMT, USDT, [WKMT, unknown, USDT.address], [KMT, USDT]).map((h) => h.symbol)).toEqual(['KMT', '0x9999…', 'USDT']);
	});

	it('uses the direct pair when there is no quote yet, and nothing without both tokens', () => {
		expect(routeHops(KMT, USDT, null, []).map((h) => h.symbol)).toEqual(['KMT', 'USDT']);
		expect(routeHops(null, USDT, null, [])).toEqual([]);
	});
});

describe('pairBaseToken', () => {
	// Real config stablecoin address (frontend/src/config/contracts.ts MAINNET_CONTRACTS.DAI) —
	// detection is address-based, so a look-alike symbol on a random address must NOT count.
	const DAI = tok('DAI', '0x8fbff791fCcF596DEf2e788549d0275557F95A21');
	const FAKE_USDT = tok('USDT', '0x9999999999999999999999999999999999999999');

	it('picks the non-stablecoin side when exactly one side is a stablecoin, either order', () => {
		expect(pairBaseToken(KMT, USDT)?.symbol).toBe('KMT');
		expect(pairBaseToken(USDT, KMT)?.symbol).toBe('KMT');
	});

	it('detects stablecoins by address, not symbol — a fake "USDT" at an unlisted address is not one', () => {
		expect(pairBaseToken(KMT, FAKE_USDT)).not.toBeNull();
		// Neither side is a real stablecoin here, so it falls through to the address-order rule
		// below rather than treating FAKE_USDT as the quote.
		const byAddress = WKMT.toLowerCase() < FAKE_USDT.address.toLowerCase() ? KMT : FAKE_USDT;
		expect(pairBaseToken(KMT, FAKE_USDT)).toBe(byAddress);
	});

	it('falls back to address order when both sides are real stablecoins', () => {
		expect(pairBaseToken(USDT, DAI)?.symbol).toBe('USDT');
		expect(pairBaseToken(DAI, USDT)?.symbol).toBe('USDT');
	});

	it('falls back to address order, independent of pick order, when neither side is a stablecoin', () => {
		const a = pairBaseToken(KMT, FAKE_USDT);
		const b = pairBaseToken(FAKE_USDT, KMT);
		expect(a).toBe(b);
	});

	it('returns null unless both tokens are known', () => {
		expect(pairBaseToken(null, USDT)).toBeNull();
		expect(pairBaseToken(KMT, null)).toBeNull();
	});
});

describe('swapDirection', () => {
	const base: FormattedSwap = {
		id: '1', hash: '0x', timestamp: new Date(0), blockNumber: 1, pairAddress: '0xpool',
		token0Symbol: 'USDT', token1Symbol: 'WKMT', token0Amount: '', token1Amount: '',
		amountUSD: 0, sender: '', from: '', to: '', type: 'BUY',
	};

	it('reads token0 as sold when its amount is negative', () => {
		expect(swapDirection({ ...base, token0Amount: '-100.000000', token1Amount: '+500.000000' })).toEqual({ from: 'USDT', to: 'WKMT', amount: 100 });
	});

	it('reads token1 as sold otherwise, with its absolute amount', () => {
		expect(swapDirection({ ...base, token0Amount: '+20.000000', token1Amount: '-100.500000' })).toEqual({ from: 'WKMT', to: 'USDT', amount: 100.5 });
	});
});

describe('relativeTime', () => {
	const now = new Date('2026-09-11T12:00:00Z');
	const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
	// fr-FR separates number and unit with a (narrow) no-break space; compare as plain spaces.
	const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ');

	it('formats minutes, hours and days in English', () => {
		expect(relativeTime(ago(120), now, 'en-US')).toBe('2 min. ago');
		expect(relativeTime(ago(3_600), now, 'en-US')).toBe('1 hr. ago');
		expect(relativeTime(ago(86_400), now, 'en-US')).toBe('yesterday');
		expect(relativeTime(ago(5), now, 'en-US')).toBe('5 sec. ago');
	});

	it('formats the same spans in French, like the reference ("il y a 2 min", "hier")', () => {
		expect(plain(relativeTime(ago(120), now, 'fr-FR'))).toBe('il y a 2 min');
		expect(plain(relativeTime(ago(3_600), now, 'fr-FR'))).toBe('il y a 1 h');
		expect(plain(relativeTime(ago(86_400), now, 'fr-FR'))).toBe('hier');
	});
});

describe('pairOrder', () => {
	const LOW = tok('AAA', '0x1000000000000000000000000000000000000001');
	const HIGH = tok('BBB', '0x2000000000000000000000000000000000000002');

	it('puts the stablecoin second whichever side the user picked it on', () => {
		expect(pairOrder(USDT, KMT)?.map((t) => t.symbol)).toEqual(['KMT', 'USDT']);
		expect(pairOrder(KMT, USDT)?.map((t) => t.symbol)).toEqual(['KMT', 'USDT']);
	});

	it('orders two non-stablecoins by address, so a reversed pick is flipped back', () => {
		expect(pairOrder(HIGH, LOW)?.map((t) => t.symbol)).toEqual(['AAA', 'BBB']);
		expect(pairOrder(LOW, HIGH)?.map((t) => t.symbol)).toEqual(['AAA', 'BBB']);
	});

	it('returns null until both tokens are picked', () => {
		expect(pairOrder(KMT, null)).toBeNull();
		expect(pairOrder(null, USDT)).toBeNull();
	});
});
