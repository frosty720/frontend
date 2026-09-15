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
import errors from '@/i18n/dictionaries/en/errors';
import { interpolate } from '@/i18n/interpolate';

/** Dictionary key (`errors.actions`) naming the operation whose transaction reverted. */
export type TxAction = keyof typeof errors.actions;

export class TransactionRevertedError extends Error {
	readonly hash: string;
	readonly action?: TxAction;

	constructor(hash: string, action?: TxAction) {
		super(action ? interpolate(errors.revertedAction, { action: errors.actions[action] }) : errors.reverted);
		this.name = 'TransactionRevertedError';
		this.hash = hash;
		this.action = action;
	}
}

/**
 * Wait for a transaction and throw if it reverted.
 *
 * @param action which operation this is, used to name it in the (translated) error message
 * @returns the receipt, only when `status === 'success'`
 */
export async function assertTxSucceeded(
	publicClient: PublicClient,
	hash: string,
	action?: TxAction
) {
	const receipt = await publicClient.waitForTransactionReceipt({
		hash: hash as `0x${string}`,
	});

	if (receipt.status !== 'success') {
		throw new TransactionRevertedError(hash, action);
	}

	return receipt;
}
