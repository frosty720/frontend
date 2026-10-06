import { type NextRequest, NextResponse } from 'next/server';
import { isRampWithdrawalId } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Cash-out payout status, polled after the transfer. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	if (!isRampWithdrawalId(id)) {
		return NextResponse.json({ error: 'invalid id' }, { status: 400 });
	}
	const r = await keeperFetch(`/api/withdrawals/${encodeURIComponent(id)}`);
	return NextResponse.json(r.body, { status: r.status });
}
