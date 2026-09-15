'use client';

import { useState } from 'react';
import { Coins } from 'lucide-react';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { useStakingActions, useStakingBalances } from '@/hooks/staking';
import { useWallet } from '@/hooks/useWallet';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { stakingLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type Mode = 'stake' | 'withdraw';

/** The reference's staking card: two big tabs, an amount box with balance + MAX, one gold action. */
export default function StakeCard() {
	const dict = useDict();
	const s = dict.stake;
	const toast = useToast();
	const { address, isConnected } = useWallet();
	const [mode, setMode] = useState<Mode>('stake');
	const [amount, setAmount] = useState('');
	const [busy, setBusy] = useState(false);

	const {
		klcBalanceFormatted,
		stakedBalanceFormatted,
		validateStake,
		validateWithdraw,
		hasStakedBalance,
		isPaused,
		isLoading,
	} = useStakingBalances(address);
	const { stakeKLC, withdrawKLC } = useStakingActions();

	const isStake = mode === 'stake';
	const available = isStake ? klcBalanceFormatted : stakedBalanceFormatted;

	const switchMode = (next: Mode) => {
		setMode(next);
		setAmount('');
	};

	const submit = async () => {
		const validation = isStake ? validateStake(amount) : validateWithdraw(amount);
		if (!validation.isValid) {
			toast.error(s.toastInvalid, validation.errorCode ? dict.errors[validation.errorCode] : undefined);
			return;
		}
		setBusy(true);
		try {
			if (isStake) {
				await stakeKLC(amount);
				toast.success(interpolate(s.toastStaked, { amount }));
			} else {
				await withdrawKLC(amount);
				toast.success(interpolate(s.toastWithdrawn, { amount }));
			}
			setAmount('');
		} catch (error) {
			stakingLogger.error(isStake ? 'Staking error:' : 'Withdrawal error:', error);
			toast.error(s.toastFailed);
		} finally {
			setBusy(false);
		}
	};

	const tabs: Array<{ key: Mode; label: string; disabled?: boolean }> = [
		{ key: 'stake', label: s.tabStake },
		{ key: 'withdraw', label: s.tabWithdraw, disabled: isConnected && !hasStakedBalance },
	];

	return (
		<section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
			<div className="grid grid-cols-2 gap-3" role="tablist">
				{tabs.map((tab) => (
					<button
						key={tab.key}
						type="button"
						role="tab"
						aria-selected={mode === tab.key}
						disabled={tab.disabled}
						onClick={() => switchMode(tab.key)}
						className={cn(
							'rounded-xl border px-4 py-3 font-display text-[15px] font-semibold transition-colors disabled:opacity-40',
							mode === tab.key ? 'border-gold/60 bg-gold-soft text-gold-light' : 'border-line bg-surface-alt text-muted-foreground hover:text-cream',
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="mt-4 rounded-xl bg-surface-alt p-4">
				<div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
					<span>{isStake ? s.amountStake : s.amountWithdraw}</span>
					{isConnected && (
						<span className="min-w-0 truncate">
							{interpolate(isStake ? s.balance : s.staked, { amount: `${isLoading ? '…' : available} KMT` })}
						</span>
					)}
				</div>
				<div className="mt-2 flex items-center gap-3">
					<input
						type="text"
						inputMode="decimal"
						placeholder="0.0"
						aria-label={isStake ? s.amountStake : s.amountWithdraw}
						value={amount}
						onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
						className="h-10 w-full min-w-0 flex-1 bg-transparent font-display text-[28px] font-semibold leading-none text-cream outline-none placeholder:text-muted-deep"
					/>
					{isConnected && (
						<button
							type="button"
							onClick={() => setAmount(available)}
							className="rounded-md border border-line bg-surface-hi px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-cream"
						>
							{s.max}
						</button>
					)}
					<TokenAvatar symbol="KMT" logoURI="/tokens/klc.png" size={32} />
				</div>
			</div>

			{isPaused && isStake && (
				<p className="mt-3 rounded-xl border border-gold/25 bg-gold-soft px-3 py-2 text-sm text-gold-light">{s.paused}</p>
			)}

			<div className="mt-5">
				{isConnected ? (
					<Button
						size="lg"
						className="h-12 w-full text-[15px]"
						variant={isStake ? 'default' : 'secondary'}
						onClick={submit}
						disabled={!amount || busy || isLoading || (isStake && isPaused)}
					>
						<Coins />
						{busy ? (isStake ? s.staking : s.withdrawing) : isStake ? s.btnStake : s.btnWithdraw}
					</Button>
				) : (
					<ClientOnlyConnectWallet className="w-full" />
				)}
			</div>
		</section>
	);
}
