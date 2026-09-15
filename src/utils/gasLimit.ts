/**
 * Gas-limit resolution for writes whose node estimate is unreliable (ported from the Vaults app,
 * kaly-vault src/lib/chain/gas.ts).
 *
 * A pinned gas limit is also a spend ceiling: wallets refuse to sign unless
 * `balance >= gas * maxFeePerGas`, so an over-sized constant locks out users who can afford the
 * real cost. Prefer a live estimate plus headroom, never below a floor, and fall back to the
 * pinned value only when estimation fails.
 */

/** Headroom over a live estimate: +50%. */
export function withHeadroom(estimate: bigint): bigint {
	return (estimate * 3n) / 2n;
}

export interface GasBounds {
	/** The resolved limit is never below this, so a low estimate can't cause an out-of-gas revert. */
	floor: bigint;
	/** Used when estimation is unavailable, fails, or returns zero. */
	fallback: bigint;
}

/** `max(floor, estimate + headroom)`, or the fallback when the node gives no usable estimate. */
export async function resolveGasLimit(estimate: () => Promise<bigint>, { floor, fallback }: GasBounds): Promise<bigint> {
	let padded: bigint;
	try {
		const est = await estimate();
		if (est <= 0n) return fallback;
		padded = withHeadroom(est);
	} catch {
		return fallback;
	}
	return padded > floor ? padded : floor;
}

/** RewardsPool.claimMany: the Vaults app's measured-safe floor and fallback. */
export const VAULT_CLAIM_GAS: GasBounds = { floor: 800_000n, fallback: 800_000n };
