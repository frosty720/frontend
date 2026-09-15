'use client';

import type { ReactNode } from 'react';
import { Panel } from '@/components/primitives/Panel';
import { Skeleton } from '@/components/ui/skeleton';
import type { Token } from '@/config/dex/types';
import { useToken24hChanges } from '@/hooks/useToken24hChanges';
import { useDict, useFormat } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { formatTokenPrice } from '@/utils/priceFormat';
import { pairOrder } from '@/utils/swapDisplay';
import { getEffectiveAddress } from '@/utils/tokens';

interface PairStatsPanelProps {
	fromToken: Token | null;
	toToken: Token | null;
	chainId: number;
	price: number;
	volume24h: number;
	liquidity: number;
	isLoading: boolean;
	error: string | null;
}

function StatRow({ label, loading, children }: { label: string; loading: boolean; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3 py-2 text-sm">
			<span className="shrink-0 text-muted-foreground">{label}</span>
			{loading ? <Skeleton height={16} className="w-20" /> : children}
		</div>
	);
}

/**
 * Compact "Pair stats" panel: price, 24h change, volume and liquidity for the selected pair.
 * Price/volume/liquidity come from `usePairMarketStats` (already fetched by the page). The 24h
 * change does NOT: `usePairMarketStats`'s own `priceChange24h` field is only ever populated by
 * the removed price chart (`PriceDataContext.setPriceChange24h`), so with no chart mounted it is
 * permanently 0 — showing it would be a fake number. `useToken24hChanges` reads the real daily
 * closes from the subgraph independently of the chart.
 */
export default function PairStatsPanel({ fromToken, toToken, chainId, price, volume24h, liquidity, isLoading, error }: PairStatsPanelProps) {
	const dict = useDict();
	const fmt = useFormat();
	const s = dict.swapDetails.pairStats;

	const order = pairOrder(fromToken, toToken);
	const baseToken = order?.[0] ?? null;
	const changes = useToken24hChanges([baseToken], chainId);
	const change = baseToken ? changes[getEffectiveAddress(baseToken).toLowerCase()] : undefined;

	const hasPrice = !error && !!order && price > 0;

	return (
		<Panel title={s.title} bodyClassName="divide-y divide-line">
			<StatRow label={s.price} loading={isLoading}>
				{hasPrice ? (
					<span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">
						<span className="font-semibold tabular-nums text-cream">
							{`1 ${order![0].symbol} = ${formatTokenPrice(price, order![0].symbol)} ${order![1].symbol}`}
						</span>
						{change !== undefined && (
							<span
								className={cn(
									'whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold',
									change >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
								)}
							>
								{`${change >= 0 ? '+' : ''}${fmt.pct(change, 2)}`}
							</span>
						)}
					</span>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</StatRow>

			<StatRow label={s.volume} loading={isLoading}>
				<span className="font-semibold tabular-nums text-cream">
					{!error && volume24h > 0 ? fmt.usd(volume24h, { compact: volume24h >= 100_000 }) : <span className="text-muted-foreground">—</span>}
				</span>
			</StatRow>

			<StatRow label={s.liquidity} loading={isLoading}>
				<span className="font-semibold tabular-nums text-cream">
					{!error && liquidity > 0 ? fmt.usd(liquidity, { compact: liquidity >= 100_000 }) : <span className="text-muted-foreground">—</span>}
				</span>
			</StatRow>
		</Panel>
	);
}
