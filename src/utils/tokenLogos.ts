import type { Token } from '@/config/dex/types';

/** The minimum a caller knows about a token: subgraph rows carry no logo, list entries do. */
export interface LogoLookup {
	symbol: string;
	address?: string;
	logoURI?: string;
}

/**
 * Logos shipped in `public/tokens/`, keyed by symbol.
 *
 * Pools come from the subgraph, so a pool can pair a token the bundled list never declares
 * (KUSD, KSWAP…). These files are the last resort before initials. `logo-files.test.ts` fails
 * if an entry here stops matching a real file.
 */
export const BUNDLED_LOGOS: Record<string, string> = {
	// One mark for the native coin and its wrapper, under both the old and the current ticker.
	kmt: '/tokens/klc.png',
	wkmt: '/tokens/klc.png',
	klc: '/tokens/klc.png',
	wklc: '/tokens/klc.png',
	kusd: '/tokens/kusd.png',
	kswap: '/tokens/kswap.png',
	usdt: '/tokens/usdt.png',
	usdc: '/tokens/usdc.png',
	dai: '/tokens/dai.png',
	wbtc: '/tokens/wbtc.png',
	btc: '/tokens/btc.png',
	eth: '/tokens/eth.png',
	bnb: '/tokens/bnb.png',
	pol: '/tokens/pol.png',
	knt: '/tokens/knt.png',
	clisha: '/tokens/clisha.png',
};

/**
 * The logo to render for a token.
 *
 * Components used to build `/tokens/{symbol}.png` from the symbol, which broke every time a symbol
 * and a filename disagreed: after the KLC → KMT rename, KMT asked for a non-existent `/tokens/kmt.png`
 * and rendered as a letter while the token list said `/tokens/klc.png` all along (2026-09-17).
 * The list is the source of truth; match on address first, since symbols are not unique.
 */
export function resolveTokenLogo(token: LogoLookup, tokens: Token[] = []): string | undefined {
	if (token.logoURI) return token.logoURI;

	if (token.address) {
		const byAddress = tokens.find((candidate) => candidate.address.toLowerCase() === token.address!.toLowerCase());
		if (byAddress?.logoURI) return byAddress.logoURI;
	}

	const symbol = token.symbol.toLowerCase();
	const bySymbol = tokens.find((candidate) => candidate.symbol.toLowerCase() === symbol);
	return bySymbol?.logoURI || BUNDLED_LOGOS[symbol];
}
