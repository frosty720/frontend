/**
 * Transaction receipt handling.
 *
 * `publicClient.waitForTransactionReceipt` resolves for REVERTED transactions — it only
 * rejects on timeout or a replacement it cannot follow. Awaiting it and then declaring
 * success is therefore wrong: a reverted swap, collect or withdrawal reports as done and
 * the user is told their funds moved when they did not. That exact bug shipped in the
 * Vault BuyModal, where reverted buys showed a success toast.
 *
 * Always route receipts through `assertTxSucceeded`.
 */

import type { PublicClient } from 'viem';

export class TransactionRevertedError extends Error {
	readonly hash: string;

	constructor(hash: string, action?: string) {
		super(
			action
				? `${action} failed: the transaction was reverted on-chain.`
				: 'The transaction was reverted on-chain.'
		);
		this.name = 'TransactionRevertedError';
		this.hash = hash;
	}
}

/**
 * Wait for a transaction and throw if it reverted.
 *
 * @param action short human label used in the error message, e.g. 'Collect fees'
 * @returns the receipt, only when `status === 'success'`
 */
export async function assertTxSucceeded(
	publicClient: PublicClient,
	hash: string,
	action?: string
) {
	const receipt = await publicClient.waitForTransactionReceipt({
		hash: hash as `0x${string}`,
	});

	if (receipt.status !== 'success') {
		throw new TransactionRevertedError(hash, action);
	}

	return receipt;
}
