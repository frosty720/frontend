/**
 * Server-only helper for the /ramp-api/* route handlers: forwards requests to the
 * fiat-bridge-keeper with the keeper API key attached. The key lives ONLY in server env (no
 * NEXT_PUBLIC_ prefix) and must never reach the browser. Import this from route handlers only.
 *
 * Env:
 *   RAMP_KEEPER_URL      keeper base URL (the keeper runs on the kusd host behind nginx)
 *   RAMP_KEEPER_API_KEY  keeper bearer token (KEEPER_API_KEY in the keeper's .env)
 */

const DEFAULT_KEEPER_URL = 'https://ramp.kalychain.io';

/** Error key for a keeper call whose outcome is unknown (lib/ramp.ts reads the same value). */
export const KEEPER_UNREACHABLE = 'keeper_unreachable';

export interface KeeperResult {
	status: number;
	body: unknown;
}

export async function keeperFetch(path: string, init?: { method?: string; body?: unknown }): Promise<KeeperResult> {
	const apiKey = process.env.RAMP_KEEPER_API_KEY || '';
	if (!apiKey) return { status: 503, body: { error: 'ramp not configured' } };
	const base = process.env.RAMP_KEEPER_URL || DEFAULT_KEEPER_URL;

	let res: Response;
	try {
		res = await fetch(base + path, {
			method: init?.method ?? 'GET',
			headers: {
				authorization: `Bearer ${apiKey}`,
				...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
			// Fail fast rather than hanging the route (and the user's spinner).
			signal: AbortSignal.timeout(30_000),
			cache: 'no-store',
		});
	} catch {
		// Unreachable or timed out: a POST may still have created the deposit, so the outcome is
		// UNKNOWN — the browser must keep its idempotency key and retry with it (see RampApiError).
		return { status: 504, body: { error: KEEPER_UNREACHABLE } };
	}
	const body = await res.json().catch(() => ({ error: 'bad keeper response' }));
	return { status: res.status, body };
}
