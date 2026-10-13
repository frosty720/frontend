'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Panel } from '@/components/primitives/Panel';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { exactAmount, parseAmount, showAmount } from '@/components/kusd/amounts';
import {
	ETH_GAS_RESERVE,
	STOCK_CURRENCIES,
	STOCK_SLIPPAGE_BPS,
	STOCKS_CHAIN_ID,
	USDG_MIN_TRADE,
	type StockCurrency,
} from '@/config/stocks';
import { useStockPrice, useStockTrade, type StockBalances } from '@/hooks/stocks/useStocks';
import { useWallet } from '@/hooks/useWallet';
import { describeError } from '@/i18n/errorText';
import type { Formatter } from '@/i18n/format';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import {
	describeFees,
	midPrice,
	pricePerToken,
	tradePair,
	usdDecimals,
	type FeeSummary,
	type StockAsset,
	type StockQuote,
	type TradeSide,
} from '@/lib/stocks';
import type { TradeStage } from '@/lib/stocksTrade';
import { cn } from '@/lib/utils';
import StockDeposit from './StockDeposit';

/** Buy an asset with USDG or ETH, or sell it for either, on Robinhood Chain — or deposit either from another chain. */
export default function StockTradePanel({
	asset,
	quote,
	balances,
}: {
	asset: StockAsset | undefined;
	quote: StockQuote | undefined;
	balances: StockBalances | undefined;
}) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const t = dict.stocks.trade;
	const { address, chainId } = useAccount();
	const { switchChain } = useWallet();
	const trade = useStockTrade();
	const [tab, setTab] = useState<TradeSide | 'deposit'>('buy');
	const side: TradeSide = tab === 'sell' ? 'sell' : 'buy';
	const [currency, setCurrency] = useState<StockCurrency>('USDG');
	const [input, setInput] = useState('');
	const [stage, setStage] = useState<TradeStage | null>(null);

	// A typed amount belongs to one asset, one direction and one currency.
	useEffect(() => setInput(''), [asset?.address, tab, currency]);

	const cur = STOCK_CURRENCIES[currency];
	const held = { symbol: asset?.symbol ?? '', decimals: asset?.decimals ?? 18 };
	const pay = side === 'buy' ? cur : held;
	const receive = side === 'buy' ? held : cur;
	const amount = parseAmount(input, pay.decimals);
	const price = useStockPrice(side, asset, amount, currency);

	if (!asset) {
		return (
			<Panel>
				<div className="flex justify-center py-12 text-muted-foreground">
					<Loader2 className="size-5 animate-spin" aria-label={dict.common.loading} />
				</div>
			</Panel>
		);
	}

	const currencyBalance = balances ? (currency === 'USDG' ? balances.usdg : balances.eth) : undefined;
	const balance = balances ? (side === 'buy' ? currencyBalance : (balances.tokens[asset.address.toLowerCase()] ?? 0n)) : undefined;
	// Paying with ETH also pays the gas, so Max leaves some behind.
	const payingEth = side === 'buy' && currency === 'ETH';
	const max = balance === undefined ? undefined : payingEth ? (balance > ETH_GAS_RESERVE ? balance - ETH_GAS_RESERVE : 0n) : balance;
	const estimate = price.data?.price ?? null;
	const perToken = estimate ? pricePerToken(side, BigInt(estimate.sellAmount), BigInt(estimate.buyAmount), asset.decimals, cur.decimals) : null;
	const fees = estimate ? describeFees(estimate.fees, [asset, cur]) : null;
	const reference = midPrice(quote);
	const wrongChain = Boolean(address) && chainId !== STOCKS_CHAIN_ID;
	const busy = stage !== null;

	let problem: string | null = null;
	if (input.trim() !== '' && amount === null) problem = dict.errors.invalidAmount;
	else if (amount !== null && balance !== undefined && amount > balance) problem = interpolate(t.insufficient, { symbol: pay.symbol });
	else if (amount !== null && amount > 0n && price.isSuccess && price.data.problem === 'belowMinimum') {
		problem = currency === 'USDG' ? interpolate(t.belowMinimumUsdg, { min: USDG_MIN_TRADE }) : t.belowMinimum;
	} else if (amount !== null && amount > 0n && price.isSuccess && price.data.problem === 'noQuote') problem = t.noPrice;

	const run = async () => {
		if (!amount) return;
		const pair = tradePair(side, asset, currency);
		setStage('quoting');
		try {
			const result = await trade({ sellToken: pair.sellToken, buyToken: pair.buyToken, sellAmount: amount }, setStage);
			toast.success(
				interpolate(t.success, {
					from: `${showAmount(BigInt(result.quote.sellAmount), pay.decimals, fmt, 6)} ${pay.symbol}`,
					to: `${showAmount(BigInt(result.quote.buyAmount), receive.decimals, fmt, 6)} ${receive.symbol}`,
				}),
				result.wrapped ? interpolate(t.wrappedNote, { symbol: `w${asset.symbol}` }) : undefined,
			);
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
			toast.error(t.switchChain, describeError(error, dict));
		}
	};

	let action;
	if (!address) {
		action = <ClientOnlyConnectWallet className="w-full" />;
	} else if (wrongChain) {
		action = (
			<Button className="w-full" onClick={switchToRobinhood}>
				{t.switchChain}
			</Button>
		);
	} else if (!amount || problem) {
		action = (
			<Button className="w-full" disabled>
				{t.enterAmount}
			</Button>
		);
	} else {
		action = (
			<Button className="w-full" disabled={busy || balance === undefined} onClick={run}>
				{busy && <Loader2 className="animate-spin" aria-hidden />}
				{stage ? interpolate(t.stages[stage], { symbol: pay.symbol }) : interpolate(side === 'buy' ? t.buyAction : t.sellAction, { symbol: asset.symbol })}
			</Button>
		);
	}

	return (
		<Panel>
			<div className="mb-4 flex items-center gap-3">
				<TokenAvatar symbol={asset.symbol} logoURI={asset.logoURI} size={40} />
				<div className="min-w-0 flex-1">
					<div className="font-display text-lg font-semibold">{asset.symbol}</div>
					<div className="truncate text-[13px] text-muted-foreground">{asset.name}</div>
				</div>
				{reference !== null && <div className="text-lg font-semibold tabular-nums">{fmt.usd(reference, { decimals: usdDecimals(reference) })}</div>}
			</div>

			<div role="tablist" aria-label={t.sideLabel} className="grid grid-cols-3 gap-1 rounded-xl bg-surface-alt p-1">
				{(['buy', 'sell', 'deposit'] as const).map((s) => (
					<button
						key={s}
						type="button"
						role="tab"
						aria-selected={tab === s}
						disabled={busy}
						onClick={() => setTab(s)}
						className={cn(
							'rounded-lg py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
							tab === s ? 'bg-gradient-to-br from-gold-light to-gold text-on-gold' : 'text-muted-foreground hover:text-cream',
						)}
					>
						{t[s]}
					</button>
				))}
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{tab === 'buy' ? t.payWith : t.receiveIn}</span>
				{(Object.keys(STOCK_CURRENCIES) as StockCurrency[]).map((c) => (
					<button
						key={c}
						type="button"
						aria-pressed={currency === c}
						disabled={busy}
						onClick={() => setCurrency(c)}
						className={cn(
							'rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
							currency === c ? 'border-gold bg-gold-soft text-gold' : 'border-line bg-surface-hi text-cream hover:bg-surface-alt',
						)}
					>
						{c}
					</button>
				))}
			</div>

			{tab === 'deposit' ? (
				<StockDeposit currency={currency} />
			) : (
				<>
					<div className="mt-4 rounded-xl border border-line bg-surface-alt p-4">
						<div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
							<label htmlFor="stock-amount" className="font-semibold uppercase tracking-[0.1em] text-muted-deep">
								{side === 'buy' ? t.youPay : t.youSell}
							</label>
							{balance !== undefined && max !== undefined && (
								<span className="flex items-center gap-2">
									{interpolate(t.balance, { amount: `${showAmount(balance, pay.decimals, fmt, 6)} ${pay.symbol}` })}
									<button type="button" disabled={busy} className="font-semibold text-gold hover:underline" onClick={() => setInput(exactAmount(max, pay.decimals))}>
										{t.max}
									</button>
								</span>
							)}
						</div>
						<div className="flex items-center gap-3">
							<Input
								id="stock-amount"
								inputMode="decimal"
								placeholder="0.0"
								value={input}
								disabled={busy}
								aria-invalid={Boolean(problem)}
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
						<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{t.youReceive}</div>
						<div className="flex items-center gap-3">
							<span className="min-w-0 flex-1 truncate text-2xl font-semibold tabular-nums">
								{price.isFetching && !estimate ? '…' : estimate ? showAmount(BigInt(estimate.buyAmount), receive.decimals, fmt, 6) : '0.0'}
							</span>
							<span className="font-display text-lg font-semibold">{receive.symbol}</span>
						</div>
					</div>

					<dl className="mt-4 space-y-2 text-[13px]">
						<Row
							label={t.rate}
							value={
								perToken === null
									? '—'
									: interpolate(t.rateValue, {
											price: fmt.number(perToken, { maximumFractionDigits: currency === 'ETH' ? 8 : 4 }),
											currency: cur.symbol,
											symbol: asset.symbol,
										})
							}
						/>
						<Row label={t.slippage} value={fmt.pct(STOCK_SLIPPAGE_BPS / 100)} />
						<Row label={t.fees} value={fees === null ? '—' : interpolate(t.feesValue, { amount: feeText(fees, fmt) })} />
					</dl>

					{problem && (
						<p role="alert" className="mt-3 text-[12.5px] text-danger">
							{problem}
						</p>
					)}
					{side === 'buy' && currency === 'USDG' && !wrongChain && balances?.usdg === 0n && (
						<p className="mt-3 text-[12.5px] text-muted-foreground">{t.usdgNeeded}</p>
					)}
					{payingEth && <p className="mt-3 text-[12.5px] text-muted-foreground">{t.ethGas}</p>}

					<div className="mt-5">{action}</div>
				</>
			)}
		</Panel>
	);
}

function feeText(fees: FeeSummary, fmt: Formatter): string {
	if (fees.kind === 'usd') return fmt.usd(fees.total, { decimals: fees.total < 1 ? 3 : 2 });
	return fees.parts.map((p) => `${showAmount(p.amount, p.decimals, fmt, 8)} ${p.symbol}`).join(' + ');
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}
