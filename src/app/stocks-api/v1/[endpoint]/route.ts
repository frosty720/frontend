import { type NextRequest, NextResponse } from 'next/server';
import { arcusFetch, arcusTokens } from '@/lib/stocksServer';

export const dynamic = 'force-dynamic';

/**
 * Proxy for the Arcus Spot Router, shaped like the router itself (/v1/<endpoint>) so the Arcus SDK
 * client works unchanged against this site. Only the endpoints the Stocks page calls are forwarded.
 */
const GET_ENDPOINTS = new Set(['price', 'quote']);
const MAX_QUERY = 2_048;
const MAX_SUBMIT_BYTES = 64 * 1024;

type Ctx = { params: Promise<{ endpoint: string }> };

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET(req: NextRequest, ctx: Ctx) {
	const { endpoint } = await ctx.params;
	if (endpoint === 'tokens') {
		const r = await arcusTokens();
		return NextResponse.json(r.body, { status: r.status });
	}
	if (!GET_ENDPOINTS.has(endpoint)) return notFound();
	const search = req.nextUrl.search;
	if (search.length > MAX_QUERY) return NextResponse.json({ error: 'query too long' }, { status: 414 });
	const r = await arcusFetch(`/v1/${endpoint}${search}`);
	return NextResponse.json(r.body, { status: r.status });
}

/** The signed trade. Forwarded byte-for-byte: the router verifies the user's signature over it. */
export async function POST(req: NextRequest, ctx: Ctx) {
	const { endpoint } = await ctx.params;
	if (endpoint !== 'submit') return notFound();
	const body = await req.text();
	if (body.length > MAX_SUBMIT_BYTES) return NextResponse.json({ error: 'body too large' }, { status: 413 });
	try {
		JSON.parse(body);
	} catch {
		return NextResponse.json({ error: 'invalid json' }, { status: 400 });
	}
	const r = await arcusFetch('/v1/submit', { method: 'POST', body });
	return NextResponse.json(r.body, { status: r.status });
}
