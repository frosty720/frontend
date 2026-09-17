'use client';

import { DataTable, type Column } from '@/components/primitives/DataTable';
import { Panel } from '@/components/primitives/Panel';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAddress } from '@/config/contracts';
import { useAffiliateLeaderboard } from '@/hooks/vaults/useVaultAffiliate';
import { useDict, useFormat } from '@/i18n/hooks';
import type { LeaderRow } from '@/utils/vaultAffiliate';

/** Top affiliates by commission, then referrals; the connected wallet's row is highlighted. */
export default function VaultLeaderboard({ you }: { you?: string }) {
	const dict = useDict();
	const fmt = useFormat();
	const l = dict.vaultApp.leaderboard;
	const { data, isLoading, isError } = useAffiliateLeaderboard();
	const me = you?.toLowerCase();

	const ranked = (data ?? []).map((row, index) => ({ ...row, position: index + 1 }));
	const columns: Column<LeaderRow & { position: number }>[] = [
		{ key: 'position', header: '#', cell: (row) => <span className="tabular-nums text-muted-foreground">{row.position}</span> },
		{
			key: 'affiliate',
			header: l.affiliate,
			cell: (row) => (
				<span className="font-mono text-cream">
					{formatAddress(row.address)}
					{row.address === me && <span className="ml-2 font-sans text-[11px] font-semibold text-gold">{l.you}</span>}
				</span>
			),
		},
		{ key: 'referrals', header: l.referrals, align: 'right', cell: (row) => <span className="tabular-nums">{fmt.number(row.referrals)}</span> },
		{ key: 'commission', header: l.commission, align: 'right', cell: (row) => <span className="font-semibold tabular-nums text-gold">{fmt.usd(row.commissionUsd)}</span> },
	];

	let body;
	if (isLoading) body = <Skeleton height={120} className="w-full" />;
	else if (isError) body = <p className="text-sm text-danger">{l.error}</p>;
	else body = <DataTable columns={columns} rows={ranked} rowKey={(row) => row.address} empty={l.empty} />;

	return (
		<Panel title={l.title}>
			{body}
			<p className="mt-4 text-[12px] text-muted-deep">{l.footnote}</p>
		</Panel>
	);
}
