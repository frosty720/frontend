'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { formatUnits, isAddress } from 'viem';
import { useAccount } from 'wagmi';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { VAULT_STABLES } from '@/config/vaults';
import { useApproveVaultStable, usePurchaseVault, useVaultStableState } from '@/hooks/vaults/usePurchaseVault';
import { useVaultFeeSplit, type VaultTier } from '@/hooks/vaults/useVaultStats';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';
import { DEFAULT_FEE_SPLIT, purchaseAmount, splitPurchase } from '@/utils/vaults';

interface BuyVaultDialogProps {
	/** The tier being bought; the dialog is closed while null. */
	tier: VaultTier | null;
	onClose: () => void;
	/** Sponsor from a shared referral link (?ref=0x…), prefilled into the referral field. */
	initialReferrer?: string;
	onViewMyVaults: () => void;
}

/** Buys a vault in-app: pick the stable, optional referrer, approve the exact price, then purchase. */
export default function BuyVaultDialog({ tier, onClose, initialReferrer, onViewMyVaults }: BuyVaultDialogProps) {
	const dict = useDict();
	const b = dict.vaultApp.buy;

	return (
		<Dialog open={tier !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-[480px] border-line bg-surface">
				{tier && (
					<>
						<DialogHeader>
							<DialogTitle>{b.title}</DialogTitle>
							<DialogDescription>{tier.name}</DialogDescription>
						</DialogHeader>
						<BuyVaultForm key={tier.index} tier={tier} initialReferrer={initialReferrer} onViewMyVaults={onViewMyVaults} />
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function BuyVaultForm({ tier, initialReferrer, onViewMyVaults }: { tier: VaultTier; initialReferrer?: string; onViewMyVaults: () => void }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const b = dict.vaultApp.buy;
	const { address } = useAccount();
	const [stable, setStable] = useState(VAULT_STABLES[0]);
	const [referral, setReferral] = useState(initialReferrer && isAddress(initialReferrer) ? initialReferrer : '');
	const [pending, setPending] = useState<'approve' | 'buy' | null>(null);
	const [purchased, setPurchased] = useState(false);
	const { allowance, balance } = useVaultStableState(address, stable.address);
	const approve = useApproveVaultStable();
	const purchase = usePurchaseVault();
	const split = splitPurchase(tier.priceUsd, useVaultFeeSplit().data ?? DEFAULT_FEE_SPLIT);

	if (!address) return <ConnectPrompt body={b.connectBody} />;

	if (purchased) {
		return (
			<div className="flex flex-col items-center gap-2 py-6 text-center">
				<CheckCircle2 className="size-10 text-success" aria-hidden />
				<p className="font-display text-lg font-semibold">{b.successTitle}</p>
				<p className="text-sm text-muted-foreground">{b.successBody}</p>
				<Button className="mt-3" onClick={onViewMyVaults}>
					{b.viewMyVaults}
				</Button>
			</div>
		);
	}

	const amount = purchaseAmount(tier.priceUsd, stable.decimals);
	const referralInvalid = referral !== '' && !isAddress(referral);
	const insufficient = balance.data !== undefined && balance.data < amount;
	const needsApproval = allowance.data === undefined || allowance.data < amount;
	const priceLabel = fmt.usd(tier.priceUsd, { decimals: 0 });

	const run = async (step: 'approve' | 'buy') => {
		setPending(step);
		try {
			if (step === 'approve') {
				await approve(stable.address, amount);
				await allowance.refetch();
			} else {
				await purchase({ tier: tier.index, stable: stable.address, referrer: referral ? (referral as `0x${string}`) : undefined });
				setPurchased(true);
			}
		} catch (error) {
			toast.error(step === 'approve' ? b.approveFailed : b.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	let action;
	if (allowance.isLoading) {
		action = <Button className="w-full" disabled>{b.loadingAllowance}</Button>;
	} else if (needsApproval) {
		action = (
			<Button className="w-full" disabled={pending !== null || insufficient} onClick={() => run('approve')}>
				{pending === 'approve' && <Loader2 className="animate-spin" aria-hidden />}
				{pending === 'approve' ? b.approving : interpolate(b.approve, { stable: stable.symbol })}
			</Button>
		);
	} else {
		action = (
			<Button className="w-full" disabled={pending !== null || insufficient || referralInvalid} onClick={() => run('buy')}>
				{pending === 'buy' && <Loader2 className="animate-spin" aria-hidden />}
				{pending === 'buy' ? b.buying : interpolate(b.buy, { name: tier.name })}
			</Button>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-baseline justify-between gap-3">
				<span className="font-display text-2xl font-bold text-gold">{priceLabel}</span>
				<span className="text-[13px] text-muted-foreground">{interpolate(b.nominalApr, { apr: fmt.pct(tier.aprPct, 0) })}</span>
			</div>

			<div className="space-y-1.5">
				<div className="flex items-center justify-between text-[12px] text-muted-foreground">
					<span className="font-semibold uppercase tracking-[0.1em] text-muted-deep">{b.payWith}</span>
					{balance.data !== undefined && (
						<span>{interpolate(b.balance, { amount: `${fmt.number(Number(formatUnits(balance.data, stable.decimals)))} ${stable.symbol}` })}</span>
					)}
				</div>
				<div role="radiogroup" aria-label={b.payWith} className="flex gap-2">
					{VAULT_STABLES.map((option) => (
						<button
							key={option.address}
							type="button"
							role="radio"
							aria-checked={option.address === stable.address}
							onClick={() => setStable(option)}
							className={cn(
								'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
								option.address === stable.address ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
							)}
						>
							{option.symbol}
						</button>
					))}
				</div>
				{insufficient && <p className="text-[12.5px] text-danger">{interpolate(b.insufficient, { stable: stable.symbol, amount: priceLabel })}</p>}
			</div>

			<div className="space-y-1.5">
				<label htmlFor="vault-referral" className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
					{b.referralLabel}
				</label>
				<Input
					id="vault-referral"
					placeholder="0x…"
					value={referral}
					aria-invalid={referralInvalid}
					onChange={(event) => setReferral(event.target.value.trim())}
					className="border-line bg-surface-hi font-mono"
				/>
				{referralInvalid && <p className="text-[12.5px] text-danger">{b.invalidAddress}</p>}
			</div>

			<div className="space-y-2 rounded-xl border border-line bg-surface-alt p-4 text-[13px]">
				<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-deep">{b.flowTitle}</p>
				<SplitRow label={interpolate(b.polRow, { pct: fmt.pct(split.polPct, 0) })} value={fmt.usd(split.pol)} accent />
				<SplitRow label={interpolate(b.feesRow, { pct: fmt.pct(split.feesPct, 0) })} value={fmt.usd(split.fees)} />
				<div className="space-y-1.5 border-l border-line pl-3">
					<SplitRow label={b.affiliate} value={fmt.usd(split.affiliate)} />
					<SplitRow label={b.dev} value={fmt.usd(split.dev)} />
					<SplitRow label={b.dao} value={fmt.usd(split.dao)} />
				</div>
			</div>

			<div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-alt p-4">
				<span className="text-[12.5px] leading-snug text-muted-foreground">
					{b.estRewards}
					<span className="block text-[11.5px] text-muted-deep">{b.estDisclaimer}</span>
				</span>
				<span className="font-semibold tabular-nums text-gold">{fmt.usd((tier.priceUsd * tier.aprPct) / 100)}</span>
			</div>

			{action}
		</div>
	);
}

function SplitRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className={cn('font-semibold tabular-nums', accent ? 'text-gold' : 'text-cream')}>{value}</span>
		</div>
	);
}
