'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { RefreshCw, Search } from 'lucide-react';
import PoolPositionsDialog from '@/components/pools/PoolPositionsDialog';
import PoolsTable from '@/components/pools/PoolsTable';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Panel } from '@/components/primitives/Panel';
import { StatCard } from '@/components/primitives/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import { usePool24hStats } from '@/hooks/usePool24hStats';
import { useTokenLists } from '@/hooks/useTokenLists';
import { useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { useV3PoolDiscovery, type V3PoolData } from '@/hooks/useV3PoolDiscovery';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';
import { filterPoolsByOwnership, servicePositionUsd, type PoolFilterMode } from '@/utils/pools';

const KMT_FAMILY = ['kmt', 'wkmt', 'klc', 'wklc'];

/** Pools page, laid out like the reference: three stat cards, then the pool table. */
export default function PoolsPage() {
	const dict = useDict();
	const fmt = useFormat();
	const href = useLocaleHref();
	const router = useRouter();
	const p = dict.pools;
	const l = dict.liquidity;
	const { isConnected } = useAccount();
	const { pools, allPools, userPoolsCount, loading, error, searchTerm, setSearchTerm, refetch } = useV3PoolDiscovery();
	const { tokens } = useTokenLists({ chainId: CHAIN_IDS.KALYCHAIN });
	const [managedPool, setManagedPool] = useState<V3PoolData | null>(null);
	const [filterMode, setFilterMode] = useState<PoolFilterMode>('all');

	const poolTokens = useMemo<Token[]>(
		() =>
			allPools.flatMap((pool) => [pool.token0, pool.token1]).map((token) => ({
				chainId: CHAIN_IDS.KALYCHAIN,
				address: token.id,
				decimals: Number(token.decimals),
				name: token.name,
				symbol: token.symbol,
				logoURI: '',
			})),
		[allPools],
	);
	const prices = useTokenUsdPrices(poolTokens, CHAIN_IDS.KALYCHAIN);
	const { data: stats24h = {} } = usePool24hStats(CHAIN_IDS.KALYCHAIN);

	const logoFor = (address: string, symbol: string): string | undefined => {
		const listed = tokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
		if (listed?.logoURI) return listed.logoURI;
		return KMT_FAMILY.includes(symbol.toLowerCase()) ? '/tokens/klc.png' : undefined;
	};

	const tvl = allPools.reduce((sum, pool) => sum + (Number(pool.totalValueLockedUSD) || 0), 0);
	const volume = Object.values(stats24h).reduce((sum, stat) => sum + stat.volumeUsd, 0);
	const mine = allPools.reduce(
		(sum, pool) => sum + pool.userPositions.reduce((acc, position) => acc + (servicePositionUsd(position, pool, prices) ?? 0), 0),
		0,
	);

	const openAdd = (pool: V3PoolData) => {
		// Symbols travel with the addresses so the add form can label tokens outside the list.
		const params = new URLSearchParams({
			tokenA: pool.token0.id,
			tokenB: pool.token1.id,
			tokenASymbol: pool.token0.symbol,
			tokenBSymbol: pool.token1.symbol,
			fee: pool.feeTier,
		});
		router.push(href(`/pools/add?${params.toString()}`));
	};

	const visiblePools = filterPoolsByOwnership(pools, filterMode);
	const emptyMessage =
		allPools.length === 0
			? p.noPools
			: filterMode === 'mine' && visiblePools.length === 0
				? l.table.mineEmpty
				: p.empty;

	let body;
	if (error) {
		body = (
			<div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
				<p>{p.error}</p>
				<Button size="sm" variant="secondary" onClick={() => refetch()}>
					<RefreshCw />
					{p.retry}
				</Button>
			</div>
		);
	} else if (loading && allPools.length === 0) {
		body = (
			<div className="flex justify-center py-10">
				<LoadingSpinner size="lg" />
			</div>
		);
	} else {
		body = (
			<PoolsTable
				pools={visiblePools}
				stats24h={stats24h}
				prices={prices}
				logoFor={logoFor}
				empty={emptyMessage}
				onManage={setManagedPool}
				onAdd={openAdd}
			/>
		);
	}

	return (
		<>
			<PageHeader title={dict.pages.pools.title} subtitle={dict.pages.pools.subtitle} />
			<div className="mb-5 grid gap-4 md:grid-cols-3">
				<StatCard label={p.statTvl} value={fmt.usd(tvl, { compact: tvl >= 100_000 })} />
				<StatCard label={p.statVolume} value={fmt.usd(volume, { compact: volume >= 100_000 })} />
				<StatCard label={p.statMine} value={isConnected ? fmt.usd(mine) : '—'} tone="gold" />
			</div>
			<Panel
				action={
					<div className="flex w-full flex-wrap items-center justify-between gap-3">
						<div className="inline-flex items-center gap-1 rounded-lg bg-surface-hi p-1">
							<button
								type="button"
								onClick={() => setFilterMode('all')}
								className={cn(
									'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
									filterMode === 'all' ? 'bg-surface text-cream' : 'text-muted-foreground hover:text-cream',
								)}
							>
								{l.table.filterAll}
							</button>
							<button
								type="button"
								onClick={() => setFilterMode('mine')}
								className={cn(
									'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
									filterMode === 'mine' ? 'bg-surface text-cream' : 'text-muted-foreground hover:text-cream',
								)}
							>
								{interpolate(l.table.filterMine, { count: userPoolsCount })}
							</button>
						</div>
						<div className="relative w-full max-w-xs">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
							<Input
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								placeholder={p.search}
								aria-label={p.search}
								className="h-9 pl-9"
							/>
						</div>
					</div>
				}
			>
				{body}
			</Panel>
			<PoolPositionsDialog pool={managedPool} onClose={() => setManagedPool(null)} onUpdate={() => refetch()} />
		</>
	);
}
