/**
 * The /stocks-api proxy forwards only what the Stocks page uses — a fixed host, an allow-list of
 * endpoints, bounded input — and hands the signed trade to the router byte-for-byte, because the
 * router verifies the user's signature over exactly those bytes.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStocksCache } from '@/lib/stocksServer';
import { GET as market } from '../market/route';
import { GET, POST } from '../v1/[endpoint]/route';

const upstream = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));

beforeEach(() => {
	clearStocksCache();
	upstream.mockClear();
	vi.stubGlobal('fetch', upstream);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const ctx = (endpoint: string) => ({ params: Promise.resolve({ endpoint }) });
const req = (path: string, init?: { method?: string; body?: string }) => new NextRequest(`http://localhost${path}`, init);
const calledUrl = () => String(upstream.mock.calls.at(-1)?.[0]);

describe('GET /stocks-api/v1/:endpoint', () => {
	it('forwards price and quote with the query string intact', async () => {
		const q = '?chainId=4663&sellToken=0xa&buyToken=0xb&sellAmount=100000000';
		expect((await GET(req(`/stocks-api/v1/price${q}`), ctx('price'))).status).toBe(200);
		expect(calledUrl()).toBe(`https://router.spot.arcus.xyz/v1/price${q}`);
		await GET(req(`/stocks-api/v1/quote${q}&taker=0xc`), ctx('quote'));
		expect(calledUrl()).toBe(`https://router.spot.arcus.xyz/v1/quote${q}&taker=0xc`);
	});

	it('serves the token list (cached upstream)', async () => {
		await GET(req('/stocks-api/v1/tokens'), ctx('tokens'));
		await GET(req('/stocks-api/v1/tokens'), ctx('tokens'));
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(calledUrl()).toBe('https://router.spot.arcus.xyz/v1/tokens');
	});

	it('refuses anything off the allow-list without calling out', async () => {
		for (const endpoint of ['submit', 'status', 'health', '..', 'admin']) {
			expect((await GET(req(`/stocks-api/v1/${endpoint}`), ctx(endpoint))).status).toBe(404);
		}
		expect(upstream).not.toHaveBeenCalled();
	});

	it('refuses an oversized query', async () => {
		const res = await GET(req(`/stocks-api/v1/price?x=${'a'.repeat(3000)}`), ctx('price'));
		expect(res.status).toBe(414);
		expect(upstream).not.toHaveBeenCalled();
	});

	it('passes the router’s status through (e.g. 422 NO_QUOTES)', async () => {
		upstream.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'NO_QUOTES' }), { status: 422 }));
		const res = await GET(req('/stocks-api/v1/price?sellAmount=1'), ctx('price'));
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ code: 'NO_QUOTES' });
	});
});

describe('POST /stocks-api/v1/submit', () => {
	const signed = '{"venue":"arcus","chainId":4663,"signature":"0xdead","typedData":{"message":{"a":1}}}';

	it('forwards the signed body byte-for-byte', async () => {
		const res = await POST(req('/stocks-api/v1/submit', { method: 'POST', body: signed }), ctx('submit'));
		expect(res.status).toBe(200);
		const [url, init] = upstream.mock.calls[0];
		expect(String(url)).toBe('https://router.spot.arcus.xyz/v1/submit');
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(signed);
	});

	it('only accepts submit', async () => {
		expect((await POST(req('/stocks-api/v1/quote', { method: 'POST', body: '{}' }), ctx('quote'))).status).toBe(404);
		expect(upstream).not.toHaveBeenCalled();
	});

	it('rejects invalid JSON and oversized bodies before they reach the router', async () => {
		expect((await POST(req('/stocks-api/v1/submit', { method: 'POST', body: 'not json' }), ctx('submit'))).status).toBe(400);
		expect((await POST(req('/stocks-api/v1/submit', { method: 'POST', body: `"${'a'.repeat(70_000)}"` }), ctx('submit'))).status).toBe(413);
		expect(upstream).not.toHaveBeenCalled();
	});

	it('reports an unreachable router as 504 so the page treats the outcome as unknown', async () => {
		upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
		const res = await POST(req('/stocks-api/v1/submit', { method: 'POST', body: signed }), ctx('submit'));
		expect(res.status).toBe(504);
		expect(await res.json()).toEqual({ error: 'arcus_unreachable' });
	});
});

describe('GET /stocks-api/market', () => {
	it('serves Robinhood logos and prices', async () => {
		upstream.mockImplementation(async (url) =>
			String(url).endsWith('/assets') ? new Response(JSON.stringify({ assets: [] })) : new Response(JSON.stringify({ quotes: [] })),
		);
		const res = await market();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ logos: {}, prices: {} });
	});
});
