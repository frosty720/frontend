'use client';

import { useCallback, useState } from 'react';
import { useChainId } from 'wagmi';
import { CreditCard } from 'lucide-react';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import SwapInterfaceWrapper from '@/components/swap/SwapInterfaceWrapper';
import SwapRoutePanel from '@/components/swap/SwapRoutePanel';
import PairStatsPanel from '@/components/swap/PairStatsPanel';
import RecentSwapsPanel from '@/components/swap/RecentSwapsPanel';
import { AlchemyPayWidget } from '@/components/onramp';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePairMarketStats } from '@/hooks';
import { PriceDataProvider } from '@/contexts/PriceDataContext';
import { useTokenLists } from '@/hooks/useTokenLists';
import { useDict } from '@/i18n/hooks';

interface Pair {
	from: Token | null;
	to: Token | null;
}

/** Swap page, laid out like the reference: swap card left, optimal route + recent swaps right. */
export default function SwapsPage() {
	// usePairMarketStats reads this context, so it has to wrap the page even without the chart.
	return (
		<PriceDataProvider>
			<SwapsPageContent />
		</PriceDataProvider>
	);
}

function SwapsPageContent() {
	const dict = useDict();
	const chainId = useChainId() || CHAIN_IDS.KALYCHAIN;
	const { tokens } = useTokenLists({ chainId });
	const [pair, setPair] = useState<Pair>({ from: null, to: null });
	const [route, setRoute] = useState<string[] | null>(null);
	const [buyOpen, setBuyOpen] = useState(false);

	// Stable: the swap card re-runs effects when this identity changes.
	const handleTokenChange = useCallback((from: Token | null, to: Token | null) => setPair({ from, to }), []);
	const {
		pairAddress,
		price: pairPrice,
		volume24h: pairVolume24h,
		liquidity: pairLiquidity,
		isLoading: pairStatsLoading,
		error: pairStatsError,
	} = usePairMarketStats(pair.from ?? undefined, pair.to ?? undefined);

	return (
		<>
			<PageHeader title={dict.pages.swap.title} subtitle={dict.pages.swap.subtitle} />
			<div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,520px)_minmax(0,530px)] xl:justify-between">
				<div className="min-w-0">
					<SwapInterfaceWrapper onTokenChange={handleTokenChange} onQuoteChange={setRoute} />
					<button
						type="button"
						onClick={() => setBuyOpen(true)}
						className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gold transition-colors hover:text-gold-light"
					>
						<CreditCard className="size-4" />
						{dict.swap.buyWithCard}
					</button>
				</div>
				<div className="min-w-0 space-y-5">
					<SwapRoutePanel fromToken={pair.from} toToken={pair.to} route={route} tokens={tokens} />
					<PairStatsPanel
						fromToken={pair.from}
						toToken={pair.to}
						chainId={chainId}
						price={pairPrice}
						volume24h={pairVolume24h}
						liquidity={pairLiquidity}
						isLoading={pairStatsLoading}
						error={pairStatsError}
					/>
					<RecentSwapsPanel pairAddress={pairAddress} chainId={chainId} />
				</div>
			</div>

			<Dialog open={buyOpen} onOpenChange={setBuyOpen}>
				<DialogContent className="max-w-[560px] border-line bg-surface">
					<DialogHeader>
						<DialogTitle>{dict.swap.buyWithCard}</DialogTitle>
					</DialogHeader>
					<AlchemyPayWidget defaultFiat="USD" defaultCrypto="KMT" defaultNetwork="KALYCHAIN" height={560} />
				</DialogContent>
			</Dialog>
		</>
	);
}
