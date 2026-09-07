/**
 * Gas floor for KalyChain-family chains.
 *
 * KalyChain nodes advertise essentially nothing for fees — measured 2026-08-26:
 *
 *   chain            eth_gasPrice   eth_maxPriorityFeePerGas
 *   3888 mainnet     1,000 wei      20 gwei
 *   3890 KMT         1,000 wei      0
 *
 * A transaction built from those suggestions is far below the 21 gwei the validators
 * actually prioritise, which turns inclusion into a lottery (seconds vs. tens of
 * minutes). viem will not save us either: for JSON-RPC accounts — which is every
 * account here, since the thirdweb bridge hands wagmi an EIP-1193 provider —
 * `sendTransaction` passes the fee fields straight through and lets the wallet decide.
 * `chain.fees.defaultPriorityFee` only affects the local-account path, which nothing
 * in this app uses.
 *
 * So every write on a KalyChain-family chain has to carry these explicitly. Spread
 * `kalyFeeOverrides(chainId)` into the `writeContract` / `sendTransaction` request;
 * on other chains it returns `{}` and the wallet's own estimation stands.
 */

import { CHAIN_IDS } from '@/config/chains';

/** The floor validators actually prioritise. Do not lower without checking inclusion times. */
export const KALYCHAIN_MIN_PRIORITY_FEE_WEI = 21_000_000_000n; // 21 gwei

/**
 * Ceiling for a single unit of gas. Base fee on KalyChain sits at a handful of wei, so
 * this is effectively `tip + headroom`. Kept close to the tip on purpose: the wallet
 * reserves `gasLimit × maxFeePerGas` as the spend ceiling, and an inflated ceiling
 * makes cheap transactions look unaffordable (the 2026-07-28 vault incident).
 */
export const KALYCHAIN_MAX_FEE_WEI = 26_000_000_000n; // 26 gwei

/** Legacy (type-0) equivalent, for any path that cannot send EIP-1559. */
export const KALYCHAIN_LEGACY_GAS_PRICE_WEI = KALYCHAIN_MIN_PRIORITY_FEE_WEI;

const KALYCHAIN_FAMILY: readonly number[] = [
	CHAIN_IDS.KALYCHAIN,
	CHAIN_IDS.KALYCHAIN,
];

export function isKalyChainFamily(chainId?: number | null): boolean {
	return chainId != null && KALYCHAIN_FAMILY.includes(chainId);
}

export interface KalyFeeOverrides {
	maxFeePerGas?: bigint;
	maxPriorityFeePerGas?: bigint;
}

/**
 * Fee fields to spread into a transaction request.
 *
 * Returns `{}` for non-KalyChain chains (BSC, Arbitrum) so their wallets keep using
 * their own estimation — pinning 21 gwei there would badly overpay.
 */
export function kalyFeeOverrides(chainId?: number | null): KalyFeeOverrides {
	if (!isKalyChainFamily(chainId)) return {};
	return {
		maxFeePerGas: KALYCHAIN_MAX_FEE_WEI,
		maxPriorityFeePerGas: KALYCHAIN_MIN_PRIORITY_FEE_WEI,
	};
}

/** Legacy variant for type-0 senders. `{}` off KalyChain, as above. */
export function kalyLegacyGasPrice(chainId?: number | null): { gasPrice?: bigint } {
	if (!isKalyChainFamily(chainId)) return {};
	return { gasPrice: KALYCHAIN_LEGACY_GAS_PRICE_WEI };
}
