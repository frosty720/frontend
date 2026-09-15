'use client';

import { useQuery } from '@tanstack/react-query';
import { getV3Config } from '@/config/dex/v3-config';
import { querySubgraph } from '@/lib/subgraph-query';

export interface DexStats {
	tvlUsd: number;
	volume24hUsd: number;
	txCount: number;
	poolCount: number;
}

interface DexStatsResponse {
	factories: { totalValueLockedUSD: string; txCount: string; poolCount: string }[];
	poolHourDatas: { volumeUSD: string }[];
}

/** Factory TVL / tx / pool counts, plus a rolling 24 h volume summed from pool hour buckets. */
export async function fetchDexStats(subgraphUrl: string, nowSeconds: number): Promise<DexStats> {
	const since = Math.floor(nowSeconds) - 86_400;
	const data = await querySubgraph<DexStatsResponse>(
		subgraphUrl,
		`{ factories(first: 1) { totalValueLockedUSD txCount poolCount } poolHourDatas(first: 1000, where: { periodStartUnix_gte: ${since} }) { volumeUSD } }`,
	);
	const factory = data.factories[0];
	return {
		tvlUsd: Number(factory?.totalValueLockedUSD ?? 0),
		volume24hUsd: data.poolHourDatas.reduce((sum, hour) => sum + (Number(hour.volumeUSD) || 0), 0),
		txCount: Number(factory?.txCount ?? 0),
		poolCount: Number(factory?.poolCount ?? 0),
	};
}

export function useDexStats(chainId: number) {
	const subgraphUrl = getV3Config(chainId)?.subgraphUrl;
	return useQuery({
		queryKey: ['dexStats', chainId],
		enabled: Boolean(subgraphUrl),
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: () => fetchDexStats(subgraphUrl as string, Date.now() / 1000),
	});
}
