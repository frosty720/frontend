'use client';

import { useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { AmountField } from '@/components/kusd/SavingsPanel';
import { exactAmount, parseAmount, showAmount } from '@/components/kusd/amounts';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { ETH_GAS_RESERVE, STOCK_CURRENCIES, STOCKS_CHAIN_ID, WITHDRAW_DESTINATIONS, type StockCurrency } from '@/config/stocks';
import { useStockWithdraw, useWithdrawQuote, type StockBalances } from '@/hooks/stocks/useStocks';
import { useWallet } from '@/hooks/useWallet';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { withdrawFeesUsd, type WithdrawStage } from '@/lib/stocksWithdraw';
import { cn } from '@/lib/utils';

/**
 * Send USDG or ETH from Robinhood Chain to the same address on another chain, through Relay
 * (lib/stocksWithdraw.ts). The parent remounts it per currency, so a choice never carries over.
 */
export default function StockWithdraw({ currency, balances }: { currency: StockCurrency; balances: StockBalances | undefined }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const t = dict.stocks.withdraw;
	const { address, chainId } = useAccount();
	const { switchChain } = useWallet();
	const withdraw = useStockWithdraw();
	const destinations = WITHDRAW_DESTINATIONS[currency];
	const [index, setIndex] = useState(0);
	const [input, setInput] = useState('');
	const [stage, setStage] = useState<WithdrawStage | null>(null);

	const destination = destinations[index];
	const cur = STOCK_CURRENCIES[currency];
	const amount = parseAmount(input, cur.decimals);
	const quote = useWithdrawQuote(currency, destination, amount, address as `0x${string}` | undefined);
	const balance = balances ? (currency === 'USDG' ? balances.usdg : balances.eth) : undefined;
	// ETH pays the gas too, so Max leaves some behind.
	const max = balance === undefined ? undefined : currency === 'ETH' ? (balance > ETH_GAS_RESERVE ? balance - ETH_GAS_RESERVE : 0n) : balance;
	const wrongChain = Boolean(address) && chainId !== STOCKS_CHAIN_ID;
	const busy = stage !== null;
	const received = quote.data?.details.currencyOut;
	const fees = quote.data ? withdrawFeesUsd(quote.data) : null;

	let problem: string | null = null;
	if (input.trim() !== '' && amount === null) problem = dict.errors.invalidAmount;
	else if (amount !== null && balance !== undefined && amount > balance) problem = interpolate(dict.stocks.trade.insufficient, { symbol: cur.symbol });
	else if (balances && balances.eth === 0n) problem = t.needGas;
	else if (amount !== null && amount > 0n && quote.isError) problem = describeError(quote.error, dict);

	const run = async () => {
		if (!amount) return;
		setStage('quoting');
		try {
			const result = await withdraw({ currency, destination, amount }, setStage);
			const out = result.quote.details.currencyOut;
			toast.success(interpolate(t.success, { amount: `${showAmount(BigInt(out.amount), out.currency.decimals, fmt, 6)} ${out.currency.symbol}`, chain: destination.chain }));
			setInput('');
		} catch (error) {
			toast.error(t.failed, describeError(error, dict));
		} finally {
			setStage(null);
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
			<Button className="w-full" disabled={!amount || Boolean(problem) || !quote.data || busy} onClick={run}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				{stage ? interpolate(t.stages[stage], { symbol: cur.symbol, chain: destination.chain }) : interpolate(t.action, { symbol: cur.symbol })}
			</Button>
		);
	}

	return (
		<div className="mt-4">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{t.to}</span>
				{destinations.map((d, i) => (
					<button
						key={`${d.chainId}:${d.token}`}
						type="button"
						aria-pressed={i === index}
						disabled={busy}
						onClick={() => setIndex(i)}
						className={cn(
							'rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
							i === index ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
						)}
					>
						{interpolate(t.destination, { symbol: d.symbol, chain: d.chain })}
					</button>
				))}
			</div>

			<AmountField
				id="stock-withdraw-amount"
				label={t.amount}
				value={input}
				onChange={setInput}
				suffix={cur.symbol}
				hint={balance !== undefined ? interpolate(t.balance, { amount: `${showAmount(balance, cur.decimals, fmt, 6)} ${cur.symbol}` }) : undefined}
				onMax={address && max !== undefined && max > 0n && !busy ? () => setInput(exactAmount(max, cur.decimals)) : undefined}
			/>

			<div className="my-2 flex justify-center">
				<span className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-hi text-gold">
					<ArrowDown className="size-4" aria-hidden />
				</span>
			</div>

			<div className="rounded-xl border border-line bg-surface-alt p-4">
				<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{t.youReceive}</div>
				<div className="flex items-baseline gap-2">
					<span className="min-w-0 flex-1 truncate text-2xl font-semibold tabular-nums">
						{quote.isFetching && !received ? '…' : received ? showAmount(BigInt(received.amount), received.currency.decimals, fmt, 6) : '0.0'}
					</span>
					<span className="font-display text-lg font-semibold">{destination.symbol}</span>
					<span className="text-[12.5px] text-muted-foreground">{interpolate(t.onChain, { chain: destination.chain })}</span>
				</div>
			</div>

			<dl className="mt-4 space-y-2 text-[13px]">
				<Row label={t.fees} value={fees === null ? '—' : interpolate(t.feesValue, { amount: fmt.usd(fees, { decimals: fees < 1 ? 3 : 2 }) })} />
				<Row
					label={t.arrives}
					value={quote.data?.details.timeEstimate === undefined ? '—' : interpolate(t.arrivesValue, { seconds: quote.data.details.timeEstimate })}
				/>
			</dl>

			{problem && (
				<p role="alert" className="mt-3 text-[12.5px] text-danger">
					{problem}
				</p>
			)}
			<p className="mt-3 text-[12.5px] text-muted-foreground">{interpolate(t.note, { chain: destination.chain })}</p>

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
