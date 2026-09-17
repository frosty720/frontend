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

/**
 * VaultManager.purchase (swap + LP mint). Floor measured, not guessed: 70 mainnet purchases used
 * 702,021–846,275 gas (2026-07-28), and 1.2M sits 42% above the maximum. The 3M fallback is a
 * last resort only — as a default it priced buyers out (the 2026-07-28 gas-ceiling incident).
 */
export const VAULT_PURCHASE_GAS: GasBounds = { floor: 1_200_000n, fallback: 3_000_000n };

/** Stable approve for a vault purchase: the Vaults app's pinned 100k. */
export const VAULT_APPROVE_GAS: GasBounds = { floor: 100_000n, fallback: 100_000n };

/**
 * NonfungiblePositionManager.mint. Measured on 3890 (2026-09-17): the three mints on record used
 * 372,611–612,345 gas; the floor sits ~47% above the maximum. The 3M fallback is the limit this path always pinned.
 */
export const V3_MINT_GAS: GasBounds = { floor: 900_000n, fallback: 3_000_000n };

/**
 * createAndInitializePoolIfNecessary + mint in one multicall. Creating a pool on 3890 used 4,612,379
 * gas (both 2026 pools); with the largest measured mint that is ~5.23M, and the floor is ~34% above.
 */
export const V3_CREATE_AND_MINT_GAS: GasBounds = { floor: 7_000_000n, fallback: 7_500_000n };
