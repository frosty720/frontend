/**
 * Every /ramp-api/* route shares one limiter (ported from Yasukey): PER_IP_LIMIT requests a minute
 * per visitor (nginx's X-Real-IP) and TOTAL_LIMIT a minute in total, answered with 429 and Retry-After.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
import { clientIp, createRateLimiter, PER_IP_LIMIT, resetRampRateLimit } from '@/lib/rampRateLimit';
import { GET as channels } from '../channels/route';
import { GET as capacity } from '../cashout-capacity/route';
import { GET as quote } from '../quote/route';
import { GET as getDeposit } from '../deposits/[id]/route';
import { GET as getWithdrawal } from '../withdrawals/[id]/route';
import { GET as withdrawChannels } from '../withdraw-channels/route';
import { GET as withdrawQuote } from '../withdraw-quote/route';
import { POST as createDeposit } from '../deposits/route';
import { POST as createWithdrawal } from '../withdrawals/route';

const from = (ip: string, path = '/ramp-api/channels') => new NextRequest(`http://localhost${path}`, { headers: { 'x-real-ip': ip } });
const keeper = vi.fn(async () => new Response('{}', { status: 200 }));

beforeEach(() => {
	process.env.RAMP_KEEPER_API_KEY = 'test-keeper-key-0123456789';
	keeper.mockClear();
	vi.stubGlobal('fetch', keeper);
	resetRampRateLimit();
});
afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.RAMP_KEEPER_API_KEY;
});

describe('per-visitor limit through a route', () => {
	it('lets PER_IP_LIMIT requests a minute through, then answers 429 with Retry-After and no keeper call', async () => {
		for (let i = 0; i < PER_IP_LIMIT; i++) expect((await channels(from('203.0.113.1'))).status).toBe(200);
		const res = await channels(from('203.0.113.1'));
		expect(res.status).toBe(429);
		expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
		expect(Number(res.headers.get('retry-after'))).toBeLessThanOrEqual(60);
		expect(await res.json()).toEqual({ error: 'rate_limited' });
		expect(keeper).toHaveBeenCalledTimes(PER_IP_LIMIT);
	});

	it('counts all routes together and leaves other visitors alone', async () => {
		for (let i = 0; i < PER_IP_LIMIT; i++) await quote(from('203.0.113.1', '/ramp-api/quote?currency=XOF&localAmount=5000'));
		expect((await withdrawChannels(from('203.0.113.1'))).status).toBe(429);
		expect((await channels(from('203.0.113.2'))).status).toBe(200);
	});

	it.each([
		['channels', (r: NextRequest) => channels(r)],
		['withdraw-channels', (r: NextRequest) => withdrawChannels(r)],
		['cashout-capacity', (r: NextRequest) => capacity(r)],
		['quote', (r: NextRequest) => quote(r)],
		['withdraw-quote', (r: NextRequest) => withdrawQuote(r)],
		['deposit status', (r: NextRequest) => getDeposit(r, { params: Promise.resolve({ id: 'fe2fea2f-1c2d' }) })],
		['withdrawal status', (r: NextRequest) => getWithdrawal(r, { params: Promise.resolve({ id: 'fe2fea2f-1c2d' }) })],
		['create deposit', (r: NextRequest) => createDeposit(r)],
		['create withdrawal', (r: NextRequest) => createWithdrawal(r)],
	])('%s answers 429 for a blocked visitor', async (_name, call) => {
		for (let i = 0; i < PER_IP_LIMIT; i++) await channels(from('203.0.113.9'));
		expect((await call(from('203.0.113.9'))).status).toBe(429);
	});
});

describe('createRateLimiter', () => {
	it('trips the total cap whatever the IP, and does not count refused requests', () => {
		const limiter = createRateLimiter(20, 300, 60_000, () => 0);
		for (let i = 0; i < 300; i++) expect(limiter.check(`10.0.${Math.floor(i / 20)}.1`), String(i)).toBeNull();
		expect(limiter.check('10.9.9.9')).not.toBeNull();
		expect(limiter.check('10.0.0.1')).not.toBeNull();
	});

	it('resets when the window ends, with Retry-After counting down to it', () => {
		let now = 1_000;
		const limiter = createRateLimiter(2, 5, 60_000, () => now);
		expect(limiter.check('a')).toBeNull();
		expect(limiter.check('a')).toBeNull();
		expect(limiter.check('a')).toBe(60);
		now = 31_500;
		expect(limiter.check('a')).toBe(30);
		now = 60_999;
		expect(limiter.check('a')).toBe(1);
		now = 61_000;
		expect(limiter.check('a')).toBeNull();
	});

	it('does not charge the IP for a request the total cap refused', () => {
		const limiter = createRateLimiter(2, 2, 60_000, () => 0);
		limiter.check('a');
		limiter.check('b');
		expect(limiter.check('c')).not.toBeNull();
		limiter.reset();
		expect(limiter.check('c')).toBeNull();
	});
});

describe('clientIp', () => {
	const headers = (h: Record<string, string>) => new Request('http://localhost', { headers: h });
	it('uses the X-Real-IP our nginx sets, never the client-supplied X-Forwarded-For', () => {
		expect(clientIp(headers({ 'x-real-ip': '198.51.100.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('198.51.100.8');
		expect(clientIp(headers({ 'x-forwarded-for': '1.1.1.1' }))).toBe('unknown');
		expect(clientIp(headers({}))).toBe('unknown');
	});
});
