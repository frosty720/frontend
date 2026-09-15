'use client';

import StakeCard from '@/components/staking/StakeCard';
import StakeNetworkCard from '@/components/staking/StakeNetworkCard';
import StakePositionCard from '@/components/staking/StakePositionCard';
import { PageHeader } from '@/components/primitives/PageHeader';
import { CHAIN_IDS } from '@/config/chains';
import { useTokenLists } from '@/hooks/useTokenLists';
import { usdPriceOf, useTokenUsdPrices } from '@/hooks/useTokenUsdPrices';
import { useDict } from '@/i18n/hooks';

/** Stake page, laid out like the reference: staking card left, position + network stats right. */
export default function StakePage() {
	const dict = useDict();
	const { tokens } = useTokenLists({ chainId: CHAIN_IDS.KALYCHAIN });
	const native = tokens.find((token) => token.isNative) ?? null;
	const prices = useTokenUsdPrices([native], CHAIN_IDS.KALYCHAIN);

	return (
		<>
			<PageHeader title={dict.pages.stake.title} subtitle={dict.pages.stake.subtitle} />
			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
				<StakeCard />
				<div className="space-y-5">
					<StakePositionCard />
					<StakeNetworkCard kmtPrice={usdPriceOf(prices, native)} />
				</div>
			</div>
		</>
	);
}
