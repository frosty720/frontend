'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { CHAIN_IDS, getExplorerAddressUrl, getExplorerTxUrl } from '@/config/chains';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { useBridgeDelivery, useCashout, usePolygonCollateral, type CashoutSent } from '@/hooks/kusd/useCashout';
import { PSM_HALTED, usePsmState, usePsmWallet } from '@/hooks/kusd/usePsm';
import { useRampWithdrawal, useRampWithdrawChannels } from '@/hooks/kusd/useRampWithdraw';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat, useLocale } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import {
	COUNTRY_KYC_EXTRAS,
	countryDisplayName,
	createRampWithdrawal,
	dedupeNetworksByName,
	fetchRampWithdrawQuote,
	isInternationalPhone,
	makeIdempotencyKey,
	normalizePhoneForCountry,
	RampApiError,
	type RampCorridor,
	type RampCustomer,
	type RampWithdrawal,
	type RampWithdrawQuote,
} from '@/lib/ramp';
import { UserError } from '@/lib/userError';
import { psmBuyCost, WAD } from '@/utils/kusd';
import { CashoutStrandedError, cashoutProblem, parseRecipient, planCashout, type CashoutPlan } from '@/utils/kusdCashout';
import type { KusdStep } from '@/utils/kusdPlans';
import type { TxAction } from '@/utils/transactions';
import { exactAmount, parseAmount, showAmount } from './amounts';
import { Field, rampErrorText } from './BuyKusdPanel';

const GEM = KUSD_PSM.gem;
const STEP_LABEL: Partial<Record<TxAction, 'approve' | 'swap' | 'bridge'>> = { tokenApproval: 'approve', psmSwap: 'swap', bridgeTransfer: 'bridge' };

/** A cash-out goes in whole cents of USDT: how Yellow Card treats a sub-cent crypto amount is unverified. */
const CENT_USDT = 10n ** BigInt(GEM.decimals - 2);
const CENT_KUSD = 10n ** BigInt(KUSD_TOKEN.decimals - 2);
/** The bridge must start within this long of opening the payout (YC's deposit window was 180 min in the sandbox). */
const PAYOUT_SEND_WINDOW_MS = 30 * 60_000;

/** The keeper's answer is not an open payout for the amount asked at a real address: nothing may be sent on it. */
class UnexpectedPayoutError extends Error {}

/** The keeper is still asking Yellow Card for the payout (a retry after a timeout): ask again with the same key. */
class PayoutPendingError extends Error {}

/** The plan rounded down to whole cents of USDT, or null when that leaves nothing. */
function toCents(plan: CashoutPlan, tout: bigint): CashoutPlan | null {
	const gemAmt = plan.gemAmt - (plan.gemAmt % CENT_USDT);
	return gemAmt === 0n ? null : { gemAmt, cost: psmBuyCost(gemAmt, GEM.decimals, tout) };
}

/** A ramp failure in cash-out words where the buy form's wording would mislead. */
function cashoutErrorText(error: unknown, dict: Dictionary): string {
	if (error instanceof UnexpectedPayoutError) return dict.kusd.cashout.badResponse;
	if (error instanceof PayoutPendingError) return dict.kusd.cashout.payoutPending;
	if (error instanceof RampApiError && !error.outcomeUnknown) {
		if (error.key === 'paused') return dict.kusd.cashout.errors.paused;
		if (error.key === 'not_found') return dict.kusd.cashout.errors.notFound;
	}
	return rampErrorText(error, dict);
}

/** Where the money goes, in the form Yellow Card takes it (E.164 numbers). */
interface Destination {
	corridor: RampCorridor;
	payoutNumber: string;
	contactPhone: string;
}

interface OpenPayout {
	withdrawal: RampWithdrawal;
	recipient: `0x${string}`;
	/** performance.now() when the keeper answered: the bridge must start within PAYOUT_SEND_WINDOW_MS. */
	openedAt: number;
}

/**
 * Cash out KUSD to mobile money (spec 2026-10-06, direct path). The fiat-ramp keeper creates the
 * Yellow Card payout and returns its Polygon deposit address. The wallet then runs the cash-out:
 * buyGem swaps KUSD → USDT 1:1 into the wallet (the psm-keeper's trim() burns the KUSD), and the USDT
 * warp route carries that USDT straight to the deposit address (~8–10 min). Yellow Card then pays the
 * mobile money number, or returns the USDT to the seller's address on Polygon if it cannot.
 *
 * The Polygon side can only release the USDT it holds, so a larger cash-out is blocked before
 * anything is sent. One flow runs at a time. If the USDT is stranded in the wallet (swap mined,
 * bridge not sent), resuming opens a fresh payout for it and bridges there.
 */
