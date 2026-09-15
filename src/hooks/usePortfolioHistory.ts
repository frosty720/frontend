'use client';

import { useQuery } from '@tanstack/react-query';
import { getV3Config } from '@/config/dex/v3-config';
import { isLowercaseAddress, querySubgraph } from '@/lib/subgraph-query';
import {
	buildPortfolioSeries,
	mergeHoldings,
	rangeSpec,
	timeGrid,
	type Holding,
	type HistoryRange,
	type PortfolioSeries,
	type PriceHistory,
} from '@/utils/portfolioHistory';

interface PriceRow {
	periodStartUnix?: number;
	date?: number;
	priceUSD: string;
}

/**
 * Historical USD prices for `ids` over `range` in one subgraph request: tokenHourDatas for 1D,
 * tokenDayDatas otherwise. Per token it reads every bucket in the window plus the last bucket
 * before it, so a token that did not trade at the window start still has a price to carry forward.
 */
export async function fetchPriceHistory(subgraphUrl: string, ids: string[], range: HistoryRange, nowSec: number): Promise<PriceHistory> {
	const safe = ids.map((id) => id.toLowerCase()).filter(isLowercaseAddress);
	if (safe.length === 0) return {};
	const hourly = rangeSpec(range).granularity === 'hour';
	const entity = hourly ? 'tokenHourDatas' : 'tokenDayDatas';
	const field = hourly ? 'periodStartUnix' : 'date';
	const start = timeGrid(range, nowSec)[0];
	const selections = safe.map(
		(id, i) =>
			`w${i}: ${entity}(first: 1000, orderBy: ${field}, orderDirection: asc, where: { token: "${id}", ${field}_gte: ${start} }) { ${field} priceUSD } ` +
			`b${i}: ${entity}(first: 1, orderBy: ${field}, orderDirection: desc, where: { token: "${id}", ${field}_lt: ${start} }) { ${field} priceUSD }`,
	);
	const data = await querySubgraph<Record<string, PriceRow[]>>(subgraphUrl, `{ ${selections.join(' ')} }`);
	const history: PriceHistory = {};
	safe.forEach((id, i) => {
		history[id] = [...(data[`b${i}`] ?? []), ...(data[`w${i}`] ?? [])].map((row) => ({
			t: Number(row[field]),
			price: Number(row.priceUSD),
		}));
	});
	return history;
}

export interface PortfolioHistory extends PortfolioSeries {
	isLoading: boolean;
	isError: boolean;
}

/**
 * The given holdings valued at each hour (1D) or day (1W/1M/1Y) of the range. Prices are fetched
 * per token set and range; amounts are applied locally, so balance updates do not refetch.
 */
export function usePortfolioHistory(holdings: Holding[], range: HistoryRange, chainId: number): PortfolioHistory {
	const subgraphUrl = getV3Config(chainId)?.subgraphUrl;
	const ids = mergeHoldings(holdings)
		.map((holding) => holding.id)
		.filter(isLowercaseAddress)
		.sort();
	const refreshMs = range === '1D' ? 300_000 : 1_800_000;
	const { data, isLoading, isError } = useQuery({
		queryKey: ['portfolioHistory', chainId, range, ids.join(',')],
		enabled: Boolean(subgraphUrl) && ids.length > 0,
		staleTime: refreshMs,
		refetchInterval: refreshMs,
		queryFn: async () => {
			const nowSec = Math.floor(Date.now() / 1000);
			return { nowSec, history: await fetchPriceHistory(subgraphUrl as string, ids, range, nowSec) };
		},
	});
	const series = data ? buildPortfolioSeries(holdings, data.history, timeGrid(range, data.nowSec)) : { points: [], unpriced: [] };
	return { ...series, isLoading, isError };
}
