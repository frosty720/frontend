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
import { KUSD_TOKEN } from '@/config/kusd';
import { planningRate, useIlks, useVaultActions, useVaultPosition, type IlkInfo, type VaultPosition } from '@/hooks/kusd/useVaults';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { collateralRatioPct, debtWad, liquidationPriceWad, RAY, repayDart, respectsDust, toWad, WAD, withdrawableInk } from '@/utils/kusd';
import { CollateralPicker, Notice, ratioTone, Row, Stat, StepHint, useIlkParam } from './vaultParts';

const KUSD_DEC = KUSD_TOKEN.decimals;

/** kusd-ui "Borrow": your vault's position, repay KUSD, withdraw collateral. */
export default function BorrowPanel() {
	const dict = useDict();
	const b = dict.lend.borrow;
	const { address } = useAccount();
	const { data } = useIlks();
	const initial = useIlkParam();
	const [key, setKey] = useState(initial);
	const ilk = data?.ilks.find((i) => i.cfg.key === key);

	return (
		<div className="space-y-5">
			<Panel title={b.title}>
				<p className="-mt-2 mb-5 text-sm text-muted-foreground">{b.subtitle}</p>
				<CollateralPicker ilks={data?.ilks} value={key} onChange={setKey} />
			</Panel>
			{!ilk ? (
				<Skeleton height={320} className="w-full rounded-2xl" />
			) : !address ? (
				<ConnectPrompt />
			) : (
				<VaultManager key={ilk.cfg.key} ilk={ilk} owner={address} />
			)}
		</div>
	);
}

