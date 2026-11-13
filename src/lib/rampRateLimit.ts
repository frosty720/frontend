/**
 * In-memory limits for the /ramp-api/* route handlers (ported from Yasukey): per visitor IP and in
 * total. Every route calls `limitRampRequest` first, so junk requests can't spend Yellow Card calls
 * or the keeper's allowance. KalySwap runs as ONE pm2 process, so a module-level fixed window is
 * enough; with more processes each would count on its own.
 *
 * The visitor is the X-Real-IP header, which our nginx sets to the connecting address for
 * app.kalyswap.io (the same source rampServer.ts forwards to the keeper). Limits are looser than
 * Yasukey's: the pay screen alone polls 12 times a minute, and mobile carriers put many buyers
 * behind one IP.
 */
import { NextResponse } from 'next/server';

export const PER_IP_LIMIT = 60;
export const TOTAL_LIMIT = 1200;
export const WINDOW_MS = 60_000;

export interface RateLimiter {
	/** Seconds the caller must wait, or null when the request is allowed (and counted). */
	check(ip: string): number | null;
	reset(): void;
}

export function createRateLimiter(perIp: number, total: number, windowMs: number, now: () => number = Date.now): RateLimiter {
	let windowStart = now();
	let count = 0;
	const byIp = new Map<string, number>();

	function roll(): void {
		if (now() - windowStart < windowMs) return;
		windowStart = now();
		count = 0;
		byIp.clear();
	}

	return {
		check(ip) {
			roll();
			const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now()) / 1000));
			const used = byIp.get(ip) ?? 0;
			if (used >= perIp || count >= total) return retryAfter;
			byIp.set(ip, used + 1);
			count += 1;
			return null;
		},
		reset() {
			windowStart = now();
			count = 0;
			byIp.clear();
		},
	};
}

/** The visitor's IP as nginx saw it, or 'unknown' when there is none (local dev). */
export function clientIp(req: Request): string {
	return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

const limiter = createRateLimiter(PER_IP_LIMIT, TOTAL_LIMIT, WINDOW_MS);

/** A 429 with Retry-After when the caller is over a limit, otherwise null. */
export function limitRampRequest(req: Request): NextResponse | null {
	const retryAfter = limiter.check(clientIp(req));
	if (retryAfter === null) return null;
	return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': String(retryAfter) } });
}

export function resetRampRateLimit(): void {
	limiter.reset();
}
