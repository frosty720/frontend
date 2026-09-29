'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { AmountField } from '@/components/kusd/SavingsPanel';
import { exactAmount, parseAmount, showAmount } from '@/components/kusd/amounts';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { Panel } from '@/components/primitives/Panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useIlks, useVaultActions, useVaultPosition, type IlkInfo, type VaultPosition } from '@/hooks/kusd/useVaults';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { ilkPriceWad, RAY, toWad, WAD } from '@/utils/kusd';
import { ClosedNotice, CollateralIcon, CollateralPicker, Notice, Row, StepHint, useIlkParam } from './vaultParts';

/** kusd-ui "Deposit Collateral": pick a collateral type, deposit it and lock it in your vault. */
export default function DepositPanel() {
	const dict = useDict();
	const d = dict.lend.deposit;
	const { address } = useAccount();
	const { data } = useIlks();
	const initial = useIlkParam();
	const [key, setKey] = useState(initial);
	const ilk = data?.ilks.find((i) => i.cfg.key === key);

	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<Panel title={d.title}>
				<p className="-mt-2 mb-5 text-sm text-muted-foreground">{d.subtitle}</p>
				<CollateralPicker ilks={data?.ilks} value={key} onChange={setKey} />
			</Panel>
			{!ilk ? (
				<Skeleton height={260} className="w-full rounded-2xl" />
			) : !address ? (
				<ConnectPrompt />
			) : (
				<DepositForm key={ilk.cfg.key} ilk={ilk} owner={address} />
			)}
		</div>
	);
}

function DepositForm({ ilk, owner }: { ilk: IlkInfo; owner: `0x${string}` }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const d = dict.lend.deposit;
	const b = dict.lend.borrow;
	const actions = useVaultActions();
	const { data: position } = useVaultPosition(owner, ilk.cfg);
	const [input, setInput] = useState('');
	const [step, setStep] = useState<{ step: number; total: number } | null>(null);
	const symbol = ilk.cfg.symbol;
	const amount = parseAmount(input, ilk.cfg.decimals);
	const invalid = input.trim() !== '' && !amount;

	if (!position) return <Skeleton height={260} className="w-full rounded-2xl" />;

	const price = ilk.spot > 0n ? ilkPriceWad(ilk) : null;
	const amountWad = amount ? toWad(amount, ilk.cfg.decimals) : 0n;
	let problem: string | null = null;
	if (invalid) problem = dict.errors.invalidAmount;
	else if (amount && amount > position.tokenBalance) problem = interpolate(b.invalid.insufficient, { symbol });

	const submit = async () => {
		if (!amount) return;
		setStep({ step: 1, total: 1 });
		try {
			await actions.deposit(ilk.cfg, amount, position.tokenAllowance, (index, total) => setStep({ step: index + 1, total }));
			toast.success(interpolate(b.success.deposit, { amount: showAmount(amount, ilk.cfg.decimals, fmt, 6), symbol }));
			setInput('');
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setStep(null);
		}
	};

	return (
		<>
			{!ilk.open && <ClosedNotice symbol={symbol} />}
			<Panel>
				<AmountField
					id="deposit-amount"
					label={b.amount}
					value={input}
					onChange={setInput}
					suffix={symbol}
					hint={interpolate(b.wallet, { amount: `${showAmount(position.tokenBalance, ilk.cfg.decimals, fmt, 6)} ${symbol}` })}
					onMax={position.tokenBalance > 0n ? () => setInput(exactAmount(position.tokenBalance, ilk.cfg.decimals)) : undefined}
					error={problem}
				/>
				<dl className="mt-4 space-y-2 rounded-xl border border-line bg-surface-alt p-4 text-[13px]">
					<Row label={d.price} value={price === null ? b.noPrice : fmt.usd(Number(price) / 1e18)} />
					<Row label={d.value} value={price === null ? '—' : fmt.usd(Number((amountWad * price) / WAD) / 1e18)} />
					<Row label={d.backs} value={price === null ? '—' : `${showAmount((amountWad * ilk.spot) / RAY, 18, fmt, 2)} KUSD`} />
				</dl>
				<Button className="mt-5 w-full" disabled={!ilk.open || step !== null || !amount || problem !== null} onClick={submit}>
					{step && <Loader2 className="animate-spin" aria-hidden />}
					{ilk.open ? interpolate(b.submit.deposit, { symbol }) : b.notOpen}
				</Button>
				<StepHint step={step} />
			</Panel>
			<YourDeposits ilk={ilk} position={position} />
		</>
	);
}

/** kusd-ui "Your Deposits": what sits in the protocol for this collateral, locked or not. */
function YourDeposits({ ilk, position }: { ilk: IlkInfo; position: VaultPosition }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const d = dict.lend.deposit;
	const b = dict.lend.borrow;
	const actions = useVaultActions();
	const [pending, setPending] = useState<'exit' | 'lock' | null>(null);
	const symbol = ilk.cfg.symbol;
	const total = position.urn.ink + position.unlockedGem;
	const price = ilk.spot > 0n ? ilkPriceWad(ilk) : null;
	// Exits pay out in token decimals: dust below one token unit cannot leave the Vat.
	const exitable = position.unlockedGem / 10n ** BigInt(18 - ilk.cfg.decimals) > 0n;

	const run = async (which: 'exit' | 'lock') => {
		setPending(which);
		try {
			if (which === 'exit') await actions.exitUnlocked(ilk.cfg, position.unlockedGem);
			else await actions.lockUnlocked(ilk.cfg, position.unlockedGem);
			toast.success(interpolate(which === 'exit' ? b.success.moved : d.locked, { amount: `${showAmount(position.unlockedGem, 18, fmt, 6)} ${symbol}` }));
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	return (
		<Panel title={d.yours}>
			{total === 0n ? (
				<p className="py-4 text-center text-sm text-muted-foreground">{d.none}</p>
			) : (
				<div className="space-y-4">
					<div className="flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-surface-alt p-4">
						<div className="flex items-center gap-3">
							<CollateralIcon ilk={ilk.cfg} size={40} />
							<div>
								<div className="font-semibold">{symbol}</div>
								<div className="text-[13px] text-muted-foreground">{ilk.cfg.name}</div>
							</div>
						</div>
						<div className="text-right">
							<div className="font-semibold tabular-nums">{`${showAmount(total, 18, fmt, 6)} ${symbol}`}</div>
							<div className="text-[13px] text-muted-foreground">{price === null ? b.noPrice : fmt.usd(Number((total * price) / WAD) / 1e18)}</div>
						</div>
					</div>
					{position.unlockedGem > 0n && (
						<Notice
							title={b.unlocked.title}
							body={interpolate(d.unlockedBody, { amount: showAmount(position.unlockedGem, 18, fmt, 6), symbol })}
							actions={[
								{ label: b.unlocked.action, pending: pending === 'exit', disabled: pending !== null || !exitable, onClick: () => run('exit'), variant: 'secondary' },
								{ label: d.lock, pending: pending === 'lock', disabled: pending !== null || !ilk.open, onClick: () => run('lock') },
							]}
						/>
					)}
					<dl className="space-y-1.5 px-1 text-[13px]">
						<Row label={d.lockedRow} value={`${showAmount(position.urn.ink, 18, fmt, 6)} ${symbol}`} />
						{position.unlockedGem > 0n && <Row label={d.unlockedRow} value={`${showAmount(position.unlockedGem, 18, fmt, 6)} ${symbol}`} />}
					</dl>
				</div>
			)}
		</Panel>
	);
}
