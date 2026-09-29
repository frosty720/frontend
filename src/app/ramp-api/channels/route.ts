import { NextResponse } from 'next/server';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Yellow Card deposit corridors, mirrored live by the fiat-ramp keeper. */
export async function GET() {
	const r = await keeperFetch('/api/channels');
	return NextResponse.json(r.body, { status: r.status });
}
