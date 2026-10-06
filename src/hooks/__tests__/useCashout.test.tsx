/**
 * @vitest-environment jsdom
 *
 * The cash-out checks the Polygon side of the USDT route before the swap and again right before the
 * bridge transaction: if it holds less than the cash-out, nothing more goes out. The USDT counts as
 * "stranded" in the wallet (the user is offered the bridge step alone) only when the swap mined and
 * the bridge transaction was never broadcast or reverted. Once the bridge transaction is broadcast
 * nothing throws: an unreadable receipt is reported as sent, so a resume can never double-send.
 * Delivery polling is capped by attempts, failed reads included.
 */
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { encodeEventTopics } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mailboxAbi } from '@/config/abis/hyperlane';
import { CashoutStrandedError } from '@/utils/kusdCashout';
import type { KusdStep } from '@/utils/kusdPlans';
import { TransactionRevertedError } from '@/utils/transactions';

const OWNER = '0x1111111111111111111111111111111111111111';
const YC = '0x2222222222222222222222222222222222222222';
const MSG = `0x${'ab'.repeat(32)}` as const;
const BRIDGE_HASH = `0x${'cd'.repeat(32)}` as const;
const USDT = 10n ** 6n;
const MAILBOX = '0x4444444444444444444444444444444444444444';
const runSteps = vi.fn();
const send = vi.fn();
const polygonRead = vi.fn();
const kalyRead = vi.fn();
const getTransactionReceipt = vi.fn();
let walletUsdt: bigint[] = []; // successive balanceOf(owner) reads on KalyChain

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: OWNER }),
	usePublicClient: ({ chainId }: { chainId: number }) =>
		chainId === 137 ? { readContract: polygonRead } : { readContract: kalyRead, getTransactionReceipt },
}));
vi.mock('@/hooks/kusd/useKusdWriter', () => ({ useKusdSteps: () => runSteps, useKusdWriter: () => send }));

import { DELIVERY_MAX_POLLS, useBridgeDelivery, useCashout } from '@/hooks/kusd/useCashout';

const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const plan = { gemAmt: 60n * USDT, cost: 60n * 10n ** 18n };
const swapFunctions = () => (runSteps.mock.calls[0][0] as KusdStep[]).map((s) => s.write.functionName);
const bridgeStep = () => send.mock.calls[0][0] as KusdStep;

beforeEach(() => {
	runSteps.mockReset().mockResolvedValue(['0x01', '0x02']);
	send.mockReset().mockImplementation(async (_step: KusdStep, onHash?: (hash: `0x${string}`) => void) => {
		onHash?.(BRIDGE_HASH);
		return BRIDGE_HASH;
	});
	polygonRead.mockReset().mockResolvedValue(100n * USDT); // Polygon router USDT
	walletUsdt = [0n, 0n];
	kalyRead.mockReset().mockImplementation(async ({ functionName }: { functionName: string }) => {
		if (functionName === 'mailbox') return MAILBOX;
		if (functionName === 'balanceOf') return walletUsdt.length > 1 ? walletUsdt.shift() : walletUsdt[0];
		return 3n; // quoteGasPayment(137)
	});
	getTransactionReceipt.mockReset().mockResolvedValue({
		logs: [{ address: MAILBOX, topics: encodeEventTopics({ abi: mailboxAbi, eventName: 'DispatchId', args: { messageId: MSG } }), data: '0x' }],
	});
});
afterEach(() => {
	vi.useRealTimers();
});

