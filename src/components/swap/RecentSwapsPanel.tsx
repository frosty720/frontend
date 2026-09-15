'use client';

import { useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Panel } from '@/components/primitives/Panel';
import { Skeleton } from '@/components/ui/skeleton';
import { KALYCHAIN_EXPLORER_URL } from '@/config/chains';
import { usePairSwaps } from '@/hooks/usePairSwaps';
import { useWallet } from '@/hooks/useWallet';
import { NUMBER_LOCALE } from '@/i18n/config';
import { useDict, useFormat, useLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { relativeTime, swapDirection } from '@/utils/swapDisplay';

const ROWS = 6;

interface RecentSwapsPanelProps {
	/** Pool address of the selected pair; nothing is fetched until it is known. */
	pairAddress: string | null | undefined;
	chainId: number;
}

type Scope = 'all' | 'mine';

export default function RecentSwapsPanel({ pairAddress, chainId }: RecentSwapsPanelProps) {
	const dict = useDict();
	const fmt = useFormat();
	const locale = useLocale();
	const { address, isConnected } = useWallet();
	const [scope, setScope] = useState<Scope>('all');
	// A wallet disconnecting mid-session falls back to "All" rather than fetching with a stale address.
	const effectiveScope: Scope = isConnected ? scope : 'all';
	const { swaps, loading, error } = usePairSwaps({
		pairAddress,
		chainId,
		limit: ROWS,
		userAddress: effectiveScope === 'mine' ? address : null,
	});
	const now = new Date();

	let body;
	if (loading && swaps.length === 0) {
		body = (
			<div className="space-y-3">
				{Array.from({ length: 3 }, (_, i) => (
					<Skeleton key={i} height={20} className="w-full" />
				))}
			</div>
		);
	} else if (error) {
		body = <p className="text-sm text-muted-foreground">{dict.swap.recentError}</p>;
	} else if (!pairAddress || swaps.length === 0) {
		body = <p className="text-sm text-muted-foreground">{dict.swap.recentEmpty}</p>;
	} else {
		body = (
			<ul className="divide-y divide-line">
				{swaps.slice(0, ROWS).map((swap) => {
					const { from, to, amount } = swapDirection(swap);
					return (
						<li key={swap.id} className="flex items-center justify-between gap-3 py-3 text-sm">
							<span className="flex min-w-0 items-center gap-1.5 font-semibold text-cream">
								<span className="truncate">{from}</span>
								<ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
								<span className="truncate">{to}</span>
							</span>
							<a
								href={`${KALYCHAIN_EXPLORER_URL}/tx/${swap.hash}`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-cream"
							>
								<span className="flex flex-col items-end tabular-nums">
									<span>
										{fmt.number(amount, { maximumFractionDigits: amount < 1 ? 4 : 2 })} · {relativeTime(swap.timestamp, now, NUMBER_LOCALE[locale])}
									</span>
									<span className="text-[11px] text-muted-deep">
										{swap.amountUSD > 0 ? fmt.usd(swap.amountUSD, { decimals: swap.amountUSD < 1 ? 4 : 2 }) : '—'}
									</span>
								</span>
								<ExternalLink className="size-3.5 shrink-0" aria-hidden />
							</a>
						</li>
					);
				})}
			</ul>
		);
	}

	return (
		<Panel
			title={dict.swap.recentTitle}
			action={
				isConnected ? (
					<div className="flex items-center gap-0.5 rounded-lg bg-surface-hi p-0.5 text-[12px] font-semibold">
						<button
							type="button"
							onClick={() => setScope('all')}
							className={cn('rounded-md px-2.5 py-1 transition-colors', scope === 'all' ? 'bg-surface text-cream' : 'text-muted-foreground hover:text-cream')}
						>
							{dict.swapDetails.recent.all}
						</button>
						<button
							type="button"
							onClick={() => setScope('mine')}
							className={cn('rounded-md px-2.5 py-1 transition-colors', scope === 'mine' ? 'bg-surface text-cream' : 'text-muted-foreground hover:text-cream')}
						>
							{dict.swapDetails.recent.mine}
						</button>
					</div>
				) : undefined
			}
		>
			{body}
		</Panel>
	);
}
