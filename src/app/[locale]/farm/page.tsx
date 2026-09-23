'use client';

import { useCallback, useMemo, useState } from 'react';
import { RefreshCw, Sprout } from 'lucide-react';
import FarmCard from '@/components/farming/FarmCard';
import V3ManageModal from '@/components/farming/V3ManageModal';
import V3StakingModal from '@/components/farming/V3StakingModal';
import { EmptyState } from '@/components/primitives/EmptyState';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Panel } from '@/components/primitives/Panel';
import { StatCard } from '@/components/primitives/StatCard';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import { useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { useWallet } from '@/hooks/useWallet';
import { useFarmStakedValue } from '@/hooks/v3/useFarmStakedValue';
import { useV3Staking } from '@/hooks/v3/useV3Staking';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { farmingLogger } from '@/lib/logger';
import type { V3Incentive } from '@/services/dex/v3-staking-types';
import { incentiveStatus, rewardTotals, totalUsd, weightedAverageApr, type IncentiveStakeValue, type TokenTotal } from '@/utils/farm';

const UNKNOWN_STAKE: IncentiveStakeValue = { totalUsd: null, userUsd: null, userTokenIds: [], userAccrued: 0n };

/** Farm page, laid out like the reference: three stat cards, then a two-column grid of farms. */
export default function FarmPage() {
	const dict = useDict();
	const fmt = useFormat();
	const f = dict.farm;
	const p = dict.farmManage.page;
	const { isConnected, address } = useWallet();
	const { incentives, pendingRewards, rewardTokenSymbols, claimReward, isLoading, error, refetch } = useV3Staking();
	const staked = useFarmStakedValue(incentives, address, CHAIN_IDS.KALYCHAIN);

	const [staking, setStaking] = useState<V3Incentive | null>(null);
	const [managing, setManaging] = useState<V3Incentive | null>(null);
	const [claiming, setClaiming] = useState(false);

	const decimalsOf = useCallback(
		(token: string) => incentives.find((i) => i.key.rewardToken.toLowerCase() === token.toLowerCase())?.rewardTokenDecimals ?? 18,
		[incentives],
	);
	const rewardTokens = useMemo<Token[]>(
		() =>
			Array.from(new Set(incentives.map((i) => i.key.rewardToken.toLowerCase()))).map((address) => ({
				chainId: CHAIN_IDS.KALYCHAIN,
				address,
				decimals: decimalsOf(address),
				name: rewardTokenSymbols[address] ?? '',
				symbol: rewardTokenSymbols[address] ?? '',
				logoURI: '',
			})),
		[incentives, rewardTokenSymbols, decimalsOf],
	);
	const prices = useTokenUsdPrices(rewardTokens, CHAIN_IDS.KALYCHAIN);

	const now = Math.floor(Date.now() / 1000);
	const stakeOf = (incentive: V3Incentive) => staked.byIncentive[incentive.incentiveId.toLowerCase()] ?? UNKNOWN_STAKE;
	const aprOf = (incentive: V3Incentive) => staked.aprByIncentive[incentive.incentiveId.toLowerCase()] ?? null;
	const rewardEntry = (token: string, raw: bigint) => ({ token, raw, decimals: decimalsOf(token), symbol: rewardTokenSymbols[token.toLowerCase()] ?? '' });
	// Claimable balances plus rewards still accruing in staked positions (paid out on unstake).
	const pending = rewardTotals(
		[
			...Object.entries(pendingRewards).map(([token, raw]) => rewardEntry(token, raw)),
			...incentives.map((incentive) => rewardEntry(incentive.key.rewardToken, stakeOf(incentive).userAccrued)),
		],
		prices,
	);
	const hasClaimable = Object.values(pendingRewards).some((raw) => raw > 0n);
	const activeCount = incentives.filter((i) => incentiveStatus(i, now) === 'active').length;

	const averageApr = weightedAverageApr(incentives.map((incentive) => ({ apr: aprOf(incentive), stakedUsd: stakeOf(incentive).totalUsd })));

	const totalText = (totals: TokenTotal[]) => {
		if (totals.length === 0) return fmt.usd(0);
		const usd = totalUsd(totals);
		if (usd !== null) return fmt.usd(usd);
		return totals.map((t) => `${fmt.number(t.amount, { maximumFractionDigits: 2 })} ${t.symbol}`).join(' + ');
	};

	const claimAll = useCallback(async () => {
		setClaiming(true);
		try {
			for (const [token, amount] of Object.entries(pendingRewards)) {
				if (amount > 0n) await claimReward(token, amount);
			}
		} catch (err) {
			farmingLogger.error('Failed to claim V3 reward:', err);
		} finally {
			setClaiming(false);
		}
	}, [pendingRewards, claimReward]);

	let body;
	if (error) {
		body = (
			<Panel>
				<EmptyState
					icon={Sprout}
					title={f.error}
					action={
						<Button size="sm" variant="secondary" onClick={() => refetch()}>
							<RefreshCw />
							{f.retry}
						</Button>
					}
				/>
			</Panel>
		);
	} else if (isLoading && incentives.length === 0) {
		body = (
			<div className="flex justify-center py-12">
				<LoadingSpinner size="lg" />
			</div>
		);
	} else if (incentives.length === 0) {
		body = (
			<Panel>
				<EmptyState icon={Sprout} title={f.empty} body={f.emptyBody} />
			</Panel>
		);
	} else {
		body = (
			<div className="grid gap-5 lg:grid-cols-2">
				{incentives.map((incentive) => (
					<FarmCard
						key={incentive.incentiveId}
						incentive={incentive}
						apr={aprOf(incentive)}
						rewardPriceUsd={prices[incentive.key.rewardToken.toLowerCase()] ?? null}
						staked={stakeOf(incentive)}
						isConnected={isConnected}
						onStake={() => setStaking(incentive)}
						onManage={() => setManaging(incentive)}
					/>
				))}
			</div>
		);
	}

	return (
		<>
			<PageHeader title={dict.pages.farm.title} subtitle={dict.pages.farm.subtitle} />
			<div className="mb-5 grid gap-4 md:grid-cols-3">
				<StatCard
					label={f.statPending}
					value={isConnected ? totalText(pending) : '—'}
					tone="success"
					hint={
						isConnected && hasClaimable ? (
							<Button size="sm" onClick={claimAll} disabled={claiming}>
								{claiming ? f.claiming : f.claim}
							</Button>
						) : undefined
					}
				/>
				<StatCard
					label={p.statStaked}
					value={staked.totalUsd !== null ? fmt.usd(staked.totalUsd) : '—'}
					hint={interpolate(p.activeFarms, { count: fmt.number(activeCount) })}
				/>
				<StatCard label={p.statAvgApr} value={averageApr !== null ? fmt.pct(averageApr) : '—'} tone="gold" hint={p.avgAprHint} />
			</div>
			{body}

			{staking && (
				<V3StakingModal isOpen onClose={() => setStaking(null)} incentive={staking} onStakeComplete={() => refetch()} />
			)}
			{managing && (
				<V3ManageModal
					isOpen
					onClose={() => setManaging(null)}
					incentive={managing}
					knownTokenIds={stakeOf(managing).userTokenIds}
					onActionComplete={() => refetch()}
				/>
			)}
		</>
	);
}
