import { NextResponse } from 'next/server';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Yellow Card mobile-money payout corridors, mirrored live by the fiat-ramp keeper. */
export async function GET() {
	const r = await keeperFetch('/api/withdraw-channels');
	return NextResponse.json(r.body, { status: r.status });
}
