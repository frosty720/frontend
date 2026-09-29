'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { AmountField } from '@/components/kusd/SavingsPanel';
import { exactAmount, parseAmount, showAmount } from '@/components/kusd/amounts';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { Panel } from '@/components/primitives/Panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { KUSD_TOKEN } from '@/config/kusd';
import { planningRate, useIlks, useVaultActions, useVaultPosition, type IlkInfo } from '@/hooks/kusd/useVaults';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { availableToDraw, collateralRatioPct, debtWad, drawDart, ilkPriceWad, liquidationPriceWad, RAY, respectsDust, WAD } from '@/utils/kusd';
import { ClosedNotice, CollateralPicker, Notice, ratioTone, Row, Stat, StepHint, useIlkParam } from './vaultParts';

const KUSD_DEC = KUSD_TOKEN.decimals;

/** kusd-ui "Mint KUSD": draw KUSD against collateral locked in your vault. */
export default function MintPanel() {
	const dict = useDict();
	const m = dict.lend.mint;
	const { address } = useAccount();
	const { data } = useIlks();
	const initial = useIlkParam();
	const [key, setKey] = useState(initial);
	const ilk = data?.ilks.find((i) => i.cfg.key === key);

	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<Panel title={m.title}>
				<p className="-mt-2 mb-5 text-sm text-muted-foreground">{m.subtitle}</p>
				<CollateralPicker ilks={data?.ilks} value={key} onChange={setKey} />
			</Panel>
			{!ilk || !data ? (
				<Skeleton height={320} className="w-full rounded-2xl" />
			) : !address ? (
				<ConnectPrompt />
			) : (
				<MintForm key={ilk.cfg.key} ilk={ilk} globalRoom={data.globalRoom} owner={address} />
			)}
			<Panel title={m.how.title}>
				<ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
					{m.how.points.map((point) => (
						<li key={point}>{point}</li>
					))}
				</ul>
			</Panel>
		</div>
	);
}

