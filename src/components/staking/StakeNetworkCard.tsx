'use client';

import { formatEther } from 'viem';
import { useStakingBalances } from '@/hooks/staking';
import { useWallet } from '@/hooks/useWallet';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

/** "Network stats": what the staking contract reports for everyone. */
export default function StakeNetworkCard({ kmtPrice }: { kmtPrice: number | null }) {
	const dict = useDict();
	const fmt = useFormat();
	const s = dict.stake;
	const { address } = useWallet();
	const { totalStaked, apr, daysRemaining, isLoading } = useStakingBalances(address);
	const total = Number(formatEther(totalStaked));

	const rows: Array<[string, string]> = [
		[s.rowTotal, `${fmt.number(total, { maximumFractionDigits: 0 })} KMT${kmtPrice !== null ? ` · ${fmt.usd(total * kmtPrice, { compact: total * kmtPrice >= 100_000 })}` : ''}`],
		[s.rowApr, fmt.pct(apr, 2)],
		[s.rowPeriod, daysRemaining > 0 ? interpolate(s.periodLeft, { days: String(daysRemaining) }) : s.periodEnded],
	];

	return (
		<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{s.networkTitle}</div>
			<dl className="mt-3 divide-y divide-line">
				{rows.map(([label, value]) => (
					<div key={label} className="flex items-center justify-between gap-3 py-3">
						<dt className="text-sm text-muted-foreground">{label}</dt>
						<dd className="text-right font-semibold tabular-nums text-cream">{isLoading ? '…' : value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
