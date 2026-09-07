/**
 * @vitest-environment jsdom
 *
 * Regression tests for the launchpad participation bugs found 2026-08-26:
 *
 *  1. ERC20 contributions sent no approval, so participate()'s safeTransferFrom always
 *     reverted, and the amount was parsed with parseEther() (18 dp) whatever the base
 *     token's real decimals were.
 *  2. canRefund was hardcoded false, so the refund button could never appear on a
 *     failed or cancelled sale.
 */
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const writeContract = vi.fn().mockResolvedValue('0xhash');
const readContract = vi.fn();
const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });

const USER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PRESALE = '0x1111111111111111111111111111111111111111';
const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172'; // 6 decimals

vi.mock('wagmi', () => ({
	useAccount: () => ({ address: USER, isConnected: true }),
	usePublicClient: () => ({ readContract, waitForTransactionReceipt }),
	useWalletClient: () => ({ data: { chain: { id: 3890 }, writeContract } }),
}));

vi.mock('@/lib/logger', () => ({
	launchpadLogger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useParticipation } from '../useParticipation';

/** Every readContract answer the hook needs, driven by function name. */
function stubReads({ allowance, status }: { allowance: bigint; status: number }) {
	readContract.mockImplementation(async ({ functionName }: any) => {
		switch (functionName) {
			case 'decimals': return 6;
			case 'allowance': return allowance;
			case 'buyers': return [1_000_000n, 5_000_000_000_000_000_000n, false];
			case 'getStatus': return status;
			default: throw new Error(`unexpected read: ${functionName}`);
		}
	});
}

const writes = () => writeContract.mock.calls.map((c) => c[0]);

describe('participate — ERC20 base token', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
	});

	it('approves the presale before contributing', async () => {
		stubReads({ allowance: 0n, status: 1 });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.participate({
				contractAddress: PRESALE, projectType: 'presale',
				amount: '25', baseToken: USDT
			});
		});

		const calls = writes();
		expect(calls).toHaveLength(2);
		expect(calls[0].functionName).toBe('approve');
		expect(calls[0].address).toBe(USDT);
		expect(calls[0].args[0]).toBe(PRESALE);
		expect(calls[1].functionName).toBe('participate');
	});

	it('uses the base token\'s OWN decimals, not 18', async () => {
		stubReads({ allowance: 0n, status: 1 });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.participate({
				contractAddress: PRESALE, projectType: 'presale',
				amount: '25', baseToken: USDT
			});
		});

		// 25 USDT at 6 decimals. parseEther('25') would be 25e18 — 1e12 too large.
		expect(writes()[1].args[0]).toBe(25_000_000n);
		expect(writes()[0].args[1]).toBe(25_000_000n);
	});

	it('sends no native value alongside an ERC20 contribution', async () => {
		// participate() has `if (!isNative) require(msg.value == 0)`.
		stubReads({ allowance: 0n, status: 1 });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.participate({
				contractAddress: PRESALE, projectType: 'presale',
				amount: '25', baseToken: USDT
			});
		});

		// participate() has `if (!isNative) require(msg.value == 0)` — 0n satisfies it.
		expect(writes()[1].value).toBe(0n);
	});

	it('skips the approval when the allowance already covers it', async () => {
		stubReads({ allowance: 100_000_000n, status: 1 });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.participate({
				contractAddress: PRESALE, projectType: 'presale',
				amount: '25', baseToken: USDT
			});
		});

		const calls = writes();
		expect(calls).toHaveLength(1);
		expect(calls[0].functionName).toBe('participate');
	});

	it('does not contribute if the approval reverted', async () => {
		stubReads({ allowance: 0n, status: 1 });
		waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.participate({
				contractAddress: PRESALE, projectType: 'presale',
				amount: '25', baseToken: USDT
			});
		});

		expect(writes().map((c) => c.functionName)).toEqual(['approve']);
		expect(result.current.error).toMatch(/Approval failed/);
	});
});

describe('participate — native base token', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('sends msg.value and never asks for an allowance', async () => {
		stubReads({ allowance: 0n, status: 1 });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.participate({
				contractAddress: PRESALE, projectType: 'presale',
				amount: '1', baseToken: '0x0000000000000000000000000000000000000000'
			});
		});

		const calls = writes();
		expect(calls).toHaveLength(1);
		expect(calls[0].functionName).toBe('participate');
		expect(calls[0].value).toBe(10n ** 18n);
	});
});

describe('refund eligibility', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	// { PENDING, ACTIVE, SUCCESS, FAILED, CANCELLED, FINALIZED }
	it.each([
		['FAILED', 3, true],
		['CANCELLED', 4, true],
		['ACTIVE', 1, false],
		['SUCCESS', 2, false],
		['FINALIZED', 5, false],
	])('is %s -> canRefund %s', async (_label, status, expected) => {
		stubReads({ allowance: 0n, status: status as number });
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.fetchUserContribution(PRESALE, 'presale', false);
		});

		expect(result.current.userContribution?.canRefund).toBe(expected);
	});

	it('is false once the contribution has already been claimed', async () => {
		readContract.mockImplementation(async ({ functionName }: any) => {
			if (functionName === 'buyers') return [1_000_000n, 0n, true]; // claimed
			if (functionName === 'getStatus') return 3; // FAILED
			throw new Error(`unexpected read: ${functionName}`);
		});
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.fetchUserContribution(PRESALE, 'presale', false);
		});

		expect(result.current.userContribution?.canRefund).toBe(false);
	});

	it('is false for someone who never contributed', async () => {
		readContract.mockImplementation(async ({ functionName }: any) => {
			if (functionName === 'buyers') return [0n, 0n, false];
			if (functionName === 'getStatus') return 3; // FAILED
			throw new Error(`unexpected read: ${functionName}`);
		});
		const { result } = renderHook(() => useParticipation());

		await act(async () => {
			await result.current.fetchUserContribution(PRESALE, 'presale', false);
		});

		expect(result.current.userContribution?.canRefund).toBe(false);
	});
});
