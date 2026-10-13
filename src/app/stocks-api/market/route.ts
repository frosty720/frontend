import { NextResponse } from 'next/server';
import { stocksMarket } from '@/lib/stocksServer';

export const dynamic = 'force-dynamic';

/** Logos and live prices for the Stocks list: Robinhood's for the stock tokens, GeckoTerminal's for the memes. */
export async function GET() {
	const r = await stocksMarket();
	return NextResponse.json(r.body, { status: r.status });
}
