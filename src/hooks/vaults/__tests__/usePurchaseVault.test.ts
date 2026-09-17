/**
 * @vitest-environment jsdom
 *
 * The vault purchase path moves user funds: it must pick the right purchase overload, never sign
 * below the measured gas floor, carry the KalyChain fee floor, approve exactly the price, and treat
 * a mined-but-reverted transaction as a failure (no success, no refresh).
 */
import { renderHook, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { KALYCHAIN_MAX_FEE_WEI, KALYCHAIN_MIN_PRIORITY_FEE_WEI } from '@/config/gas';
import { VAULT_MANAGER_ADDRESS, VAULT_STABLES } from '@/config/vaults';
import { TransactionRevertedError } from '@/utils/transactions';

const BUYER = '0x1111111111111111111111111111111111111111';
const REFERRER = '0x2222222222222222222222222222222222222222';
const USDT = VAULT_STABLES[0].address;

const writeContractAsync = vi.fn(async (_request: Record<string, unknown>) => '0xhash' as `0x${string}`);
const estimateContractGas = vi.fn(async (_request: Record<string, unknown>) => 800_000n);
const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' }));
const invalidateQueries = vi.fn(async () => undefined);
let account: string | undefined = BUYER;

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: account }),
	usePublicClient: () => ({ estimateContractGas, waitForTransactionReceipt }),
	useWriteContract: () => ({ writeContractAsync }),
	useReadContract: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));

import { useApproveVaultStable, usePurchaseVault } from '../usePurchaseVault';

describe('usePurchaseVault', () => {
	beforeEach(() => {
		account = BUYER;
		writeContractAsync.mockClear();
		estimateContractGas.mockReset();
		estimateContractGas.mockImplementation(async () => 800_000n);
		waitForTransactionReceipt.mockReset();
		waitForTransactionReceipt.mockImplementation(async () => ({ status: 'success' }));
		invalidateQueries.mockClear();
	});
	afterEach(cleanup);

	it('uses the 4-argument purchase with a referrer, with a 10-minute deadline and the fee floor', async () => {
		const purchase = renderHook(() => usePurchaseVault()).result.current;
		const before = Math.floor(Date.now() / 1000);
		await purchase({ tier: 2, stable: USDT, referrer: REFERRER });

		const request = writeContractAsync.mock.calls[0][0] as { args: readonly unknown[]; [key: string]: unknown };
		expect(request.address).toBe(VAULT_MANAGER_ADDRESS);
		expect(request.functionName).toBe('purchase');
		expect(request.args).toHaveLength(4);
		expect(request.args[0]).toBe(2);
		expect(request.args[1]).toBe(USDT);
		expect(request.args[3]).toBe(REFERRER);
		const deadline = Number(request.args[2]);
		expect(deadline).toBeGreaterThanOrEqual(before + 600);
		expect(deadline).toBeLessThanOrEqual(before + 602);
		expect(request.chainId).toBe(CHAIN_IDS.KALYCHAIN);
		expect(request.maxPriorityFeePerGas).toBe(KALYCHAIN_MIN_PRIORITY_FEE_WEI);
		expect(request.maxFeePerGas).toBe(KALYCHAIN_MAX_FEE_WEI);
		// 800k estimate + 50% = 1.2M, which is also the floor.
		expect(request.gas).toBe(1_200_000n);
	});

	it('uses the 3-argument purchase without a referrer', async () => {
		const purchase = renderHook(() => usePurchaseVault()).result.current;
		await purchase({ tier: 0, stable: USDT });
		const request = writeContractAsync.mock.calls[0][0] as { args: readonly unknown[] };
		expect(request.args).toHaveLength(3);
	});

	it('never signs below the 1.2M floor, pads a larger estimate, and falls back to 3M when estimation fails', async () => {
		const purchase = renderHook(() => usePurchaseVault()).result.current;
		estimateContractGas.mockImplementationOnce(async () => 100_000n);
		await purchase({ tier: 0, stable: USDT });
		expect(writeContractAsync.mock.calls[0][0].gas).toBe(1_200_000n);

		estimateContractGas.mockImplementationOnce(async () => 1_000_000n);
		await purchase({ tier: 0, stable: USDT });
		expect(writeContractAsync.mock.calls[1][0].gas).toBe(1_500_000n);

		estimateContractGas.mockImplementationOnce(async () => {
			throw new Error('execution reverted');
		});
		await purchase({ tier: 0, stable: USDT });
		expect(writeContractAsync.mock.calls[2][0].gas).toBe(3_000_000n);
	});

	it('throws on a reverted purchase and refreshes nothing', async () => {
		waitForTransactionReceipt.mockImplementation(async () => ({ status: 'reverted' }));
		const purchase = renderHook(() => usePurchaseVault()).result.current;
		await expect(purchase({ tier: 1, stable: USDT })).rejects.toBeInstanceOf(TransactionRevertedError);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	it('refreshes holdings, totals, POL and the affiliate graph after a successful purchase', async () => {
		const purchase = renderHook(() => usePurchaseVault()).result.current;
		await purchase({ tier: 1, stable: USDT });
		const keys = invalidateQueries.mock.calls.map((call) => (call as unknown as [{ queryKey: string[] }])[0].queryKey[0]);
		expect(keys).toEqual(expect.arrayContaining(['myVaults', 'vaultProtocolStats', 'vaultPolStats', 'vaultAffiliateGraph']));
	});

	it('refuses to sign without a wallet', async () => {
		account = undefined;
		const purchase = renderHook(() => usePurchaseVault()).result.current;
		await expect(purchase({ tier: 1, stable: USDT })).rejects.toThrow('Wallet not connected');
		expect(writeContractAsync).not.toHaveBeenCalled();
	});
});

describe('useApproveVaultStable', () => {
	beforeEach(() => {
		account = BUYER;
		writeContractAsync.mockClear();
		estimateContractGas.mockReset();
		estimateContractGas.mockImplementation(async () => 46_000n);
		waitForTransactionReceipt.mockReset();
		waitForTransactionReceipt.mockImplementation(async () => ({ status: 'success' }));
	});
	afterEach(cleanup);

	it('approves exactly the amount to the VaultManager with at least 100k gas', async () => {
		const approve = renderHook(() => useApproveVaultStable()).result.current;
		await approve(USDT, 50_000_000n);
		const request = writeContractAsync.mock.calls[0][0] as { args: readonly unknown[]; [key: string]: unknown };
		expect(request.address).toBe(USDT);
		expect(request.functionName).toBe('approve');
		expect(request.args).toEqual([VAULT_MANAGER_ADDRESS, 50_000_000n]);
		expect(request.gas).toBe(100_000n);
		expect(request.maxPriorityFeePerGas).toBe(KALYCHAIN_MIN_PRIORITY_FEE_WEI);
	});

	it('throws when the approval reverts', async () => {
		waitForTransactionReceipt.mockImplementation(async () => ({ status: 'reverted' }));
		const approve = renderHook(() => useApproveVaultStable()).result.current;
		await expect(approve(USDT, 1n)).rejects.toBeInstanceOf(TransactionRevertedError);
	});
});
