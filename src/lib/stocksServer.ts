/**
 * Server-only helpers for the /stocks-api/* route handlers. Arcus's router only answers CORS for
 * allow-listed origins and Robinhood's stock-token API sends no CORS headers at all, so the browser
 * reaches both through these. Import from route handlers only.
 */
import { ARCUS_ROUTER_URL, GECKOTERMINAL_API_URL, GECKOTERMINAL_NETWORK, ROBINHOOD_RHJ_URL, STOCKS_CHAIN_ID } from '@/config/stocks';
import type { StockQuote, StocksMarket } from './stocks';

/** Error key for a router call whose outcome is unknown (the trade runner reads the 504 status). */
export const ARCUS_UNREACHABLE = 'arcus_unreachable';

export interface UpstreamResult {
	status: number;
	body: unknown;
}

/** Forward one request to the Arcus Spot Router. */
export async function arcusFetch(path: string, init?: { method?: 'GET' | 'POST'; body?: string }): Promise<UpstreamResult> {
	let res: Response;
	try {
		res = await fetch(ARCUS_ROUTER_URL + path, {
			method: init?.method ?? 'GET',
			headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
			body: init?.body,
			// Under the browser client's 30s, so the browser hears this route's answer rather than its own abort.
			signal: AbortSignal.timeout(25_000),
			cache: 'no-store',
		});
	} catch {
		// Unreachable or timed out. A /submit may still have been broadcast, so the outcome is UNKNOWN —
		// the trade runner tells the user to check their balance before trying again.
		return { status: 504, body: { error: ARCUS_UNREACHABLE } };
	}
	const body = await res.json().catch(() => ({ error: 'bad router response' }));
	return { status: res.status, body };
}

const TOKENS_TTL_MS = 5 * 60_000;
const MARKET_TTL_MS = 15_000; // Robinhood caches /prices for 15s itself; asking sooner gets the same answer.
// GeckoTerminal's free tier allows 30 calls a minute; at 60s this costs two (32 memes, 30 per call).
const MEME_TTL_MS = 60_000;
const GECKO_MAX_ADDRESSES = 30;

let tokensCache: { at: number; result: UpstreamResult } | null = null;
let marketCache: { at: number; result: UpstreamResult } | null = null;
let memeCache: { at: number; market: StocksMarket } | null = null;

/** Forget cached upstream answers (tests). */
export function clearStocksCache(): void {
	tokensCache = null;
	marketCache = null;
	memeCache = null;
}

