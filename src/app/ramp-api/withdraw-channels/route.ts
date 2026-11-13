import { NextResponse } from 'next/server';
import { keeperFetch } from '@/lib/rampServer';
import { limitRampRequest } from '@/lib/rampRateLimit';

export const dynamic = 'force-dynamic';

/** Yellow Card mobile-money payout corridors, mirrored live by the fiat-ramp keeper. */
export async function GET(req: Request) {
	const limited = limitRampRequest(req);
	if (limited) return limited;
	const r = await keeperFetch('/api/withdraw-channels');
	return NextResponse.json(r.body, { status: r.status });
}
