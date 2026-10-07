/**
 * Server-only: the cash-out limit, the USDT the bridge's Polygon router holds, read through the paid
 * Polygon RPC. POLYGON_RPC_URL carries the key, so it lives only in server env (no NEXT_PUBLIC_) and
 * never appears in a response or a log line. The RPC is shared with the bridge, so it sees at most
 * one read per CAPACITY_TTL_MS however many visitors ask, failures included. Import from route
 * handlers only.
 */
import { createPublicClient, erc20Abi, http } from 'viem';
import { polygon } from 'viem/chains';
import { KUSD_CASHOUT } from '@/config/kusd';

export const CAPACITY_TTL_MS = 60_000;

/** `read`, shared by concurrent callers and remembered (value or failure) for `ttlMs`. */
export function cachedRead<T>(read: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
	let last: { at: number; result: Promise<T> } | null = null;
	return () => {
		if (!last || now() - last.at >= ttlMs) last = { at: now(), result: read() };
		return last.result;
	};
}

async function readRouterUsdt(): Promise<bigint> {
	const url = process.env.POLYGON_RPC_URL;
	if (!url) throw new Error('cash-out capacity not configured');
	const client = createPublicClient({ chain: polygon, transport: http(url) });
	return client.readContract({ address: KUSD_CASHOUT.polygonUsdt, abi: erc20Abi, functionName: 'balanceOf', args: [KUSD_CASHOUT.polygonRouter] });
}

export const cashoutCapacity = cachedRead(readRouterUsdt, CAPACITY_TTL_MS);
