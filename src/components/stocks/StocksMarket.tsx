'use client';

import { useRef, useState } from 'react';
import type { Hex } from 'viem';
import { useAccount } from 'wagmi';
import { useStockAssets, useStockBalances } from '@/hooks/stocks/useStocks';
import { useDict } from '@/i18n/hooks';
import type { StockAsset } from '@/lib/stocks';
import StockHoldings from './StockHoldings';
import StockList from './StockList';
import StockTradePanel from './StockTradePanel';
import StockWrapPanel from './StockWrapPanel';

/** The Stocks page body: market list beside the trade ticket and the wallet's holdings. */
export default function StocksMarket() {
	const dict = useDict();
	const { address } = useAccount();
	const { assets, prices, isLoading, isError, refetch } = useStockAssets();
	const balances = useStockBalances(address, assets);
	const [selected, setSelected] = useState<Hex | null>(null);
	const ticketRef = useRef<HTMLDivElement>(null);

	// Default to the router's first stock (it lists the most traded first).
	const asset = assets?.find((a) => a.address === selected) ?? assets?.find((a) => a.group === 'stock') ?? assets?.[0];

	const select = (next: StockAsset) => {
		setSelected(next.address);
		// On a phone the ticket sits above the list, out of view after scrolling it.
		if (window.matchMedia('(max-width: 1023px)').matches) ticketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	return (
		<>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
				<div className="order-2 min-w-0 lg:order-1">
					<StockList
						assets={assets}
						prices={prices}
						selected={asset?.address}
						onSelect={select}
						loading={isLoading}
						failed={isError}
						onRetry={() => void refetch()}
					/>
				</div>
				<div ref={ticketRef} className="order-1 min-w-0 scroll-mt-4 space-y-6 lg:order-2">
					<StockTradePanel asset={asset} quote={asset ? prices[asset.address.toLowerCase()] : undefined} balances={balances.data} />
					<StockWrapPanel balances={balances.data} />
					{address && assets && <StockHoldings assets={assets} prices={prices} balances={balances.data} onSelect={select} />}
				</div>
			</div>
			<p className="mt-6 text-[12px] text-muted-foreground">{dict.stocks.disclaimer}</p>
		</>
	);
}
