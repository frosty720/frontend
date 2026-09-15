'use client';

import Link from 'next/link';
import { DataTable, type Column } from '@/components/primitives/DataTable';
import { Panel } from '@/components/primitives/Panel';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { AssetRow } from '@/utils/dashboard';

interface AssetsTableProps {
	rows: AssetRow[];
	loading: boolean;
}

/** "My assets": the connected wallet's KalyChain tokens with live prices and 24 h change. */
export default function AssetsTable({ rows, loading }: AssetsTableProps) {
	const dict = useDict();
	const fmt = useFormat();
	const href = useLocaleHref();
	const d = dict.dashboard;

	const columns: Column<AssetRow>[] = [
		{
			key: 'asset',
			header: d.colAsset,
			cell: (row) => (
				<span className="flex items-center gap-3">
					<TokenAvatar symbol={row.token.symbol} logoURI={row.token.logoURI || undefined} size={34} />
					<span className="min-w-0">
						<span className="block font-semibold text-cream">{row.token.symbol}</span>
						<span className="block truncate text-[12.5px] text-muted-deep">{row.token.name}</span>
					</span>
				</span>
			),
		},
		{ key: 'balance', header: d.colBalance, align: 'right', cell: (row) => <span className="tabular-nums">{fmt.number(row.balance, { maximumFractionDigits: row.balance < 1 ? 6 : 3 })}</span> },
		{ key: 'price', header: d.colPrice, align: 'right', cell: (row) => <span className="tabular-nums">{row.price !== null ? fmt.usd(row.price, { decimals: row.price < 1 ? 4 : 2 }) : '—'}</span> },
		{ key: 'value', header: d.colValue, align: 'right', cell: (row) => <span className="font-semibold tabular-nums text-cream">{row.value !== null ? fmt.usd(row.value) : '—'}</span> },
		{
			key: 'change',
			header: d.col24h,
			align: 'right',
			cell: (row) =>
				row.change24h === null ? (
					<span className="text-muted-foreground">—</span>
				) : (
					<span className={cn('font-semibold tabular-nums', row.change24h > 0 ? 'text-success' : row.change24h < 0 ? 'text-danger' : 'text-muted-foreground')}>
						{`${row.change24h > 0 ? '+' : ''}${fmt.pct(row.change24h, 1)}`}
					</span>
				),
		},
	];

	return (
		<Panel title={d.assetsTitle}>
			{loading && rows.length === 0 ? (
				<div className="space-y-3">
					{Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} height={40} className="w-full" />
					))}
				</div>
			) : (
				<DataTable
					columns={columns}
					rows={rows}
					rowKey={(row) => `${row.token.address}-${row.token.symbol}`}
					empty={
						<span className="flex flex-col items-center gap-2">
							{d.assetsEmpty}
							<Link href={href('/bridge')} className="font-semibold text-gold hover:text-gold-light">
								{d.assetsEmptyCta}
							</Link>
						</span>
					}
				/>
			)}
		</Panel>
	);
}
