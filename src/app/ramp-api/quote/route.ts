import { type NextRequest, NextResponse } from 'next/server';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Quote a local-currency amount; country + channelType are the corridor context YC's fee config needs. */
export async function GET(req: NextRequest) {
	const search = req.nextUrl.searchParams;
	const currency = search.get('currency') ?? '';
	const localAmount = search.get('localAmount') ?? '';
	if (!currency || !localAmount) {
		return NextResponse.json({ error: 'currency and localAmount required' }, { status: 400 });
	}
	const params = new URLSearchParams({ currency, localAmount });
	const country = search.get('country');
	const channelType = search.get('channelType');
	if (country) params.set('country', country);
	if (channelType) params.set('channelType', channelType);
	const r = await keeperFetch(`/api/quote?${params}`);
	return NextResponse.json(r.body, { status: r.status });
}
