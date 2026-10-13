/**
 * Pure helpers for the Stocks page: turn the Arcus token list into the assets the page lists, pick
 * the quote to execute, and read the numbers a quote carries. No I/O here — hooks and the trade
 * runner (lib/stocksTrade.ts) do the calls.
 */
import {
	SpotRouterClient,
	SpotRouterError,
	type FirmQuote,
	type NormalizedPrice,
	type PriceResponse,
	type QuoteResponse,
	type RouteFee,
	type TokenInfo,
} from '@arcus-xyz/arcus-spot-sdk';
import { formatUnits, type Hex } from 'viem';
import {
	NATIVE_TOKEN_SENTINEL,
	STOCK_CURRENCIES,
	STOCK_GROUPS,
	STOCKS_API_PATH,
	STOCKS_CHAIN_ID,
	USDG,
	type StockCurrency,
	type StockGroup,
} from '@/config/stocks';
import { STOCK_LOGO_ADDRESSES } from '@/config/stockLogos';

export interface StockAsset {
	address: Hex;
	symbol: string;
	name: string;
	decimals: number;
	group: StockGroup;
	/** False for meme tokens the router has not curated. */
	verified: boolean;
	/** The `wXXX` placeholder a long-tail buy can be delivered as until the maker settles it. */
	wrappedAddress?: Hex;
	logoURI?: string;
}

/** Robinhood's per-token quote (token-denominated, so corporate-action multipliers are already applied). */
export interface StockQuote {
	bid: number;
	ask: number;
	halted: boolean;
}

/** What /stocks-api/market serves, keyed by lowercase token address. */
export interface StocksMarket {
	logos: Record<string, string>;
	prices: Record<string, StockQuote>;
}

/** An indicative price. The router sends each route's fees with it, though the SDK's type omits them. */
export type IndicativePrice = NormalizedPrice & { fees?: RouteFee[] };

/**
 * A buy paid in native ETH. Instead of a signature request the router returns a transaction for the
 * user's wallet to send (Arcus docs: "buying with the chain's native asset … the user broadcasts").
 * SDK 1.0.2 does not model it; this is the shape the router returned on 2026-10-13.
 */
export interface NativeTxQuote {
	venue: 'arcus';
	buyAmount: string;
	sellAmount: string;
	fees: RouteFee[];
	expiry: number;
	transaction: { to: Hex; data: Hex; value: string };
}

/** What the page can execute: a quote the SDK can sign (never Bebop), or a native-ETH transaction. */
export type ExecutableQuote = Exclude<FirmQuote, { venue: 'bebop' }> | NativeTxQuote;

export function isNativeTxQuote(quote: ExecutableQuote): quote is NativeTxQuote {
	return 'transaction' in quote && !('toSign' in quote);
}

const KNOWN_GROUPS = new Set<string>(STOCK_GROUPS);

/** The router's category, or `other` for one this build does not know yet. */
export function groupOf(category: string): StockGroup {
	return KNOWN_GROUPS.has(category) ? (category as StockGroup) : 'other';
}

/**
 * Everything the router lists on Robinhood Chain, minus the two trading currencies (USDG and native
 * ETH — see STOCK_CURRENCIES). The router's order is kept within each group. Logos: the bundled company
 * logo when there is one (scripts/gen-stock-logos.mjs), else Robinhood's token icon from `logos`.
 */
export function toStockAssets(tokens: readonly TokenInfo[], logos: Record<string, string> = {}): StockAsset[] {
	const skip = new Set([USDG.address.toLowerCase(), NATIVE_TOKEN_SENTINEL.toLowerCase()]);
	return tokens
		.filter((t) => t.chainId === STOCKS_CHAIN_ID && !skip.has(t.address.toLowerCase()))
		.map((t) => ({
			address: t.address,
			symbol: t.symbol,
			name: t.name,
			decimals: t.decimals,
			group: groupOf(t.category),
			verified: t.verified,
			wrappedAddress: t.wrappedTokenAddress ?? undefined,
			logoURI: logoFor(t.address.toLowerCase(), logos),
		}));
}

function logoFor(address: string, robinhoodLogos: Record<string, string>): string | undefined {
	return STOCK_LOGO_ADDRESSES.has(address) ? `/stock-logos/${address}.png` : robinhoodLogos[address];
}

/** Non-empty groups in display order. */
export function groupAssets(assets: readonly StockAsset[]): Array<{ group: StockGroup; assets: StockAsset[] }> {
	return STOCK_GROUPS.map((group) => ({ group, assets: assets.filter((a) => a.group === group) })).filter((g) => g.assets.length > 0);
}

/** Case-insensitive match on ticker or name. */
export function searchAssets(assets: readonly StockAsset[], query: string): StockAsset[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...assets];
	return assets.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
}

/** Decimals that keep a USD amount readable: cents from $1 up, more below — meme prices run to $0.00001. */
export function usdDecimals(value: number): number {
	if (value >= 1) return 2;
	if (value >= 0.01) return 4;
	return 8;
}

