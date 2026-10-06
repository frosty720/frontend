import { type NextRequest, NextResponse } from 'next/server';
import { isEvmAddress, isValidUsdAmount } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/**
 * Create a mobile-money cash-out (the keeper opens the Yellow Card payout). Thin validation here (fast
 * 400s for obviously bad input); the keeper re-validates everything authoritatively.
 */
export async function POST(req: NextRequest) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: 'invalid json' }, { status: 400 });
	}
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		return NextResponse.json({ error: 'invalid body' }, { status: 400 });
	}
	const fields = body as Record<string, unknown>;
	if (typeof fields.userWallet !== 'string' || !isEvmAddress(fields.userWallet)) {
		return NextResponse.json({ error: 'invalid userWallet' }, { status: 400 });
	}
	if (typeof fields.usdAmount !== 'string' || !isValidUsdAmount(fields.usdAmount)) {
		return NextResponse.json({ error: 'invalid usdAmount' }, { status: 400 });
	}
	const r = await keeperFetch('/api/withdrawals', { method: 'POST', body: fields });
	return NextResponse.json(r.body, { status: r.status });
}
