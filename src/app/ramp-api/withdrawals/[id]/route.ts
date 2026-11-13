import { type NextRequest, NextResponse } from 'next/server';
import { isRampWithdrawalId } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';
import { limitRampRequest } from '@/lib/rampRateLimit';

export const dynamic = 'force-dynamic';

/** Cash-out payout status, polled after the transfer. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const limited = limitRampRequest(req);
	if (limited) return limited;
	const { id } = await ctx.params;
	if (!isRampWithdrawalId(id)) {
		return NextResponse.json({ error: 'invalid id' }, { status: 400 });
	}
	const r = await keeperFetch(`/api/withdrawals/${encodeURIComponent(id)}`);
	return NextResponse.json(r.body, { status: r.status });
}
