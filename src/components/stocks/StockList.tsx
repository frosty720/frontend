'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { Hex } from 'viem';
import { Panel } from '@/components/primitives/Panel';
import { Pill } from '@/components/primitives/Pill';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StockGroup } from '@/config/stocks';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { groupAssets, midPrice, searchAssets, usdDecimals, type StockAsset, type StockQuote } from '@/lib/stocks';
import { cn } from '@/lib/utils';

type Filter = StockGroup | 'all';

/** Every listed asset, filterable by asset class and searchable by ticker or name. */
export default function StockList({
	assets,
	prices,
	selected,
	onSelect,
	loading,
	failed,
	onRetry,
}: {
	assets: StockAsset[] | undefined;
	prices: Record<string, StockQuote>;
	selected: Hex | undefined;
	onSelect: (asset: StockAsset) => void;
	loading: boolean;
	failed: boolean;
	onRetry: () => void;
}) {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.stocks;
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<Filter>('all');

	const groups = useMemo(() => groupAssets(assets ?? []), [assets]);
	const inFilter = filter === 'all' ? (assets ?? []) : (groups.find((g) => g.group === filter)?.assets ?? []);
	const visible = searchAssets(inFilter, query);
	const filters: Array<{ key: Filter; count: number }> = [
		{ key: 'all', count: assets?.length ?? 0 },
		...groups.map((g) => ({ key: g.group, count: g.assets.length })),
	];

	let body;
	if (loading) {
		body = (
			<div className="flex justify-center py-12 text-muted-foreground">
				<Loader2 className="size-5 animate-spin" aria-label={dict.common.loading} />
			</div>
		);
	} else if (failed) {
		body = (
			<div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
				<p>{t.loadFailed}</p>
				<Button variant="secondary" size="sm" onClick={onRetry}>
					{dict.common.retry}
				</Button>
			</div>
		);
	} else if (visible.length === 0) {
		body = <p className="py-12 text-center text-sm text-muted-foreground">{interpolate(t.noResults, { query })}</p>;
	} else {
		body = (
			<ul className="-mx-2 max-h-[600px] overflow-y-auto">
				{visible.map((asset) => {
					const quote = prices[asset.address.toLowerCase()];
					const price = midPrice(quote);
					const active = asset.address === selected;
					return (
						<li key={asset.address}>
							<button
								type="button"
								aria-pressed={active}
								onClick={() => onSelect(asset)}
								className={cn(
									'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
									active ? 'bg-gold-soft' : 'hover:bg-surface-alt',
								)}
							>
								<TokenAvatar symbol={asset.symbol} logoURI={asset.logoURI} size={34} />
								<span className="min-w-0 flex-1">
									<span className="flex flex-wrap items-center gap-1.5">
										<span className="font-semibold">{asset.symbol}</span>
										{/* Arcus flags every meme as unverified; the Meme tab already says what they are. */}
										{!asset.verified && asset.group !== 'meme' && <Pill tone="muted">{t.unverified}</Pill>}
										{quote?.halted && <Pill tone="danger">{t.halted}</Pill>}
									</span>
									<span className="block truncate text-[12.5px] text-muted-foreground">{asset.name}</span>
								</span>
								<span className="shrink-0 text-right text-sm font-semibold tabular-nums">{price === null ? '—' : fmt.usd(price, { decimals: usdDecimals(price) })}</span>
							</button>
						</li>
					);
				})}
			</ul>
		);
	}

	return (
		<Panel title={t.listTitle}>
			<div className="relative mb-3">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
				<Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.search} className="pl-9" />
			</div>
			<div role="tablist" aria-label={t.groupsLabel} className="mb-3 flex flex-wrap gap-1.5">
				{filters.map(({ key, count }) => (
					<button
						key={key}
						type="button"
						role="tab"
						aria-selected={filter === key}
						onClick={() => setFilter(key)}
						className={cn(
							'rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold transition-colors',
							filter === key ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
						)}
					>
						{t.groups[key]} <span className="text-muted-foreground">{count}</span>
					</button>
				))}
			</div>
			{body}
		</Panel>
	);
}
