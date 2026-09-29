'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { AmountField } from '@/components/kusd/SavingsPanel';
import { exactAmount, parseAmount, showAmount } from '@/components/kusd/amounts';
import { Panel } from '@/components/primitives/Panel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { WRAP_GAS_RESERVE, useWrapActions, useWrapState } from '@/hooks/kusd/useSklc';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';

/** Wrap KMT into sKLC (1:1) for surplus/debt auction bids, and back. */
export default function WrapPanel() {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const w = dict.lend.wrap;
	const { address } = useAccount();
	const { data } = useWrapState(address);
	const actions = useWrapActions();
	const [mode, setMode] = useState<'wrap' | 'unwrap'>('wrap');
	const [input, setInput] = useState('');
	const [pending, setPending] = useState(false);

	const symbol = mode === 'wrap' ? 'KMT' : 'sKLC';
	const balance = data ? (mode === 'wrap' ? data.kmt : data.sklc) : undefined;
	const max = balance === undefined ? 0n : mode === 'wrap' ? (balance > WRAP_GAS_RESERVE ? balance - WRAP_GAS_RESERVE : 0n) : balance;
	const amount = parseAmount(input, 18);
	const insufficient = amount !== null && balance !== undefined && amount > balance;

	const submit = async () => {
		if (!amount) return;
		setPending(true);
		try {
			if (mode === 'wrap') await actions.wrap(amount);
			else await actions.unwrap(amount);
			toast.success(interpolate(w.success, { action: mode === 'wrap' ? w.wrap : w.unwrap, amount: `${showAmount(amount, 18, fmt, 6)} ${symbol}` }));
			setInput('');
		} catch (error) {
			toast.error(w.failed, describeError(error, dict));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="mx-auto max-w-[520px]">
			<Panel title={w.title}>
				<p className="-mt-2 mb-5 text-sm text-muted-foreground">{w.subtitle}</p>
				<div role="tablist" className="mb-4 flex gap-2">
					{(['wrap', 'unwrap'] as const).map((m) => (
						<button
							key={m}
							type="button"
							role="tab"
							aria-selected={m === mode}
							onClick={() => {
								setMode(m);
								setInput('');
							}}
							className={cn(
								'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
								m === mode ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
							)}
						>
							{m === 'wrap' ? w.wrap : w.unwrap}
						</button>
					))}
				</div>
				<AmountField
					id="sklc-amount"
					label={dict.lend.borrow.amount}
					value={input}
					onChange={setInput}
					suffix={symbol}
					hint={
						data && address
							? interpolate(mode === 'wrap' ? w.kmtBalance : w.sklcBalance, { amount: showAmount(balance ?? 0n, 18, fmt) })
							: undefined
					}
					onMax={address && max > 0n ? () => setInput(exactAmount(max, 18)) : undefined}
					error={input.trim() !== '' && !amount ? dict.errors.invalidAmount : insufficient ? interpolate(w.insufficient, { symbol }) : null}
				/>
				{mode === 'wrap' && <p className="mt-2 text-[12px] text-muted-deep">{w.gasReserve}</p>}
				<div className="mt-5">
					{!address ? (
						<ClientOnlyConnectWallet className="w-full" />
					) : (
						<Button className="w-full" disabled={!amount || insufficient || pending} onClick={submit}>
							{pending && <Loader2 className="animate-spin" aria-hidden />}
							{pending ? (mode === 'wrap' ? w.wrapping : w.unwrapping) : mode === 'wrap' ? w.wrap : w.unwrap}
						</Button>
					)}
				</div>
				{data && (
					<p className="mt-4 text-[12.5px] text-muted-foreground">
						{w.supply}: {showAmount(data.supply, 18, fmt, 2)} sKLC
					</p>
				)}
			</Panel>
		</div>
	);
}