function MintForm({ ilk, globalRoom, owner }: { ilk: IlkInfo; globalRoom: bigint; owner: `0x${string}` }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const m = dict.lend.mint;
	const b = dict.lend.borrow;
	const actions = useVaultActions();
	const { data: position } = useVaultPosition(owner, ilk.cfg);
	const [input, setInput] = useState('');
	const [step, setStep] = useState<{ step: number; total: number } | null>(null);
	const [pending, setPending] = useState<'lock' | 'move' | null>(null);
	const symbol = ilk.cfg.symbol;
	const amount = parseAmount(input, KUSD_DEC);
	const invalid = input.trim() !== '' && !amount;

	if (!position) return <Skeleton height={320} className="w-full rounded-2xl" />;

	const { urn } = position;
	const planIlk = { ...ilk, rate: planningRate(ilk) };
	const available = ilk.open ? availableToDraw(urn, planIlk, globalRoom) : 0n;
	const liqPct = Number((ilk.mat * 10_000n) / RAY) / 100;
	const after = amount ? { ink: urn.ink, art: urn.art + drawDart(amount, planIlk.rate) } : urn;
	const ratioNow = collateralRatioPct(urn, ilk);
	const ratioAfter = collateralRatioPct(after, planIlk);
	const liqAfter = liquidationPriceWad(after, planIlk);
	const price = ilk.spot > 0n ? ilkPriceWad(ilk) : null;

	let problem: string | null = null;
	if (invalid) problem = dict.errors.invalidAmount;
	else if (amount) {
		if (!ilk.open) problem = b.invalid.closed;
		else if (urn.ink === 0n) problem = m.noCollateral;
		else if (amount > available) problem = interpolate(b.invalid.overBorrow, { amount: showAmount(available, KUSD_DEC, fmt, 2) });
		else if (!respectsDust(after.art, ilk)) problem = interpolate(b.invalid.dust, { amount: showAmount(ilk.dust / RAY, KUSD_DEC, fmt, 2) });
	}
	// kusd-ui warns below 1.5× the liquidation ratio, and flags liquidation risk below it.
	const lowRatio = Boolean(amount) && ratioAfter !== null && ratioAfter < liqPct * 1.5;

	const submit = async () => {
		if (!amount) return;
		setStep({ step: 1, total: 1 });
		try {
			await actions.borrow(ilk.cfg, amount, planIlk.rate, position.kusdJoinHoped, (index, total) => setStep({ step: index + 1, total }));
			toast.success(interpolate(b.success.borrow, { amount: showAmount(amount, KUSD_DEC, fmt, 2) }));
			setInput('');
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setStep(null);
		}
	};

	const fix = async (which: 'lock' | 'move') => {
		setPending(which);
		try {
			if (which === 'lock') await actions.lockUnlocked(ilk.cfg, position.unlockedGem);
			else await actions.moveInternal(position.kusdJoinHoped);
		} catch (error) {
			toast.error(b.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	const ratioText = (ratio: number | null) => (ratio === null ? m.noDebt : fmt.pct(ratio, 0));

	return (
		<>
			{!ilk.open && <ClosedNotice symbol={symbol} />}
			<Panel title={interpolate(b.position.title, { symbol })}>
				<dl className="grid gap-3 sm:grid-cols-2">
					<Stat label={b.position.locked} value={`${showAmount(urn.ink, 18, fmt, 6)} ${symbol}`} />
					<Stat label={m.minted} value={`${showAmount(debtWad(urn, ilk.rate), KUSD_DEC, fmt, 2)} KUSD`} />
				</dl>
				<div className="mt-4 space-y-3">
					{position.unlockedGem > 0n && (
						<Notice
							title={m.unlockedTitle}
							body={interpolate(m.unlockedBody, { amount: showAmount(position.unlockedGem, 18, fmt, 6), symbol })}
							actions={[{ label: dict.lend.deposit.lock, pending: pending === 'lock', disabled: pending !== null || !ilk.open, onClick: () => fix('lock') }]}
						/>
					)}
					{position.internalKusd > 0n && (
						<Notice
							title={b.internal.title}
							body={interpolate(b.internal.body, { amount: showAmount(position.internalKusd, KUSD_DEC, fmt, 2) })}
							actions={[{ label: b.internal.action, pending: pending === 'move', disabled: pending !== null, onClick: () => fix('move') }]}
						/>
					)}
				</div>
			</Panel>

			<Panel>
				<AmountField
					id="mint-amount"
					label={m.amount}
					value={input}
					onChange={setInput}
					hint={interpolate(m.available, { amount: showAmount(available, KUSD_DEC, fmt, 2) })}
					onMax={available > 0n ? () => setInput(exactAmount(available, KUSD_DEC)) : undefined}
					error={problem}
				/>
				<dl className="mt-4 space-y-2 rounded-xl border border-line bg-surface-alt p-4 text-[13px]">
					<Row label={m.availableRow} value={`${showAmount(available, KUSD_DEC, fmt, 2)} KUSD`} />
					<Row label={m.ratioNow} value={ratioText(ratioNow)} tone={ratioTone(ratioNow, liqPct) === 'danger' ? 'danger' : undefined} />
					<Row label={m.ratioAfter} value={ratioText(ratioAfter)} tone={ratioTone(ratioAfter, liqPct) === 'danger' ? 'danger' : undefined} />
					<Row label={b.position.liqPrice} value={liqAfter === null ? b.position.none : fmt.usd(Number(liqAfter) / 1e18)} />
					<Row label={m.collateralValue} value={price === null ? b.noPrice : fmt.usd(Number((urn.ink * price) / WAD) / 1e18)} />
				</dl>
				{lowRatio && (
					<p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
						{interpolate(ratioAfter! < liqPct ? m.liquidationRisk : m.lowRatio, { ratio: fmt.pct(liqPct, 0) })}
					</p>
				)}
				<Button className="mt-5 w-full" disabled={step !== null || !amount || problem !== null} onClick={submit}>
					{step && <Loader2 className="animate-spin" aria-hidden />}
					{!ilk.open ? b.notOpen : urn.ink === 0n ? m.depositFirst : m.submit}
				</Button>
				<StepHint step={step} />
			</Panel>
		</>
	);
}
