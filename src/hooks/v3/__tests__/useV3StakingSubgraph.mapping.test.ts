import { describe, it, expect } from 'vitest';
import {
	rewardTokenIds,
	toSubgraphDeposits,
	toSubgraphRewardClaims,
	type RawRewardClaim,
	type RawStakerDeposit,
} from '@/hooks/v3/useV3StakingSubgraph';

const WKMT = '0xF90F0BD56558AC12F7FC285571D38181D2FED69B';
const INCENTIVE = '0xc87a4ed7453081756c65da02967e134f7a2b60cebef231eb2dbd131392e1bf49';

const deposits: RawStakerDeposit[] = [
	{ id: '7', numberOfStakes: '1', stakes: [{ liquidity: '58230031824456', incentive: { id: INCENTIVE, rewardToken: WKMT } }] },
];
const claims: RawRewardClaim[] = [
	{ id: '0xf377-1', rewardToken: WKMT.toLowerCase(), reward: '0.000016003598834676', timestamp: '1787700000' },
	{ id: '0xabcd-2', rewardToken: null, reward: '1', timestamp: '1787700100' },
];

describe('staking subgraph mapping', () => {
	it('collects reward-token ids once, lowercased, skipping claims whose token is unknown', () => {
		expect(rewardTokenIds(deposits, claims)).toEqual([WKMT.toLowerCase()]);
	});

	it('nests each stake’s reward-token symbol the way the staking code reads it', () => {
		const symbols = new Map([[WKMT.toLowerCase(), 'WKMT']]);
		expect(toSubgraphDeposits(deposits, symbols)).toEqual([
			{ id: '7', numberOfStakes: '1', stakes: [{ liquidity: '58230031824456', incentive: { id: INCENTIVE, rewardToken: { symbol: 'WKMT' } } }] },
		]);
	});

	it('maps claims to token + amount, and marks an unknown token instead of guessing', () => {
		const symbols = new Map([[WKMT.toLowerCase(), 'WKMT']]);
		const mapped = toSubgraphRewardClaims(claims, symbols);
		expect(mapped[0]).toEqual({ id: '0xf377-1', rewardToken: { id: WKMT.toLowerCase(), symbol: 'WKMT' }, amount: '0.000016003598834676', timestamp: '1787700000' });
		expect(mapped[1].rewardToken).toEqual({ id: '', symbol: '?' });
	});
});
