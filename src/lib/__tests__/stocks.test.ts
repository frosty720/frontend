/**
 * The Stocks page lists what the Arcus router lists and executes what the SDK can sign. These pin
 * the decisions that would silently cost a user money if they drifted: which quote gets executed,
 * which amounts mean "pay" and which mean "receive", and that USDG / native ETH never appear as a
 * tradable asset.
 */
import { describe, expect, it } from 'vitest';
import { SpotRouterError, type FirmQuote, type PriceResponse, type QuoteResponse, type TokenInfo } from '@arcus-xyz/arcus-spot-sdk';
import { NATIVE_TOKEN_SENTINEL, USDG } from '@/config/stocks';
import {
	describeFees,
	isNativeTxQuote,
	pricePerToken,
	priceProblem,
	groupAssets,
	groupOf,
	midPrice,
	pickFirmQuote,
	pickPrice,
	searchAssets,
	stocksRouterClient,
	toStockAssets,
	tradePair,
	usdDecimals,
} from '../stocks';

const token = (symbol: string, category: string, extra: Partial<TokenInfo> = {}): TokenInfo => ({
	chainId: 4663,
	symbol,
	name: `${symbol} Inc`,
	address: `0x${symbol.toLowerCase().padEnd(40, '0').slice(0, 40)}` as `0x${string}`,
	decimals: 18,
	source: 'server',
	category: category as TokenInfo['category'],
	verified: category !== 'meme',
	wrappedTokenAddress: `0x${'f'.repeat(39)}${symbol.length}` as `0x${string}`,
	...extra,
});

