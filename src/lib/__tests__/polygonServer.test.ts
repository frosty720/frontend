/**
 * The cash-out limit is read server-side through the paid Polygon RPC (POLYGON_RPC_URL, shared with
 * the bridge). However many visitors ask, the RPC sees at most one read per TTL, failures included,
 * and the URL (which carries the key) never leaves the server.
 */
import { encodeAbiParameters } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KUSD_CASHOUT } from '@/config/kusd';

const RPC = 'https://matic.example/secret-key';

async function load(url: string) {
	vi.resetModules();
	vi.stubEnv('POLYGON_RPC_URL', url);
	return import('../polygonServer');
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('cachedRead', () => {
	it('shares one read among concurrent callers and serves it until the TTL runs out', async () => {
		const { cachedRead } = await load('');
		let now = 0;
		const read = vi.fn(async () => 7n);
		const get = cachedRead(read, 60_000, () => now);
		expect(await Promise.all([get(), get(), get()])).toEqual([7n, 7n, 7n]);
		now = 59_999;
		await get();
		expect(read).toHaveBeenCalledTimes(1);
		now = 60_000;
		await get();
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('remembers a failure for the TTL too, so a failing RPC is not asked again on every request', async () => {
		const { cachedRead } = await load('');
		let now = 0;
		const read = vi.fn(async () => {
			throw new Error('429');
		});
		const get = cachedRead(read, 60_000, () => now);
		await expect(get()).rejects.toThrow('429');
		await expect(get()).rejects.toThrow('429');
		expect(read).toHaveBeenCalledTimes(1);
		now = 60_000;
		await expect(get()).rejects.toThrow('429');
		expect(read).toHaveBeenCalledTimes(2);
	});
});

describe('cashoutCapacity', () => {
	it("reads the router's USDT through POLYGON_RPC_URL", async () => {
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { id } = JSON.parse(String(init?.body)) as { id: number };
			return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: encodeAbiParameters([{ type: 'uint256' }], [592_999_040n]) }), { status: 200 });
		});
		vi.stubGlobal('fetch', fetchMock);
		const { cashoutCapacity } = await load(RPC);
		expect(await cashoutCapacity()).toBe(592_999_040n);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(String(url)).toBe(RPC);
		const call = JSON.parse(String(init.body)) as { method: string; params: [{ to: string; data: string }] };
		expect(call.method).toBe('eth_call');
		expect(call.params[0].to.toLowerCase()).toBe(KUSD_CASHOUT.polygonUsdt.toLowerCase());
		expect(call.params[0].data.toLowerCase()).toContain(KUSD_CASHOUT.polygonRouter.slice(2).toLowerCase());
	});

	it('refuses without asking anyone when POLYGON_RPC_URL is not set', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const { cashoutCapacity } = await load('');
		await expect(cashoutCapacity()).rejects.toThrow(/not configured/);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
