'use client';

import { useState } from 'react';
import { Gift } from 'lucide-react';
import { formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useStakingActions, useStakingBalances } from '@/hooks/staking';
import { useWallet } from '@/hooks/useWallet';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { stakingLogger } from '@/lib/logger';

/** "My staking position": stake, rewards, APR and pool share, with Claim (and Exit). */
export default function StakePositionCard() {
	const dict = useDict();
	const fmt = useFormat();
	const s = dict.stake;
	const toast = useToast();
	const { address, isConnected } = useWallet();
	const { stakedBalance, earnedRewards, apr, poolSharePercentage, hasStakedBalance, hasEarnedRewards, isLoading } = useStakingBalances(address);
	const { claimRewards, exitStaking } = useStakingActions();
	const [claiming, setClaiming] = useState(false);
	const [exiting, setExiting] = useState(false);

	const staked = Number(formatEther(stakedBalance));
	const earned = Number(formatEther(earnedRewards));
	const kmt = (value: number, digits = 4) => `${fmt.number(value, { maximumFractionDigits: digits })} KMT`;

	const claim = async () => {
		setClaiming(true);
		try {
			await claimRewards();
			toast.success(s.toastClaimed);
		} catch (error) {
			stakingLogger.error('Claim rewards error:', error);
			toast.error(s.toastFailed);
		} finally {
			setClaiming(false);
		}
	};

	const exit = async () => {
		if (!window.confirm(interpolate(s.exitConfirm, { staked: fmt.number(staked, { maximumFractionDigits: 4 }), rewards: fmt.number(earned, { maximumFractionDigits: 4 }) }))) return;
		setExiting(true);
		try {
			await exitStaking();
			toast.success(s.toastExited);
		} catch (error) {
			stakingLogger.error('Exit staking error:', error);
			toast.error(s.toastFailed);
		} finally {
			setExiting(false);
		}
	};

	const rows: Array<[string, string, string?]> = [
		[s.rowStaked, isConnected ? kmt(staked, 2) : '—'],
		[s.rowRewards, isConnected ? `+${kmt(earned)}` : '—', 'text-success'],
		[s.rowApr, fmt.pct(apr, 2)],
		[s.rowShare, isConnected ? fmt.pct(poolSharePercentage, 4) : '—'],
	];

	return (
		<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{s.positionTitle}</div>
			<dl className="mt-3 divide-y divide-line">
				{rows.map(([label, value, tone]) => (
					<div key={label} className="flex items-center justify-between gap-3 py-3">
						<dt className="text-sm text-muted-foreground">{label}</dt>
						<dd className={`font-semibold tabular-nums ${tone ?? 'text-cream'}`}>{isLoading ? '…' : value}</dd>
					</div>
				))}
			</dl>
			<Button variant="secondary" className="mt-4 h-11 w-full" onClick={claim} disabled={!isConnected || !hasEarnedRewards || claiming}>
				<Gift />
				{claiming ? s.claiming : interpolate(s.claim, { amount: kmt(earned) })}
			</Button>
			{isConnected && hasStakedBalance && (
				<button
					type="button"
					onClick={exit}
					disabled={exiting}
					className="mt-3 w-full text-center text-[12.5px] text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
				>
					{exiting ? s.exiting : s.exit}
				</button>
			)}
		</section>
	);
}
