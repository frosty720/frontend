/**
 * @vitest-environment jsdom
 *
 * A farm card shows only what ITS staked positions have accrued. The staker's claimable `rewards()`
 * balance is per reward token, so putting it on each card showed the same WKMT on every WKMT farm.
 */
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { V3Incentive } from '@/services/dex/v3-staking-types';
import type { IncentiveStakeValue } from '@/utils/farm';
import FarmCard from '../FarmCard';

const now = Math.floor(Date.now() / 1000);
const incentive: V3Incentive = {
	key: {
		rewardToken: '0xf90f0bd56558ac12f7fc285571d38181d2fed69b',
		pool: '0xa9ac6d3c75a883cc5d6efe7ebb973c68174ba61f',
		startTime: BigInt(now - 86_400),
		endTime: BigInt(now + 86_400),
		refundee: '0xae51f2efe70e57b994be8f7f97c4dc824c51802a',
	},
	incentiveId: `0x${'c'.repeat(64)}`,
	totalRewardUnclaimed: 1_000n * 10n ** 18n,
	totalSecondsClaimedX128: 0n,
	numberOfStakes: 1,
	poolToken0Symbol: 'USDT',
	poolToken1Symbol: 'WKMT',
	poolFee: 3000,
	rewardTokenSymbol: 'WKMT',
	rewardTokenDecimals: 18,
	isActive: true,
	timeRemaining: 86_400,
};

function renderCard(staked: IncentiveStakeValue) {
	render(
		<DictionaryProvider dict={en} locale="en">
			<FarmCard incentive={incentive} apr={4.67} rewardPriceUsd={0.2} staked={staked} isConnected onStake={() => {}} onManage={() => {}} />
		</DictionaryProvider>,
	);
}

describe('FarmCard', () => {
	afterEach(cleanup);

	it('shows the rewards accrued by this farm\'s staked positions, with Harvest', () => {
		renderCard({ totalUsd: 10, userUsd: 9.93, userTokenIds: [21n], userAccrued: 50n * 10n ** 18n });
		expect(screen.getByText('+$10.00')).toBeTruthy();
		expect(screen.getByText(en.farmManage.card.rewards).parentElement!.textContent).toBe(`${en.farmManage.card.rewards}+$10.0050 WKMT`);
		expect(screen.getByRole('button', { name: en.farm.harvest })).toBeTruthy();
	});

	it('shows no rewards and no Harvest on a farm where the wallet has nothing staked', () => {
		renderCard({ totalUsd: 0, userUsd: 0, userTokenIds: [], userAccrued: 0n });
		// The Rewards box reads "—" (the footer still lists what the farm has left to distribute).
		const rewardsBox = screen.getByText(en.farmManage.card.rewards).parentElement!;
		expect(rewardsBox.textContent).toBe(`${en.farmManage.card.rewards}—`);
		expect(screen.queryByRole('button', { name: en.farm.harvest })).toBeNull();
	});
});
