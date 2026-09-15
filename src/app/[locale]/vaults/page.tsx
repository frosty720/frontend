'use client';

import { useAccount } from 'wagmi';
import MyVaultsPanel from '@/components/vaults/MyVaultsPanel';
import VaultTierCard from '@/components/vaults/VaultTierCard';
import { PageHeader } from '@/components/primitives/PageHeader';
import { StatCard } from '@/components/primitives/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { CHAIN_IDS } from '@/config/chains';
import { useTokenLists } from '@/hooks/useTokenLists';
import { usdPriceOf, useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { useVaultProtocolStats, useVaultTiers } from '@/hooks/vaults/useVaultStats';
import { useDict, useFormat } from '@/i18n/hooks';
import { sumDeposited } from '@/utils/vaults';

/** Vaults page, laid out like the reference: three stat cards, the tier cards, then My vaults. */
export default function VaultsPage() {
	const dict = useDict();
	const fmt = useFormat();
	const v = dict.vaults;
	const { address } = useAccount();
	const { data: tierData } = useVaultTiers();
	const { data: stats } = useVaultProtocolStats();
	const { tokens } = useTokenLists({ chainId: CHAIN_IDS.KALYCHAIN });
	const native = tokens.find((token) => token.isNative) ?? null;
	const kmtPrice = usdPriceOf(useTokenUsdPrices([native], CHAIN_IDS.KALYCHAIN), native);

	const tiers = (tierData?.tiers ?? []).filter((tier) => tier.active);
	const deposited = stats && tierData ? sumDeposited(stats.tierCounts, new Map(tierData.tiers.map((tier) => [tier.index, tier.priceUsd]))) : null;
	const distributed = stats ? (kmtPrice !== null ? fmt.usd(stats.claimedKmt * kmtPrice) : `${fmt.number(stats.claimedKmt, { maximumFractionDigits: 0 })} KMT`) : null;
	const pending = <Skeleton width={120} height={32} />;

	return (
		<>
			<PageHeader title={dict.pages.vaults.title} subtitle={dict.pages.vaults.subtitle} />
			<div className="mb-5 grid gap-4 md:grid-cols-3">
				<StatCard label={v.statDeposited} value={deposited !== null ? fmt.usd(deposited, { decimals: 0 }) : pending} />
				<StatCard label={v.statActive} value={stats ? fmt.number(stats.activeVaults) : pending} />
				<StatCard label={v.statDistributed} value={distributed ?? pending} tone="success" />
			</div>
			<div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{tierData
					? tiers.map((tier) => (
							<VaultTierCard key={tier.index} tier={tier} paused={tierData.paused} minted={stats ? (stats.tierCounts.get(tier.index) ?? 0) : null} />
						))
					: Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={250} className="w-full rounded-2xl" />)}
			</div>
			<MyVaultsPanel address={address} kmtPrice={kmtPrice} />
		</>
	);
}
