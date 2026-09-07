/**
 * assertTxSucceeded exists because viem's waitForTransactionReceipt RESOLVES for
 * reverted transactions. These tests pin that behaviour down.
 */
import { describe, it, expect, vi } from 'vitest';
import { assertTxSucceeded, TransactionRevertedError } from '../transactions';

const HASH = '0xabc123';

function clientReturning(status: 'success' | 'reverted') {
	return {
		waitForTransactionReceipt: vi.fn().mockResolvedValue({ status, blockNumber: 42n }),
	} as any;
}

describe('assertTxSucceeded', () => {
	it('returns the receipt when the transaction succeeded', async () => {
		const client = clientReturning('success');
		const receipt = await assertTxSucceeded(client, HASH, 'Collect');
		expect(receipt.blockNumber).toBe(42n);
		expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
	});

	it('throws when the transaction reverted — the whole point', async () => {
		const client = clientReturning('reverted');
		await expect(assertTxSucceeded(client, HASH, 'Collect')).rejects.toBeInstanceOf(
			TransactionRevertedError
		);
	});

	it('names the action in the error so the toast is not generic', async () => {
		const client = clientReturning('reverted');
		await expect(assertTxSucceeded(client, HASH, 'Remove liquidity')).rejects.toThrow(
			/Remove liquidity failed/
		);
	});

	it('carries the hash for support/debugging', async () => {
		const client = clientReturning('reverted');
		await assertTxSucceeded(client, HASH, 'Stake').catch((e: TransactionRevertedError) => {
			expect(e.hash).toBe(HASH);
		});
		expect.assertions(1);
	});

	it('still throws without an action label', async () => {
		const client = clientReturning('reverted');
		await expect(assertTxSucceeded(client, HASH)).rejects.toThrow(/reverted on-chain/);
	});
});
