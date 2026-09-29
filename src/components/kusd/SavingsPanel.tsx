'use client';

import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { Panel } from '@/components/primitives/Panel';
import { StatCard } from '@/components/primitives/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { KUSD_TOKEN } from '@/config/kusd';
import { savingsRateIsZero, savingsSharePct, usePotState, useSavingsActions, useSavingsPosition, type SavingsPosition } from '@/hooks/kusd/useSavings';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { annualPct } from '@/utils/kusd';
import { exactAmount, parseAmount, showAmount } from './amounts';

const DEC = KUSD_TOKEN.decimals;

/** KUSD savings rate: deposit into the Pot through the user's DSProxy, withdraw any time. */
export default function SavingsPanel() {
	const dict = useDict();
	const fmt = useFormat();
	const s = dict.kusd.savings;
	const { address } = useAccount();
	const { data: pot } = usePotState();
	const { data: position } = useSavingsPosition(address);
	const pending = <Skeleton width={110} height={30} />;

	return (
		<div className="space-y-5">
			<Panel title={s.title}>
				<p className="-mt-2 text-sm text-muted-foreground">{s.subtitle}</p>
				{pot && savingsRateIsZero(pot.dsr) && (
					<p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-alt px-4 py-3 text-[13px] text-muted-foreground">
						<Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
						{s.zeroRate}
					</p>
				)}
			</Panel>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard label={s.rate} value={pot ? fmt.pct(annualPct(pot.dsr)) : pending} hint={s.rateHint} tone="success" />
				<StatCard label={s.yourDeposit} value={position ? `${showAmount(position.kusd, DEC, fmt, 2)} KUSD` : address ? pending : '—'} />
				<StatCard label={s.totalDeposits} value={pot ? `${showAmount(pot.totalKusd, DEC, fmt, 2)} KUSD` : pending} />
				<StatCard label={s.yourShare} value={pot && position ? fmt.pct(savingsSharePct(position.pie, pot.Pie)) : address ? pending : '—'} />
			</div>

			{!address ? (
				<ConnectPrompt />
			) : position ? (
				<div className="grid gap-5 md:grid-cols-2">
					<DepositCard position={position} />
					<WithdrawCard position={position} />
				</div>
			) : (
				<Skeleton height={260} className="w-full rounded-2xl" />
			)}

			<Panel title={s.how.title}>
				<ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
					{s.how.points.map((point) => (
						<li key={point}>{point}</li>
					))}
				</ul>
			</Panel>
		</div>
	);
}

