'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';
import BuyVaultDialog from '@/components/vaults/BuyVaultDialog';
import MyVaultsPanel from '@/components/vaults/MyVaultsPanel';
import VaultAffiliatePanel from '@/components/vaults/VaultAffiliatePanel';
import VaultLeaderboard from '@/components/vaults/VaultLeaderboard';
import VaultPolPanel from '@/components/vaults/VaultPolPanel';
import VaultPositionSummary from '@/components/vaults/VaultPositionSummary';
import VaultTierCard from '@/components/vaults/VaultTierCard';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { PageHeader } from '@/components/primitives/PageHeader';
import { StatCard } from '@/components/primitives/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CHAIN_IDS } from '@/config/chains';
import { useTokenLists } from '@/hooks/useTokenLists';
import { usdPriceOf, useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { usePolStats, useVaultProtocolStats, useVaultTiers, type VaultTier } from '@/hooks/vaults/useVaultStats';
import { useDict, useFormat } from '@/i18n/hooks';
import { sumDeposited } from '@/utils/vaults';

const TABS = ['vaults', 'my', 'affiliate'] as const;
type VaultTab = (typeof TABS)[number];

function isVaultTab(value: string | null): value is VaultTab {
	return TABS.includes(value as VaultTab);
}

/** Vaults app: buy (tiers + in-app purchase), manage (position, maturity, claim), affiliate (link, standing, leaderboard). */
export default function VaultsPage() {
	// useSearchParams needs a Suspense boundary under the App Router.
	return (
		<Suspense>
			<VaultsPageContent />
		</Suspense>
	);
}

function VaultsPageContent() {
	const dict = useDict();
	const fmt = useFormat();
	const v = dict.vaults;
	const va = dict.vaultApp;
	const params = useSearchParams();
	const referrer = params.get('ref');
	const initialTab = params.get('tab');
	const [tab, setTab] = useState<VaultTab>(isVaultTab(initialTab) ? initialTab : 'vaults');
	const [buying, setBuying] = useState<VaultTier | null>(null);
	const { address } = useAccount();
	const { data: tierData } = useVaultTiers();
	const { data: stats } = useVaultProtocolStats();
	const pol = usePolStats();
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
			<Tabs value={tab} onValueChange={(value) => isVaultTab(value) && setTab(value)}>
				<TabsList className="mb-5">
					{TABS.map((key) => (
						<TabsTrigger key={key} value={key}>
							{va.tabs[key]}
						</TabsTrigger>
					))}
				</TabsList>

				<TabsContent value="vaults">
					<div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
						<StatCard label={va.pol.statLabel} value={pol.data ? fmt.usd(pol.data.totalUsd, { decimals: 0 }) : pol.isError ? '—' : pending} hint={va.pol.live} />
						<StatCard label={v.statDeposited} value={deposited !== null ? fmt.usd(deposited, { decimals: 0 }) : pending} />
						<StatCard label={v.statActive} value={stats ? fmt.number(stats.activeVaults) : pending} />
						<StatCard label={v.statDistributed} value={distributed ?? pending} tone="success" />
					</div>
					<div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
						{tierData
							? tiers.map((tier) => (
									<VaultTierCard
										key={tier.index}
										tier={tier}
										paused={tierData.paused}
										minted={stats ? (stats.tierCounts.get(tier.index) ?? 0) : null}
										onMint={setBuying}
									/>
								))
							: Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={250} className="w-full rounded-2xl" />)}
					</div>
					<VaultPolPanel kmtPrice={kmtPrice} />
				</TabsContent>

				<TabsContent value="my">
					{address ? (
						<>
							<VaultPositionSummary address={address} kmtPrice={kmtPrice} />
							<MyVaultsPanel address={address} kmtPrice={kmtPrice} />
						</>
					) : (
						<ConnectPrompt />
					)}
				</TabsContent>

				<TabsContent value="affiliate">
					{address ? <VaultAffiliatePanel address={address} /> : <ConnectPrompt body={va.affiliate.connectBody} />}
					<div className={address ? undefined : 'mt-5'}>
						<VaultLeaderboard you={address} />
					</div>
				</TabsContent>
			</Tabs>

			<BuyVaultDialog
				tier={buying}
				onClose={() => setBuying(null)}
				initialReferrer={referrer && isAddress(referrer) ? referrer : undefined}
				onViewMyVaults={() => {
					setBuying(null);
					setTab('my');
				}}
			/>
		</>
	);
}
