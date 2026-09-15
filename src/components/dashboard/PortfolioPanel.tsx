'use client';

import { useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { Skeleton } from '@/components/ui/skeleton';
import { CHAIN_IDS } from '@/config/chains';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';
import { HISTORY_RANGES, hasEnoughHistory, type HistoryRange, type Holding } from '@/utils/portfolioHistory';

interface PortfolioPanelProps {
	connected: boolean;
	loading: boolean;
	walletUsd: number;
	stakedUsd: number;
	liquidityUsd: number;
	/** Value-weighted 24 h change of the wallet's priced tokens, in percent. */
	change24h: number | null;
	/** Wallet balances plus staked KMT (keyed as wrapped KMT) — what the chart values over time. */
	holdings: Holding[];
}

/**
 * "Total portfolio value": the live total and 24 h change, a chart of the CURRENT holdings valued at
 * past subgraph prices (1D hourly, 1W/1M/1Y daily), and the wallet / staked / liquidity split.
 */
export default function PortfolioPanel({ connected, loading, walletUsd, stakedUsd, liquidityUsd, change24h, holdings }: PortfolioPanelProps) {
	const dict = useDict();
	const fmt = useFormat();
	const d = dict.dashboard;
	const y = dict.yields;
	const [range, setRange] = useState<HistoryRange>('1W');
	const history = usePortfolioHistory(connected ? holdings : [], range, CHAIN_IDS.KALYCHAIN);

	const total = walletUsd + stakedUsd + liquidityUsd;
	const hasHoldings = holdings.some((holding) => holding.amount > 0);
	const parts = [
		{ key: 'wallet', label: d.portfolioWallet, value: walletUsd, color: 'bg-gold' },
		{ key: 'staked', label: d.portfolioStaked, value: stakedUsd, color: 'bg-violet' },
		{ key: 'liquidity', label: d.portfolioLiquidity, value: liquidityUsd, color: 'bg-info' },
	];
	const dateOptions: Intl.DateTimeFormatOptions = range === '1D' ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' };
	const first = history.points[0];
	const last = history.points[history.points.length - 1];

	let chart;
	if (history.isLoading) {
		chart = <Skeleton height={160} className="w-full" />;
	} else if (history.isError) {
		chart = <ChartMessage text={y.chartError} />;
	} else if (!hasEnoughHistory(history.points)) {
		chart = <ChartMessage text={y.chartNotEnough} />;
	} else {
		const from = fmt.date(first.t * 1000, dateOptions);
		chart = (
			<>
				<PortfolioChart points={history.points} label={interpolate(y.chartAria, { from, to: fmt.date(last.t * 1000, dateOptions) })} />
				<div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-deep">
					<span>{from}</span>
					<span>{y.chartNow}</span>
				</div>
			</>
		);
	}

	return (
		<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{d.portfolioLabel}</div>
				{connected && !loading && hasHoldings && (
					<div role="group" aria-label={y.rangeLabel} className="flex rounded-full border border-line bg-surface-alt p-0.5">
						{HISTORY_RANGES.map((option) => (
							<button
								key={option}
								type="button"
								aria-pressed={option === range}
								onClick={() => setRange(option)}
								className={cn(
									'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
									option === range ? 'bg-gold text-on-gold' : 'text-muted-foreground hover:text-cream',
								)}
							>
								{y.ranges[option]}
							</button>
						))}
					</div>
				)}
			</div>
			{!connected ? (
				<div className="mt-4 flex flex-col items-start gap-3">
					<p className="text-sm text-muted-foreground">{d.portfolioConnect}</p>
					<ClientOnlyConnectWallet />
				</div>
			) : loading ? (
				<div className="mt-3 space-y-3">
					<Skeleton width={220} height={40} />
					<Skeleton height={160} className="w-full" />
				</div>
			) : (
				<>
					<div className="mt-2 font-display text-[40px] font-bold leading-tight tabular-nums">{fmt.usd(total)}</div>
					{change24h !== null && (
						<div className={cn('mt-1 flex items-center gap-1.5 text-sm font-semibold', change24h >= 0 ? 'text-success' : 'text-danger')}>
							{change24h >= 0 ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
							{interpolate(d.portfolioChange, { change: `${change24h >= 0 ? '+' : ''}${fmt.pct(change24h, 1)}` })}
						</div>
					)}
					{hasHoldings && (
						<>
							<div className="mt-5">{chart}</div>
							<p className="mt-2 text-[11.5px] leading-relaxed text-muted-deep">
								{y.chartNote}
								{history.unpriced.length > 0 && ` ${interpolate(y.chartUnpriced, { count: String(history.unpriced.length) })}`}
							</p>
						</>
					)}
					<div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4">
						{parts.map((part) => (
							<div key={part.key} className="flex items-center gap-2 text-[12.5px]">
								<span className={cn('size-2 rounded-full', part.color)} aria-hidden />
								<span className="text-muted-foreground">{part.label}</span>
								<span className="font-semibold tabular-nums text-cream">{fmt.usd(part.value)}</span>
							</div>
						))}
					</div>
				</>
			)}
		</section>
	);
}

function ChartMessage({ text }: { text: string }) {
	return <div className="flex h-40 items-center justify-center rounded-xl bg-surface-alt px-4 text-center text-sm text-muted-foreground">{text}</div>;
}
