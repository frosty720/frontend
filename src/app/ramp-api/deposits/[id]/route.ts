import { type NextRequest, NextResponse } from 'next/server';
import { isRampDepositId } from '@/lib/ramp';
import { keeperFetch } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/** Deposit status, polled by the pay screen. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	if (!isRampDepositId(id)) {
		return NextResponse.json({ error: 'invalid id' }, { status: 400 });
	}
	const r = await keeperFetch(`/api/deposits/${encodeURIComponent(id)}`);
	return NextResponse.json(r.body, { status: r.status });
}
