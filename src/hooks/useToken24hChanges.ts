'use client';

import { useQuery } from '@tanstack/react-query';
import { getV3Config } from '@/config/dex/v3-config';
import type { Token } from '@/config/dex/types';
import { isLowercaseAddress, querySubgraph } from '@/lib/subgraph-query';
import { subgraphTokenIds } from '@/hooks/useTokenUsdPrices';

/** 24 h price change in percent, keyed by lowercase (wrapped-native-resolved) address. */
export type ChangeMap = Record<string, number>;

interface DayDataResponse {
	tokenDayDatas: { date: number; priceUSD: string; token: { id: string } }[];
}

/** Latest daily close vs the previous one, per token, from the V3 subgraph's tokenDayDatas. */
export async function fetchToken24hChanges(subgraphUrl: string, ids: string[]): Promise<ChangeMap> {
	const safe = ids.map((id) => id.toLowerCase()).filter(isLowercaseAddress);
	if (safe.length === 0) return {};
	const list = safe.map((id) => `"${id}"`).join(',');
	const data = await querySubgraph<DayDataResponse>(
		subgraphUrl,
		`{ tokenDayDatas(first: 500, orderBy: date, orderDirection: desc, where: { token_in: [${list}] }) { date priceUSD token { id } } }`,
	);
	const closes = new Map<string, number[]>();
	for (const day of data.tokenDayDatas) {
		const id = day.token.id.toLowerCase();
		const series = closes.get(id) ?? [];
		if (series.length < 2) series.push(Number(day.priceUSD));
		closes.set(id, series);
	}
	const changes: ChangeMap = {};
	for (const [id, [latest, previous]] of closes) {
		if (latest > 0 && previous > 0) changes[id] = (latest / previous - 1) * 100;
	}
	return changes;
}

/** 24 h change per token (refreshed every 5 min — daily closes move slowly). */
export function useToken24hChanges(tokens: (Token | null | undefined)[], chainId: number): ChangeMap {
	const subgraphUrl = getV3Config(chainId)?.subgraphUrl;
	const ids = subgraphTokenIds(tokens);
	const { data } = useQuery({
		queryKey: ['token24hChanges', chainId, ids.join(',')],
		enabled: Boolean(subgraphUrl) && ids.length > 0,
		staleTime: 300_000,
		refetchInterval: 300_000,
		queryFn: () => fetchToken24hChanges(subgraphUrl as string, ids),
	});
	return data ?? {};
}