export default function CashoutPanel({ onBusyChange }: { onBusyChange?: (busy: boolean) => void } = {}) {
	const dict = useDict();
	const fmt = useFormat();
	const locale = useLocale();
	const toast = useToast();
	const c = dict.kusd.cashout;
	const b = dict.kusd.buy;
	const { address } = useAccount();
	const [input, setInput] = useState('');
	const [corridorId, setCorridorId] = useState('');
	const [networkId, setNetworkId] = useState('');
	const [momoNumber, setMomoNumber] = useState('');
	const [accountName, setAccountName] = useState('');
	const [customer, setCustomer] = useState<RampCustomer>({ name: '', country: '' });
	const [quote, setQuote] = useState<RampWithdrawQuote | null>(null);
	const [formError, setFormError] = useState('');
	const [progress, setProgress] = useState<{ index: number; total: number; step: KusdStep } | null>(null);
	const [stranded, setStranded] = useState<{ gemAmt: bigint } | null>(null);
	const [pending, setPending] = useState(false);
	const inFlight = useRef(false);
	// One idempotency key per payout request: kept while the keeper's answer is unknown, dropped once it
	// answers, and never reused for a different request (the keeper replays by key alone).
	const idemKeyRef = useRef<{ key: string; fingerprint: string } | null>(null);
	const quoteSeqRef = useRef(0);
	const [sent, setSent] = useState<CashoutSent | null>(null);
	const [withdrawal, setWithdrawal] = useState<RampWithdrawal | null>(null);
	const { data: psm } = usePsmState();
	const { data: wallet } = usePsmWallet(address);
	const { data: collateral } = usePolygonCollateral();
	const channels = useRampWithdrawChannels();
	const { cashout, resumeBridge } = useCashout();
	const delivery = useBridgeDelivery(sent?.messageId ?? null);
	const { data: liveWithdrawal } = useRampWithdrawal(withdrawal?.withdrawalId ?? null);

	// A payout needs an operator (Yellow Card's networkId), so corridors without one are not offered.
	const corridors = channels.data ? channels.data.corridors.filter((x) => x.networks.length > 0) : null;
	const corridor = corridors?.find((x) => x.channelId === corridorId) ?? null;
	const operators = corridor ? dedupeNetworksByName(corridor.networks) : [];
	const minUsd = channels.data?.minUsd;
	const maxUsd = channels.data?.maxUsd;

	// The KYC country follows the corridor; operators belong to it (a lone one is preselected).
	useEffect(() => {
		if (corridor) setCustomer((x) => ({ ...x, country: corridor.country }));
		const ops = corridor ? dedupeNetworksByName(corridor.networks) : [];
		setNetworkId(ops.length === 1 ? ops[0].id : '');
	}, [corridor]);

	const halted = psm?.tout === PSM_HALTED;
	const kusdIn = parseAmount(input, KUSD_TOKEN.decimals);
	const exactPlan = psm && !halted ? planCashout(kusdIn, psm.tout) : null;
	const plan = psm && exactPlan ? toCents(exactPlan, psm.tout) : null;
	const problem = cashoutProblem({ plan, halted, kusdBalance: wallet?.kusdBalance, pocketGem: psm?.pocketGem, collateral });
	const invalidAmount = input.trim() !== '' && !plan && !halted;
	const rounded = Boolean(plan && kusdIn !== null && plan.cost < kusdIn);
	const busy = pending;
	const feeLabel = !psm || halted ? '—' : psm.tout === 0n ? dict.kusd.swap.noFee : interpolate(dict.kusd.swap.feePct, { pct: fmt.pct(Number((psm.tout * 1_000_000n) / WAD) / 10_000, 4) });

	let message: string | null = null;
	if (problem?.key === 'halted') message = c.halted;
	else if (invalidAmount) message = dict.errors.invalidAmount;
	else if (problem?.key === 'insufficient') message = c.insufficient;
	// The PSM pocket and the Polygon router limit cash-outs, but their balances are never shown.
	else if (problem?.key === 'pocket' || problem?.key === 'collateral') message = c.overLimit;
	else if (plan && minUsd && plan.gemAmt < parseUnits(minUsd, GEM.decimals)) message = interpolate(c.belowMin, { min: minUsd });
	else if (plan && maxUsd && plan.gemAmt > parseUnits(maxUsd, GEM.decimals)) message = interpolate(c.aboveMax, { max: maxUsd });
	const shown = message ?? (formError || null);

	const ready = Boolean(plan && corridor && networkId && !message && wallet && collateral !== undefined);
	const strandedHeld = Boolean(stranded && wallet && wallet.gemBalance >= stranded.gemAmt);
	const canResume = Boolean(stranded && corridor && networkId && strandedHeld && !busy);
	const onStep = (index: number, total: number, step: KusdStep) => setProgress({ index, total, step });
	/**
	 * Progress, plus the rule that the bridge only starts while the payout opened at `openedAt` is fresh:
	 * wallet prompts can stay open for any length of time. useCashout strands the USDT in the wallet when
	 * this throws before the bridge is sent, and the resume opens a fresh payout for it.
	 */
	const stepWithin = (openedAt: number) => (index: number, total: number, step: KusdStep) => {
		if (step.action === 'bridgeTransfer' && performance.now() - openedAt > PAYOUT_SEND_WINDOW_MS) throw new UserError('cashoutPayoutStale');
		onStep(index, total, step);
	};
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

	/** The destination as Yellow Card takes it, or why it cannot go yet. Shows normalised numbers as sent. */
	const destination = (): Destination | string => {
		if (!corridor) return b.invalid.country;
		if (!networkId) return b.invalid.operator;
		const payoutNumber = normalizePhoneForCountry(momoNumber, corridor.country);
		if (!isInternationalPhone(payoutNumber)) return c.invalidMomoNumber;
		if (!accountName.trim()) return c.invalidAccountName;
		if (!customer.name.trim()) return b.invalid.name;
		const contactPhone = normalizePhoneForCountry(customer.phone ?? '', corridor.country);
		if (!isInternationalPhone(contactPhone)) return b.invalid.phone;
		if (payoutNumber !== momoNumber) setMomoNumber(payoutNumber);
		if (contactPhone !== customer.phone) setCustomer((x) => ({ ...x, phone: contactPhone }));
		return { corridor, payoutNumber, contactPhone };
	};

	/**
	 * Opens the Yellow Card payout for exactly `gemAmt` USDT and returns where to send it. Otherwise it
	 * shows why and returns null. Nothing is sent unless the answer is an open payout for that amount
	 * at a real address.
	 */
	const openPayout = async (gemAmt: bigint, owner: `0x${string}`): Promise<OpenPayout | null> => {
		setFormError('');
		const dest = destination();
		if (typeof dest === 'string') {
			setFormError(dest);
			return null;
		}
		const request = {
			userWallet: owner,
			usdAmount: formatUnits(gemAmt, GEM.decimals),
			channelId: dest.corridor.channelId,
			country: dest.corridor.country,
			currency: dest.corridor.currency,
			networkId,
			momoNumber: dest.payoutNumber,
			accountName: accountName.trim(),
			sender: { ...customer, country: dest.corridor.country, phone: dest.contactPhone },
		};
		// A pending key is reused only for the very same request: a corrected number or amount after a
		// timeout gets a new key, or the keeper would answer with the payout for the old one.
		const fingerprint = JSON.stringify(request);
		if (idemKeyRef.current?.fingerprint !== fingerprint) idemKeyRef.current = { key: makeIdempotencyKey(owner), fingerprint };
		try {
			const w = await createRampWithdrawal({ idempotencyKey: idemKeyRef.current.key, ...request });
			if (w.state === 'created') throw new PayoutPendingError();
			idemKeyRef.current = null; // answered: the next payout gets a fresh key
			const recipient = w.depositAddress ? parseRecipient(w.depositAddress) : null;
			const sameAmount = /^\d+(\.\d{1,6})?$/.test(w.usdAmount) && parseUnits(w.usdAmount, GEM.decimals) === gemAmt;
			if (w.state !== 'awaiting_funds' || !recipient || !sameAmount || w.currency !== dest.corridor.currency) throw new UnexpectedPayoutError();
			return { withdrawal: w, recipient, openedAt: performance.now() };
		} catch (error) {
			// A definitive rejection ends this attempt; an unknown outcome keeps the key for the retry.
			if (error instanceof RampApiError && !error.outcomeUnknown) idemKeyRef.current = null;
			setFormError(cashoutErrorText(error, dict));
			return null;
		}
	};

	const run = () =>
		exclusive(async () => {
			if (!plan || !wallet || !address) return;
			const open = await openPayout(plan.gemAmt, address);
			if (!open) return;
			try {
				const result = await cashout({ plan, recipient: open.recipient, kusdAllowance: wallet.kusdAllowance }, stepWithin(open.openedAt));
				setWithdrawal(open.withdrawal);
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
			if (!stranded || !address) return;
			// A fresh payout for the stranded USDT: the earlier one was never funded and simply expires.
			const open = await openPayout(stranded.gemAmt, address);
			if (!open) return;
			try {
				const result = await resumeBridge({ gemAmt: stranded.gemAmt, recipient: open.recipient }, stepWithin(open.openedAt));
				setStranded(null);
				setWithdrawal(open.withdrawal);
				setSent(result);
				setInput('');
			} catch (error) {
				failed(error);
			}
		});

	/** The local-currency estimate for the planned USDT; an estimate only, so a failed quote just shows none. */
	const quoteFor = async (cor: RampCorridor | null) => {
		setQuote(null);
		if (!cor || !plan) return;
		const seq = ++quoteSeqRef.current;
		try {
			const q = await fetchRampWithdrawQuote(cor.country, cor.currency, formatUnits(plan.gemAmt, GEM.decimals));
			if (seq === quoteSeqRef.current) setQuote(q);
		} catch {
			// the create call reports real errors
		}
	};

	const startOver = () => {
		setSent(null);
		setWithdrawal(null);
		setInput('');
		setQuote(null);
		setFormError('');
		setCorridorId('');
		setNetworkId('');
		setMomoNumber('');
		setAccountName('');
		setCustomer({ name: '', country: '' });
	};

	const setCust = (patch: Partial<RampCustomer>) => setCustomer((x) => ({ ...x, ...patch }));
	const kycExtra = corridor ? COUNTRY_KYC_EXTRAS[corridor.country] : undefined;

	if (sent) {
		const payout = liveWithdrawal ?? withdrawal;
		const state = String(payout?.state ?? 'awaiting_funds');
		const paid = state === 'paid';
		const lost = state === 'failed' || state === 'expired';
		const headline = paid
			? payout?.localAmount && payout.currency
				? interpolate(c.payout.paid, { amount: fmt.number(Number(payout.localAmount)), currency: payout.currency, number: momoNumber })
				: interpolate(c.payout.paidNoAmount, { number: momoNumber })
			: lost
				? c.payout[state as 'failed' | 'expired']
				: interpolate(c.sent, { amount: showAmount(sent.gemAmt, GEM.decimals, fmt, 6) });
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-3 rounded-xl border border-line bg-surface-alt p-4">
					{paid ? (
						<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
					) : lost ? (
						<XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
					) : (
						<Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-gold" aria-hidden />
					)}
					<div className="text-sm">
						<p className="font-semibold">{headline}</p>
						{!paid && !lost && <p className="mt-1 text-muted-foreground">{c.status[delivery]}</p>}
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
				<Button variant="outline" className="w-full" onClick={startOver}>
					{c.again}
				</Button>
			</div>
		);
	}

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">{c.subtitle}</p>

			{stranded && (
				<div className="mb-5 rounded-xl border border-gold/50 bg-gold-soft p-4 text-sm">
					<p className="font-semibold">{c.resumeTitle}</p>
					<p className="mt-1 text-muted-foreground">{c.resumeBody}</p>
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
							<button type="button" className="font-semibold text-gold hover:underline" onClick={() => setInput(exactAmount(wallet.kusdBalance - (wallet.kusdBalance % CENT_KUSD), KUSD_TOKEN.decimals))}>
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
						onChange={(e) => {
							setInput(e.target.value);
							setQuote(null);
							quoteSeqRef.current++; // a quote still in flight is for the old amount
						}}
						onBlur={() => void quoteFor(corridor)}
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

			<div className="mt-5 space-y-4">
				<Field id="cashout-country" label={b.country}>
					<Select
						value={corridorId}
						onValueChange={(id) => {
							setCorridorId(id);
							void quoteFor(corridors?.find((x) => x.channelId === id) ?? null);
						}}
						disabled={!corridors || busy}
					>
						<SelectTrigger id="cashout-country" className="border-line bg-surface-hi">
							<SelectValue placeholder={corridors ? b.countryPlaceholder : b.countriesLoading} />
						</SelectTrigger>
						<SelectContent>
							{corridors?.map((x) => (
								<SelectItem key={x.channelId} value={x.channelId}>
									{interpolate(b.corridorOption, { country: countryDisplayName(x.country, locale), currency: x.currency, rail: b.rail.momo })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{channels.error && <p className="text-[12.5px] text-danger">{interpolate(b.countriesFailed, { error: cashoutErrorText(channels.error, dict) })}</p>}
				</Field>
				{corridor && (
					<>
						<Field id="cashout-operator" label={b.operator}>
							<Select value={networkId} onValueChange={setNetworkId} disabled={busy}>
								<SelectTrigger id="cashout-operator" className="border-line bg-surface-hi">
									<SelectValue placeholder={b.operatorPlaceholder} />
								</SelectTrigger>
								<SelectContent>
									{operators.map((n) => (
										<SelectItem key={n.id} value={n.id}>
											{n.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field id="cashout-momo-number" label={c.momoNumber}>
							<Input
								id="cashout-momo-number"
								inputMode="tel"
								value={momoNumber}
								disabled={busy}
								onChange={(e) => setMomoNumber(e.target.value)}
								placeholder="+225 07 01 23 45 67"
								className="border-line bg-surface-hi"
							/>
						</Field>
						<Field id="cashout-account-name" label={c.accountName}>
							<Input id="cashout-account-name" value={accountName} disabled={busy} onChange={(e) => setAccountName(e.target.value)} className="border-line bg-surface-hi" />
						</Field>
					</>
				)}
			</div>

			<dl className="mt-4 space-y-2 text-[13px]">
				{quote && corridor && quote.currency === corridor.currency && (
					<>
						<Row label={c.receive} value={interpolate(c.receiveValue, { amount: fmt.number(quote.receiveLocal), currency: quote.currency })} />
						<Row label={c.ycFee} value={interpolate(c.ycFeeValue, { amount: fmt.number(quote.feeLocal), currency: quote.currency })} />
					</>
				)}
				<Row label={c.rate} value={c.rateValue} />
				<Row label={dict.kusd.swap.fee} value={feeLabel} />
				<Row label={c.arrival} value={c.arrivalValue} />
			</dl>

			<div className="mt-5 space-y-3 border-t border-line pt-5">
				<div>
					<h3 className="font-display font-semibold">{b.details}</h3>
					<p className="text-[12.5px] text-muted-foreground">{b.detailsHint}</p>
				</div>
				<Input aria-label={b.name} placeholder={b.name} value={customer.name} disabled={busy} onChange={(e) => setCust({ name: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.email} placeholder={b.email} value={customer.email ?? ''} disabled={busy} onChange={(e) => setCust({ email: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.phone} placeholder={b.phone} value={customer.phone ?? ''} disabled={busy} onChange={(e) => setCust({ phone: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.address} placeholder={b.address} value={customer.address ?? ''} disabled={busy} onChange={(e) => setCust({ address: e.target.value })} className="border-line bg-surface-hi" />
				<Input aria-label={b.dob} placeholder={b.dob} value={customer.dob ?? ''} disabled={busy} onChange={(e) => setCust({ dob: e.target.value })} className="border-line bg-surface-hi" />
				<div className="grid gap-3 sm:grid-cols-2">
					<Input aria-label={b.idType} placeholder={b.idType} value={customer.idType ?? ''} disabled={busy} onChange={(e) => setCust({ idType: e.target.value })} className="border-line bg-surface-hi" />
					<Input aria-label={b.idNumber} placeholder={b.idNumber} value={customer.idNumber ?? ''} disabled={busy} onChange={(e) => setCust({ idNumber: e.target.value })} className="border-line bg-surface-hi" />
				</div>
				{kycExtra && (
					<div className="grid gap-3 sm:grid-cols-2">
						<Input
							aria-label={b.kycExtras[kycExtra].label}
							placeholder={b.kycExtras[kycExtra].label}
							value={customer.additionalIdType ?? ''}
							disabled={busy}
							onChange={(e) => setCust({ additionalIdType: e.target.value })}
							className="border-line bg-surface-hi"
						/>
						<Input
							aria-label={b.kycExtras[kycExtra].number}
							placeholder={b.kycExtras[kycExtra].number}
							value={customer.additionalIdNumber ?? ''}
							disabled={busy}
							onChange={(e) => setCust({ additionalIdNumber: e.target.value })}
							className="border-line bg-surface-hi"
						/>
					</div>
				)}
			</div>

			{(shown || rounded) && (
				<p role={shown ? 'alert' : undefined} className={shown ? 'mt-3 text-[12.5px] text-danger' : 'mt-3 text-[12.5px] text-muted-foreground'}>
					{shown ?? interpolate(c.rounded, { amount: plan ? showAmount(plan.cost, KUSD_TOKEN.decimals, fmt, 6) : '' })}
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
