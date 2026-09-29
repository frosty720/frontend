/**
 * @vitest-environment jsdom
 *
 * A swap must not report success until it is mined and succeeded. The router call returns the
 * moment the wallet sends the transaction; on 2026-09-28 the swap form showed "complete" and
 * refreshed balances right then, so the boss saw no KUSD from a swap that had in fact landed —
 * and a reverted swap would have read as done. These pin executeSwap to the receipt.
 */
import { renderHook, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import type { SwapParams, Token } from '@/config/dex/types';
import { KALYCHAIN_MIN_PRIORITY_FEE_WEI } from '@/config/gas';
import { TransactionRevertedError } from '@/utils/transactions';

const WETH = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';
const KUSD = '0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9';
const USER = '0x1111111111111111111111111111111111111111';

const waitForTransactionReceipt = vi.fn();
const serviceExecuteSwap = vi.fn(async () => '0xswap');
const writeContract = vi.fn(async (_request: Record<string, unknown>) => '0xwrap');

vi.mock('wagmi', () => ({
	usePublicClient: () => ({ waitForTransactionReceipt }),
	useWalletClient: () => ({ data: { chain: { id: 3890 }, writeContract } }),
	useAccount: () => ({ connector: undefined }),
}));
vi.mock('@/services/dex/KalySwapV3Service', () => ({
	getKalySwapV3Service: () => ({
		getWethAddress: () => WETH,
		getRouterAddress: () => '0x2222222222222222222222222222222222222222',
		executeSwap: serviceExecuteSwap,
	}),
}));

import { useV3Swap } from '../useV3Swap';

const token = (symbol: string, address: string, isNative = false): Token => ({
	chainId: CHAIN_IDS.KALYCHAIN,
	address,
	decimals: 18,
	name: symbol,
	symbol,
	logoURI: '',
	isNative,
});
const KMT = token('KMT', '0x0000000000000000000000000000000000000000', true);

const params = (tokenOut: Token): SwapParams => ({
	tokenIn: KMT,
	tokenOut,
	amountIn: '10',
	amountOutMin: '1',
	to: USER,
	deadline: 20,
	slippageTolerance: 0.5,
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('useV3Swap.executeSwap', () => {
	beforeEach(() => {
		waitForTransactionReceipt.mockReset();
		serviceExecuteSwap.mockClear();
		writeContract.mockClear();
	});
	afterEach(cleanup);

	it('does not resolve until the swap receipt arrives, then returns the hash', async () => {
		const receipt = deferred<{ status: string }>();
		waitForTransactionReceipt.mockReturnValue(receipt.promise);
		const { executeSwap } = renderHook(() => useV3Swap(CHAIN_IDS.KALYCHAIN)).result.current;

		let settled = false;
		const swap = executeSwap(params(token('KUSD', KUSD))).finally(() => (settled = true));
		await vi.waitFor(() => expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xswap' }));
		expect(settled).toBe(false);

		receipt.resolve({ status: 'success' });
		await expect(swap).resolves.toBe('0xswap');
	});

	it('throws TransactionRevertedError when the swap reverts on-chain', async () => {
		waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
		const { executeSwap } = renderHook(() => useV3Swap(CHAIN_IDS.KALYCHAIN)).result.current;
		await expect(executeSwap(params(token('KUSD', KUSD)))).rejects.toBeInstanceOf(TransactionRevertedError);
	});

	it('also waits for a KMT → WKMT wrap and rejects a reverted one', async () => {
		waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
		const { executeSwap } = renderHook(() => useV3Swap(CHAIN_IDS.KALYCHAIN)).result.current;
		await expect(executeSwap(params(token('WKMT', WETH)))).resolves.toBe('0xwrap');
		expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xwrap' });
		expect(serviceExecuteSwap).not.toHaveBeenCalled();

		waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
		await expect(executeSwap(params(token('WKMT', WETH)))).rejects.toBeInstanceOf(TransactionRevertedError);
	});
});

describe('useV3Swap.approveToken', () => {
	beforeEach(() => {
		waitForTransactionReceipt.mockReset();
		writeContract.mockClear();
	});
	afterEach(cleanup);

	// 3890 advertises a 20 gwei tip (fee history 0). The approval was the one write sent without
	// the floor, so MetaMask signed it underpriced and the swap behind it never started.
	it('sends the router approval with the KalyChain 21 gwei fee floor and waits for it', async () => {
		waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
		const { approveToken } = renderHook(() => useV3Swap(CHAIN_IDS.KALYCHAIN)).result.current;
		await approveToken(token('USDT', '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172'));

		const request = writeContract.mock.calls[0][0];
		expect(request.functionName).toBe('approve');
		expect(request.maxPriorityFeePerGas).toBeGreaterThanOrEqual(KALYCHAIN_MIN_PRIORITY_FEE_WEI);
		expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xwrap' });
	});
});
