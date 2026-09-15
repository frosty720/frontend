'use client';

import Link from 'next/link';
import { Coins, Layers, Sprout, Vault, type LucideIcon } from 'lucide-react';
import ClaimAllButton, { type ClaimAllProps } from '@/components/dashboard/ClaimAllButton';
import { Panel } from '@/components/primitives/Panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

export type YieldKind = 'vault' | 'stake' | 'farm' | 'pool';

export interface YieldRow {
	key: string;
	kind: YieldKind;
	title: string;
	subtitle: string;
	/** Top-right accent, e.g. "30% APR" or a fee tier. */
	badge?: string;
	/** Bottom-right accent, e.g. "+12.4 KMT claimable". */
	value?: string;
	/** Internal path (localised) or absolute URL (opens in a new tab). */
	href: string;
}

const ICONS: Record<YieldKind, LucideIcon> = { vault: Vault, stake: Coins, farm: Sprout, pool: Layers };

interface ActiveYieldsPanelProps {
	rows: YieldRow[];
	loading: boolean;
	connected: boolean;
	/** Estimated USD per day from positions with a known APR; null when none. */
	dailyUsd: number | null;
	claim: ClaimAllProps;
}

/**
 * "Active yields": one card per earning position (each links to where it is managed), an estimated
 * daily total in the header, and a single claim-all button that collects staking, farm and vault
 * rewards one transaction after another.
 */
export default function ActiveYieldsPanel({ rows, loading, connected, dailyUsd, claim }: ActiveYieldsPanelProps) {
	const dict = useDict();
	const fmt = useFormat();
	const href = useLocaleHref();
	const d = dict.dashboard;
	const y = dict.yields;

	let body;
	if (!connected) {
		body = <p className="text-sm text-muted-foreground">{dict.common.connectBody}</p>;
	} else if (loading && rows.length === 0) {
		body = (
			<div className="space-y-3">
				{Array.from({ length: 3 }, (_, i) => (
					<Skeleton key={i} height={64} className="w-full" />
				))}
			</div>
		);
	} else if (rows.length === 0) {
		body = (
			<div className="space-y-3 text-sm text-muted-foreground">
				<p>{d.yieldsEmpty}</p>
				<div className="flex flex-wrap gap-3">
					<Link href={href('/stake')} className="font-semibold text-gold hover:text-gold-light">{d.yieldsStake}</Link>
					<Link href={href('/vaults')} className="font-semibold text-gold hover:text-gold-light">{d.yieldsVaults}</Link>
				</div>
			</div>
		);
	} else {
		body = (
			<>
				<ul className="space-y-3">
					{rows.map((row) => {
						const Icon = ICONS[row.kind];
						const external = row.href.startsWith('http');
						const content = (
							<>
								<div className="flex items-center justify-between gap-3">
									<span className="flex min-w-0 items-center gap-2 font-semibold text-cream">
										<Icon className="size-4 shrink-0 text-gold" aria-hidden />
										<span className="truncate">{row.title}</span>
									</span>
									{row.badge && <span className="shrink-0 text-[12.5px] font-semibold text-success">{row.badge}</span>}
								</div>
								<div className="mt-1.5 flex items-center justify-between gap-3 text-[12.5px]">
									<span className="min-w-0 truncate text-muted-foreground">{row.subtitle}</span>
									{row.value && <span className="shrink-0 font-semibold text-success">{row.value}</span>}
								</div>
							</>
						);
						const className = 'block rounded-xl border border-line bg-surface-alt px-4 py-3 transition-colors hover:border-gold/35';
						return (
							<li key={row.key}>
								{external ? (
									<a href={row.href} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
								) : (
									<Link href={href(row.href)} className={className}>{content}</Link>
								)}
							</li>
						);
					})}
				</ul>
				<ClaimAllButton {...claim} />
			</>
		);
	}

	const action =
		connected && dailyUsd !== null ? (
			<span className="text-sm font-semibold tabular-nums text-success" title={y.perDayHint}>
				{interpolate(y.perDay, { amount: fmt.usd(dailyUsd) })}
			</span>
		) : undefined;

	return (
		<Panel title={d.yieldsTitle} action={action}>
			{body}
		</Panel>
	);
}
