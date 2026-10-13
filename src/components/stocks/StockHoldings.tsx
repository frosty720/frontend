'use client';

import { formatUnits } from 'viem';
import { Panel } from '@/components/primitives/Panel';
import { Pill } from '@/components/primitives/Pill';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { showAmount } from '@/components/kusd/amounts';
import { USDG } from '@/config/stocks';
import type { StockBalances } from '@/hooks/stocks/useStocks';
import { useDict, useFormat } from '@/i18n/hooks';
import { midPrice, usdDecimals, type StockAsset, type StockQuote } from '@/lib/stocks';

interface Holding {
	key: string;
	asset: StockAsset;
	amount: bigint;
	/** A `wXXX` placeholder the maker has not settled to the real token yet. */
	settling: boolean;
}

/** Every non-zero position, settling placeholders included, built from one balance read. */
export function holdingsOf(assets: readonly StockAsset[], balances: StockBalances): Holding[] {
	const out: Holding[] = [];
	for (const asset of assets) {
		const key = asset.address.toLowerCase();
		const held = balances.tokens[key] ?? 0n;
		const settling = balances.wrapped[key] ?? 0n;
		if (held > 0n) out.push({ key, asset, amount: held, settling: false });
		if (settling > 0n) out.push({ key: `w${key}`, asset, amount: settling, settling: true });
	}
	return out;
}

/** The wallet's USDG, ETH and stock-token positions on Robinhood Chain. */
export default function StockHoldings({
	assets,
	prices,
	balances,
	onSelect,
}: {
	assets: readonly StockAsset[];
	prices: Record<string, StockQuote>;
	balances: StockBalances | undefined;
	onSelect: (asset: StockAsset) => void;
}) {
	const dict = useDict();
	const fmt = useFormat();
	const t = dict.stocks.holdings;
	if (!balances) return null;

	const holdings = holdingsOf(assets, balances);

	return (
		<Panel title={t.title}>
			<div className="mb-3 space-y-2 text-sm">
				{[
					{ symbol: USDG.symbol, logo: USDG.logoURI, amount: balances.usdg, decimals: USDG.decimals, digits: 2 },
					{ symbol: 'ETH', logo: '/tokens/eth.png', amount: balances.eth, decimals: 18, digits: 6 },
				].map((c) => (
					<div key={c.symbol} className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-2">
							<TokenAvatar symbol={c.symbol} logoURI={c.logo} size={28} />
							<span className="font-semibold">{c.symbol}</span>
						</span>
						<span className="font-semibold tabular-nums">{showAmount(c.amount, c.decimals, fmt, c.digits)}</span>
					</div>
				))}
			</div>
			{holdings.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t.empty}</p>
			) : (
				<ul className="-mx-2">
					{holdings.map(({ key, asset, amount, settling }) => {
						const price = midPrice(prices[asset.address.toLowerCase()]);
						const value = price === null ? null : Number(formatUnits(amount, asset.decimals)) * price;
						return (
							<li key={key}>
								<button
									type="button"
									onClick={() => onSelect(asset)}
									className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-alt"
								>
									<TokenAvatar symbol={asset.symbol} logoURI={asset.logoURI} size={28} />
									<span className="min-w-0 flex-1">
										<span className="flex flex-wrap items-center gap-1.5 font-semibold">
											{settling ? `w${asset.symbol}` : asset.symbol}
											{settling && <Pill tone="info">{t.settling}</Pill>}
										</span>
										<span className="block text-[12.5px] text-muted-foreground tabular-nums">{showAmount(amount, asset.decimals, fmt, 6)}</span>
									</span>
									<span className="shrink-0 text-sm font-semibold tabular-nums">{value === null ? '—' : fmt.usd(value, { decimals: usdDecimals(value) })}</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}
