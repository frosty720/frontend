import { type NextRequest, NextResponse } from 'next/server';
import { isEvmAddress, isValidLocalAmount } from '@/lib/ramp';
import { keeperFetch, rampReturnUrl } from '@/lib/rampServer';

export const dynamic = 'force-dynamic';

/**
 * Create a fiat deposit. Thin validation here (fast 400s for obviously bad input); the keeper
 * re-validates everything authoritatively.
 */
export async function POST(req: NextRequest) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: 'invalid json' }, { status: 400 });
	}
	// `null` and other non-object payloads parse as valid JSON — reject them here instead of
	// throwing on the property reads below.
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		return NextResponse.json({ error: 'invalid body' }, { status: 400 });
	}
	const fields = body as Record<string, unknown>;
	if (typeof fields.userWallet !== 'string' || !isEvmAddress(fields.userWallet)) {
		return NextResponse.json({ error: 'invalid userWallet' }, { status: 400 });
	}
	if (typeof fields.localAmount !== 'string' || !isValidLocalAmount(fields.localAmount)) {
		return NextResponse.json({ error: 'invalid localAmount' }, { status: 400 });
	}
	// The return page is chosen here from the buyer's locale, never taken from the browser.
	const { locale, ...deposit } = fields;
	const r = await keeperFetch('/api/deposits', { method: 'POST', body: { ...deposit, redirectUrl: rampReturnUrl(locale) } });
	return NextResponse.json(r.body, { status: r.status });
}