/** Mid of Robinhood's bid/ask, or null when there is no usable quote. */
export function midPrice(quote: StockQuote | undefined): number | null {
	if (!quote || !(quote.bid > 0) || !(quote.ask > 0)) return null;
	return (quote.bid + quote.ask) / 2;
}

export type TradeSide = 'buy' | 'sell';

export interface TradePair {
	sellToken: Hex;
	buyToken: Hex;
	sellDecimals: number;
	buyDecimals: number;
}

/** Buy = pay the currency for the asset; sell = pay the asset for the currency. */
export function tradePair(side: TradeSide, asset: Pick<StockAsset, 'address' | 'decimals'>, currency: StockCurrency): TradePair {
	const c = STOCK_CURRENCIES[currency];
	return side === 'buy'
		? { sellToken: c.address, buyToken: asset.address, sellDecimals: c.decimals, buyDecimals: asset.decimals }
		: { sellToken: asset.address, buyToken: c.address, sellDecimals: asset.decimals, buyDecimals: c.decimals };
}

const isExecutable = (q: FirmQuote | NativeTxQuote): q is ExecutableQuote => q.venue !== 'bebop';

const largestBuy = <T extends { buyAmount: string }>(quotes: T[]): T | null =>
	quotes.reduce<T | null>((best, q) => (best === null || BigInt(q.buyAmount) > BigInt(best.buyAmount) ? q : best), null);

/** The router's recommended quote when the SDK can sign it, else the signable one paying out most. */
export function pickFirmQuote(response: QuoteResponse): ExecutableQuote | null {
	const signable = (response.all as Array<FirmQuote | NativeTxQuote>).filter(isExecutable);
	return signable.find((q) => q.venue === response.recommended) ?? largestBuy(signable);
}

/**
 * The indicative price shown before the user commits. Bebop is skipped for the same reason as in
 * pickFirmQuote: showing a price the trade can never be filled at would mislead.
 */
export function pickPrice(response: PriceResponse): IndicativePrice | null {
	const usable: IndicativePrice[] = response.all.filter((p) => p.venue !== 'bebop' && BigInt(p.buyAmount) > 0n);
	return usable.find((p) => p.venue === response.recommended) ?? largestBuy(usable);
}

/** Why the router would not price a trade. Anything else (timeouts, 5xx) is a failure, not an answer. */
export type PriceProblem = 'belowMinimum' | 'noQuote';

/** The router's refusal (a 4xx) as a reason the page can name, or null for a real failure. */
export function priceProblem(error: unknown): PriceProblem | null {
	if (!(error instanceof SpotRouterError) || error.status === undefined || error.status >= 500) return null;
	const body = error.body as { code?: unknown } | null;
	return body?.code === 'TRADE_NOTIONAL_BELOW_MINIMUM' ? 'belowMinimum' : 'noQuote';
}

export type FeeSummary = { kind: 'usd'; total: number } | { kind: 'tokens'; parts: Array<{ amount: bigint; symbol: string; decimals: number }> };

/**
 * What a route charges, already netted out of the quoted amounts. In USD when the router prices every
 * fee (USDG trades); otherwise in the tokens it takes them in (ETH buys are charged in the asset).
 * Null when there are none or one is in a token the page does not know — "—" beats a made-up number.
 */
export function describeFees(
	fees: readonly RouteFee[] | undefined,
	known: ReadonlyArray<{ address: string; symbol: string; decimals: number }>,
): FeeSummary | null {
	if (!fees || fees.length === 0) return null;
	if (fees.every((f) => typeof f.amountUsd === 'number' && Number.isFinite(f.amountUsd))) {
		return { kind: 'usd', total: fees.reduce((sum, f) => sum + (f.amountUsd as number), 0) };
	}
	const parts: Array<{ amount: bigint; symbol: string; decimals: number }> = [];
	for (const fee of fees) {
		const token = known.find((k) => k.address.toLowerCase() === fee.token.toLowerCase());
		if (!token) return null;
		const part = parts.find((p) => p.symbol === token.symbol);
		if (part) part.amount += BigInt(fee.amount);
		else parts.push({ amount: BigInt(fee.amount), symbol: token.symbol, decimals: token.decimals });
	}
	return { kind: 'tokens', parts };
}

/** Currency paid or received per one asset token, from the amounts of a trade on that asset. */
export function pricePerToken(
	side: TradeSide,
	sellAmount: bigint,
	buyAmount: bigint,
	assetDecimals: number,
	currencyDecimals: number,
): number | null {
	const [currency, asset] = side === 'buy' ? [sellAmount, buyAmount] : [buyAmount, sellAmount];
	const tokens = Number(formatUnits(asset, assetDecimals));
	if (!(tokens > 0)) return null;
	return Number(formatUnits(currency, currencyDecimals)) / tokens;
}

/** An SDK client pointed at this site's proxy. Absolute URL required by the SDK. */
export function stocksRouterClient(origin: string): SpotRouterClient {
	return new SpotRouterClient({ baseUrl: new URL(STOCKS_API_PATH, origin).toString(), timeoutMs: 30_000 });
}