function DepositCard({ position }: { position: SavingsPosition }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const s = dict.kusd.savings;
	const actions = useSavingsActions();
	const [input, setInput] = useState('');
	const [pending, setPending] = useState<'proxy' | 'approve' | 'deposit' | null>(null);

	const wad = parseAmount(input, DEC);
	const invalid = input.trim() !== '' && !wad;
	const insufficient = wad !== null && wad > position.walletKusd;

	const run = async (step: 'proxy' | 'approve' | 'deposit') => {
		setPending(step);
		try {
			if (step === 'proxy') await actions.buildProxy();
			else if (step === 'approve') await actions.approve(position.proxy!, wad!);
			else {
				await actions.deposit(position.proxy!, wad!, position.allowanceToProxy);
				toast.success(interpolate(s.depositSuccess, { amount: showAmount(wad!, DEC, fmt, 6) }));
				setInput('');
			}
		} catch (error) {
			toast.error(s.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	let action;
	if (!position.proxy) {
		action = (
			<>
				<p className="text-[12.5px] text-muted-foreground">{s.proxyStep}</p>
				<Button className="w-full" disabled={pending !== null} onClick={() => run('proxy')}>
					{pending === 'proxy' && <Loader2 className="animate-spin" aria-hidden />}
					{pending === 'proxy' ? s.buildingProxy : s.buildProxy}
				</Button>
			</>
		);
	} else if (!wad || invalid || insufficient) {
		action = (
			<Button className="w-full" disabled>
				{s.deposit}
			</Button>
		);
	} else if (position.allowanceToProxy < wad) {
		action = (
			<Button className="w-full" disabled={pending !== null} onClick={() => run('approve')}>
				{pending === 'approve' && <Loader2 className="animate-spin" aria-hidden />}
				{pending === 'approve' ? s.approving : interpolate(s.approve, { amount: showAmount(wad, DEC, fmt, 6) })}
			</Button>
		);
	} else {
		action = (
			<Button className="w-full" disabled={pending !== null} onClick={() => run('deposit')}>
				{pending === 'deposit' && <Loader2 className="animate-spin" aria-hidden />}
				{pending === 'deposit' ? s.depositing : s.deposit}
			</Button>
		);
	}

	return (
		<Panel title={s.depositTitle}>
			<AmountField
				id="savings-deposit"
				label={s.amount}
				value={input}
				onChange={setInput}
				hint={interpolate(s.walletBalance, { amount: `${showAmount(position.walletKusd, DEC, fmt)} KUSD` })}
				onMax={() => setInput(exactAmount(position.walletKusd, DEC))}
				error={invalid ? dict.errors.invalidAmount : insufficient ? s.insufficient : null}
			/>
			<div className="mt-4 space-y-3">{action}</div>
		</Panel>
	);
}

function WithdrawCard({ position }: { position: SavingsPosition }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const s = dict.kusd.savings;
	const actions = useSavingsActions();
	const [input, setInput] = useState('');
	const [pending, setPending] = useState<'withdraw' | 'all' | null>(null);

	const wad = parseAmount(input, DEC);
	const invalid = input.trim() !== '' && !wad;
	const exceeds = wad !== null && wad > position.kusd;
	const nothing = position.pie === 0n;

	const run = async (which: 'withdraw' | 'all') => {
		setPending(which);
		try {
			await actions.withdraw(position.proxy!, which === 'all' ? 'all' : wad!);
			toast.success(s.withdrawSuccess);
			setInput('');
		} catch (error) {
			toast.error(s.failed, describeError(error, dict));
		} finally {
			setPending(null);
		}
	};

	return (
		<Panel title={s.withdrawTitle}>
			<AmountField
				id="savings-withdraw"
				label={s.amount}
				value={input}
				onChange={setInput}
				hint={interpolate(s.deposited, { amount: `${showAmount(position.kusd, DEC, fmt)} KUSD` })}
				onMax={() => setInput(exactAmount(position.kusd, DEC))}
				error={invalid ? dict.errors.invalidAmount : exceeds ? s.exceedsDeposit : null}
			/>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<Button disabled={nothing || !wad || invalid || exceeds || pending !== null || !position.proxy} onClick={() => run('withdraw')}>
					{pending === 'withdraw' && <Loader2 className="animate-spin" aria-hidden />}
					{pending === 'withdraw' ? s.withdrawing : s.withdraw}
				</Button>
				<Button variant="secondary" disabled={nothing || pending !== null || !position.proxy} onClick={() => run('all')}>
					{pending === 'all' && <Loader2 className="animate-spin" aria-hidden />}
					{pending === 'all' ? s.withdrawing : s.withdrawAll}
				</Button>
			</div>
			{nothing && <p className="mt-3 text-[12.5px] text-muted-foreground">{s.nothingToWithdraw}</p>}
		</Panel>
	);
}

/** Amount input with a balance hint, a Max button and an inline error. Shared by the KUSD panels. */
export function AmountField({
	id,
	label,
	value,
	onChange,
	hint,
	onMax,
	error,
	suffix = 'KUSD',
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	hint?: string;
	onMax?: () => void;
	error?: string | null;
	suffix?: string;
}) {
	const dict = useDict();
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-[12px] text-muted-foreground">
				<label htmlFor={id} className="font-semibold uppercase tracking-[0.1em] text-muted-deep">
					{label}
				</label>
				<span className="flex items-center gap-2">
					{hint}
					{onMax && (
						<button type="button" className="font-semibold text-gold hover:underline" onClick={onMax}>
							{dict.kusd.savings.max}
						</button>
					)}
				</span>
			</div>
			<div className="relative">
				<Input
					id={id}
					inputMode="decimal"
					placeholder="0.0"
					value={value}
					aria-invalid={Boolean(error)}
					onChange={(e) => onChange(e.target.value)}
					className="border-line bg-surface-hi pr-16 text-lg"
				/>
				<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{suffix}</span>
			</div>
			{error && <p className="text-[12.5px] text-danger">{error}</p>}
		</div>
	);
}
