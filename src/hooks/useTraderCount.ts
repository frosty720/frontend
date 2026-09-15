'use client';

import { useQuery } from '@tanstack/react-query';
import { getV3Config } from '@/config/dex/v3-config';
import { querySubgraph } from '@/lib/subgraph-query';
import { countTraders } from '@/utils/dashboard';

/** Graph-node's maximum page size. */
const PAGE_SIZE = 1000;

/**
 * Hard cap: 20 pages = the first 20,000 swaps, i.e. at most 20 subgraph requests per refresh.
 * Past that the count is a lower bound and shows as "N+"; at that volume a trader counter in the
 * subgraph itself is the right fix.
 */
const MAX_PAGES = 20;

export async function fetchTraderCount(subgraphUrl: string): Promise<{ count: number; capped: boolean }> {
	return countTraders(
		async (cursor) => {
			const data = await querySubgraph<{ swaps: { id: string; origin: string }[] }>(
				subgraphUrl,
				`{ swaps(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: { id_gt: ${JSON.stringify(cursor)} }) { id origin } }`,
			);
			return data.swaps;
		},
		PAGE_SIZE,
		MAX_PAGES,
	);
}

/** Distinct wallets (`swaps.origin`) that have swapped on the DEX, from the V3 subgraph, refreshed every 5 min. */
export function useTraderCount(chainId: number) {
	const subgraphUrl = getV3Config(chainId)?.subgraphUrl;
	return useQuery({
		queryKey: ['traderCount', chainId],
		enabled: Boolean(subgraphUrl),
		staleTime: 300_000,
		refetchInterval: 300_000,
		queryFn: () => fetchTraderCount(subgraphUrl as string),
	});
}
