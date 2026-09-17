'use client';

import { Panel } from '@/components/primitives/Panel';
import VaultPolChart from '@/components/vaults/VaultPolChart';
import { usePolHistory, usePolStats, useVaultFeeSplit, useVaultPoolTvl } from '@/hooks/vaults/useVaultStats';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

/** POL detail: cumulative POL added (subgraph), live value per pool (RPC), whole-pool TVL, KMT price. */
export default function VaultPolPanel({ kmtPrice }: { kmtPrice: number | null }) {
	const dict = useDict();
	const fmt = useFormat();
	const p = dict.vaultApp.pol;
	const pol = usePolStats();
	const history = usePolHistory(useVaultFeeSplit().data);
	const poolTvl = useVaultPoolTvl();

	const points = history.data ?? [];
	const perPool = pol.data?.perPool ?? [];
	if (points.length < 2 && perPool.length === 0 && !pol.isError) return null;

	return (
		<Panel title={p.title} className="mb-5">
			<VaultPolChart points={points} label={p.chartLabel} />
			{pol.isError && <p className="text-sm text-danger">{p.error}</p>}
			{perPool.length > 0 && (
				<div className="mt-4 flex flex-wrap gap-2">
					{perPool.map(({ symbol, usd }) => (
						<span key={symbol} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-alt px-3 py-1.5 text-[12.5px] text-muted-foreground">
							KMT/{symbol} <span className="font-semibold tabular-nums text-gold">{fmt.usd(usd)}</span>
						</span>
					))}
				</div>
			)}
			{poolTvl.data !== undefined && poolTvl.data > 0 && (
				<p className="mt-4 text-[13px] text-muted-foreground">
					{p.totalPool} <span className="font-semibold tabular-nums text-cream">{fmt.usd(poolTvl.data)}</span>
				</p>
			)}
			<p className="mt-3 text-[12px] text-muted-deep">
				{p.footnote}
				{kmtPrice !== null && <> · {interpolate(p.kmtPrice, { price: fmt.usd(kmtPrice, { decimals: 4 }) })}</>}
			</p>
		</Panel>
	);
}
