'use client';

import { useQuery } from '@tanstack/react-query';
import { getV3Config } from '@/config/dex/v3-config';
import { querySubgraph } from '@/lib/subgraph-query';

/** Rolling 24 h volume and fees per pool (keyed by lowercase pool id). */
export type Pool24hStats = Record<string, { volumeUsd: number; feesUsd: number }>;

interface HourResponse {
	poolHourDatas: { volumeUSD: string; feesUSD: string; pool: { id: string } }[];
}

export async function fetchPool24hStats(subgraphUrl: string, nowSeconds: number): Promise<Pool24hStats> {
	const since = Math.floor(nowSeconds) - 86_400;
	const data = await querySubgraph<HourResponse>(
		subgraphUrl,
		`{ poolHourDatas(first: 1000, where: { periodStartUnix_gte: ${since} }) { volumeUSD feesUSD pool { id } } }`,
	);
	const stats: Pool24hStats = {};
	for (const hour of data.poolHourDatas) {
		const id = hour.pool.id.toLowerCase();
		const entry = stats[id] ?? { volumeUsd: 0, feesUsd: 0 };
		entry.volumeUsd += Number(hour.volumeUSD) || 0;
		entry.feesUsd += Number(hour.feesUSD) || 0;
		stats[id] = entry;
	}
	return stats;
}

export function usePool24hStats(chainId: number) {
	const subgraphUrl = getV3Config(chainId)?.subgraphUrl;
	return useQuery({
		queryKey: ['pool24hStats', chainId],
		enabled: Boolean(subgraphUrl),
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: () => fetchPool24hStats(subgraphUrl as string, Date.now() / 1000),
	});
}
