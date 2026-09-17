'use client';

import { StatCard } from '@/components/primitives/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyVaults } from '@/hooks/vaults/useMyVaults';
import { useDict, useFormat } from '@/i18n/hooks';

/** The wallet's totals across its vaults: claimable KMT (≈ USD), invested USD and reward weight. */
export default function VaultPositionSummary({ address, kmtPrice }: { address: string; kmtPrice: number | null }) {
	const dict = useDict();
	const fmt = useFormat();
	const p = dict.vaultApp.position;
	const { data: vaults, isLoading } = useMyVaults(address);
	const pending = <Skeleton width={120} height={32} />;

	const claimable = vaults?.reduce((sum, vault) => sum + vault.claimableKmt, 0) ?? 0;
	const invested = vaults?.reduce((sum, vault) => sum + vault.priceUsd, 0) ?? 0;
	const weight = vaults?.reduce((sum, vault) => sum + vault.weight, 0n) ?? 0n;
	const ready = !isLoading && vaults !== undefined;

	return (
		<div className="mb-5 grid gap-4 md:grid-cols-3">
			<StatCard
				label={p.claimable}
				tone="success"
				value={ready ? `${fmt.number(claimable, { maximumFractionDigits: 2 })} KMT` : pending}
				hint={ready ? (kmtPrice !== null ? `≈ ${fmt.usd(claimable * kmtPrice)}` : p.priceUnavailable) : undefined}
			/>
			<StatCard label={p.invested} value={ready ? fmt.usd(invested, { decimals: 0 }) : pending} />
			<StatCard label={p.weight} value={ready ? fmt.number(Number(weight), { maximumFractionDigits: 0 }) : pending} />
		</div>
	);
}