describe('useCashout', () => {
	it('sends nothing when the Polygon side holds less USDT than the cash-out before the swap', async () => {
		polygonRead.mockResolvedValue(59n * USDT);
		const { result } = renderHook(() => useCashout(), { wrapper });
		await expect(result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n })).rejects.toMatchObject({ code: 'insufficientCollateral' });
		expect(runSteps).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it('swaps, re-checks Polygon right before bridging, then bridges with the live fee and returns the message id', async () => {
		const { result } = renderHook(() => useCashout(), { wrapper });
		const sent = await result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n });
		expect(swapFunctions()).toEqual(['approve', 'buyGem']);
		expect(bridgeStep().write.functionName).toBe('transferRemote');
		expect(bridgeStep().write.value).toBe(3n);
		expect(polygonRead).toHaveBeenCalledTimes(2);
		expect(sent).toEqual({ gemAmt: plan.gemAmt, recipient: YC, hash: BRIDGE_HASH, messageId: MSG });
	});

	it('leaves the USDT stranded, unsent, when Polygon runs short between the swap and the bridge', async () => {
		polygonRead.mockResolvedValueOnce(100n * USDT).mockResolvedValueOnce(59n * USDT);
		const { result } = renderHook(() => useCashout(), { wrapper });
		const error = await result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(CashoutStrandedError);
		expect(error).toMatchObject({ gemAmt: plan.gemAmt, cause: { code: 'insufficientCollateral' } });
		expect(send).not.toHaveBeenCalled();
	});

	it('leaves the USDT stranded when the wallet rejects the bridge transaction', async () => {
		send.mockRejectedValue(new Error('User rejected the request.'));
		const { result } = renderHook(() => useCashout(), { wrapper });
		await expect(result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n })).rejects.toBeInstanceOf(CashoutStrandedError);
	});

	it('leaves the USDT stranded when the bridge transaction reverts on-chain', async () => {
		send.mockImplementation(async (_step: KusdStep, onHash?: (hash: `0x${string}`) => void) => {
			onHash?.(BRIDGE_HASH);
			throw new TransactionRevertedError(BRIDGE_HASH, 'bridgeTransfer');
		});
		const { result } = renderHook(() => useCashout(), { wrapper });
		await expect(result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n })).rejects.toBeInstanceOf(CashoutStrandedError);
	});

	it('reports a broadcast bridge transaction as sent when its receipt wait fails — never as stranded', async () => {
		send.mockImplementation(async (_step: KusdStep, onHash?: (hash: `0x${string}`) => void) => {
			onHash?.(BRIDGE_HASH);
			throw new Error('Timed out while waiting for transaction');
		});
		getTransactionReceipt.mockRejectedValue(new Error('rpc down'));
		const { result } = renderHook(() => useCashout(), { wrapper });
		await expect(result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n })).resolves.toEqual({ gemAmt: plan.gemAmt, recipient: YC, hash: BRIDGE_HASH, messageId: null });
	});

	it('reports the message id as unknown when the mined receipt cannot be re-read', async () => {
		getTransactionReceipt.mockRejectedValue(new Error('rpc down'));
		const { result } = renderHook(() => useCashout(), { wrapper });
		await expect(result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n })).resolves.toMatchObject({ hash: BRIDGE_HASH, messageId: null });
	});

	it('treats a swap whose receipt wait failed as stranded when its USDT reached the wallet', async () => {
		runSteps.mockRejectedValue(new Error('Timed out while waiting for transaction'));
		walletUsdt = [5n * USDT, 65n * USDT]; // before the swap, then after: +60 USDT arrived
		const { result } = renderHook(() => useCashout(), { wrapper });
		const error = await result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(CashoutStrandedError);
		expect(error).toMatchObject({ gemAmt: plan.gemAmt });
		expect(send).not.toHaveBeenCalled();
	});

	it('passes a swap failure through unchanged when no USDT arrived', async () => {
		runSteps.mockRejectedValue(new Error('User rejected the request.'));
		walletUsdt = [5n * USDT, 5n * USDT];
		const { result } = renderHook(() => useCashout(), { wrapper });
		const error = await result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n }).catch((e: unknown) => e);
		expect(error).not.toBeInstanceOf(CashoutStrandedError);
		expect((error as Error).message).toBe('User rejected the request.');
	});

	it('refreshes the shown Polygon limit when it refuses a cash-out', async () => {
		polygonRead.mockResolvedValue(59n * USDT);
		const client = new QueryClient();
		const invalidate = vi.spyOn(client, 'invalidateQueries');
		const own = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		const { result } = renderHook(() => useCashout(), { wrapper: own });
		await result.current.cashout({ plan, recipient: YC, kusdAllowance: 0n }).catch(() => undefined);
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['kusdCashoutCollateral'] });
	});

	it('resumes a stranded swap with the bridge step alone, after the same collateral check', async () => {
		const { result } = renderHook(() => useCashout(), { wrapper });
		await result.current.resumeBridge({ gemAmt: plan.gemAmt, recipient: YC });
		expect(runSteps).not.toHaveBeenCalled();
		expect(bridgeStep().write.functionName).toBe('transferRemote');
		expect(polygonRead).toHaveBeenCalledTimes(1);
	});
});

describe('useBridgeDelivery', () => {
	it('does not poll Polygon without a message id', () => {
		const { result } = renderHook(() => useBridgeDelivery(null), { wrapper });
		expect(result.current).toBe('untracked');
		expect(polygonRead).not.toHaveBeenCalled();
	});

	it('moves from pending to delivered as Polygon processes the message, then stops', async () => {
		vi.useFakeTimers();
		polygonRead.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
		const { result } = renderHook(() => useBridgeDelivery(MSG), { wrapper });
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(result.current).toBe('pending');
		for (let i = 0; i < 2; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));
		await act(() => vi.advanceTimersByTimeAsync(1)); // React Query notifies on a 0 ms timer
		expect(result.current).toBe('delivered');
		for (let i = 0; i < 5; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));
		expect(polygonRead).toHaveBeenCalledTimes(3);
	});

	it('stops polling once delivered', async () => {
		vi.useFakeTimers();
		polygonRead.mockResolvedValue(true);
		const { result } = renderHook(() => useBridgeDelivery(MSG), { wrapper });
		for (let i = 0; i < 5; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));
		expect(result.current).toBe('delivered');
		expect(polygonRead).toHaveBeenCalledTimes(1);
	});

	it('gives up as "slow" after the poll cap even when every Polygon read fails (no unbounded paid-RPC calls)', async () => {
		vi.useFakeTimers();
		polygonRead.mockRejectedValue(new Error('429 Too Many Requests'));
		const { result } = renderHook(() => useBridgeDelivery(MSG), { wrapper });
		for (let i = 0; i < DELIVERY_MAX_POLLS + 10; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));
		expect(result.current).toBe('slow');
		expect(polygonRead).toHaveBeenCalledTimes(DELIVERY_MAX_POLLS);
	});
});
