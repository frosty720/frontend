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
import { ETH_GAS_RESERVE, ROBINHOOD_WETH, STOCKS_CHAIN_ID } from '@/config/stocks';
import { useStockWrap, type StockBalances } from '@/hooks/stocks/useStocks';
import { useWallet } from '@/hooks/useWallet';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import type { WrapMode } from '@/lib/stocksWrap';
import { cn } from '@/lib/utils';

/** ETH ⇄ WETH on Robinhood Chain, 1:1 through the WETH contract (the Lend page's wrap card, for ETH). */
export default function StockWrapPanel({ balances }: { balances: StockBalances | undefined }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const w = dict.stocks.wrap;
	const { address, chainId } = useAccount();
	const { switchChain } = useWallet();
	const wrap = useStockWrap();
	const [mode, setMode] = useState<WrapMode>('wrap');
	const [input, setInput] = useState('');
	const [pending, setPending] = useState(false);

	const symbol = mode === 'wrap' ? 'ETH' : 'WETH';
	const balance = balances ? (mode === 'wrap' ? balances.eth : (balances.tokens[ROBINHOOD_WETH.toLowerCase()] ?? 0n)) : undefined;
	// Wrapping spends the gas token itself, so Max leaves some for gas.
	const max = balance === undefined ? 0n : mode === 'wrap' ? (balance > ETH_GAS_RESERVE ? balance - ETH_GAS_RESERVE : 0n) : balance;
	const amount = parseAmount(input, 18);
	const insufficient = amount !== null && balance !== undefined && amount > balance;
	const wrongChain = Boolean(address) && chainId !== STOCKS_CHAIN_ID;

	const submit = async () => {
		if (!amount) return;
		setPending(true);
		try {
			await wrap(mode, amount);
			toast.success(interpolate(mode === 'wrap' ? w.wrapped : w.unwrapped, { amount: showAmount(amount, 18, fmt, 6) }));
			setInput('');
		} catch (error) {
			toast.error(w.failed, describeError(error, dict));
		} finally {
			setPending(false);
		}
	};

	const switchToRobinhood = async () => {
		try {
			await switchChain(STOCKS_CHAIN_ID);
		} catch (error) {
			toast.error(dict.stocks.trade.switchChain, describeError(error, dict));
		}
	};

	let action;
	if (!address) {
		action = <ClientOnlyConnectWallet className="w-full" />;
	} else if (wrongChain) {
		action = (
			<Button className="w-full" onClick={switchToRobinhood}>
				{dict.stocks.trade.switchChain}
			</Button>
		);
	} else {
		action = (
			<Button className="w-full" disabled={!amount || insufficient || pending} onClick={submit}>
				{pending && <Loader2 className="animate-spin" aria-hidden />}
				{pending ? (mode === 'wrap' ? w.wrapping : w.unwrapping) : mode === 'wrap' ? w.wrapAction : w.unwrapAction}
			</Button>
		);
	}

	return (
		<Panel title={w.title}>
			<p className="-mt-2 mb-4 text-sm text-muted-foreground">{w.subtitle}</p>
			<div role="tablist" className="mb-4 flex gap-2">
				{(['wrap', 'unwrap'] as const).map((m) => (
					<button
						key={m}
						type="button"
						role="tab"
						aria-selected={m === mode}
						disabled={pending}
						onClick={() => {
							setMode(m);
							setInput('');
						}}
						className={cn(
							'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
							m === mode ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
						)}
					>
						{w[m]}
					</button>
				))}
			</div>
			<AmountField
				id="stock-wrap-amount"
				label={w.amount}
				value={input}
				onChange={setInput}
				suffix={symbol}
				hint={balance !== undefined ? interpolate(w.balance, { amount: `${showAmount(balance, 18, fmt, 6)} ${symbol}` }) : undefined}
				onMax={address && max > 0n ? () => setInput(exactAmount(max, 18)) : undefined}
				error={input.trim() !== '' && amount === null ? dict.errors.invalidAmount : insufficient ? interpolate(dict.stocks.trade.insufficient, { symbol }) : null}
			/>
			{mode === 'wrap' && (
				<p className="mt-2 text-[12px] text-muted-deep">{interpolate(w.gasReserve, { amount: showAmount(ETH_GAS_RESERVE, 18, fmt, 6) })}</p>
			)}
			<div className="mt-5">{action}</div>
		</Panel>
	);
}
