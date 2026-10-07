/**
 * The cash-out limit comes from our server route (the paid RPC behind it); the browser's own Polygon
 * RPC answers only when the route is down or answers something that is not a balance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCollateral } from '../useCashout';

const browserRpc = { readContract: vi.fn(async () => 111n) };
const stubRoute = (res: () => Response) => vi.stubGlobal('fetch', vi.fn(async () => res()));

afterEach(() => {
	vi.unstubAllGlobals();
	browserRpc.readContract.mockClear();
});

describe('readCollateral', () => {
	it("takes the route's balance and skips the browser RPC", async () => {
		stubRoute(() => new Response(JSON.stringify({ collateral: '592999040' }), { status: 200 }));
		expect(await readCollateral(browserRpc as never)).toBe(592_999_040n);
		expect(browserRpc.readContract).not.toHaveBeenCalled();
	});

	it('falls back to the browser RPC when the route is down, refuses, or answers nonsense', async () => {
		for (const res of [
			() => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }),
			() => new Response(JSON.stringify({ collateral: '-1' }), { status: 200 }),
			() => new Response('not json', { status: 200 }),
		]) {
			stubRoute(res);
			expect(await readCollateral(browserRpc as never)).toBe(111n);
		}
		vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
		expect(await readCollateral(browserRpc as never)).toBe(111n);
		expect(browserRpc.readContract).toHaveBeenCalledTimes(4);
	});

	it('throws when there is no browser RPC either', async () => {
		stubRoute(() => new Response('{}', { status: 503 }));
		await expect(readCollateral(undefined)).rejects.toThrow();
	});
});
