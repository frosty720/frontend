'use client';

import { PageHeader } from '@/components/primitives/PageHeader';
import StocksMarket from '@/components/stocks/StocksMarket';
import { useDict } from '@/i18n/hooks';

/** Tokenized US stocks and ETFs on Robinhood Chain, traded spot through Arcus and paid in USDG. */
export default function StocksPage() {
	const dict = useDict();
	return (
		<>
			<PageHeader title={dict.pages.stocks.title} subtitle={dict.pages.stocks.subtitle} />
			<StocksMarket />
		</>
	);
}
