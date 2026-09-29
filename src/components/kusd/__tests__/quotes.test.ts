/**
 * The swap form's amount parsing and PSM quotes: a USDT amount can't carry a 7th decimal, a KUSD
 * amount below a micro-dollar can't be redeemed, and the quote must be what the PSM will move.
 */
import { describe, expect, it } from 'vitest';
import { parseAmount } from '../amounts';
import { quotePsm } from '../psmQuote';

const WAD = 10n ** 18n;
const PCT = WAD / 100n;

describe('parseAmount', () => {
	it('parses plain decimals up to the token precision', () => {
		expect(parseAmount('12.5', 6)).toBe(12_500_000n);
		expect(parseAmount(' 7 ', 18)).toBe(7n * WAD);
		expect(parseAmount('.5', 6)).toBe(500_000n);
	});
	it('rejects empty, signed, exponent, grouped and over-precise input', () => {
		for (const v of ['', '.', '-1', '1e6', '1,000', 'abc', '1.1234567']) expect(parseAmount(v, 6), v).toBeNull();
	});
});

describe('quotePsm', () => {
	it('sell: USDT in, KUSD out 1:1 less tin', () => {
		expect(quotePsm('sell', '1000', 0n, 0n)).toEqual({ gemAmt: 1_000_000_000n, pay: 1_000_000_000n, receive: 1_000n * WAD });
		expect(quotePsm('sell', '100', PCT, 0n)?.receive).toBe(99n * WAD);
	});
	it('buy: KUSD in, the most USDT it buys, charging the exact cost', () => {
		expect(quotePsm('buy', '40', 0n, 0n)).toEqual({ gemAmt: 40_000_000n, pay: 40n * WAD, receive: 40_000_000n });
		const withFee = quotePsm('buy', '101', 0n, PCT)!;
		expect(withFee.receive).toBe(100_000_000n);
		expect(withFee.pay).toBe(101n * WAD);
	});
	it('buy: sub-micro KUSD is not spent (USDT has 6 decimals)', () => {
		expect(quotePsm('buy', '1.0000009', 0n, 0n)?.pay).toBe(10n ** 18n);
		expect(quotePsm('buy', '0.0000001', 0n, 0n)).toBeNull();
	});
	it('returns null for missing or invalid input', () => {
		expect(quotePsm('sell', '', 0n, 0n)).toBeNull();
		expect(quotePsm('sell', '0', 0n, 0n)).toBeNull();
		expect(quotePsm('sell', '1.1234567', 0n, 0n)).toBeNull();
	});
});
