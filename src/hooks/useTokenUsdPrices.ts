'use client';

import { useQuery } from '@tanstack/react-query';
import { getV3Config } from '@/config/dex/v3-config';
import type { Token } from '@/config/dex/types';
import { isLowercaseAddress, querySubgraph } from '@/lib/subgraph-query';
import { getEffectiveAddress } from '@/utils/tokens';

/** USD price per token, keyed by lowercase (wrapped-native-resolved) address. */
export type UsdPriceMap = Record<string, number>;

interface PricesResponse {
	bundles: { ethPriceUSD: string }[];
	tokens: { id: string; derivedETH: string }[];
}

/** Sorted, de-duplicated subgraph token ids for a token list (native tokens resolve to their wrapped form). */
export function subgraphTokenIds(tokens: (Token | null | undefined)[]): string[] {
	return Array.from(
		new Set(
			tokens
				.filter((token): token is Token => Boolean(token))
				.map((token) => getEffectiveAddress(token).toLowerCase())
				.filter(isLowercaseAddress),
		),
	).sort();
}

/**
 * One V3 subgraph read: USD = token.derivedETH × bundle.ethPriceUSD (the chain's wrapped native
 * is the subgraph's "ETH", so its own derivedETH is 1). Tokens with no price are left out.
 */
export async function fetchTokenUsdPrices(subgraphUrl: string, ids: string[]): Promise<UsdPriceMap> {
	const safe = ids.map((id) => id.toLowerCase()).filter(isLowercaseAddress);
	if (safe.length === 0) return {};
	const list = safe.map((id) => `"${id}"`).join(',');
	const data = await querySubgraph<PricesResponse>(
		subgraphUrl,
		`{ bundles(first: 1) { ethPriceUSD } tokens(where: { id_in: [${list}] }) { id derivedETH } }`,
	);
	const ethPriceUsd = Number(data.bundles[0]?.ethPriceUSD ?? 0);
	const prices: UsdPriceMap = {};
	for (const token of data.tokens) {
		const usd = Number(token.derivedETH) * ethPriceUsd;
		if (Number.isFinite(usd) && usd > 0) prices[token.id.toLowerCase()] = usd;
	}
	return prices;
}

/** USD price of one token from a price map, or null when unknown. Native tokens resolve to their wrapped form. */
export function usdPriceOf(prices: UsdPriceMap, token: Token | null | undefined): number | null {
	if (!token) return null;
	const price = prices[getEffectiveAddress(token).toLowerCase()];
	return price && price > 0 ? price : null;
}

/** Live USD prices for the given tokens from the chain's V3 subgraph (refreshed every 60 s). */
export function useTokenUsdPrices(tokens: (Token | null | undefined)[], chainId: number): UsdPriceMap {
	const subgraphUrl = getV3Config(chainId)?.subgraphUrl;
	const ids = subgraphTokenIds(tokens);
	const { data } = useQuery({
		queryKey: ['tokenUsdPrices', chainId, ids.join(',')],
		enabled: Boolean(subgraphUrl) && ids.length > 0,
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: () => fetchTokenUsdPrices(subgraphUrl as string, ids),
	});
	return data ?? {};
}
