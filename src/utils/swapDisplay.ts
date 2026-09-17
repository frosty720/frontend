import { isStablecoinAddress } from '@/config/contracts';
import type { Token } from '@/config/dex/types';
import type { FormattedSwap } from '@/hooks/usePairSwaps';
import { getEffectiveAddress } from '@/utils/tokens';

export interface RouteHop {
	symbol: string;
	logoURI?: string;
}

/**
 * Tokens a swap passes through, for the "Optimal route" panel. The endpoints are the tokens the
 * user picked (so native KMT shows as KMT, not WKMT); intermediate hops are looked up by address.
 */
export function routeHops(
	fromToken: Token | null,
	toToken: Token | null,
	route: string[] | null,
	tokens: Token[],
): RouteHop[] {
	if (!fromToken || !toToken) return [];
	const first: RouteHop = { symbol: fromToken.symbol, logoURI: fromToken.logoURI || undefined };
	const last: RouteHop = { symbol: toToken.symbol, logoURI: toToken.logoURI || undefined };
	if (!route || route.length <= 2) return [first, last];
	const byAddress = new Map(tokens.map((token) => [getEffectiveAddress(token).toLowerCase(), token]));
	const middle = route.slice(1, -1).map((address): RouteHop => {
		const token = byAddress.get(address.toLowerCase());
		return token ? { symbol: token.symbol, logoURI: token.logoURI || undefined } : { symbol: `${address.slice(0, 6)}…` };
	});
	return [first, ...middle, last];
}

/** Which side a pool swap sold: `token0Amount` carries a leading "-" when token0 went into the pool. */
export function swapDirection(swap: FormattedSwap): { from: string; to: string; amount: number } {
	const soldToken0 = swap.token0Amount.startsWith('-');
	return soldToken0
		? { from: swap.token0Symbol, to: swap.token1Symbol, amount: Math.abs(parseFloat(swap.token0Amount)) }
		: { from: swap.token1Symbol, to: swap.token0Symbol, amount: Math.abs(parseFloat(swap.token1Amount)) };
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
	['year', 31_536_000],
	['month', 2_592_000],
	['week', 604_800],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60],
	['second', 1],
];

/**
 * The non-stablecoin side of a pair, for price-formatting precision (`formatTokenPrice` needs
 * the "real" asset's symbol, not the stablecoin quote). Stablecoin detection is by address, per
 * this repo's rule — symbol matching is unreliable, anyone can name a token "USDT". Falls back
 * to address order when both or neither side is a stablecoin, matching how `usePairMarketStats`
 * itself normalizes pair order.
 */
export function pairBaseToken(fromToken: Token | null, toToken: Token | null): Token | null {
	if (!fromToken || !toToken) return null;
	const fromAddress = getEffectiveAddress(fromToken).toLowerCase();
	const toAddress = getEffectiveAddress(toToken).toLowerCase();
	const fromIsStable = isStablecoinAddress(fromAddress);
	const toIsStable = isStablecoinAddress(toAddress);
	if (fromIsStable && !toIsStable) return toToken;
	if (toIsStable && !fromIsStable) return fromToken;
	return fromAddress < toAddress ? fromToken : toToken;
}

/** The pair in the order `usePairMarketStats` prices it — [base, quote] — so its price reads "1 base = price quote". */
export function pairOrder(fromToken: Token | null, toToken: Token | null): [Token, Token] | null {
	const base = pairBaseToken(fromToken, toToken);
	if (!base || !fromToken || !toToken) return null;
	return base === fromToken ? [fromToken, toToken] : [toToken, fromToken];
}

/** "2 min. ago" / "il y a 2 min" / "hier" for a past date, relative to `now`. */
export function relativeTime(date: Date, now: Date, localeTag: string): string {
	const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
	const format = new Intl.RelativeTimeFormat(localeTag, { numeric: 'auto', style: 'short' });
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
	}
	return format.format(0, 'second');
}

/**
 * A token's symbol for a raw address, from the chain's own list.
 *
 * GeckoTerminal trades (every chain but KalyChain) carry addresses, not symbols, and the recent-swaps
 * list used to print a literal "Token" for both sides of every Arbitrum and BSC swap (2026-09-17).
 */
export function symbolForAddress(address: string | undefined, tokens: Token[], fallback = 'Token'): string {
	if (!address) return fallback;
	const hit = tokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
	return hit?.symbol ?? fallback;
}