const TSLA = token('aaa1', 'stock', { symbol: 'TSLA', name: 'Tesla' });
const NVDA = token('aaa2', 'stock', { symbol: 'NVDA', name: 'NVIDIA' });
const SPY = token('bbb1', 'index', { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' });
const GLD = token('ccc1', 'commodity', { symbol: 'GLD', name: 'SPDR Gold' });
const LEV = token('ddd1', 'pToken', { symbol: 'pBTC3x', name: 'BTC 3x' });
const MEME = token('eee1', 'meme', { symbol: 'WOJAK', name: 'Wojak' });
const NEWCAT = token('fff1', 'bond', { symbol: 'TBILL', name: 'T-Bill' });
const USDG_TOKEN = token('0', 'crypto', { symbol: 'USDG', address: USDG.address, decimals: 6 });
const ETH = token('0', 'crypto', { symbol: 'ETH', address: NATIVE_TOKEN_SENTINEL as `0x${string}` });
const OTHER_CHAIN = token('9991', 'stock', { symbol: 'XYZ', chainId: 46630 });

const LIST = [NVDA, MEME, TSLA, SPY, USDG_TOKEN, ETH, GLD, LEV, NEWCAT, OTHER_CHAIN];

describe('toStockAssets', () => {
	it('drops USDG (the trading currency), native ETH and other chains, in any address case', () => {
		const upper = { ...USDG_TOKEN, address: USDG.address.toUpperCase().replace('0X', '0x') as `0x${string}` };
		const symbols = toStockAssets([...LIST, upper]).map((a) => a.symbol);
		expect(symbols).not.toContain('USDG');
		expect(symbols).not.toContain('ETH');
		expect(symbols).not.toContain('XYZ');
		expect(symbols).toEqual(['NVDA', 'WOJAK', 'TSLA', 'SPY', 'GLD', 'pBTC3x', 'TBILL']);
	});

	it('files an unknown category under other instead of losing the token', () => {
		expect(toStockAssets([NEWCAT])[0].group).toBe('other');
		expect(groupOf('stock')).toBe('stock');
		expect(groupOf('somethingNew')).toBe('other');
	});

	it('uses the bundled company logo when there is one, over Robinhood’s generic token icon', () => {
		const realTsla = { ...TSLA, address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d' as `0x${string}` };
		const [asset] = toStockAssets([realTsla], { [realTsla.address.toLowerCase()]: 'https://cdn.robinhood.com/tsla.png' });
		expect(asset.logoURI).toBe('/stock-logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png');
	});

	it('attaches logos by lowercase address and keeps verification + wrapped address', () => {
		const [asset] = toStockAssets([TSLA], { [TSLA.address.toLowerCase()]: 'https://cdn.example/tsla.png' });
		expect(asset.logoURI).toBe('https://cdn.example/tsla.png');
		expect(asset.wrappedAddress).toBe(TSLA.wrappedTokenAddress);
		expect(toStockAssets([MEME])[0].verified).toBe(false);
		expect(toStockAssets([{ ...TSLA, wrappedTokenAddress: null }])[0].wrappedAddress).toBeUndefined();
	});
});

describe('groupAssets / searchAssets', () => {
	const assets = toStockAssets(LIST);

	it('orders groups stock → ETF → commodity → leveraged → crypto → meme → other, skipping empty ones', () => {
		expect(groupAssets(assets).map((g) => g.group)).toEqual(['stock', 'index', 'commodity', 'pToken', 'meme', 'other']);
		expect(groupAssets(assets)[0].assets.map((a) => a.symbol)).toEqual(['NVDA', 'TSLA']);
	});

	it('matches ticker or name, case-insensitively, and returns everything for a blank query', () => {
		expect(searchAssets(assets, 'tesla').map((a) => a.symbol)).toEqual(['TSLA']);
		expect(searchAssets(assets, 'spdr').map((a) => a.symbol)).toEqual(['SPY', 'GLD']);
		expect(searchAssets(assets, '  ')).toHaveLength(assets.length);
		expect(searchAssets(assets, 'zzz')).toEqual([]);
	});
});

describe('usdDecimals', () => {
	it('shows cents from $1, four places below, eight for meme-sized prices', () => {
		expect(usdDecimals(374.8)).toBe(2);
		expect(usdDecimals(1)).toBe(2);
		expect(usdDecimals(0.5)).toBe(4);
		expect(usdDecimals(0.01)).toBe(4);
		expect(usdDecimals(0.00001194)).toBe(8);
	});
});

describe('midPrice', () => {
	it('averages bid and ask, and refuses a missing or non-positive side', () => {
		expect(midPrice({ bid: 374.75, ask: 374.85, halted: false })).toBeCloseTo(374.8);
		expect(midPrice(undefined)).toBeNull();
		expect(midPrice({ bid: 0, ask: 10, halted: false })).toBeNull();
		expect(midPrice({ bid: 10, ask: Number.NaN, halted: false })).toBeNull();
	});
});

describe('tradePair', () => {
	const asset = { address: TSLA.address, decimals: 18 };

	it('buy pays USDG (6 decimals) for the asset', () => {
		expect(tradePair('buy', asset, 'USDG')).toEqual({ sellToken: USDG.address, buyToken: TSLA.address, sellDecimals: 6, buyDecimals: 18 });
	});

	it('sell pays the asset for USDG', () => {
		expect(tradePair('sell', asset, 'USDG')).toEqual({ sellToken: TSLA.address, buyToken: USDG.address, sellDecimals: 18, buyDecimals: 6 });
	});

	it('ETH trades use the router’s native-ETH address at 18 decimals', () => {
		expect(tradePair('buy', asset, 'ETH')).toEqual({ sellToken: NATIVE_TOKEN_SENTINEL, buyToken: TSLA.address, sellDecimals: 18, buyDecimals: 18 });
		expect(tradePair('sell', asset, 'ETH')).toEqual({ sellToken: TSLA.address, buyToken: NATIVE_TOKEN_SENTINEL, sellDecimals: 18, buyDecimals: 18 });
	});
});

const firm = (venue: FirmQuote['venue'], buyAmount: string, extra: Record<string, unknown> = {}) =>
	({ venue, buyAmount, sellAmount: '100000000', fees: [], ...extra }) as unknown as FirmQuote;

describe('pickFirmQuote', () => {
	it('takes the recommended quote when the SDK can sign it', () => {
		const response = { recommended: 'rialto', all: [firm('arcus', '300'), firm('rialto', '200')] } as QuoteResponse;
		expect(pickFirmQuote(response)?.venue).toBe('rialto');
	});

	it('never executes a Bebop quote (unsignable): falls back to the signable quote paying the most', () => {
		const response = { recommended: 'bebop', all: [firm('bebop', '999'), firm('arcus', '250'), firm('lifi', '260')] } as QuoteResponse;
		expect(pickFirmQuote(response)?.venue).toBe('lifi');
	});

	it('accepts a native-ETH buy (a transaction to send, no signature) and tells it apart', () => {
		const native = { venue: 'arcus', buyAmount: '11', sellAmount: '1', fees: [], expiry: 0, transaction: { to: '0x1', data: '0x', value: '1' } };
		const picked = pickFirmQuote({ recommended: 'arcus', all: [native] } as unknown as QuoteResponse)!;
		expect(isNativeTxQuote(picked)).toBe(true);
		expect(isNativeTxQuote(firm('arcus', '1', { toSign: {} }) as never)).toBe(false);
	});

	it('returns null when nothing is signable', () => {
		expect(pickFirmQuote({ recommended: 'bebop', all: [firm('bebop', '1')] } as QuoteResponse)).toBeNull();
		expect(pickFirmQuote({ recommended: 'arcus', all: [] } as QuoteResponse)).toBeNull();
	});
});

describe('pickPrice', () => {
	const price = (venue: string, buyAmount: string) => ({ venue, buyAmount, sellAmount: '100' });

	it('prefers the recommended signable venue, else the largest signable payout', () => {
		expect(pickPrice({ recommended: 'arcus', all: [price('arcus', '5'), price('rialto', '9')] } as PriceResponse)?.venue).toBe('arcus');
		expect(pickPrice({ recommended: 'bebop', all: [price('bebop', '50'), price('arcus', '5'), price('rialto', '9')] } as PriceResponse)?.venue).toBe(
			'rialto',
		);
	});

	it('ignores zero payouts and returns null when nothing usable is left', () => {
		expect(pickPrice({ recommended: 'arcus', all: [price('arcus', '0')] } as PriceResponse)).toBeNull();
	});
});

describe('describeFees', () => {
	const known = [
		{ address: USDG.address, symbol: 'USDG', decimals: 6 },
		{ address: TSLA.address, symbol: 'TSLA', decimals: 18 },
	];
	const fee = (amountUsd?: number, token: string = USDG.address, amount = '1') => ({ amount, token: token as `0x${string}`, type: 'protocol', amountUsd });

	it('totals USD when the router prices every fee (USDG trades: protocol fee + settlement gas)', () => {
		const summary = describeFees([fee(0.05), fee(0.027207)], known);
		expect(summary?.kind).toBe('usd');
		expect(summary?.kind === 'usd' && summary.total).toBeCloseTo(0.077207);
	});

	it('falls back to token amounts when a fee is unpriced (ETH buys are charged in the asset)', () => {
		expect(describeFees([fee(undefined, TSLA.address.toLowerCase(), '5547758268186')], known)).toEqual({
			kind: 'tokens',
			parts: [{ amount: 5547758268186n, symbol: 'TSLA', decimals: 18 }],
		});
	});

	it('adds up several fees in the same token', () => {
		expect(describeFees([fee(undefined, TSLA.address, '10'), fee(undefined, TSLA.address, '5')], known)).toEqual({
			kind: 'tokens',
			parts: [{ amount: 15n, symbol: 'TSLA', decimals: 18 }],
		});
	});

	it('shows nothing rather than a made-up number when there are no fees or one is in an unknown token', () => {
		expect(describeFees(undefined, known)).toBeNull();
		expect(describeFees([], known)).toBeNull();
		expect(describeFees([fee(undefined, '0x' + '9'.repeat(40))], known)).toBeNull();
	});
});

describe('pricePerToken', () => {
	it('buy: 100 USDG for 0.25 TSLA is 400 USDG per token', () => {
		expect(pricePerToken('buy', 100_000_000n, 250_000_000_000_000_000n, 18, 6)).toBeCloseTo(400);
	});

	it('sell: 0.5 TSLA for 187.5 USDG is 375 USDG per token', () => {
		expect(pricePerToken('sell', 500_000_000_000_000_000n, 187_500_000n, 18, 6)).toBeCloseTo(375);
	});

	it('works in ETH too: 0.001 ETH for 0.011 NVDA is ~0.0909 ETH per token', () => {
		expect(pricePerToken('buy', 10n ** 15n, 11n * 10n ** 15n, 18, 18)).toBeCloseTo(0.0909, 4);
	});

	it('has no price for a zero asset amount', () => {
		expect(pricePerToken('buy', 100_000_000n, 0n, 18, 6)).toBeNull();
	});
});

describe('priceProblem', () => {
	it('names a too-small trade from the router’s code', () => {
		expect(priceProblem(new SpotRouterError('x', { status: 422, body: { code: 'TRADE_NOTIONAL_BELOW_MINIMUM' } }))).toBe('belowMinimum');
	});

	it('treats any other refusal as nobody quoting', () => {
		expect(priceProblem(new SpotRouterError('x', { status: 422, body: { code: 'NO_QUOTES' } }))).toBe('noQuote');
		expect(priceProblem(new SpotRouterError('x', { status: 400, body: 'not json' }))).toBe('noQuote');
	});

	it('is not an answer for timeouts, 5xx or foreign errors (those are failures)', () => {
		expect(priceProblem(new SpotRouterError('aborted'))).toBeNull();
		expect(priceProblem(new SpotRouterError('x', { status: 504 }))).toBeNull();
		expect(priceProblem(new Error('boom'))).toBeNull();
	});
});

describe('stocksRouterClient', () => {
	it('points the SDK at this site’s proxy, versioned the way the SDK expects', () => {
		const client = stocksRouterClient('https://app.kalyswap.io');
		expect(client.baseUrl).toBe('https://app.kalyswap.io/stocks-api');
	});
});
