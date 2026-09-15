'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { DataTable, type Column } from '@/components/primitives/DataTable';
import { Pill } from '@/components/primitives/Pill';
import { TokenPair } from '@/components/primitives/TokenPair';
import { Button } from '@/components/ui/button';
import type { V3PoolData } from '@/hooks/useV3PoolDiscovery';
import type { Pool24hStats } from '@/hooks/usePool24hStats';
import type { UsdPriceMap } from '@/hooks/useTokenUsdPrices';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { poolApr, poolComposition, servicePositionUsd, sortPools, type PoolSortKey, type PoolSortOrder } from '@/utils/pools';

interface PoolsTableProps {
	pools: V3PoolData[];
	stats24h: Pool24hStats;
	prices: UsdPriceMap;
	logoFor: (address: string, symbol: string) => string | undefined;
	empty: React.ReactNode;
	onManage: (pool: V3PoolData) => void;
	onAdd: (pool: V3PoolData) => void;
}

/** The reference's pool table: pair, TVL, fee APR, 24 h volume, the wallet's liquidity, action. */
export default function PoolsTable({ pools, stats24h, prices, logoFor, empty, onManage, onAdd }: PoolsTableProps) {
	const dict = useDict();
	const fmt = useFormat();
	const p = dict.pools;
	const l = dict.liquidity;

	const [sortKey, setSortKey] = useState<PoolSortKey>('tvl');
	const [sortOrder, setSortOrder] = useState<PoolSortOrder>('desc');

	const toggleSort = (key: PoolSortKey) => {
		if (sortKey === key) setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
		else {
			setSortKey(key);
			setSortOrder('desc');
		}
	};

	const sortedPools = useMemo(() => sortPools(pools, sortKey, sortOrder, stats24h), [pools, sortKey, sortOrder, stats24h]);

	const myLiquidity = (pool: V3PoolData) =>
		pool.userPositions.reduce((sum, position) => sum + (servicePositionUsd(position, pool, prices) ?? 0), 0);

	const compactNumber = (value: number) => fmt.number(value, { notation: 'compact', maximumFractionDigits: 2 });

	const sortHeader = (label: string, key: PoolSortKey, ariaLabel: string) => (
		<button type="button" onClick={() => toggleSort(key)} aria-label={ariaLabel} className="inline-flex items-center gap-1 hover:text-cream">
			{label}
			{sortKey === key ? (
				sortOrder === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />
			) : (
				<ArrowUpDown className="size-3 opacity-50" aria-hidden />
			)}
		</button>
	);

	const columns: Column<V3PoolData>[] = [
		{
			key: 'pool',
			header: p.colPool,
			cell: (pool) => {
				const comp = poolComposition(pool);
				return (
					<div className="flex flex-col gap-0.5">
						<span className="flex items-center gap-3">
							<TokenPair
								a={{ symbol: pool.token0.symbol, logoURI: logoFor(pool.token0.id, pool.token0.symbol) }}
								b={{ symbol: pool.token1.symbol, logoURI: logoFor(pool.token1.id, pool.token1.symbol) }}
							/>
							<span className="font-semibold text-cream">{pool.token0.symbol} / {pool.token1.symbol}</span>
							<Pill tone="muted">{fmt.pct(Number(pool.feeTier) / 10_000, 2)}</Pill>
						</span>
						<span className="text-xs text-muted-deep">
							{interpolate(l.table.summaryLine, {
								amount0: compactNumber(comp.amount0),
								symbol0: comp.symbol0,
								amount1: compactNumber(comp.amount1),
								symbol1: comp.symbol1,
								txCount: fmt.number(comp.txCount),
							})}
						</span>
					</div>
				);
			},
		},
		{
			key: 'tvl',
			header: sortHeader(p.colTvl, 'tvl', l.table.sortTvl),
			align: 'right',
			cell: (pool) => <span className="tabular-nums">{fmt.usd(Number(pool.totalValueLockedUSD) || 0, { decimals: 0 })}</span>,
		},
		{
			key: 'apr',
			header: sortHeader(p.colApr, 'apr', l.table.sortApr),
			align: 'right',
			cell: (pool) => {
				const apr = poolApr(stats24h[pool.id.toLowerCase()]?.feesUsd ?? 0, Number(pool.totalValueLockedUSD) || 0);
				return apr === null ? <span className="text-muted-foreground">—</span> : <span className="font-semibold tabular-nums text-success">{fmt.pct(apr, apr < 1 ? 2 : 1)}</span>;
			},
		},
		{
			key: 'volume',
			header: sortHeader(p.colVolume, 'volume', l.table.sortVolume),
			align: 'right',
			cell: (pool) => <span className="tabular-nums">{fmt.usd(stats24h[pool.id.toLowerCase()]?.volumeUsd ?? 0, { decimals: 0 })}</span>,
		},
		{
			key: 'mine',
			header: p.colMine,
			align: 'right',
			cell: (pool) => (pool.userHasPosition ? <span className="font-semibold tabular-nums text-cream">{fmt.usd(myLiquidity(pool))}</span> : <span className="text-muted-foreground">—</span>),
		},
		{
			key: 'action',
			header: '',
			align: 'right',
			cell: (pool) =>
				pool.userHasPosition ? (
					<Button size="sm" variant="secondary" onClick={() => onManage(pool)}>{p.manage}</Button>
				) : (
					<Button size="sm" variant="outline" onClick={() => onAdd(pool)}>
						{parseFloat(pool.liquidity || '0') > 0 ? p.add : p.seed}
					</Button>
				),
		},
	];

	return <DataTable columns={columns} rows={sortedPools} rowKey={(pool) => pool.id} empty={empty} />;
}