function VaultManager({ ilk, owner }: { ilk: IlkInfo; owner: `0x${string}` }) {
	const dict = useDict();
	const fmt = useFormat();
	const b = dict.lend.borrow;
	const { data: position } = useVaultPosition(owner, ilk.cfg);
	const symbol = ilk.cfg.symbol;

	if (!position) return <Skeleton height={320} className="w-full rounded-2xl" />;

	const { urn } = position;
	const planIlk = { ...ilk, rate: planningRate(ilk) };
	const ratio = collateralRatioPct(urn, ilk);
	const liqPct = Number((ilk.mat * 10_000n) / RAY) / 100;
	const tone = ratioTone(ratio, liqPct);
	const liq = liquidationPriceWad(urn, ilk);
	const withdrawable = withdrawableInk(urn, planIlk);

	return (
		<>
			<Panel title={interpolate(b.position.overview, { symbol })}>
				{urn.ink === 0n && urn.art === 0n && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{interpolate(b.position.empty, { symbol })}</p>}
				<dl className="grid gap-3 sm:grid-cols-3">
					<Stat label={b.position.locked} value={`${showAmount(urn.ink, 18, fmt, 6)} ${symbol}`} />
					<Stat label={b.position.debt} value={`${showAmount(debtWad(urn, ilk.rate), KUSD_DEC, fmt, 2)} KUSD`} />
					<Stat label={b.position.withdrawable} value={`${showAmount(withdrawable, 18, fmt, 6)} ${symbol}`} />
					<Stat
						label={b.position.ratio}
						value={ratio === null ? b.ratio.noDebt : `${fmt.pct(ratio, 0)} · ${b.ratio[tone]}`}
						tone={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger'}
					/>
					<Stat label={b.position.liqPrice} value={liq === null ? b.position.none : fmt.usd(Number(liq) / 1e18)} />
				</dl>
				<Leftovers ilk={ilk} position={position} />
				<p className="mt-4 text-[12.5px] text-muted-foreground">
					{interpolate(b.risk, {
						ratio: fmt.pct(liqPct, 0),
						penalty: fmt.pct(Number(((ilk.chop > WAD ? ilk.chop - WAD : 0n) * 10_000n) / WAD) / 100, 0),
					})}
				</p>
			</Panel>
			<div className="grid gap-5 lg:grid-cols-2">
				<RepayForm ilk={ilk} planIlk={planIlk} position={position} />
				<WithdrawForm ilk={ilk} withdrawable={withdrawable} ink={urn.ink} />
			</div>
		</>
	);
}

/** Collateral deposited but not locked, and KUSD left in the protocol balance — each one click home. */
function Leftovers({ ilk, position }: { ilk: IlkInfo; position: VaultPosition }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const b = dict.lend.borrow;
	const actions = useVaultActions();
	const [pending, setPending] = useState<'gem' | 'kusd' | null>(null);
	const unlockedTokens = position.unlockedGem / 10n ** BigInt(18 - ilk.cfg.decimals);

	const run = async (which: 'gem' | 'kusd') => {
		setPending(which);
		try {
			if (which === 'gem') await actions.exitUnlocked(ilk.cfg, position.unlockedGem);
			else await actions.moveInternal(position.kusdJoinHoped);
			toast.success(
				interpolate(b.success.moved, {
					amount: which === 'gem' ? `${showAmount(position.unlockedGem, 18, fmt, 6)} ${ilk.cfg.symbol}` : `${showAmount(position.internalKusd, KUSD_DEC, fmt, 2)} KUSD`,
				}),
			);
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	if (unlockedTokens === 0n && position.internalKusd === 0n) return null;
	return (
		<div className="mt-4 space-y-3">
			{unlockedTokens > 0n && (
				<Notice
					title={b.unlocked.title}
					body={interpolate(b.unlocked.body, { amount: showAmount(position.unlockedGem, 18, fmt, 6), symbol: ilk.cfg.symbol })}
					actions={[{ label: b.unlocked.action, pending: pending === 'gem', disabled: pending !== null, onClick: () => run('gem') }]}
				/>
			)}
			{position.internalKusd > 0n && (
				<Notice
					title={b.internal.title}
					body={interpolate(b.internal.body, { amount: showAmount(position.internalKusd, KUSD_DEC, fmt, 2) })}
					actions={[{ label: b.internal.action, pending: pending === 'kusd', disabled: pending !== null, onClick: () => run('kusd') }]}
				/>
			)}
		</div>
	);
}

/** kusd-ui "Repay KUSD": burn KUSD against the vault's debt, in part or in full. */
function RepayForm({ ilk, planIlk, position }: { ilk: IlkInfo; planIlk: IlkInfo; position: VaultPosition }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const b = dict.lend.borrow;
	const actions = useVaultActions();
	const [input, setInput] = useState('');
	const [step, setStep] = useState<{ step: number; total: number } | null>(null);
	const { urn } = position;
	const amount = parseAmount(input, KUSD_DEC);
	const invalid = input.trim() !== '' && !amount;

	// Repaying in full clears art exactly; the KUSD it needs is the debt at the planning rate, less
	// what already sits in the protocol balance.
	const fullRepayWad = debtWad(urn, planIlk.rate);
	const shortfall = (need: bigint) => (need > position.internalKusd ? need - position.internalKusd : 0n);
	const repayAllShort = shortfall(fullRepayWad) > position.kusdBalance;
	const remaining = amount && amount < fullRepayWad ? fullRepayWad - amount : fullRepayWad;

	let problem: string | null = null;
	if (invalid) problem = dict.errors.invalidAmount;
	else if (amount) {
		if (amount >= fullRepayWad) problem = b.invalid.overRepay;
		else if (!respectsDust(urn.art - repayDart(amount, planIlk.rate), ilk)) problem = interpolate(b.invalid.dust, { amount: showAmount(ilk.dust / RAY, KUSD_DEC, fmt, 2) });
		else if (shortfall(amount) > position.kusdBalance) problem = interpolate(b.invalid.insufficient, { symbol: 'KUSD' });
	}

	const submit = async (all: boolean) => {
		setStep({ step: 1, total: 1 });
		const onStep = (index: number, total: number) => setStep({ step: index + 1, total });
		try {
			if (all) {
				await actions.repay(ilk.cfg, shortfall(fullRepayWad), urn.art, position.kusdAllowance, onStep);
				toast.success(interpolate(b.success.repay, { amount: showAmount(fullRepayWad, KUSD_DEC, fmt, 2) }));
			} else if (amount) {
				await actions.repay(ilk.cfg, shortfall(amount), repayDart(amount, planIlk.rate), position.kusdAllowance, onStep);
				toast.success(interpolate(b.success.repay, { amount: showAmount(amount, KUSD_DEC, fmt, 2) }));
			}
			setInput('');
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setStep(null);
		}
	};

	return (
		<Panel title={b.repayTitle}>
			<AmountField
				id="repay-amount"
				label={b.amount}
				value={input}
				onChange={setInput}
				hint={interpolate(b.wallet, { amount: `${showAmount(position.kusdBalance, KUSD_DEC, fmt)} KUSD` })}
				error={problem}
			/>
			<dl className="mt-4 space-y-2 rounded-xl border border-line bg-surface-alt p-4 text-[13px]">
				<Row label={b.position.debt} value={`${showAmount(fullRepayWad, KUSD_DEC, fmt, 2)} KUSD`} />
				<Row label={b.remainingDebt} value={`${showAmount(remaining, KUSD_DEC, fmt, 2)} KUSD`} />
			</dl>
			<div className="mt-5 grid gap-3 sm:grid-cols-2">
				<Button disabled={step !== null || !amount || problem !== null} onClick={() => submit(false)}>
					{step && <Loader2 className="animate-spin" aria-hidden />}
					{urn.art === 0n ? b.noDebt : b.submit.repay}
				</Button>
				{urn.art > 0n && (
					<Button variant="secondary" disabled={step !== null || repayAllShort} onClick={() => submit(true)}>
						{interpolate(b.submit.repayAll, { amount: showAmount(fullRepayWad, KUSD_DEC, fmt, 2) })}
					</Button>
				)}
			</div>
			{urn.art > 0n && repayAllShort && <p className="mt-3 text-[12.5px] text-danger">{interpolate(b.invalid.repayShort, { amount: showAmount(fullRepayWad, KUSD_DEC, fmt, 6) })}</p>}
			<StepHint step={step} />
		</Panel>
	);
}

/** kusd-ui "Withdraw Collateral": unlock collateral the vault does not need and send it to the wallet. */
function WithdrawForm({ ilk, withdrawable, ink }: { ilk: IlkInfo; withdrawable: bigint; ink: bigint }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const b = dict.lend.borrow;
	const actions = useVaultActions();
	const [input, setInput] = useState('');
	const [step, setStep] = useState<{ step: number; total: number } | null>(null);
	const symbol = ilk.cfg.symbol;
	const decimals = ilk.cfg.decimals;
	const amount = parseAmount(input, decimals);
	const invalid = input.trim() !== '' && !amount;
	const maxTokens = withdrawable / 10n ** BigInt(18 - decimals);
	const amountWad = amount ? toWad(amount, decimals) : 0n;

	let problem: string | null = null;
	if (invalid) problem = dict.errors.invalidAmount;
	else if (amount && amountWad > withdrawable) problem = interpolate(b.invalid.overWithdraw, { amount: showAmount(withdrawable, 18, fmt, 6), symbol });

	const submit = async () => {
		if (!amount) return;
		setStep({ step: 1, total: 1 });
		try {
			await actions.withdraw(ilk.cfg, amount, (index, total) => setStep({ step: index + 1, total }));
			toast.success(interpolate(b.success.withdraw, { amount: showAmount(amount, decimals, fmt, 6), symbol }));
			setInput('');
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setStep(null);
		}
	};

	return (
		<Panel title={b.withdrawTitle}>
			<AmountField
				id="withdraw-amount"
				label={b.amount}
				value={input}
				onChange={setInput}
				suffix={symbol}
				hint={interpolate(b.withdrawMax, { amount: `${showAmount(withdrawable, 18, fmt, 6)} ${symbol}` })}
				onMax={maxTokens > 0n ? () => setInput(exactAmount(maxTokens, decimals)) : undefined}
				error={problem}
			/>
			<dl className="mt-4 space-y-2 rounded-xl border border-line bg-surface-alt p-4 text-[13px]">
				<Row label={b.position.locked} value={`${showAmount(ink, 18, fmt, 6)} ${symbol}`} />
				<Row label={b.remainingCollateral} value={`${showAmount(amountWad < ink ? ink - amountWad : 0n, 18, fmt, 6)} ${symbol}`} />
			</dl>
			<Button className="mt-5 w-full" disabled={step !== null || !amount || problem !== null} onClick={submit}>
				{step && <Loader2 className="animate-spin" aria-hidden />}
				{ink === 0n ? b.noCollateral : withdrawable === 0n ? b.noneAvailable : interpolate(b.submit.withdraw, { symbol })}
			</Button>
			<StepHint step={step} />
		</Panel>
	);
}
