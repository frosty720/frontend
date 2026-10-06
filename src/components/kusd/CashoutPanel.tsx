'use client';

import { useRef, useState } from 'react';
import { ArrowDown, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { CHAIN_IDS, getExplorerAddressUrl, getExplorerTxUrl } from '@/config/chains';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { useBridgeDelivery, useCashout, usePolygonCollateral, type CashoutSent } from '@/hooks/kusd/useCashout';
import { PSM_HALTED, usePsmState, usePsmWallet } from '@/hooks/kusd/usePsm';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { CashoutStrandedError, cashoutProblem, parseRecipient, planCashout } from '@/utils/kusdCashout';
import type { KusdStep } from '@/utils/kusdPlans';
import type { TxAction } from '@/utils/transactions';
import { psmBuyCost, WAD } from '@/utils/kusd';
import { exactAmount, parseAmount, showAmount } from './amounts';

const GEM = KUSD_PSM.gem;
const STEP_LABEL: Partial<Record<TxAction, 'approve' | 'swap' | 'bridge'>> = { tokenApproval: 'approve', psmSwap: 'swap', bridgeTransfer: 'bridge' };

/**
 * Cash out KUSD to the user's own Yellow Card account. buyGem swaps KUSD → USDT 1:1 into the wallet
 * (the psm-keeper's trim() then burns the KUSD), and the USDT warp route carries that USDT to the
 * Yellow Card deposit address on Polygon (~8–10 min). The Polygon side can only release the USDT it
 * holds, so a larger cash-out is blocked before anything is sent. One flow runs at a time; if the hook
 * reports the USDT stranded in the wallet, the bridge step alone is offered — to the address currently
 * shown and confirmed, and only while the wallet still holds that USDT.
 */
export default function CashoutPanel({ onBusyChange }: { onBusyChange?: (busy: boolean) => void } = {}) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const c = dict.kusd.cashout;
	const { address } = useAccount();
	const [input, setInput] = useState('');
	const [recipientInput, setRecipientInput] = useState('');
	const [confirmed, setConfirmed] = useState(false);
	const [progress, setProgress] = useState<{ index: number; total: number; step: KusdStep } | null>(null);
	const [stranded, setStranded] = useState<{ gemAmt: bigint } | null>(null);
	const [pending, setPending] = useState(false);
	const inFlight = useRef(false);
	const [sent, setSent] = useState<CashoutSent | null>(null);
	const { data: psm } = usePsmState();
	const { data: wallet } = usePsmWallet(address);
	const { data: collateral } = usePolygonCollateral();
	const { cashout, resumeBridge } = useCashout();
	const delivery = useBridgeDelivery(sent?.messageId ?? null);

	/** A USDT limit, rounded DOWN to cents: typing the number shown must always go through. */
	const usdtLimit = (value: bigint) => `${showAmount(value - (value % 10n ** BigInt(GEM.decimals - 2)), GEM.decimals, fmt, 2)} ${GEM.symbol}`;
	const halted = psm?.tout === PSM_HALTED;
	const kusdIn = parseAmount(input, KUSD_TOKEN.decimals);
	const plan = psm && !halted ? planCashout(kusdIn, psm.tout) : null;
	const recipient = parseRecipient(recipientInput);
	const problem = cashoutProblem({ plan, halted, kusdBalance: wallet?.kusdBalance, pocketGem: psm?.pocketGem, collateral });
	const invalidAmount = input.trim() !== '' && !plan && !halted;
	const badAddress = recipientInput.trim() !== '' && !recipient;
	const rounded = Boolean(plan && kusdIn !== null && plan.cost < kusdIn);
	const available = psm && collateral !== undefined ? (psm.pocketGem < collateral ? psm.pocketGem : collateral) : undefined;
	const busy = pending;
	/** The most KUSD that can go out now: the wallet balance, capped by what the PSM and Polygon can pay. */
	const capKusd = psm && available !== undefined ? psmBuyCost(available, GEM.decimals, psm.tout) : undefined;
	const maxKusd = wallet && capKusd !== undefined && capKusd < wallet.kusdBalance ? capKusd : wallet?.kusdBalance;
	const feeLabel = !psm || halted ? '—' : psm.tout === 0n ? dict.kusd.swap.noFee : interpolate(dict.kusd.swap.feePct, { pct: fmt.pct(Number((psm.tout * 1_000_000n) / WAD) / 10_000, 4) });

	let message: string | null = null;
	if (problem?.key === 'halted') message = c.halted;
	else if (invalidAmount) message = dict.errors.invalidAmount;
	else if (problem?.key === 'insufficient') message = c.insufficient;
	else if (problem?.key === 'pocket') message = interpolate(c.overPocket, { amount: usdtLimit(problem.limit) });
	else if (problem?.key === 'collateral') message = interpolate(c.overCollateral, { amount: usdtLimit(problem.limit) });
	else if (badAddress) message = c.invalidAddress;

	const ready = Boolean(plan && recipient && confirmed && !message && wallet && collateral !== undefined);
	const resumeTo = recipient && confirmed ? recipient : null;
	const strandedHeld = Boolean(stranded && wallet && wallet.gemBalance >= stranded.gemAmt);
	const canResume = Boolean(stranded && resumeTo && strandedHeld && !busy);
	const onStep = (index: number, total: number, step: KusdStep) => setProgress({ index, total, step });
	const label = progress
		? interpolate(c.progress, { step: c.steps[STEP_LABEL[progress.step.action] ?? 'swap'], n: progress.index + 1, total: progress.total })
		: null;

	/** One flow at a time: the ref blocks a second click synchronously, before the first await. */
	const exclusive = async (work: () => Promise<void>) => {
		if (inFlight.current) return;
		inFlight.current = true;
		setPending(true);
		onBusyChange?.(true);
		try {
			await work();
		} finally {
			inFlight.current = false;
			setPending(false);
			onBusyChange?.(false);
			setProgress(null);
		}
	};

	const failed = (error: unknown) => toast.error(c.failed, describeError(error instanceof CashoutStrandedError ? error.cause : error, dict));

	const run = () =>
		exclusive(async () => {
			if (!plan || !recipient || !wallet) return;
			try {
				const result = await cashout({ plan, recipient, kusdAllowance: wallet.kusdAllowance }, onStep);
				setSent(result);
				setInput('');
			} catch (error) {
				// Added to any earlier stranded USDT: one resume sends all of it.
				if (error instanceof CashoutStrandedError) setStranded((prev) => ({ gemAmt: (prev?.gemAmt ?? 0n) + error.gemAmt }));
				failed(error);
			}
		});

	const resume = () =>
		exclusive(async () => {
			if (!stranded || !resumeTo) return;
			try {
				const result = await resumeBridge({ gemAmt: stranded.gemAmt, recipient: resumeTo }, onStep);
				setStranded(null);
				setSent(result);
				setInput('');
			} catch (error) {
				failed(error);
			}
		});

	if (sent) {
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-3 rounded-xl border border-line bg-surface-alt p-4">
					{delivery === 'delivered' ? (
						<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
					) : (
						<Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-gold" aria-hidden />
					)}
					<div className="text-sm">
						<p className="font-semibold">{interpolate(c.sent, { amount: showAmount(sent.gemAmt, GEM.decimals, fmt, 6) })}</p>
						<p className="mt-1 text-muted-foreground">{c.status[delivery]}</p>
					</div>
				</div>
				<div className="flex flex-col gap-2 text-[13px]">
					<a href={getExplorerTxUrl(CHAIN_IDS.KALYCHAIN, sent.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold hover:underline">
						{c.viewTx}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
					<a href={getExplorerAddressUrl(CHAIN_IDS.POLYGON, sent.recipient)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold hover:underline">
						{c.viewPolygon}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
				</div>
				<Button
					variant="outline"
					className="w-full"
					onClick={() => {
						setSent(null);
						setInput('');
						setRecipientInput('');
						setConfirmed(false);
					}}
				>
					{c.again}
				</Button>
			</div>
		);
	}

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">{c.subtitle}</p>

			{stranded && (
				<div role="alert" className="mb-5 rounded-xl border border-gold/50 bg-gold-soft p-4 text-sm">
					<p className="font-semibold">{c.resumeTitle}</p>
					<p className="mt-1 text-muted-foreground">{c.resumeBody}</p>
					<p className="mt-2 break-all font-mono text-[12px]">{resumeTo ? interpolate(c.resumeTo, { address: resumeTo }) : c.resumeConfirm}</p>
					{!strandedHeld && <p className="mt-1 text-[12px] text-danger">{interpolate(c.resumeMissing, { amount: showAmount(stranded.gemAmt, GEM.decimals, fmt, 6) })}</p>}
					<Button className="mt-3 w-full" disabled={!canResume} onClick={resume}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						{interpolate(c.resume, { amount: showAmount(stranded.gemAmt, GEM.decimals, fmt, 6) })}
					</Button>
				</div>
			)}

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
					<label htmlFor="cashout-amount" className="font-semibold uppercase tracking-[0.1em] text-muted-deep">
						{c.amount}
					</label>
					{wallet && (
						<span className="flex items-center gap-2">
							{interpolate(c.balance, { amount: `${showAmount(wallet.kusdBalance, KUSD_TOKEN.decimals, fmt)} ${KUSD_TOKEN.symbol}` })}
							<button type="button" className="font-semibold text-gold hover:underline" onClick={() => setInput(exactAmount(maxKusd ?? wallet.kusdBalance, KUSD_TOKEN.decimals))}>
								{c.max}
							</button>
						</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					<Input
						id="cashout-amount"
						inputMode="decimal"
						placeholder="0.0"
						value={input}
						aria-invalid={invalidAmount}
						disabled={busy}
						onChange={(e) => setInput(e.target.value)}
						className="min-w-0 flex-1 border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
					/>
					<span className="font-display text-lg font-semibold">{KUSD_TOKEN.symbol}</span>
				</div>
			</div>

			<div className="-my-3 flex justify-center">
				<span className="relative z-10 flex size-9 items-center justify-center rounded-full border border-line bg-surface-hi text-gold">
					<ArrowDown className="size-4" aria-hidden />
				</span>
			</div>

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{c.youReceive}</div>
				<div className="flex items-center gap-3">
					<span className="min-w-0 flex-1 truncate text-2xl font-semibold tabular-nums">{plan ? showAmount(plan.gemAmt, GEM.decimals, fmt, 6) : '0.0'}</span>
					<span className="font-display text-lg font-semibold">{GEM.symbol}</span>
				</div>
			</div>

			<div className="mt-4">
				<label htmlFor="cashout-address" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
					{c.address}
				</label>
				<Input
					id="cashout-address"
					autoComplete="off"
					spellCheck={false}
					placeholder="0x…"
					value={recipientInput}
					aria-invalid={badAddress}
					disabled={busy}
					onChange={(e) => {
						setRecipientInput(e.target.value);
						setConfirmed(false);
					}}
					className="font-mono text-sm"
				/>
				<p className="mt-1.5 text-[12px] text-muted-foreground">{c.addressHint}</p>
				<label className="mt-3 flex items-start gap-2 text-[13px]">
					<input
						type="checkbox"
						className="mt-0.5 size-4 accent-gold"
						checked={confirmed}
						disabled={!recipient || busy}
						onChange={(e) => setConfirmed(e.target.checked)}
					/>
					<span>{c.confirm}</span>
				</label>
			</div>

			<dl className="mt-4 space-y-2 text-[13px]">
				<Row label={c.rate} value={c.rateValue} />
				<Row label={dict.kusd.swap.fee} value={feeLabel} />
				<Row label={c.arrival} value={c.arrivalValue} />
				<Row label={c.available} value={available !== undefined ? usdtLimit(available) : '—'} />
			</dl>

			{(message || rounded) && (
				<p role={message ? 'alert' : undefined} className={message ? 'mt-3 text-[12.5px] text-danger' : 'mt-3 text-[12.5px] text-muted-foreground'}>
					{message ?? interpolate(c.rounded, { amount: plan ? showAmount(plan.cost, KUSD_TOKEN.decimals, fmt, 6) : '' })}
				</p>
			)}

			<div className="mt-5">
				{!address ? (
					<ClientOnlyConnectWallet className="w-full" />
				) : (
					<Button className="w-full" disabled={!ready || busy} onClick={run}>
						{busy && <Loader2 className="animate-spin" aria-hidden />}
						{busy && label ? label : plan ? c.cashout : c.enterAmount}
					</Button>
				)}
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}
