/**
 * The /stocks-api proxy: it must price tokens per TOKEN (not per share), keep only Robinhood Chain
 * deployments, report an unreachable router as an unknown outcome, and not hammer upstreams
 * (shared caches) while never caching a failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ARCUS_UNREACHABLE,
	arcusFetch,
	arcusTokens,
	clearStocksCache,
	memeMarket,
	parseGeckoTokens,
	parseRobinhoodAssets,
	parseRobinhoodPrices,
	robinhoodMarket,
	stocksMarket,
} from '../stocksServer';

const TSLA = '0x322F0929c4625eD5bAd873c95208D54E1c003b2d';
const CRM = '0xd95B44124e475743a7589e68F3D74008A5536D44';

const deployment = (contractAddress: string, chainId = 4663) => ({ contractAddress, chainId, networkName: 'Robinhood Chain' });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const upstream = vi.fn(async (_url: string | URL, _init?: RequestInit) => json({}));

beforeEach(() => {
	clearStocksCache();
	upstream.mockReset();
	vi.stubGlobal('fetch', upstream);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe('parseRobinhoodAssets', () => {
	it('maps each Robinhood Chain deployment to its logo, lowercased', () => {
		const logos = parseRobinhoodAssets({
			assets: [
				{ tokenSymbol: 'TSLA', logoUrl: 'https://cdn.robinhood.com/tsla.png', deployments: [deployment(TSLA), deployment('0x' + '1'.repeat(40), 1)] },
			],
		});
		expect(logos).toEqual({ [TSLA.toLowerCase()]: 'https://cdn.robinhood.com/tsla.png' });
	});

	it('skips non-https logos and malformed entries without throwing', () => {
		expect(parseRobinhoodAssets({ assets: [{ logoUrl: 'javascript:alert(1)', deployments: [deployment(TSLA)] }, null, 'x'] })).toEqual({});
		expect(parseRobinhoodAssets(null)).toEqual({});
		expect(parseRobinhoodAssets({ assets: 'nope' })).toEqual({});
	});
});

describe('parseRobinhoodPrices', () => {
	it('uses the per-token bid/ask, not the per-share one (they differ once a dividend lifts the multiplier)', () => {
		const prices = parseRobinhoodPrices({
			quotes: [{ tokenSymbol: 'CRM', bid: '227.26', ask: '227.66', tokenBid: '227.52', tokenAsk: '227.92', isTradingHalt: false, deployments: [deployment(CRM)] }],
		});
		expect(prices[CRM.toLowerCase()]).toEqual({ bid: 227.52, ask: 227.92, halted: false });
	});

	it('flags halted names and drops quotes without a usable per-token price', () => {
		const prices = parseRobinhoodPrices({
			quotes: [
				{ tokenBid: '10', tokenAsk: '11', isTradingHalt: true, deployments: [deployment(TSLA)] },
				{ bid: '5', ask: '6', deployments: [deployment(CRM)] },
				{ tokenBid: '0', tokenAsk: '6', deployments: [deployment('0x' + '2'.repeat(40))] },
			],
		});
		expect(prices).toEqual({ [TSLA.toLowerCase()]: { bid: 10, ask: 11, halted: true } });
	});
});

describe('arcusFetch', () => {
	it('forwards to the Arcus router and passes status + body through', async () => {
		upstream.mockResolvedValueOnce(json({ code: 'NO_QUOTES' }, 422));
		const r = await arcusFetch('/v1/price?sellAmount=1');
		expect(r).toEqual({ status: 422, body: { code: 'NO_QUOTES' } });
		expect(String(upstream.mock.calls[0][0])).toBe('https://router.spot.arcus.xyz/v1/price?sellAmount=1');
	});

	it('posts a JSON body verbatim', async () => {
		upstream.mockResolvedValueOnce(json({ txHash: '0xabc' }));
		await arcusFetch('/v1/submit', { method: 'POST', body: '{"venue":"arcus"}' });
		const init = upstream.mock.calls[0][1]!;
		expect(init.method).toBe('POST');
		expect(init.body).toBe('{"venue":"arcus"}');
		expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
	});

	it('reports an unreachable router as 504 arcus_unreachable (outcome unknown)', async () => {
		upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
		expect(await arcusFetch('/v1/submit', { method: 'POST', body: '{}' })).toEqual({ status: 504, body: { error: ARCUS_UNREACHABLE } });
	});

	it('maps a non-JSON reply to a JSON error', async () => {
		upstream.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
		expect(await arcusFetch('/v1/tokens')).toEqual({ status: 502, body: { error: 'bad router response' } });
	});
});

describe('arcusTokens', () => {
	it('serves one cached copy for 5 minutes, then refreshes', async () => {
		upstream.mockResolvedValue(json([{ symbol: 'TSLA' }]));
		await arcusTokens(0);
		await arcusTokens(4 * 60_000);
		expect(upstream).toHaveBeenCalledTimes(1);
		await arcusTokens(5 * 60_000 + 1);
		expect(upstream).toHaveBeenCalledTimes(2);
	});

	it('never caches a failure', async () => {
		upstream.mockResolvedValueOnce(json({ error: 'down' }, 503)).mockResolvedValueOnce(json([{ symbol: 'TSLA' }]));
		expect((await arcusTokens(0)).status).toBe(503);
		expect((await arcusTokens(1)).status).toBe(200);
	});
});

describe('robinhoodMarket', () => {
	const assets = { assets: [{ logoUrl: 'https://cdn.robinhood.com/tsla.png', deployments: [deployment(TSLA)] }] };
	const prices = { quotes: [{ tokenBid: '374.7', tokenAsk: '374.9', deployments: [deployment(TSLA)] }] };
	const route = (assetsRes: Response | Error, pricesRes: Response | Error) =>
		upstream.mockImplementation(async (url) => {
			const res = String(url).endsWith('/assets') ? assetsRes : pricesRes;
			if (res instanceof Error) throw res;
			return res.clone();
		});

	it('combines logos and per-token prices', async () => {
		route(json(assets), json(prices));
		const r = await robinhoodMarket(0);
		expect(r.status).toBe(200);
		expect(r.body).toEqual({
			logos: { [TSLA.toLowerCase()]: 'https://cdn.robinhood.com/tsla.png' },
			prices: { [TSLA.toLowerCase()]: { bid: 374.7, ask: 374.9, halted: false } },
		});
		expect(upstream.mock.calls.map(([u]) => String(u)).sort()).toEqual([
			'https://api.robinhood.com/rhj/assets',
			'https://api.robinhood.com/rhj/prices',
		]);
	});

	it('still serves prices when logos fail, but does not cache the partial answer', async () => {
		route(json({}, 500), json(prices));
		const r = await robinhoodMarket(0);
		expect(r.body).toMatchObject({ logos: {}, prices: { [TSLA.toLowerCase()]: { bid: 374.7 } } });
		await robinhoodMarket(1);
		expect(upstream).toHaveBeenCalledTimes(4);
	});

	it('answers 502 when both halves fail', async () => {
		route(new TypeError('fetch failed'), json({}, 503));
		expect((await robinhoodMarket(0)).status).toBe(502);
	});

	it('caches a full answer for 15 seconds', async () => {
		route(json(assets), json(prices));
		await robinhoodMarket(0);
		await robinhoodMarket(14_999);
		expect(upstream).toHaveBeenCalledTimes(2);
		await robinhoodMarket(15_001);
		expect(upstream).toHaveBeenCalledTimes(4);
	});
});

describe('parseGeckoTokens', () => {
	const item = (address: string, image_url: unknown, price_usd: unknown) => ({ id: `robinhood_${address}`, attributes: { address, image_url, price_usd } });

	it('maps each meme to its logo and DEX price (bid = ask), lowercased', () => {
		const m = parseGeckoTokens({ data: [item('0xAbC0000000000000000000000000000000000001', 'https://coin-images.coingecko.com/x.jpg', '0.00001193985731')] });
		expect(m.logos).toEqual({ '0xabc0000000000000000000000000000000000001': 'https://coin-images.coingecko.com/x.jpg' });
		expect(m.prices['0xabc0000000000000000000000000000000000001']).toEqual({ bid: 0.00001193985731, ask: 0.00001193985731, halted: false });
	});

	it('skips missing / placeholder / non-https images and missing or zero prices', () => {
		const m = parseGeckoTokens({
			data: [
				item('0x01', null, null),
				item('0x02', 'https://assets.geckoterminal.com/missing.png', '0'),
				item('0x03', 'http://insecure.example/x.png', 'abc'),
				{ attributes: null },
				'junk',
			],
		});
		expect(m).toEqual({ logos: {}, prices: {} });
		expect(parseGeckoTokens(null)).toEqual({ logos: {}, prices: {} });
	});
});

describe('memeMarket', () => {
	const meme = (i: number) => ({ chainId: 4663, category: 'meme', address: `0x${i.toString(16).padStart(40, '0')}`, symbol: `M${i}` });
	const LIST = [...Array.from({ length: 32 }, (_, i) => meme(i + 1)), { chainId: 4663, category: 'stock', address: TSLA, symbol: 'TSLA' }, { ...meme(99), chainId: 1 }];
	const geckoUrls = () => upstream.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('geckoterminal'));
	const route = (gecko: (url: string) => Response | Error) =>
		upstream.mockImplementation(async (url) => {
			const u = String(url);
			if (u.endsWith('/v1/tokens')) return json(LIST);
			const res = gecko(u);
			if (res instanceof Error) throw res;
			return res;
		});
	const answer = (url: string) => {
		const addresses = url.split('/multi/')[1].split(',');
		return json({ data: addresses.map((address) => ({ attributes: { address, image_url: `https://img.example/${address}.png`, price_usd: '0.5' } })) });
	};

	it('asks GeckoTerminal for the router’s Robinhood-Chain memes only, at most 30 per call', async () => {
		route(answer);
		const m = await memeMarket(0);
		const calls = geckoUrls();
		expect(calls).toHaveLength(2);
		expect(calls.every((u) => u.startsWith('https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/multi/'))).toBe(true);
		expect(calls.map((u) => u.split('/multi/')[1].split(',').length)).toEqual([30, 2]);
		expect(Object.keys(m!.prices)).toHaveLength(32);
		expect(m!.prices[TSLA.toLowerCase()]).toBeUndefined();
	});

	it('caches a full answer for 60 seconds (2 calls a minute against a 30/min limit)', async () => {
		route(answer);
		await memeMarket(0);
		await memeMarket(59_999);
		expect(geckoUrls()).toHaveLength(2);
		await memeMarket(60_001);
		expect(geckoUrls()).toHaveLength(4);
	});

	it('serves a partial answer when one call fails, without caching it', async () => {
		let n = 0;
		route((url) => (n++ === 0 ? json({}, 429) : answer(url)));
		const m = await memeMarket(0);
		expect(Object.keys(m!.prices)).toHaveLength(2);
		await memeMarket(1);
		expect(geckoUrls()).toHaveLength(4);
	});

	it('is null when GeckoTerminal is unreachable', async () => {
		route(() => new TypeError('fetch failed'));
		expect(await memeMarket(0)).toBeNull();
	});
});

describe('stocksMarket', () => {
	const MEME = '0x00000000000000000000000000000000000000aa';
	const serve = (opts: { robinhood: boolean; gecko: boolean }) =>
		upstream.mockImplementation(async (url) => {
			const u = String(url);
			if (u.endsWith('/v1/tokens')) return json([{ chainId: 4663, category: 'meme', address: MEME }]);
			if (u.includes('geckoterminal')) {
				if (!opts.gecko) throw new TypeError('fetch failed');
				return json({ data: [{ attributes: { address: MEME, image_url: 'https://img.example/m.png', price_usd: '0.001' } }] });
			}
			if (!opts.robinhood) return json({}, 503);
			return u.endsWith('/assets')
				? json({ assets: [{ logoUrl: 'https://cdn.robinhood.com/tsla.png', deployments: [deployment(TSLA)] }] })
				: json({ quotes: [{ tokenBid: '374.7', tokenAsk: '374.9', deployments: [deployment(TSLA)] }] });
		});

	it('merges Robinhood’s stock data with GeckoTerminal’s meme data', async () => {
		serve({ robinhood: true, gecko: true });
		const r = await stocksMarket(0);
		expect(r.status).toBe(200);
		expect(r.body).toEqual({
			logos: { [TSLA.toLowerCase()]: 'https://cdn.robinhood.com/tsla.png', [MEME]: 'https://img.example/m.png' },
			prices: { [TSLA.toLowerCase()]: { bid: 374.7, ask: 374.9, halted: false }, [MEME]: { bid: 0.001, ask: 0.001, halted: false } },
		});
	});

	it('keeps serving stocks when GeckoTerminal is down, and memes when Robinhood is down', async () => {
		serve({ robinhood: true, gecko: false });
		expect(((await stocksMarket(0)).body as { prices: object }).prices).toHaveProperty(TSLA.toLowerCase());
		clearStocksCache();
		serve({ robinhood: false, gecko: true });
		expect(((await stocksMarket(0)).body as { prices: object }).prices).toHaveProperty(MEME);
	});

	it('answers 502 only when both are down', async () => {
		serve({ robinhood: false, gecko: false });
		expect((await stocksMarket(0)).status).toBe(502);
	});
});
