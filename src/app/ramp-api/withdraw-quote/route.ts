import { type NextRequest, NextResponse } from 'next/server';
import { isValidUsdAmount } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Quote a cash-out: what the mobile money number receives in local currency, after Yellow Card's fee. */
export async function GET(req: NextRequest) {
	const search = req.nextUrl.searchParams;
	const country = search.get('country') ?? '';
	const currency = search.get('currency') ?? '';
	const usd = search.get('usd') ?? '';
	if (!country || !currency || !isValidUsdAmount(usd)) {
		return NextResponse.json({ error: 'country, currency and usd required' }, { status: 400 });
	}
	const r = await keeperFetch(`/api/withdraw-quote?${new URLSearchParams({ country, currency, usd })}`);
	return NextResponse.json(r.body, { status: r.status });
}
