import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchTokenUsdPrices, usdPriceOf } from '../useTokenUsdPrices';
import { getEffectiveAddress } from '@/utils/tokens';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';

const USDT = '0x6318ecdbae6b469d39c38949edc671f4ba8a6172';
const tok = (symbol: string, address: string, extra: Partial<Token> = {}): Token => ({
	chainId: CHAIN_IDS.KALYCHAIN,
	address,
	decimals: 18,
	name: symbol,
	symbol,
	logoURI: '',
	...extra,
});
const KMT = tok('KMT', '0x0000000000000000000000000000000000000000', { isNative: true });
const WKMT = getEffectiveAddress(KMT).toLowerCase();

function mockSubgraph(body: unknown, ok = true) {
	const fetchMock = vi.fn(async () => ({ ok, status: ok ? 200 : 502, json: async () => body }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('fetchTokenUsdPrices', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('prices each token as derivedETH × ethPriceUSD, keyed by lowercase address', async () => {
		mockSubgraph({
			data: {
				bundles: [{ ethPriceUSD: '0.2' }],
				tokens: [
					{ id: WKMT, derivedETH: '1' },
					{ id: USDT, derivedETH: '5' },
				],
			},
		});
		const prices = await fetchTokenUsdPrices('https://subgraph.test', [WKMT, USDT.toUpperCase().replace('0X', '0x')]);
		expect(prices[WKMT]).toBeCloseTo(0.2);
		expect(prices[USDT]).toBeCloseTo(1);
	});

	it('drops tokens the subgraph cannot price and never sends a malformed id', async () => {
		const fetchMock = mockSubgraph({
			data: { bundles: [{ ethPriceUSD: '0.2' }], tokens: [{ id: USDT, derivedETH: '0' }] },
		});
		const prices = await fetchTokenUsdPrices('https://subgraph.test', [USDT, '"]) { evil }', 'not-an-address']);
		expect(prices).toEqual({});
		const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).query as string;
		expect(sent).toContain(`"${USDT}"`);
		expect(sent).not.toContain('evil');
	});

	it('skips the network entirely when no valid id remains', async () => {
		const fetchMock = mockSubgraph({});
		expect(await fetchTokenUsdPrices('https://subgraph.test', ['nope'])).toEqual({});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws on a failed response instead of reporting fake zero prices', async () => {
		mockSubgraph({}, false);
		await expect(fetchTokenUsdPrices('https://subgraph.test', [USDT])).rejects.toThrow('502');
		mockSubgraph({ errors: [{ message: 'bad' }] });
		await expect(fetchTokenUsdPrices('https://subgraph.test', [USDT])).rejects.toThrow();
	});
});

describe('usdPriceOf', () => {
	it('resolves the native token through its wrapped address', () => {
		expect(usdPriceOf({ [WKMT]: 0.2 }, KMT)).toBeCloseTo(0.2);
	});

	it('returns null for unknown or missing tokens', () => {
		expect(usdPriceOf({}, tok('USDT', USDT))).toBeNull();
		expect(usdPriceOf({ [USDT]: 1 }, null)).toBeNull();
	});
});