/** The router's token list. It changes when Arcus lists a token, so every visitor shares one copy for 5 minutes. */
export async function arcusTokens(now = Date.now()): Promise<UpstreamResult> {
	if (tokensCache && now - tokensCache.at < TOKENS_TTL_MS) return tokensCache.result;
	const result = await arcusFetch('/v1/tokens');
	if (result.status === 200) tokensCache = { at: now, result };
	return result;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Robinhood Chain contract addresses of one /rhj asset or quote entry, lowercased. */
function chainAddresses(entry: Record<string, unknown>): string[] {
	const deployments = Array.isArray(entry.deployments) ? entry.deployments : [];
	return deployments
		.filter((d): d is Record<string, unknown> => isRecord(d) && d.chainId === STOCKS_CHAIN_ID && typeof d.contractAddress === 'string')
		.map((d) => (d.contractAddress as string).toLowerCase());
}

/** address → logo URL, from GET /rhj/assets. */
export function parseRobinhoodAssets(body: unknown): Record<string, string> {
	const logos: Record<string, string> = {};
	const assets = isRecord(body) && Array.isArray(body.assets) ? body.assets : [];
	for (const asset of assets) {
		if (!isRecord(asset) || typeof asset.logoUrl !== 'string' || !asset.logoUrl.startsWith('https://')) continue;
		for (const address of chainAddresses(asset)) logos[address] = asset.logoUrl;
	}
	return logos;
}

/**
 * address → per-token bid/ask, from GET /rhj/prices. Only `tokenBid`/`tokenAsk` are used: the plain
 * `bid`/`ask` are per share, and a token is worth more than a share once dividends raise its multiplier.
 */
export function parseRobinhoodPrices(body: unknown): Record<string, StockQuote> {
	const prices: Record<string, StockQuote> = {};
	const quotes = isRecord(body) && Array.isArray(body.quotes) ? body.quotes : [];
	for (const quote of quotes) {
		if (!isRecord(quote)) continue;
		const bid = Number(quote.tokenBid);
		const ask = Number(quote.tokenAsk);
		if (!(bid > 0) || !(ask > 0)) continue;
		for (const address of chainAddresses(quote)) prices[address] = { bid, ask, halted: quote.isTradingHalt === true };
	}
	return prices;
}

async function rhjJson(path: string): Promise<unknown | null> {
	try {
		const res = await fetch(ROBINHOOD_RHJ_URL + path, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	}
}

/**
 * Logos and live prices for the list. Either half may be missing — the page still trades without
 * logos or reference prices — but with neither there is nothing to serve.
 */
export async function robinhoodMarket(now = Date.now()): Promise<UpstreamResult> {
	if (marketCache && now - marketCache.at < MARKET_TTL_MS) return marketCache.result;
	const [assets, prices] = await Promise.all([rhjJson('/assets'), rhjJson('/prices')]);
	if (assets === null && prices === null) return { status: 502, body: { error: 'market unavailable' } };
	const body: StocksMarket = {
		logos: assets === null ? {} : parseRobinhoodAssets(assets),
		prices: prices === null ? {} : parseRobinhoodPrices(prices),
	};
	const result = { status: 200, body };
	if (assets !== null && prices !== null) marketCache = { at: now, result };
	return result;
}

/** address → logo and price, from GeckoTerminal's multi-token endpoint. A DEX spot price, so bid = ask. */
export function parseGeckoTokens(body: unknown): StocksMarket {
	const market: StocksMarket = { logos: {}, prices: {} };
	const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
	for (const item of data) {
		const a = isRecord(item) && isRecord(item.attributes) ? item.attributes : null;
		if (!a || typeof a.address !== 'string') continue;
		const address = a.address.toLowerCase();
		if (typeof a.image_url === 'string' && a.image_url.startsWith('https://') && !a.image_url.includes('missing')) {
			market.logos[address] = a.image_url;
		}
		const price = Number(a.price_usd);
		if (price > 0) market.prices[address] = { bid: price, ask: price, halted: false };
	}
	return market;
}

async function geckoJson(path: string): Promise<unknown | null> {
	try {
		const res = await fetch(GECKOTERMINAL_API_URL + path, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(10_000),
			cache: 'no-store',
		});
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	}
}

/**
 * Logos and prices for the meme tokens the router lists, from GeckoTerminal. Null when the token list
 * or every call failed; a partial answer is served but not cached, so the next request tries again.
 */
export async function memeMarket(now = Date.now()): Promise<StocksMarket | null> {
	if (memeCache && now - memeCache.at < MEME_TTL_MS) return memeCache.market;
	const tokens = await arcusTokens(now);
	if (tokens.status !== 200 || !Array.isArray(tokens.body)) return null;
	const addresses = tokens.body
		.filter((t): t is Record<string, unknown> => isRecord(t) && t.category === 'meme' && t.chainId === STOCKS_CHAIN_ID && typeof t.address === 'string')
		.map((t) => (t.address as string).toLowerCase());

	const market: StocksMarket = { logos: {}, prices: {} };
	let failed = 0;
	for (let i = 0; i < addresses.length; i += GECKO_MAX_ADDRESSES) {
		const body = await geckoJson(`/networks/${GECKOTERMINAL_NETWORK}/tokens/multi/${addresses.slice(i, i + GECKO_MAX_ADDRESSES).join(',')}`);
		if (body === null) {
			failed++;
			continue;
		}
		const part = parseGeckoTokens(body);
		Object.assign(market.logos, part.logos);
		Object.assign(market.prices, part.prices);
	}
	const calls = Math.ceil(addresses.length / GECKO_MAX_ADDRESSES);
	if (calls > 0 && failed === calls) return null;
	if (failed === 0) memeCache = { at: now, market };
	return market;
}

/**
 * What /stocks-api/market serves: Robinhood's logos and prices for the stock tokens plus GeckoTerminal's
 * for the memes. Each half is optional; with neither there is nothing to serve.
 */
export async function stocksMarket(now = Date.now()): Promise<UpstreamResult> {
	const [robinhood, memes] = await Promise.all([robinhoodMarket(now), memeMarket(now)]);
	const stocks = robinhood.status === 200 ? (robinhood.body as StocksMarket) : null;
	if (!stocks && !memes) return { status: 502, body: { error: 'market unavailable' } };
	const body: StocksMarket = {
		logos: { ...memes?.logos, ...stocks?.logos },
		prices: { ...memes?.prices, ...stocks?.prices },
	};
	return { status: 200, body };
}
