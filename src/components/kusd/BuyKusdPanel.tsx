'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHAIN_IDS, getExplorerTxUrl } from '@/config/chains';
import { useRampChannels } from '@/hooks/kusd/useRampChannels';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { useDict, useFormat, useLocale } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import {
	amountWithinCorridorLimits,
	buildDepositSource,
	COUNTRY_KYC_EXTRAS,
	countryDisplayName,
	createRampDeposit,
	dedupeNetworksByName,
	fetchRampDeposit,
	fetchRampQuote,
	isEvmAddress,
	isInternationalPhone,
	isTerminalDepositState,
	isValidLocalAmount,
	makeIdempotencyKey,
	normalizePhoneForCountry,
	railKey,
	RAMP_DEPOSIT_STATES,
	RampApiError,
	type RampCorridor,
	type RampCustomer,
	type RampDeposit,
	type RampDepositState,
} from '@/lib/ramp';

const POLL_MS = 5_000;

/** The buy form's explanation for any ramp failure, in the reader's language. */
export function rampErrorText(error: unknown, dict: Dictionary): string {
	const t = dict.kusd.buy.errors;
	if (!(error instanceof RampApiError) || error.outcomeUnknown) return t.network;
	if (error.key) return t[error.key];
	if (error.status === 503) return t.unavailable;
	if (error.raw) return interpolate(t.providerWithCode, { code: error.raw });
	return interpolate(t.requestFailed, { status: error.status });
}

function stateLabel(state: string, dict: Dictionary): string {
	return (RAMP_DEPOSIT_STATES as readonly string[]).includes(state) ? dict.kusd.buy.states[state as RampDepositState] : state;
}

/**
 * Buy KUSD with local currency via Yellow Card (ported from kusd-ui /buy). Talks to the fiat-ramp
 * keeper through /ramp-api/*. Flow: form (corridor, amount, payout wallet, KYC) → pay (payment
 * details, deposit status polled) → done (paid / expired / failed_create / manual_review).
 *
 * `initialDepositId` resumes a deposit from ?deposit=<id>: redirect channels (Wave) send the
 * customer back here after the hosted payment, and a refresh must not lose the pay screen.
 * It renders bare: the Buy/Sell card (BuySellKusd) supplies the frame and title.
 */
