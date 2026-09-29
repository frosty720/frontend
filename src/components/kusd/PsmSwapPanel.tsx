'use client';

import { useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { KUSD_PSM, KUSD_TOKEN } from '@/config/kusd';
import { PSM_HALTED, psmPayToken, useApprovePsm, usePsmState, usePsmSwap, usePsmWallet, type PsmDirection } from '@/hooks/kusd/usePsm';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { WAD } from '@/utils/kusd';
import { exactAmount, parseAmount, showAmount } from './amounts';
import { quotePsm } from './psmQuote';

const GEM = KUSD_PSM.gem;

/**
 * Swap USDT ⇄ KUSD 1:1 through the Peg Stability Module (sellGem / buyGem). `direction` comes from the
 * Buy/Sell card: 'sell' sells USDT for KUSD (buying KUSD), 'buy' buys USDT back with KUSD (selling it).
 */
export default function PsmSwapPanel({ direction }: { direction: PsmDirection }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const s = dict.kusd.swap;
	const { address } = useAccount();
	const [input, setInput] = useState('');
	const [pending, setPending] = useState<'approve' | 'swap' | null>(null);
	const { data: psm } = usePsmState();
	const { data: wallet } = usePsmWallet(address);
	const approve = useApprovePsm();
	const swap = usePsmSwap();

	const pay = psmPayToken(direction);
	const receive = direction === 'sell' ? { symbol: KUSD_TOKEN.symbol, decimals: KUSD_TOKEN.decimals } : { symbol: GEM.symbol, decimals: GEM.decimals };
	const fee = psm ? (direction === 'sell' ? psm.tin : psm.tout) : 0n;
	const halted = fee === PSM_HALTED;
	const quote = psm && !halted ? quotePsm(direction, input, psm.tin, psm.tout) : null;
	const invalid = input.trim() !== '' && !quote && !halted;

	const balance = wallet ? (direction === 'sell' ? wallet.gemBalance : wallet.kusdBalance) : undefined;
	const allowance = wallet ? (direction === 'sell' ? wallet.gemAllowance : wallet.kusdAllowance) : undefined;
	const capacity = psm ? (direction === 'sell' ? psm.kusdCash : psm.pocketGem) : undefined;
	const insufficient = Boolean(quote && balance !== undefined && quote.pay > balance);
	const overCapacity = Boolean(quote && capacity !== undefined && quote.receive > capacity);
	const needsApproval = Boolean(quote && allowance !== undefined && allowance < quote.pay);
	const kusdTyped = direction === 'buy' ? parseAmount(input, KUSD_TOKEN.decimals) : null;
	const rounded = Boolean(quote && kusdTyped !== null && quote.pay < kusdTyped);

	const run = async (step: 'approve' | 'swap') => {
		if (!quote) return;
		setPending(step);
		try {
			if (step === 'approve') {
				await approve(direction, quote.pay);
			} else {
				await swap({ direction, gemAmt: quote.gemAmt });
				toast.success(
					interpolate(s.success, {
						from: `${showAmount(quote.pay, pay.decimals, fmt, 6)} ${pay.symbol}`,
						to: `${showAmount(quote.receive, receive.decimals, fmt, 6)} ${receive.symbol}`,
					}),
				);
				setInput('');
			}
		} catch (error) {
			toast.error(step === 'approve' ? s.approveFailed : s.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	let problem: string | null = null;
	if (halted) problem = s.halted;
	else if (invalid) problem = dict.errors.invalidAmount;
	else if (insufficient) problem = interpolate(s.insufficient, { symbol: pay.symbol });
	else if (overCapacity && capacity !== undefined) problem = interpolate(s.overCapacity, { amount: `${showAmount(capacity, receive.decimals, fmt, 2)} ${receive.symbol}` });

	let action;
	if (!address) {
		action = <ClientOnlyConnectWallet className="w-full" />;
	} else if (!quote || problem) {
		action = (
			<Button className="w-full" disabled>
				{problem ? s.swap : s.enterAmount}
			</Button>
		);
	} else if (needsApproval) {
		action = (
			<Button className="w-full" disabled={pending !== null} onClick={() => run('approve')}>
				{pending === 'approve' && <Loader2 className="animate-spin" aria-hidden />}
				{pending === 'approve' ? s.approving : interpolate(s.approve, { amount: showAmount(quote.pay, pay.decimals, fmt, 6), symbol: pay.symbol })}
			</Button>
		);
	} else {
		action = (
			<Button className="w-full" disabled={pending !== null || allowance === undefined} onClick={() => run('swap')}>
				{pending === 'swap' && <Loader2 className="animate-spin" aria-hidden />}
				{pending === 'swap' ? s.swapping : s.swap}
			</Button>
		);
	}

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">{s.subtitle}</p>

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
					<label htmlFor="psm-amount" className="font-semibold uppercase tracking-[0.1em] text-muted-deep">
						{s.youPay}
					</label>
					{balance !== undefined && (
						<span className="flex items-center gap-2">
							{interpolate(s.balance, { amount: `${showAmount(balance, pay.decimals, fmt)} ${pay.symbol}` })}
							<button type="button" className="font-semibold text-gold hover:underline" onClick={() => setInput(exactAmount(balance, pay.decimals))}>
								{s.max}
							</button>
						</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					<Input
						id="psm-amount"
						inputMode="decimal"
						placeholder="0.0"
						value={input}
						aria-invalid={invalid}
						onChange={(e) => setInput(e.target.value)}
						className="min-w-0 flex-1 border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
					/>
					<span className="font-display text-lg font-semibold">{pay.symbol}</span>
				</div>
			</div>

			<div className="-my-3 flex justify-center">
				<span className="relative z-10 flex size-9 items-center justify-center rounded-full border border-line bg-surface-hi text-gold">
					<ArrowDown className="size-4" aria-hidden />
				</span>
			</div>

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{s.youReceive}</div>
				<div className="flex items-center gap-3">
					<span className="min-w-0 flex-1 truncate text-2xl font-semibold tabular-nums">
						{quote ? showAmount(quote.receive, receive.decimals, fmt, 6) : '0.0'}
					</span>
					<span className="font-display text-lg font-semibold">{receive.symbol}</span>
				</div>
			</div>

			<dl className="mt-4 space-y-2 text-[13px]">
				<Row label={s.rate} value={interpolate(s.rateValue, { from: pay.symbol, to: receive.symbol })} />
				<Row label={s.fee} value={fee === 0n || halted ? s.noFee : interpolate(s.feePct, { pct: fmt.pct(Number((fee * 1_000_000n) / WAD) / 10_000, 4) })} />
				<Row
					label={s.available}
					value={capacity !== undefined ? `${showAmount(capacity, receive.decimals, fmt, 2)} ${receive.symbol}` : '—'}
				/>
			</dl>

			{(problem || rounded) && (
				<p role={problem ? 'alert' : undefined} className={problem ? 'mt-3 text-[12.5px] text-danger' : 'mt-3 text-[12.5px] text-muted-foreground'}>
					{problem ?? interpolate(s.rounded, { amount: quote ? showAmount(quote.pay, KUSD_TOKEN.decimals, fmt, 6) : '' })}
				</p>
			)}

			<div className="mt-5">{action}</div>
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
