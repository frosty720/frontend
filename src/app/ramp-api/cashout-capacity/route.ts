import { NextResponse } from 'next/server';
import { cashoutCapacity } from '@/lib/polygonServer';

export const dynamic = 'force-dynamic';

/**
 * The USDT the bridge's Polygon router holds: the most a cash-out can release. Read through the paid
 * RPC and cached server-side; a failure says only "unavailable" (the RPC URL carries the key).
 */
export async function GET() {
	try {
		return NextResponse.json({ collateral: (await cashoutCapacity()).toString() });
	} catch {
		return NextResponse.json({ error: 'unavailable' }, { status: 503 });
	}
}
