/**
 * The browser asks our route for the cash-out limit; the route answers from the server's cached read
 * of the paid RPC, and on any failure says only "unavailable" (the RPC URL carries the key).
 */
import { encodeAbiParameters } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

const RPC = 'https://matic.example/secret-key';

async function route() {
	vi.resetModules();
	vi.stubEnv('POLYGON_RPC_URL', RPC);
	return (await import('../cashout-capacity/route')).GET;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('GET /ramp-api/cashout-capacity', () => {
	it('answers with the router balance as a string', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				const { id } = JSON.parse(String(init?.body)) as { id: number };
				return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: encodeAbiParameters([{ type: 'uint256' }], [592_999_040n]) }), { status: 200 });
			}),
		);
		const res = await (await route())();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ collateral: '592999040' });
	});

	it('says only "unavailable" when the read fails, never the RPC URL', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError(`fetch failed for ${RPC}`);
			}),
		);
		const res = await (await route())();
		expect(res.status).toBe(503);
		const text = await res.text();
		expect(JSON.parse(text)).toEqual({ error: 'unavailable' });
		expect(text).not.toContain('secret-key');
	});
});
