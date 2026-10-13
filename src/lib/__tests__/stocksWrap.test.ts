/**
 * ETH ⇄ WETH goes straight to the WETH contract: wrap = deposit() carrying the ETH as value, unwrap =
 * withdraw(amount). Getting either backwards would send ETH nowhere useful or burn the wrong amount.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PublicClient, WalletClient } from 'viem';
import { ROBINHOOD_WETH } from '@/config/stocks';
import { TransactionRevertedError } from '@/utils/transactions';
import { wrapEth } from '../stocksWrap';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TX = `0x${'ab'.repeat(32)}` as const;

function deps(receipt: 'success' | 'reverted' = 'success') {
	const writeContract = vi.fn(async (_: Record<string, unknown>) => TX);
	const waitForTransactionReceipt = vi.fn(async () => ({ status: receipt }));
	return {
		writeContract,
		waitForTransactionReceipt,
		d: {
			walletClient: { writeContract } as unknown as WalletClient,
			publicClient: { waitForTransactionReceipt } as unknown as PublicClient,
			account: ACCOUNT as `0x${string}`,
		},
	};
}

describe('wrapEth', () => {
	it('wrap calls WETH.deposit() with the ETH as value, on Robinhood Chain', async () => {
		const { d, writeContract } = deps();
		await wrapEth('wrap', 5n * 10n ** 14n, d);
		const call = writeContract.mock.calls[0][0];
		expect(call).toMatchObject({ address: ROBINHOOD_WETH, functionName: 'deposit', value: 5n * 10n ** 14n, account: ACCOUNT });
		expect(call.args).toBeUndefined();
		expect((call.chain as { id: number }).id).toBe(4663);
	});

	it('unwrap calls WETH.withdraw(amount) and sends no ETH', async () => {
		const { d, writeContract } = deps();
		await wrapEth('unwrap', 7n, d);
		const call = writeContract.mock.calls[0][0];
		expect(call).toMatchObject({ address: ROBINHOOD_WETH, functionName: 'withdraw', args: [7n] });
		expect(call.value).toBeUndefined();
	});

	it('waits for the receipt and fails on a revert', async () => {
		const { d, waitForTransactionReceipt } = deps('reverted');
		await expect(wrapEth('wrap', 1n, d)).rejects.toBeInstanceOf(TransactionRevertedError);
		expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX });
	});
});
