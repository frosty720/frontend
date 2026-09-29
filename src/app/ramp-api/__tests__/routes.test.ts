/**
 * The /ramp-api/* proxy holds the keeper API key: it must attach it server-side, never echo it,
 * refuse obviously bad input before it reaches the keeper, and report an unreachable keeper as an
 * unknown outcome (504 keeper_unreachable) so the browser keeps its idempotency key.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as channels } from '../channels/route';
import { GET as quote } from '../quote/route';
import { POST as createDeposit } from '../deposits/route';
import { GET as getDeposit } from '../deposits/[id]/route';

const KEY = 'test-keeper-key-0123456789';
const KEEPER = 'https://keeper.test';
const WALLET = '0xfF409DBD66bD013385c41cb55D8cD90902BB4c80';

const keeper = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));

beforeEach(() => {
	process.env.RAMP_KEEPER_API_KEY = KEY;
	process.env.RAMP_KEEPER_URL = KEEPER;
	keeper.mockClear();
	vi.stubGlobal('fetch', keeper);
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
		const res = await channels();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ corridors: [{ channelId: 'c1' }] });
		const [url, init] = lastCall();
		expect(url).toBe(`${KEEPER}/api/channels`);
		expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
	});

	it('never puts the key in a response, even when the keeper errors', async () => {
		keeper.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
		const res = await channels();
		expect(res.status).toBe(401);
		expect(JSON.stringify(await res.json())).not.toContain(KEY);
	});

	it('answers 503 without calling out when the key is not configured', async () => {
		delete process.env.RAMP_KEEPER_API_KEY;
		const res = await channels();
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
		const res = await channels();
		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'bad keeper response' });
	});
});

describe('quote', () => {
	it('requires currency and localAmount', async () => {
		expect((await quote(req('/ramp-api/quote?currency=XOF'))).status).toBe(400);
		expect(keeper).not.toHaveBeenCalled();
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
	it('forwards a valid body as a POST', async () => {
		const body = { idempotencyKey: 'ui-ff409dbd-1', userWallet: WALLET, localAmount: '5000', channelId: 'c1' };
		await post(JSON.stringify(body));
		const [url, init] = lastCall();
		expect(url).toBe(`${KEEPER}/api/deposits`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual(body);
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
