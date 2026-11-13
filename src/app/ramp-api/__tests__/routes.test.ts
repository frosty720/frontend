/**
 * The /ramp-api/* proxy holds the keeper API key: it must attach it server-side, never echo it,
 * refuse obviously bad input before it reaches the keeper, and report an unreachable keeper as an
 * unknown outcome (504 keeper_unreachable) so the browser keeps its idempotency key.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The incoming request's headers as nginx passed them (it sets X-Real-IP to the visitor's address).
let incoming = new Headers();
vi.mock('next/headers', () => ({ headers: async () => incoming }));
import { GET as channels } from '../channels/route';
import { GET as quote } from '../quote/route';
import { POST as createDeposit } from '../deposits/route';
import { GET as getDeposit } from '../deposits/[id]/route';
import { GET as withdrawChannels } from '../withdraw-channels/route';
import { GET as withdrawQuote } from '../withdraw-quote/route';
import { POST as createWithdrawal } from '../withdrawals/route';
import { GET as getWithdrawal } from '../withdrawals/[id]/route';
import { resetRampRateLimit } from '@/lib/rampRateLimit';

const KEY = 'test-keeper-key-0123456789';
const KEEPER = 'https://keeper.test';
const WALLET = '0xfF409DBD66bD013385c41cb55D8cD90902BB4c80';

const keeper = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));

beforeEach(() => {
	process.env.RAMP_KEEPER_API_KEY = KEY;
	process.env.RAMP_KEEPER_URL = KEEPER;
	keeper.mockClear();
	vi.stubGlobal('fetch', keeper);
	incoming = new Headers();
	resetRampRateLimit();
});
afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.RAMP_KEEPER_API_KEY;
	delete process.env.RAMP_KEEPER_URL;
});

const req = (path: string, init?: { method?: string; body?: string }) => new NextRequest(`http://localhost${path}`, init);
const lastCall = () => keeper.mock.calls.at(-1) as [string, RequestInit];

describe('keeper forwarding', () => {
	it('attaches the bearer key server-side and passes status + body through', async () => {
		keeper.mockResolvedValueOnce(new Response(JSON.stringify({ corridors: [{ channelId: 'c1' }] }), { status: 200 }));
		const res = await channels(req('/ramp-api/channels'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ corridors: [{ channelId: 'c1' }] });
		const [url, init] = lastCall();
		expect(url).toBe(`${KEEPER}/api/channels`);
		expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
	});

	it('names the visitor nginx saw, so the keeper limits each visitor separately', async () => {
		incoming = new Headers({ 'x-real-ip': '203.0.113.7' });
		await channels(req('/ramp-api/channels'));
		expect((lastCall()[1].headers as Record<string, string>)['x-ramp-client-ip']).toBe('203.0.113.7');
	});

	it('names no visitor when nginx passed none', async () => {
		await channels(req('/ramp-api/channels'));
		expect(lastCall()[1].headers as Record<string, string>).not.toHaveProperty('x-ramp-client-ip');
	});

	// #9: the old version could not fail (the mocked keeper reply never held the key). Here the keeper
	// echoes the key in its headers and a cookie: none of it may reach the browser, on any route.
	it('never puts the key in any response, whatever the keeper replies, and forwards no keeper header', async () => {
		const calls: Array<[string, () => Promise<Response>]> = [
			['channels', () => channels(req('/ramp-api/channels'))],
			['quote', () => quote(req('/ramp-api/quote?currency=XOF&localAmount=5000'))],
			['withdraw-channels', () => withdrawChannels(req('/ramp-api/withdraw-channels'))],
			['withdraw-quote', () => withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF&usd=25'))],
			['deposit', () => getDeposit(req('/ramp-api/deposits/fe2fea2f-1c2d'), { params: Promise.resolve({ id: 'fe2fea2f-1c2d' }) })],
			['withdrawal', () => getWithdrawal(req('/ramp-api/withdrawals/6f1c2d3e-4a5b'), { params: Promise.resolve({ id: '6f1c2d3e-4a5b' }) })],
			['create deposit', () => createDeposit(req('/ramp-api/deposits', { method: 'POST', body: JSON.stringify({ userWallet: WALLET, localAmount: '5000' }) }))],
			['create withdrawal', () => createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body: JSON.stringify({ userWallet: WALLET, usdAmount: '25' }) }))],
		];
		for (const [name, call] of calls) {
			keeper.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'x-echo': `Bearer ${KEY}`, 'set-cookie': `k=${KEY}` } }));
			const res = await call();
			expect(res.status, name).toBe(401);
			expect(JSON.stringify(await res.json()), name).not.toContain(KEY);
			expect(JSON.stringify([...res.headers.entries()]), name).not.toContain(KEY);
			expect(res.headers.get('set-cookie'), name).toBeNull();
		}
		expect(keeper).toHaveBeenCalledTimes(calls.length);
	});

	it('answers 503 without calling out when the key is not configured', async () => {
		delete process.env.RAMP_KEEPER_API_KEY;
		const res = await channels(req('/ramp-api/channels'));
		expect(res.status).toBe(503);
		expect(keeper).not.toHaveBeenCalled();
	});

	it('reports an unreachable keeper as 504 keeper_unreachable (outcome unknown)', async () => {
		keeper.mockRejectedValueOnce(new TypeError('fetch failed'));
		const res = await createDeposit(req('/ramp-api/deposits', { method: 'POST', body: JSON.stringify({ userWallet: WALLET, localAmount: '5000' }) }));
		expect(res.status).toBe(504);
		expect(await res.json()).toEqual({ error: 'keeper_unreachable' });
	});

	it('maps a non-JSON keeper reply to a JSON error instead of crashing', async () => {
		keeper.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
		const res = await channels(req('/ramp-api/channels'));
		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'bad keeper response' });
	});
});

describe('quote', () => {
	it('requires currency and localAmount', async () => {
		expect((await quote(req('/ramp-api/quote?currency=XOF'))).status).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
	});
	// #8: every value reaches Yellow Card's fee config through the keeper, so junk stops here.
	it('refuses a malformed currency, amount, country or channel type without calling the keeper', async () => {
		for (const q of [
			'currency=xof&localAmount=5000',
			'currency=XOFF&localAmount=5000',
			'currency=XOF&localAmount=abc',
			'currency=XOF&localAmount=-5',
			'currency=XOF&localAmount=5000&country=CIV',
			'currency=XOF&localAmount=5000&country=ci',
			'currency=XOF&localAmount=5000&channelType=card',
		]) {
			expect((await quote(req(`/ramp-api/quote?${q}`))).status, q).toBe(400);
		}
		expect(keeper).not.toHaveBeenCalled();
		for (const channelType of ['momo', 'bank', 'p2p']) {
			expect((await quote(req(`/ramp-api/quote?currency=XOF&localAmount=5000&country=CI&channelType=${channelType}`))).status, channelType).toBe(200);
		}
	});
	it('forwards the corridor context', async () => {
		await quote(req('/ramp-api/quote?currency=XOF&localAmount=6000&country=CI&channelType=momo&evil=1'));
		const [url] = lastCall();
		expect(url).toBe(`${KEEPER}/api/quote?currency=XOF&localAmount=6000&country=CI&channelType=momo`);
	});
});

describe('create deposit', () => {
	const post = (body: string) => createDeposit(req('/ramp-api/deposits', { method: 'POST', body }));

	it('rejects malformed JSON, null, arrays and bad fields before reaching the keeper', async () => {
		for (const body of ['{nope', 'null', '[]', JSON.stringify({ userWallet: '0x123', localAmount: '5000' }), JSON.stringify({ userWallet: WALLET, localAmount: '-1' })]) {
			expect((await post(body)).status, body).toBe(400);
		}
		expect(keeper).not.toHaveBeenCalled();
	});
	// #10: the checks trim, so the forwarded values must be the trimmed ones the keeper will accept.
	it('forwards the wallet and amount exactly as checked, without surrounding spaces', async () => {
		await post(JSON.stringify({ userWallet: `  ${WALLET} `, localAmount: ' 5000 ' }));
		const sent = JSON.parse(String(lastCall()[1].body));
		expect(sent.userWallet).toBe(WALLET);
		expect(sent.localAmount).toBe('5000');
	});
	it('forwards a valid body as a POST', async () => {
		const body = { idempotencyKey: 'ui-ff409dbd-1', userWallet: WALLET, localAmount: '5000', channelId: 'c1' };
		await post(JSON.stringify(body));
		const [url, init] = lastCall();
		expect(url).toBe(`${KEEPER}/api/deposits`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({ ...body, redirectUrl: 'https://app.kalyswap.io/kusd' });
	});

	// Yellow Card's hosted payments (Wave etc.) must bring KalySwap buyers back to KalySwap, in
	// their language — not to kusd.kalychain.io, the keeper's default.
	const sentRedirect = () => JSON.parse(String(lastCall()[1].body)).redirectUrl;
	const base = { userWallet: WALLET, localAmount: '5000' };
	it('returns buyers to this site\'s KUSD page in their language', async () => {
		await post(JSON.stringify({ ...base, locale: 'fr' }));
		expect(sentRedirect()).toBe('https://app.kalyswap.io/fr/kusd');
		expect(JSON.parse(String(lastCall()[1].body))).not.toHaveProperty('locale');
		await post(JSON.stringify({ ...base, locale: 'en' }));
		expect(sentRedirect()).toBe('https://app.kalyswap.io/kusd');
		await post(JSON.stringify({ ...base, locale: 'xx' }));
		expect(sentRedirect()).toBe('https://app.kalyswap.io/kusd');
	});
	it('never lets the browser choose the return page', async () => {
		await post(JSON.stringify({ ...base, redirectUrl: 'https://evil.example/kusd' }));
		expect(sentRedirect()).toBe('https://app.kalyswap.io/kusd');
	});
	it('takes the site origin from RAMP_SITE_URL', async () => {
		process.env.RAMP_SITE_URL = 'https://kalyswap.localhost/';
		try {
			await post(JSON.stringify({ ...base, locale: 'fr' }));
			expect(sentRedirect()).toBe('https://kalyswap.localhost/fr/kusd');
		} finally {
			delete process.env.RAMP_SITE_URL;
		}
	});
});

describe('deposit status', () => {
	const get = (id: string) => getDeposit(req(`/ramp-api/deposits/${id}`), { params: Promise.resolve({ id }) });

	it('rejects ids that could reshape the keeper path', async () => {
		for (const id of ['..%2Fadmin', 'short', 'a/b/c/d/e/f/g']) expect((await get(id)).status, id).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
	});
	it('forwards a keeper deposit id', async () => {
		await get('fe2fea2f-1c2d-4e5f');
		expect(lastCall()[0]).toBe(`${KEEPER}/api/deposits/fe2fea2f-1c2d-4e5f`);
	});
});

describe('mobile-money cash-out', () => {
	it('forwards the payout corridors', async () => {
		await withdrawChannels(req('/ramp-api/withdraw-channels'));
		expect(lastCall()[0]).toBe(`${KEEPER}/api/withdraw-channels`);
	});

	it('quotes only with country, currency and a ≤6-decimal USD amount, forwarding nothing else', async () => {
		expect((await withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF'))).status).toBe(400);
		expect((await withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF&usd=1.1234567'))).status).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
		for (const q of ['country=CIV&currency=XOF&usd=25', 'country=CI&currency=xof&usd=25']) {
			expect((await withdrawQuote(req(`/ramp-api/withdraw-quote?${q}`))).status, q).toBe(400);
		}
		expect(keeper).not.toHaveBeenCalled();
		await withdrawQuote(req('/ramp-api/withdraw-quote?country=CI&currency=XOF&usd=25&evil=1'));
		expect(lastCall()[0]).toBe(`${KEEPER}/api/withdraw-quote?country=CI&currency=XOF&usd=25`);
	});

	it('rejects malformed withdrawals before reaching the keeper', async () => {
		const post = (body: string) => createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body }));
		for (const body of [
			'{nope',
			'null',
			'[]',
			JSON.stringify({ userWallet: '0x123', usdAmount: '25' }),
			JSON.stringify({ userWallet: WALLET, usdAmount: '-1' }),
			JSON.stringify({ userWallet: WALLET, usdAmount: '1.1234567' }),
		]) {
			expect((await post(body)).status, body).toBe(400);
		}
		expect(keeper).not.toHaveBeenCalled();
	});

	it('forwards a valid withdrawal unchanged as a POST, and an unreachable keeper as an unknown outcome', async () => {
		const body = { idempotencyKey: 'ui-ff409dbd-1', userWallet: WALLET, usdAmount: '25', channelId: 'wd1' };
		await createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body: JSON.stringify(body) }));
		const [url, init] = lastCall();
		expect(url).toBe(`${KEEPER}/api/withdrawals`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual(body);

		keeper.mockRejectedValueOnce(new TypeError('fetch failed'));
		const res = await createWithdrawal(req('/ramp-api/withdrawals', { method: 'POST', body: JSON.stringify(body) }));
		expect(res.status).toBe(504);
		expect(await res.json()).toEqual({ error: 'keeper_unreachable' });
	});

	it('checks the withdrawal id before forwarding a status poll', async () => {
		const get = (id: string) => getWithdrawal(req(`/ramp-api/withdrawals/${id}`), { params: Promise.resolve({ id }) });
		for (const id of ['..%2Fadmin', 'short']) expect((await get(id)).status, id).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
		await get('6f1c2d3e-4a5b-6c7d');
		expect(lastCall()[0]).toBe(`${KEEPER}/api/withdrawals/6f1c2d3e-4a5b-6c7d`);
	});
});
