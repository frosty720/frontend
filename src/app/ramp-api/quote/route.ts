import { type NextRequest, NextResponse } from 'next/server';
import { isChannelType, isCountryCode, isCurrencyCode, isValidLocalAmount } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';
import { limitRampRequest } from '@/lib/rampRateLimit';

export const dynamic = 'force-dynamic';

/** Quote a local-currency amount; country + channelType are the corridor context YC's fee config needs. */
export async function GET(req: NextRequest) {
	const limited = limitRampRequest(req);
	if (limited) return limited;
	const search = req.nextUrl.searchParams;
	const currency = search.get('currency') ?? '';
	const localAmount = search.get('localAmount') ?? '';
	if (!currency || !localAmount) {
		return NextResponse.json({ error: 'currency and localAmount required' }, { status: 400 });
	}
	const country = search.get('country');
	const channelType = search.get('channelType');
	// Every value reaches Yellow Card's fee config through the keeper: junk must stop here.
	if (!isCurrencyCode(currency)) return NextResponse.json({ error: 'invalid currency' }, { status: 400 });
	if (!isValidLocalAmount(localAmount)) return NextResponse.json({ error: 'invalid localAmount' }, { status: 400 });
	if (country !== null && !isCountryCode(country)) return NextResponse.json({ error: 'invalid country' }, { status: 400 });
	if (channelType !== null && !isChannelType(channelType)) return NextResponse.json({ error: 'invalid channelType' }, { status: 400 });
	const params = new URLSearchParams({ currency, localAmount: localAmount.trim() });
	if (country) params.set('country', country);
	if (channelType) params.set('channelType', channelType);
	const r = await keeperFetch(`/api/quote?${params}`);
	return NextResponse.json(r.body, { status: r.status });
}
