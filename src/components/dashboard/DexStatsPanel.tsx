'use client';

import { Sprout } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CHAIN_IDS } from '@/config/chains';
import { useDexStats } from '@/hooks/useDexStats';
import { useTraderCount } from '@/hooks/useTraderCount';
import { useDict, useFormat } from '@/i18n/hooks';

interface StatRow {
	label: string;
	value: string | undefined;
	loading: boolean;
}

/** "KalySwap stats": whole-DEX figures from the V3 subgraph. Traders = distinct wallets that have swapped. */
export default function DexStatsPanel() {
	const dict = useDict();
	const fmt = useFormat();
	const d = dict.dashboard;
	const { data, isLoading, isError } = useDexStats(CHAIN_IDS.KALYCHAIN);
	const traders = useTraderCount(CHAIN_IDS.KALYCHAIN);

	const rows: StatRow[] = [
		{ label: d.statsTvl, value: data ? fmt.usd(data.tvlUsd, { compact: data.tvlUsd >= 100_000 }) : undefined, loading: isLoading },
		{ label: d.statsVolume, value: data ? fmt.usd(data.volume24hUsd, { compact: data.volume24hUsd >= 100_000 }) : undefined, loading: isLoading },
		{
			label: dict.yields.traders,
			value: traders.data ? `${fmt.number(traders.data.count)}${traders.data.capped ? '+' : ''}` : traders.isError ? '—' : undefined,
			loading: traders.isLoading,
		},
		{ label: d.statsTxs, value: data ? fmt.number(data.txCount) : undefined, loading: isLoading },
	];

	return (
		<section className="flex flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6">
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{d.statsLabel}</div>
			{isError ? (
				<p className="mt-4 text-sm text-muted-foreground">{d.statsError}</p>
			) : (
				<dl className="mt-3 divide-y divide-line">
					{rows.map((row) => (
						<div key={row.label} className="flex items-center justify-between gap-3 py-3">
							<dt className="text-sm text-muted-foreground">{row.label}</dt>
							<dd className="font-semibold tabular-nums text-cream">
								{row.loading || row.value === undefined ? <Skeleton width={72} height={16} /> : row.value}
							</dd>
						</div>
					))}
				</dl>
			)}
			<p className="mt-auto flex items-center gap-2 rounded-xl border border-gold/35 bg-gold-soft px-4 py-3 text-[13px] text-cream">
				<Sprout className="size-4 shrink-0 text-gold" aria-hidden />
				<span>
					{d.statsNoteLead} <b className="font-semibold text-gold-light">{d.statsNoteAccent}</b> {d.statsNoteTail}
				</span>
			</p>
		</section>
	);
}
