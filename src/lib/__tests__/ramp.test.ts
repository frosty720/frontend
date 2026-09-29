/**
 * The fiat-ramp client (ported from kusd-ui, where each rule below was learned from a production
 * failure): international phone format, dial-code normalisation, corridor limits, the keeper's
 * error keys, and the split between a definitive rejection and an unknown outcome that the
 * idempotency-key retry depends on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	amountWithinCorridorLimits,
	buildDepositSource,
	countryDisplayName,
	dedupeNetworksByName,
	fetchRampChannels,
	fetchRampQuote,
	isEvmAddress,
	isInternationalPhone,
	isRampDepositId,
	isTerminalDepositState,
	isValidLocalAmount,
	makeIdempotencyKey,
	normalizePhoneForCountry,
	paymentMethods,
	railKey,
	RampApiError,
	sourceAccountTypeFor,
	type RampCorridor,
} from '../ramp';

describe('paymentMethods (Buy/Sell page panel)', () => {
	const corridor = (channelType: RampCorridor['channelType'], names: string[]): RampCorridor => ({
		channelId: `${channelType}-${names.join('-')}`,
		country: 'CI',
		currency: 'XOF',
		channelType,
		min: null,
		max: null,
		estimatedSettlementTime: null,
		networks: names.map((name, i) => ({ id: `${name}-${i}`, name, accountNumberType: null })),
	});

	it('lists each mobile-money operator once, across corridors, and flags bank transfer', () => {
		// Yellow Card lists "Wave" twice in CI under different ids
		const m = paymentMethods([corridor('momo', ['Orange Money', 'Wave', 'Wave ']), corridor('momo', ['MTN MoMo', 'wave']), corridor('bank', ['Ecobank'])]);
		expect(m.operators).toEqual(['Orange Money', 'Wave', 'MTN MoMo']);
		expect(m.bank).toBe(true);
	});

	it('lists nothing the keeper did not report', () => {
		expect(paymentMethods([])).toEqual({ operators: [], bank: false });
		expect(paymentMethods([corridor('momo', ['Wave'])]).bank).toBe(false);
	});
});

describe('isEvmAddress', () => {
	it('accepts a checksummed address', () => {
		expect(isEvmAddress('0xfF409DBD66bD013385c41cb55D8cD90902BB4c80')).toBe(true);
	});
	it('accepts lowercase and trims whitespace', () => {
		expect(isEvmAddress('  0xff409dbd66bd013385c41cb55d8cd90902bb4c80 ')).toBe(true);
	});
	it('rejects wrong length, missing prefix, and garbage', () => {
		expect(isEvmAddress('0xfF409DBD66bD013385c41cb55D8cD90902BB4c8')).toBe(false);
		expect(isEvmAddress('fF409DBD66bD013385c41cb55D8cD90902BB4c80')).toBe(false);
		expect(isEvmAddress('not an address')).toBe(false);
		expect(isEvmAddress('')).toBe(false);
	});
});

describe('isValidLocalAmount', () => {
	it('accepts integers and decimals', () => {
		expect(isValidLocalAmount('25000')).toBe(true);
		expect(isValidLocalAmount('25000.50')).toBe(true);
	});
	it('rejects zero, negatives, and non-numeric input', () => {
		expect(isValidLocalAmount('0')).toBe(false);
		expect(isValidLocalAmount('-5')).toBe(false);
		expect(isValidLocalAmount('1e5')).toBe(false);
		expect(isValidLocalAmount('25,000')).toBe(false);
		expect(isValidLocalAmount('')).toBe(false);
	});
});

describe('makeIdempotencyKey', () => {
	it('embeds the wallet fragment and is unique per call', () => {
		const wallet = '0xfF409DBD66bD013385c41cb55D8cD90902BB4c80';
		const a = makeIdempotencyKey(wallet);
		const b = makeIdempotencyKey(wallet);
		expect(a).toContain('ff409dbd');
		expect(a).not.toBe(b);
		expect(a.length).toBeGreaterThanOrEqual(8); // keeper requires min 8 chars
	});
});

describe('sourceAccountTypeFor / railKey', () => {
	it('maps momo to momo and every other rail to bank', () => {
		expect(sourceAccountTypeFor('momo')).toBe('momo');
		expect(sourceAccountTypeFor('bank')).toBe('bank');
		// NG's NGN deposit rail is p2p but the payer still uses a bank account.
		expect(sourceAccountTypeFor('p2p')).toBe('bank');
	});
	it('labels p2p as a bank transfer', () => {
		expect(railKey('momo')).toBe('momo');
		expect(railKey('bank')).toBe('bank');
		expect(railKey('p2p')).toBe('bank');
	});
});

describe('countryDisplayName', () => {
	it('resolves ISO codes via Intl without a hardcoded list, in the reader’s language', () => {
		expect(countryDisplayName('NG')).toBe('Nigeria');
		expect(countryDisplayName('CM')).toBe('Cameroon');
		expect(countryDisplayName('CM', 'fr')).toBe('Cameroun');
	});
	it('falls back to the code for unknown or invalid input', () => {
		// XQ is unassigned in ISO 3166 — CLDR has no name for it.
		expect(countryDisplayName('XQ')).toBe('XQ');
		expect(countryDisplayName('not-a-code')).toBe('not-a-code');
	});
});

describe('amountWithinCorridorLimits', () => {
	it('enforces min and max when both are set', () => {
		const c = { min: 2500, max: 5000000 };
		expect(amountWithinCorridorLimits('2500', c)).toBe(true);
		expect(amountWithinCorridorLimits('2499', c)).toBe(false);
		expect(amountWithinCorridorLimits('5000000', c)).toBe(true);
		expect(amountWithinCorridorLimits('5000001', c)).toBe(false);
	});
	it('treats 0 and null bounds as no limit (Yellow Card uses 0 for none)', () => {
		expect(amountWithinCorridorLimits('999999999', { min: 150, max: 0 })).toBe(true);
		expect(amountWithinCorridorLimits('1', { min: 0, max: null })).toBe(true);
	});
	it('rejects non-numeric input', () => {
		expect(amountWithinCorridorLimits('abc', { min: null, max: null })).toBe(false);
	});
});

describe('isInternationalPhone', () => {
	it('accepts + international numbers with common separators', () => {
		expect(isInternationalPhone('+2348012345678')).toBe(true);
		expect(isInternationalPhone('+225 05 56 41 80 73')).toBe(true);
		expect(isInternationalPhone('+237 677-889-900')).toBe(true);
	});
	it('REJECTS local formats — YC hard-rejects them (prod 2026-08-11)', () => {
		expect(isInternationalPhone('0556418073')).toBe(false);
		expect(isInternationalPhone('0801 234 5678')).toBe(false);
	});
	it('rejects too-short, too-long, and non-numeric input', () => {
		expect(isInternationalPhone('+12345')).toBe(false);
		expect(isInternationalPhone(`+${'1'.repeat(16)}`)).toBe(false);
		expect(isInternationalPhone('call-me-maybe')).toBe(false);
		expect(isInternationalPhone('')).toBe(false);
	});
});

describe('normalizePhoneForCountry', () => {
	// Prod report 2026-08-13: a Burkina Faso user's valid 8-digit local number was rejected
	// because the form demanded hand-typed international format.
	it('prepends the dial code to a bare local number (BF, 8 digits)', () => {
		expect(normalizePhoneForCountry('70216205', 'BF')).toBe('+22670216205');
	});
	it('normalized local input passes isInternationalPhone (the BF regression)', () => {
		expect(isInternationalPhone(normalizePhoneForCountry('70216205', 'BF'))).toBe(true);
	});
	it('passes already-international numbers through, stripping separators', () => {
		expect(normalizePhoneForCountry('+22670216205', 'BF')).toBe('+22670216205');
		expect(normalizePhoneForCountry('+226 70 21 62 05', 'BF')).toBe('+22670216205');
	});
	it('strips separators from local input before prepending', () => {
		expect(normalizePhoneForCountry('70 21 62 05', 'BF')).toBe('+22670216205');
	});
	it('converts the 00 international-dialing prefix to +', () => {
		expect(normalizePhoneForCountry('0022670216205', 'BF')).toBe('+22670216205');
	});
	it('adds only + when the country code was typed without it', () => {
		expect(normalizePhoneForCountry('22670216205', 'BF')).toBe('+22670216205');
	});
	it('does NOT mistake a local number starting with the dial digits for a country-coded one', () => {
		// 22 67 02 16 is a plausible 8-digit BF landline — far too short to already contain one.
		expect(normalizePhoneForCountry('22670216', 'BF')).toBe('+22622670216');
	});
	it('drops the trunk 0 for countries that omit it internationally (NG)', () => {
		expect(normalizePhoneForCountry('08012345678', 'NG')).toBe('+2348012345678');
	});
	it('keeps the leading 0 for CI — it became part of the number in 2021', () => {
		expect(normalizePhoneForCountry('0701234567', 'CI')).toBe('+2250701234567');
	});
	it('returns input unchanged (minus separators) for unknown countries', () => {
		expect(normalizePhoneForCountry('70 21 62 05', 'XQ')).toBe('70216205');
	});
	it('leaves non-numeric and empty input for the validator to reject', () => {
		expect(normalizePhoneForCountry('abc123', 'BF')).toBe('abc123');
		expect(normalizePhoneForCountry('', 'BF')).toBe('');
	});
});

describe('buildDepositSource', () => {
	it('builds a bank source with no account details for bank and p2p rails', () => {
		expect(buildDepositSource('bank')).toEqual({ accountType: 'bank' });
		expect(buildDepositSource('p2p')).toEqual({ accountType: 'bank' });
		// stray momo state left in the form must not leak into a bank source
		expect(buildDepositSource('bank', { phone: '0801', networkId: 'n1' })).toEqual({ accountType: 'bank' });
	});
	it('builds a momo source with normalized payer phone and networkId', () => {
		expect(buildDepositSource('momo', { phone: '+237 677 (889) 900', networkId: 'net-1' })).toEqual({
			accountType: 'momo',
			accountNumber: '+237677889900',
			networkId: 'net-1',
		});
	});
	it('omits networkId when the corridor has no networks to pick', () => {
		const src = buildDepositSource('momo', { phone: '0801234567' });
		expect(src).toEqual({ accountType: 'momo', accountNumber: '0801234567' });
		expect('networkId' in src).toBe(false);
	});
});

describe('dedupeNetworksByName', () => {
	it('keeps the first id per case-insensitive operator name (CI lists Wave twice)', () => {
		const nets = [
			{ id: 'a', name: 'Wave', accountNumberType: null },
			{ id: 'b', name: 'Moov', accountNumberType: null },
			{ id: 'c', name: 'wave ', accountNumberType: null },
			{ id: 'd', name: 'Moov money', accountNumberType: null },
		];
		expect(dedupeNetworksByName(nets).map((n) => n.id)).toEqual(['a', 'b', 'd']);
	});
	it('passes through an already-unique list untouched', () => {
		const nets = [
			{ id: 'a', name: 'MTN', accountNumberType: null },
			{ id: 'b', name: 'Moov', accountNumberType: null },
		];
		expect(dedupeNetworksByName(nets)).toEqual(nets);
	});
});

describe('isRampDepositId', () => {
	it('accepts keeper deposit ids and rejects anything that could reshape the keeper path', () => {
		expect(isRampDepositId('fe2fea2f-1c2d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
		expect(isRampDepositId('short')).toBe(false);
		expect(isRampDepositId('../admin/pause')).toBe(false);
		expect(isRampDepositId('abc?x=1&y=2')).toBe(false);
	});
});

describe('fetchRampChannels', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('calls the ramp proxy, not /api (nginx sends /api to the backend)', async () => {
		const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({ corridors: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await fetchRampChannels();
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/ramp-api/channels');
	});
	it("passes through the keeper's USD policy bounds alongside corridors", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ corridors: [], minDepositUsd: '5', maxDepositUsd: '20000' }), { status: 200 })),
		);
		const res = await fetchRampChannels();
		expect(res.corridors).toEqual([]);
		expect(res.minDepositUsd).toBe('5');
		expect(res.maxDepositUsd).toBe('20000');
	});
	it('defaults corridors to an empty array when absent', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
		expect((await fetchRampChannels()).corridors).toEqual([]);
	});
});

describe('fetchRampQuote', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sends the corridor context YC's fee config requires (country, channelType)", async () => {
		const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({ payoutUsd: '9.8' }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await fetchRampQuote('XOF', '6000', { country: 'CI', channelType: 'momo' });
		const url = String(fetchMock.mock.calls[0]?.[0]);
		expect(url.startsWith('/ramp-api/quote?')).toBe(true);
		expect(url).toContain('currency=XOF');
		expect(url).toContain('localAmount=6000');
		expect(url).toContain('country=CI');
		expect(url).toContain('channelType=momo');
	});
});

describe('RampApiError vs unknown outcomes', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const failWith = (status: number, body: unknown) =>
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

	it('carries the keeper error key for known keys', async () => {
		failWith(422, { error: 'amount_out_of_range' });
		const err = (await fetchRampQuote('NGN', '1').catch((e) => e)) as RampApiError;
		expect(err).toBeInstanceOf(RampApiError);
		expect(err.status).toBe(422);
		expect(err.key).toBe('amount_out_of_range');
		expect(err.outcomeUnknown).toBe(false);
	});
	it("prefers Yellow Card's specific code over the keeper's generic 'provider'", async () => {
		failWith(502, { error: 'provider', code: 'InvalidPhoneNumberFormat' });
		const err = (await fetchRampQuote('NGN', '1').catch((e) => e)) as RampApiError;
		expect(err.key).toBe('InvalidPhoneNumberFormat');
	});
	it('keeps an unmapped code only as raw diagnostics (never a key)', async () => {
		// Fastify's default 400 body ({error: "Bad Request"}) reached users verbatim on 2026-08-12.
		failWith(400, { error: 'Bad Request' });
		const err = (await fetchRampQuote('NGN', '1').catch((e) => e)) as RampApiError;
		expect(err.key).toBeNull();
		expect(err.raw).toBe('Bad Request');
	});
	it('prefers the specific code over the generic error in the raw diagnostics', async () => {
		failWith(400, { error: 'Bad Request', code: 'InvalidRequestBody' });
		expect(((await fetchRampQuote('NGN', '1').catch((e) => e)) as RampApiError).raw).toBe('InvalidRequestBody');
	});
	it('marks a keeper the proxy could not reach as an UNKNOWN outcome (a deposit may exist)', async () => {
		failWith(504, { error: 'keeper_unreachable' });
		const err = (await fetchRampQuote('NGN', '1').catch((e) => e)) as RampApiError;
		expect(err).toBeInstanceOf(RampApiError);
		expect(err.outcomeUnknown).toBe(true);
	});
	it('lets browser network failures propagate as plain errors (outcome unknown)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			}),
		);
		const err = await fetchRampQuote('NGN', '1').catch((e) => e);
		expect(err).toBeInstanceOf(TypeError);
		expect(err).not.toBeInstanceOf(RampApiError);
	});
});

describe('isTerminalDepositState', () => {
	// State names must match the keeper's DepositState union exactly — 'paid', not 'paid_out'.
	it('flags terminal states', () => {
		for (const s of ['paid', 'expired', 'failed_create', 'manual_review']) expect(isTerminalDepositState(s)).toBe(true);
	});
	it('keeps polling on in-flight states', () => {
		for (const s of ['created', 'awaiting_payment', 'fiat_confirmed', 'paying']) expect(isTerminalDepositState(s)).toBe(false);
	});
});