export default function BuyKusdPanel({ initialDepositId }: { initialDepositId?: string }) {
	const dict = useDict();
	const locale = useLocale();
	const fmt = useFormat();
	const b = dict.kusd.buy;
	const router = useRouter();
	const pathname = usePathname();
	const { address } = useAccount();

	const [step, setStep] = useState<'form' | 'pay' | 'done'>('form');
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);

	// Corridors come from the keeper (which mirrors Yellow Card's active deposit channels) —
	// nothing country-specific is hardcoded here.
	const channels = useRampChannels();
	const corridors: RampCorridor[] | null = channels.data?.corridors ?? null;
	// The keeper's USD floor — the binding minimum, shown instead of YC's (usually far lower)
	// per-channel local minimum.
	const minDepositUsd = channels.data?.minDepositUsd ?? null;
	const corridorsError = channels.error ? { error: channels.error as unknown } : null;
	const [corridorId, setCorridorId] = useState('');
	const corridor = corridors?.find((c) => c.channelId === corridorId) ?? null;
	const momoOperators = corridor?.channelType === 'momo' ? dedupeNetworksByName(corridor.networks) : [];

	const [localAmount, setLocalAmount] = useState('');
	const [userWallet, setUserWallet] = useState('');
	const [payoutUsd, setPayoutUsd] = useState<string | null>(null);
	const [customer, setCustomer] = useState<RampCustomer>({ name: '', country: '' });
	const [momoPhone, setMomoPhone] = useState('');
	const [momoNetworkId, setMomoNetworkId] = useState('');

	const [deposit, setDeposit] = useState<RampDeposit | null>(null);
	// One idempotency key per purchase attempt: kept across retries whose outcome is unknown so
	// the keeper can dedupe, discarded once the server answers definitively.
	const idemKeyRef = useRef<string | null>(null);
	// Monotonic token so a slow stale quote response can't overwrite a newer one.
	const quoteSeqRef = useRef(0);

	useEffect(() => {
		if (!initialDepositId) return;
		let cancelled = false;
		fetchRampDeposit(initialDepositId)
			.then((d) => {
				if (cancelled) return;
				setDeposit(d);
				setStep(isTerminalDepositState(String(d.state)) ? 'done' : 'pay');
			})
			.catch(() => {
				// unknown or expired id — leave the fresh form
			});
		return () => {
			cancelled = true;
		};
	}, [initialDepositId]);

	// Keep the KYC country in sync with the selected corridor.
	useEffect(() => {
		if (corridor) setCustomer((c) => ({ ...c, country: corridor.country }));
	}, [corridor]);

	// Operators belong to the corridor: reset the pick when it changes, preselecting a lone operator.
	useEffect(() => {
		const ops = corridor?.channelType === 'momo' ? dedupeNetworksByName(corridor.networks) : [];
		setMomoNetworkId(ops.length === 1 ? ops[0].id : '');
	}, [corridor]);

	// Autofill the payout wallet from the connected account (still editable).
	useEffect(() => {
		if (address && !userWallet) setUserWallet(address);
	}, [address, userWallet]);

	const limitsMessage = useCallback(
		(c: RampCorridor): string => {
			const parts: string[] = [];
			if (c.min !== null && c.min > 0) parts.push(interpolate(b.invalid.rangeMin, { amount: fmt.number(c.min) }));
			if (c.max !== null && c.max > 0) parts.push(interpolate(b.invalid.rangeMax, { amount: fmt.number(c.max) }));
			return parts.length ? interpolate(b.invalid.range, { limits: parts.join(', '), currency: c.currency }) : b.invalid.rangeNoLimits;
		},
		[b, fmt],
	);

	const getQuote = useCallback(async () => {
		setError('');
		setPayoutUsd(null);
		if (!corridor || !localAmount) return;
		if (!isValidLocalAmount(localAmount)) return setError(b.invalid.amount);
		if (!amountWithinCorridorLimits(localAmount, corridor)) return setError(limitsMessage(corridor));
		const seq = ++quoteSeqRef.current;
		try {
			const q = await fetchRampQuote(corridor.currency, localAmount, { country: corridor.country, channelType: corridor.channelType });
			if (seq !== quoteSeqRef.current) return; // a newer request superseded this one
			// Pre-empt the keeper's $-floor rejection with a clear message while still on the form.
			const payoutNum = Number(q.payoutUsd);
			if (minDepositUsd && Number.isFinite(payoutNum) && payoutNum < Number(minDepositUsd)) {
				setError(interpolate(b.invalid.belowMinimum, { amount: payoutNum.toFixed(2), min: minDepositUsd }));
				return;
			}
			setPayoutUsd(String(q.payoutUsd ?? ''));
		} catch (e) {
			if (seq === quoteSeqRef.current) setError(rampErrorText(e, dict));
		}
	}, [corridor, localAmount, limitsMessage, minDepositUsd, b, dict]);

	const submit = useCallback(async () => {
		setError('');
		if (!corridor) return setError(b.invalid.country);
		if (!isValidLocalAmount(localAmount)) return setError(b.invalid.amount);
		if (!amountWithinCorridorLimits(localAmount, corridor)) return setError(limitsMessage(corridor));
		if (!isEvmAddress(userWallet)) return setError(b.invalid.wallet);
		if (!customer.name.trim()) return setError(b.invalid.name);
		// YC hard-rejects local phone formats (InvalidPhoneNumberFormat), so normalise local input with
		// the corridor's dial code and validate the result. isInternationalPhone stays the hard gate.
		const contactPhone = normalizePhoneForCountry(customer.phone ?? '', corridor.country);
		if (!isInternationalPhone(contactPhone)) return setError(b.invalid.phone);
		const payerPhone = normalizePhoneForCountry(momoPhone, corridor.country);
		if (corridor.channelType === 'momo') {
			if (corridor.networks.length > 0 && !momoNetworkId) return setError(b.invalid.operator);
			if (!isInternationalPhone(payerPhone)) return setError(b.invalid.momoPhone);
		}
		// Show the numbers as they will be sent, so the user can spot a wrong fix.
		if (contactPhone !== customer.phone) setCustomer((c) => ({ ...c, phone: contactPhone }));
		if (payerPhone !== momoPhone) setMomoPhone(payerPhone);
		setSubmitting(true);
		// Reuse the attempt's key on retries so a lost response can't open a second Yellow Card receive.
		if (!idemKeyRef.current) idemKeyRef.current = makeIdempotencyKey(userWallet);
		try {
			const d = await createRampDeposit({
				idempotencyKey: idemKeyRef.current,
				userWallet,
				channelId: corridor.channelId,
				currency: corridor.currency,
				localAmount,
				// The normalised phones, NOT the raw state — the setState calls above haven't landed yet.
				customer: { ...customer, phone: contactPhone },
				source: buildDepositSource(corridor.channelType, { phone: payerPhone, networkId: momoNetworkId }),
				reason: 'other',
			});
			idemKeyRef.current = null; // consumed — the next purchase gets a fresh key
			setDeposit(d);
			setStep('pay');
		} catch (e) {
			// A definitive rejection ends this attempt; an unknown outcome keeps the key for the retry.
			if (e instanceof RampApiError && !e.outcomeUnknown) idemKeyRef.current = null;
			setError(rampErrorText(e, dict));
		} finally {
			setSubmitting(false);
		}
	}, [corridor, customer, localAmount, userWallet, momoPhone, momoNetworkId, limitsMessage, b, dict]);

	// Poll the deposit while on the pay screen.
	useEffect(() => {
		if (step !== 'pay' || !deposit?.depositId) return;
		// clearInterval stops future ticks but not a response already in flight; without this flag a
		// slow poll resolving after the terminal one could overwrite the final state.
		let cancelled = false;
		const timer = setInterval(async () => {
			try {
				const d = await fetchRampDeposit(deposit.depositId);
				if (cancelled) return;
				setDeposit(d);
				if (isTerminalDepositState(String(d.state))) setStep('done');
			} catch {
				// transient poll errors are fine; the next tick retries
			}
		}, POLL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [step, deposit?.depositId]);

	const startOver = () => {
		setDeposit(null);
		setStep('form');
		setError('');
		setPayoutUsd(null);
		setLocalAmount('');
		if (initialDepositId) router.replace(pathname);
	};

	const setCust = (patch: Partial<RampCustomer>) => setCustomer((c) => ({ ...c, ...patch }));
	const kycExtra = corridor ? COUNTRY_KYC_EXTRAS[corridor.country] : undefined;

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">{b.subtitle}</p>

			{error && (
				<p role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
					{error}
				</p>
			)}

			{step === 'form' && (
				<div className="space-y-5">
					<Field id="ramp-country" label={b.country}>
						<Select value={corridorId} onValueChange={setCorridorId} disabled={!corridors}>
							<SelectTrigger id="ramp-country" className="border-line bg-surface-hi">
								<SelectValue placeholder={corridors ? b.countryPlaceholder : b.countriesLoading} />
							</SelectTrigger>
							<SelectContent>
								{corridors?.map((c) => (
									<SelectItem key={c.channelId} value={c.channelId}>
										{interpolate(b.corridorOption, {
											country: countryDisplayName(c.country, locale),
											currency: c.currency,
											rail: b.rail[railKey(c.channelType)],
										})}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{corridorsError && (
							<p className="text-[12.5px] text-danger">{interpolate(b.countriesFailed, { error: rampErrorText(corridorsError.error, dict) })}</p>
						)}
						{corridor?.estimatedSettlementTime ? (
							<p className="text-[12.5px] text-muted-foreground">{interpolate(b.settlement, { minutes: corridor.estimatedSettlementTime })}</p>
						) : null}
					</Field>

					{/* Operator + payer number (momo corridors only) — the customer must know which operator the
					    funds go through, so this sits right under the country pick. */}
					{corridor?.channelType === 'momo' && (
						<>
							{momoOperators.length > 0 && (
								<Field id="ramp-momo-network" label={b.operator}>
									<Select value={momoNetworkId} onValueChange={setMomoNetworkId}>
										<SelectTrigger id="ramp-momo-network" className="border-line bg-surface-hi">
											<SelectValue placeholder={b.operatorPlaceholder} />
										</SelectTrigger>
										<SelectContent>
											{momoOperators.map((n) => (
												<SelectItem key={n.id} value={n.id}>
													{n.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
							<Field id="ramp-momo-phone" label={b.momoPhone}>
								<Input
									id="ramp-momo-phone"
									inputMode="tel"
									value={momoPhone}
									onChange={(e) => setMomoPhone(e.target.value)}
									placeholder="+237 6XX XXX XXX"
									className="border-line bg-surface-hi"
								/>
							</Field>
						</>
					)}

					<Field id="ramp-amount" label={b.amount}>
						<div className="relative">
							<Input
								id="ramp-amount"
								inputMode="decimal"
								value={localAmount}
								onChange={(e) => setLocalAmount(e.target.value)}
								onBlur={getQuote}
								placeholder="25000"
								className="border-line bg-surface-hi pr-16 text-lg"
							/>
							<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
								{corridor?.currency ?? ''}
							</span>
						</div>
						{corridor && (
							<p className="text-[12.5px] text-muted-foreground">
								{/* OUR floor is the binding minimum — YC's local channel minimum is usually far below it. */}
								{[
									minDepositUsd ? interpolate(b.minUsd, { amount: minDepositUsd }) : '',
									corridor.max !== null && corridor.max > 0 ? interpolate(b.max, { amount: fmt.number(corridor.max), currency: corridor.currency }) : '',
								]
									.filter(Boolean)
									.join(' · ')}
							</p>
						)}
					</Field>

					{payoutUsd && (
						<div className="flex items-center justify-between rounded-xl border border-line bg-surface-alt px-4 py-3 text-sm">
							<span className="text-muted-foreground">{b.receive}</span>
							<span className="font-semibold text-gold">{interpolate(b.receiveValue, { amount: payoutUsd })}</span>
						</div>
					)}

					<Field id="ramp-wallet" label={b.wallet}>
						<Input
							id="ramp-wallet"
							value={userWallet}
							onChange={(e) => setUserWallet(e.target.value.trim())}
							placeholder="0x…"
							className="border-line bg-surface-hi font-mono text-sm"
						/>
					</Field>

					<div className="space-y-3 border-t border-line pt-5">
						<div>
							<h3 className="font-display font-semibold">{b.details}</h3>
							<p className="text-[12.5px] text-muted-foreground">{b.detailsHint}</p>
						</div>
						<Input aria-label={b.name} placeholder={b.name} value={customer.name} onChange={(e) => setCust({ name: e.target.value })} className="border-line bg-surface-hi" />
						<Input aria-label={b.email} placeholder={b.email} value={customer.email ?? ''} onChange={(e) => setCust({ email: e.target.value })} className="border-line bg-surface-hi" />
						<Input aria-label={b.phone} placeholder={b.phone} value={customer.phone ?? ''} onChange={(e) => setCust({ phone: e.target.value })} className="border-line bg-surface-hi" />
						<Input aria-label={b.address} placeholder={b.address} value={customer.address ?? ''} onChange={(e) => setCust({ address: e.target.value })} className="border-line bg-surface-hi" />
						<Input aria-label={b.dob} placeholder={b.dob} value={customer.dob ?? ''} onChange={(e) => setCust({ dob: e.target.value })} className="border-line bg-surface-hi" />
						<div className="grid gap-3 sm:grid-cols-2">
							<Input aria-label={b.idType} placeholder={b.idType} value={customer.idType ?? ''} onChange={(e) => setCust({ idType: e.target.value })} className="border-line bg-surface-hi" />
							<Input aria-label={b.idNumber} placeholder={b.idNumber} value={customer.idNumber ?? ''} onChange={(e) => setCust({ idNumber: e.target.value })} className="border-line bg-surface-hi" />
						</div>
						{kycExtra && (
							<div className="grid gap-3 sm:grid-cols-2">
								<Input
									aria-label={b.kycExtras[kycExtra].label}
									placeholder={b.kycExtras[kycExtra].label}
									value={customer.additionalIdType ?? ''}
									onChange={(e) => setCust({ additionalIdType: e.target.value })}
									className="border-line bg-surface-hi"
								/>
								<Input
									aria-label={b.kycExtras[kycExtra].number}
									placeholder={b.kycExtras[kycExtra].number}
									value={customer.additionalIdNumber ?? ''}
									onChange={(e) => setCust({ additionalIdNumber: e.target.value })}
									className="border-line bg-surface-hi"
								/>
							</div>
						)}
					</div>

					<Button className="w-full" disabled={submitting || !corridor} onClick={submit}>
						{submitting && <Loader2 className="animate-spin" aria-hidden />}
						{submitting ? b.submitting : b.submit}
					</Button>
				</div>
			)}

			{step === 'pay' && deposit && (
				<PayStep deposit={deposit} corridor={corridor} localAmount={localAmount} />
			)}

			{step === 'done' && deposit && (
				<div className="flex flex-col items-center gap-2 py-4 text-center">
					{deposit.state === 'paid' ? (
						<CheckCircle2 className="size-10 text-success" aria-hidden />
					) : (
						<AlertTriangle className="size-10 text-danger" aria-hidden />
					)}
					<p className="font-display text-lg font-semibold">
						{deposit.state === 'paid' ? b.done.paid : deposit.state === 'manual_review' ? b.done.manualReview : b.done.failed}
					</p>
					<p className="text-sm text-muted-foreground">{interpolate(b.done.finalStatus, { state: stateLabel(String(deposit.state), dict) })}</p>
					{typeof deposit.payoutTxHash === 'string' && (
						<a
							className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
							href={getExplorerTxUrl(CHAIN_IDS.KALYCHAIN, deposit.payoutTxHash)}
							target="_blank"
							rel="noreferrer"
						>
							{b.done.viewTx}
							<ExternalLink className="size-3.5" aria-hidden />
						</a>
					)}
					<Button variant="secondary" className="mt-3" onClick={startOver}>
						{b.done.again}
					</Button>
				</div>
			)}
		</div>
	);
}

function PayStep({ deposit, corridor, localAmount }: { deposit: RampDeposit; corridor: RampCorridor | null; localAmount: string }) {
	const dict = useDict();
	const b = dict.kusd.buy;
	const hasBankInfo = Boolean(deposit.bankInfo && Object.keys(deposit.bankInfo).length > 0);
	const amount = `${deposit.fiatAmount ?? localAmount} ${deposit.fiatCurrency ?? corridor?.currency ?? ''}`.trim();
	const how = deposit.paymentUrl ? b.pay.viaPage : hasBankInfo ? b.pay.toAccount : b.pay.viaPrompt;

	return (
		<div className="space-y-5">
			<div>
				<h3 className="font-display text-lg font-semibold">
					{deposit.paymentUrl || corridor?.channelType === 'momo' ? b.pay.titleMomo : b.pay.titleBank}
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					<span className="font-semibold text-cream">{interpolate(b.pay.payExactly, { amount })}</span> {how}
					{deposit.expiresAt && <> {interpolate(b.pay.expires, { time: new Date(deposit.expiresAt).toLocaleTimeString() })}</>}
				</p>
			</div>

			{deposit.paymentUrl ? (
				// Hosted-payment channels (e.g. Wave): the link IS the payment flow.
				<Button asChild className="w-full">
					<a href={deposit.paymentUrl}>{b.pay.openPage}</a>
				</Button>
			) : hasBankInfo ? (
				<dl className="space-y-2 rounded-xl border border-line bg-surface-alt p-4 text-sm">
					{Object.entries(deposit.bankInfo!).map(([key, value]) => (
						<div key={key} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
							<dt className="text-muted-foreground">{humanizeKey(key)}</dt>
							<dd className="min-w-0 break-all font-mono text-cream">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
						</div>
					))}
				</dl>
			) : (
				<p className="rounded-xl border border-line bg-surface-alt p-4 text-sm text-muted-foreground">{b.pay.promptHint}</p>
			)}

			<p className="flex items-center gap-2 text-sm">
				<span className="inline-block size-2 animate-pulse rounded-full bg-gold" aria-hidden />
				<span className="text-muted-foreground">{b.pay.status}</span>
				<span className="font-semibold">{stateLabel(String(deposit.state), dict)}</span>
				<span className="text-muted-deep">({b.pay.autoUpdate})</span>
			</p>
			<p className="text-[12.5px] text-muted-foreground">{b.pay.arrival}</p>
		</div>
	);
}

/** `accountNumber` → `Account number` for Yellow Card's bank-detail keys. */
function humanizeKey(key: string): string {
	const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={id} className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
				{label}
			</label>
			{children}
		</div>
	);
}
