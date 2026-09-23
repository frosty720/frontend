'use client';

import { Plus, Sprout } from 'lucide-react';
import { formatUnits } from 'viem';
import { Pill, type PillTone } from '@/components/primitives/Pill';
import { Button } from '@/components/ui/button';
import type { V3Incentive } from '@/services/dex/v3-staking-types';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { formatDuration, incentiveStatus, type IncentiveStakeValue, type IncentiveStatus } from '@/utils/farm';

const STATUS_TONE: Record<IncentiveStatus, PillTone> = { active: 'success', upcoming: 'gold', ended: 'muted' };

interface FarmCardProps {
	incentive: V3Incentive;
	/** Estimated APR of the farm's in-range staked liquidity; null when it can't be estimated. */
	apr: number | null;
	/** USD price of the reward token; null when the subgraph has none. */
	rewardPriceUsd: number | null;
	/** USD staked in this farm, overall and by the wallet. */
	staked: IncentiveStakeValue;
	isConnected: boolean;
	onStake: () => void;
	onManage: () => void;
}

/** The reference's farm card: pair + fee tier + APR, Staked / Rewards boxes, Stake LP / Harvest. */
export default function FarmCard({ incentive, apr, rewardPriceUsd, staked, isConnected, onStake, onManage }: FarmCardProps) {
	const dict = useDict();
	const fmt = useFormat();
	const f = dict.farm;
	const c = dict.farmManage.card;
	const status = incentiveStatus(incentive, Math.floor(Date.now() / 1000));
	const pair = `${incentive.poolToken0Symbol || '?'} / ${incentive.poolToken1Symbol || '?'}`;
	const rewardSymbol = incentive.rewardTokenSymbol || '';
	const decimals = incentive.rewardTokenDecimals || 18;

	// Only what this farm's staked positions have accrued. The claimable `rewards()` balance is kept per
	// reward TOKEN, not per farm, so it is shown once on the page (with Claim) instead of on every card.
	const hasPending = staked.userAccrued > 0n;
	const hasStake = staked.userTokenIds.length > 0;
	const pendingAmount = Number(formatUnits(staked.userAccrued, decimals));
	const tokens = (amount: number) => `${fmt.number(amount, { maximumFractionDigits: 4 })} ${rewardSymbol}`.trim();
	const timeLeft = formatDuration(incentive.timeRemaining, { day: f.dayUnit, hour: f.hourUnit, minute: f.minuteUnit });
	const stakedText = isConnected && staked.userUsd !== null ? fmt.usd(staked.userUsd) : '—';
	let rewardsText = '—';
	if (isConnected && hasPending) {
		rewardsText = rewardPriceUsd !== null ? `+${fmt.usd(pendingAmount * rewardPriceUsd)}` : `+${tokens(pendingAmount)}`;
	}

	return (
		<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
			<header className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Sprout className="size-4 shrink-0 text-gold" aria-hidden />
					<h3 className="font-display text-lg font-semibold">{interpolate(f.lp, { pair })}</h3>
					{incentive.poolFee ? <Pill tone="gold">{fmt.pct(incentive.poolFee / 10_000, 2)}</Pill> : null}
					{status !== 'active' && <Pill tone={STATUS_TONE[status]}>{f[status]}</Pill>}
				</div>
				<div className="shrink-0 text-right">
					<div className="font-display text-xl font-bold leading-none tabular-nums text-success">{apr !== null ? fmt.pct(apr) : '—'}</div>
					<div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-deep">{c.aprEstimate}</div>
				</div>
			</header>

			<div className="mt-4 grid grid-cols-2 gap-3">
				<div className="rounded-xl bg-surface-alt px-4 py-3">
					<div className="text-[12px] text-muted-foreground">{c.staked}</div>
					<div className="mt-1 font-semibold tabular-nums text-cream">{stakedText}</div>
					{isConnected && staked.userTokenIds.length > 0 && (
						<div className="mt-0.5 text-[11.5px] text-muted-deep">{interpolate(c.positions, { count: fmt.number(staked.userTokenIds.length) })}</div>
					)}
				</div>
				<div className="rounded-xl bg-surface-alt px-4 py-3">
					<div className="text-[12px] text-muted-foreground">{c.rewards}</div>
					<div className={hasPending ? 'mt-1 font-semibold tabular-nums text-success' : 'mt-1 font-semibold text-cream'}>{rewardsText}</div>
					{isConnected && hasPending && rewardPriceUsd !== null && (
						<div className="mt-0.5 text-[11.5px] text-muted-deep">{tokens(pendingAmount)}</div>
					)}
				</div>
			</div>

			{hasStake ? (
				<div className="mt-4 flex gap-3">
					{status !== 'ended' && (
						<Button className="flex-1" variant="secondary" onClick={onStake}>
							<Plus />
							{f.stakeLp}
						</Button>
					)}
					<Button className="flex-1" onClick={onManage}>
						{f.harvest}
					</Button>
				</div>
			) : (
				<div className="mt-4 flex flex-col gap-2">
					{status !== 'ended' && (
						<Button className="w-full" onClick={onStake}>
							<Plus />
							{f.stakeLp}
						</Button>
					)}
					{isConnected && (
						<Button className="self-center" variant="ghost" size="sm" onClick={onManage}>
							{c.manageStaked}
						</Button>
					)}
				</div>
			)}

			<ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[12px] text-muted-deep">
				{status === 'active' && timeLeft && <li>{interpolate(f.timeLeft, { time: timeLeft })}</li>}
				<li>{interpolate(c.totalStaked, { amount: staked.totalUsd !== null ? fmt.usd(staked.totalUsd) : '—' })}</li>
				<li>{interpolate(c.stakedPositions, { count: fmt.number(incentive.numberOfStakes) })}</li>
				<li>{interpolate(c.rewardsLeft, { amount: tokens(Number(formatUnits(incentive.totalRewardUnclaimed, decimals))) })}</li>
			</ul>
		</section>
	);
}
