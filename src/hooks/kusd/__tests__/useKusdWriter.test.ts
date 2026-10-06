/**
 * @vitest-environment jsdom
 *
 * Every KUSD write goes through useKusdWriter: it must carry the KalyChain 21 gwei floor, never sign
 * below the step's measured gas floor, treat a mined-but-reverted transaction as a failure, and the
 * plan runner must stop at the first failed step so a later step (e.g. a frob after a failed join)
 * never goes out.
 */
import { renderHook, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { KALYCHAIN_MAX_FEE_WEI, KALYCHAIN_MIN_PRIORITY_FEE_WEI } from '@/config/gas';
import { KUSD_PSM } from '@/config/kusd';
import { UserError } from '@/lib/userError';
import { PSM_SWAP_GAS } from '@/utils/gasLimit';
import { approveStep, psmSwapStep } from '@/utils/kusdPlans';
import { TransactionRevertedError } from '@/utils/transactions';

const OWNER = '0x1111111111111111111111111111111111111111';
const writeContractAsync = vi.fn(async (_request: Record<string, unknown>) => '0xhash' as `0x${string}`);
const estimateContractGas = vi.fn(async (_request: Record<string, unknown>) => 50_000n);
const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' }));
let account: string | undefined = OWNER;

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: account }),
	usePublicClient: () => ({ estimateContractGas, waitForTransactionReceipt }),
	useWriteContract: () => ({ writeContractAsync }),
}));

import { useKusdSteps, useKusdWriter } from '../useKusdWriter';

describe('useKusdWriter', () => {
	beforeEach(() => {
		account = OWNER;
		writeContractAsync.mockClear();
		estimateContractGas.mockReset();
		estimateContractGas.mockImplementation(async () => 50_000n);
		waitForTransactionReceipt.mockReset();
		waitForTransactionReceipt.mockImplementation(async () => ({ status: 'success' }));
	});
	afterEach(cleanup);

	it('sends on KalyChain with the 21 gwei floor and the estimate + 50%, never below the floor', async () => {
		const send = renderHook(() => useKusdWriter()).result.current;
		await send(psmSwapStep('sell', OWNER, 1_000_000n));
		const request = writeContractAsync.mock.calls[0][0];
		expect(request.address).toBe(KUSD_PSM.address);
		expect(request.functionName).toBe('sellGem');
		expect(request.args).toEqual([OWNER, 1_000_000n]);
		expect(request.chainId).toBe(CHAIN_IDS.KALYCHAIN);
		expect(request.maxPriorityFeePerGas).toBe(KALYCHAIN_MIN_PRIORITY_FEE_WEI);
		expect(request.maxFeePerGas).toBe(KALYCHAIN_MAX_FEE_WEI);
		expect(request.gas).toBe(PSM_SWAP_GAS.floor); // 75k padded estimate < 120k floor

		estimateContractGas.mockImplementationOnce(async () => 200_000n);
		await send(psmSwapStep('sell', OWNER, 1_000_000n));
		expect(writeContractAsync.mock.calls[1][0].gas).toBe(300_000n);
	});

	it('reports the hash as soon as the wallet broadcasts, before waiting for the receipt', async () => {
		const seen: string[] = [];
		waitForTransactionReceipt.mockImplementationOnce(async () => {
			seen.push('receipt');
			return { status: 'success' };
		});
		const send = renderHook(() => useKusdWriter()).result.current;
		await send(psmSwapStep('buy', OWNER, 1n), (hash) => seen.push(hash));
		expect(seen).toEqual(['0xhash', 'receipt']);
	});

	it('reports no hash when the wallet never broadcasts', async () => {
		writeContractAsync.mockRejectedValueOnce(new Error('User rejected the request.'));
		const onHash = vi.fn();
		const send = renderHook(() => useKusdWriter()).result.current;
		await expect(send(psmSwapStep('buy', OWNER, 1n), onHash)).rejects.toThrow();
		expect(onHash).not.toHaveBeenCalled();
	});

	it('falls back to the pinned limit when estimation fails', async () => {
		estimateContractGas.mockRejectedValueOnce(new Error('execution reverted'));
		const send = renderHook(() => useKusdWriter()).result.current;
		await send(psmSwapStep('buy', OWNER, 1n));
		expect(writeContractAsync.mock.calls[0][0].gas).toBe(PSM_SWAP_GAS.fallback);
	});

	it('throws on a mined-but-reverted transaction', async () => {
		waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'reverted' }));
		const send = renderHook(() => useKusdWriter()).result.current;
		await expect(send(psmSwapStep('sell', OWNER, 1n))).rejects.toBeInstanceOf(TransactionRevertedError);
	});

	it('refuses to send without a connected wallet', async () => {
		account = undefined;
		const send = renderHook(() => useKusdWriter()).result.current;
		await expect(send(psmSwapStep('sell', OWNER, 1n))).rejects.toBeInstanceOf(UserError);
		expect(writeContractAsync).not.toHaveBeenCalled();
	});
});

describe('useKusdSteps', () => {
	beforeEach(() => {
		account = OWNER;
		writeContractAsync.mockClear();
		estimateContractGas.mockImplementation(async () => 50_000n);
		waitForTransactionReceipt.mockReset();
		waitForTransactionReceipt.mockImplementation(async () => ({ status: 'success' }));
	});

	it('runs steps in order and reports progress', async () => {
		const run = renderHook(() => useKusdSteps()).result.current;
		const progress: Array<[number, number]> = [];
		await run([approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, 5n), psmSwapStep('sell', OWNER, 5n)], (i, total) => progress.push([i, total]));
		expect(writeContractAsync.mock.calls.map(([r]) => r.functionName)).toEqual(['approve', 'sellGem']);
		expect(progress).toEqual([
			[0, 2],
			[1, 2],
		]);
	});

	it('stops at the first failed step — later steps are never sent', async () => {
		waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'reverted' }));
		const run = renderHook(() => useKusdSteps()).result.current;
		await expect(run([approveStep(KUSD_PSM.gem.address, KUSD_PSM.address, 5n), psmSwapStep('sell', OWNER, 5n)])).rejects.toBeInstanceOf(
			TransactionRevertedError,
		);
		expect(writeContractAsync).toHaveBeenCalledTimes(1);
	});
});
