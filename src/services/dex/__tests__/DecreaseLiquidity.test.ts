/**
 * Regression tests for the two withdrawal bugs found 2026-08-26:
 *
 *  1. amount0Min / amount1Min were parsed at a hardcoded 18 decimals, so on a pool with
 *     a 6-decimal token (KMT/USDT) any non-zero minimum came out 1e12 too large and the
 *     withdrawal reverted.
 *  2. The UI passed '0' for both minimums, so withdrawals had no slippage protection.
 *
 * These drive the real BaseV3Service.decreaseLiquidity against stubbed clients and
 * assert on the arguments that reach the position manager.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseV3Service } from '../BaseV3Service';
import { V3DexConfig } from '@/config/dex/v3-config';

const POSITION_MANAGER = '0xCa4a8fC696ADAE8edC042cB9E32Cd7F0A28EBdf0';
const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172'; // 6 decimals
const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b'; // 18 decimals
const TOKEN_ID = 2n;

class TestV3Service extends BaseV3Service {
	getName(): string { return 'Test'; }
	getChainId(): number { return 3890; }
	async executeSwap(): Promise<string> { return '0x'; }
	async createAndInitializePool(): Promise<string> { return '0x'; }
}

function makeService() {
	return new TestV3Service({
		positionManager: POSITION_MANAGER,
		positionManagerABI: [],
	} as unknown as V3DexConfig);
}

/**
 * @param expected what a simulated decreaseLiquidity would return, as [amount0, amount1]
 */
function makeClients(expected: [bigint, bigint] | 'revert') {
	const writeContract = vi.fn().mockResolvedValue('0xtx');

	const publicClient = {
		readContract: vi.fn(async ({ address, functionName }: any) => {
			if (functionName === 'positions') {
				// (nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, ...)
				return [0n, '0x0', USDT, WKMT, 3000, -887220, 887220, 1000n, 0n, 0n, 0n, 0n];
			}
			if (functionName === 'ownerOf') {
				return '0xdead';
			}
			if (functionName === 'decimals') {
				return address.toLowerCase() === USDT.toLowerCase() ? 6 : 18;
			}
			throw new Error(`unexpected read: ${functionName}`);
		}),
		simulateContract: vi.fn(async () => {
			if (expected === 'revert') throw new Error('simulation failed');
			return { result: expected };
		}),
	} as any;

	const walletClient = {
		account: { address: '0xdead' },
		chain: { id: 3890 },
		writeContract,
	} as any;

	return { publicClient, walletClient, writeContract };
}

function argsOf(writeContract: ReturnType<typeof vi.fn>) {
	return writeContract.mock.calls[0][0].args[0];
}

describe('decreaseLiquidity — decimals', () => {
	it('parses an explicit token0 minimum at the token\'s OWN decimals, not 18', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients([0n, 0n]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, amount0Min: '25', amount1Min: '125', deadline: 20 },
			publicClient,
			walletClient
		);

		const args = argsOf(writeContract);
		// 25 USDT at 6 decimals. The old code produced 25e18 — 1e12 too large.
		expect(args.amount0Min).toBe(25_000_000n);
		expect(args.amount1Min).toBe(125_000_000_000_000_000_000n);
	});

	it('does not confuse the two tokens when their decimals differ', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients([0n, 0n]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 1n, amount0Min: '1', amount1Min: '1', deadline: 20 },
			publicClient,
			walletClient
		);

		const args = argsOf(writeContract);
		expect(args.amount0Min).toBe(10n ** 6n);
		expect(args.amount1Min).toBe(10n ** 18n);
	});
});

describe('decreaseLiquidity — slippage protection', () => {
	it('derives non-zero minimums from a simulation when none are supplied', async () => {
		const service = makeService();
		// the withdrawal would return 26 USDT and 130 wKMT
		const { publicClient, walletClient, writeContract } = makeClients([
			26_000_000n,
			130_000_000_000_000_000_000n,
		]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, slippageTolerance: 0.5, deadline: 20 },
			publicClient,
			walletClient
		);

		const args = argsOf(writeContract);
		// 0.5% below expected — and crucially NOT zero, which is what shipped before.
		expect(args.amount0Min).toBe(25_870_000n);
		expect(args.amount1Min).toBe(129_350_000_000_000_000_000n);
		expect(args.amount0Min).toBeGreaterThan(0n);
		expect(args.amount1Min).toBeGreaterThan(0n);
	});

	it('honours a tighter tolerance', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients([1_000_000n, 0n]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, slippageTolerance: 0.1, deadline: 20 },
			publicClient,
			walletClient
		);

		expect(argsOf(writeContract).amount0Min).toBe(999_000n);
	});

	it('defaults to 0.5% when no tolerance is given', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients([1_000_000n, 0n]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, deadline: 20 },
			publicClient,
			walletClient
		);

		expect(argsOf(writeContract).amount0Min).toBe(995_000n);
	});

	it('leaves a one-sided position\'s empty side at zero', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients([0n, 500_000_000n]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, deadline: 20 },
			publicClient,
			walletClient
		);

		const args = argsOf(writeContract);
		expect(args.amount0Min).toBe(0n);
		expect(args.amount1Min).toBe(497_500_000n);
	});

	it('still sends the withdrawal if the simulation reverts, rather than trapping funds', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients('revert');

		const hash = await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, deadline: 20 },
			publicClient,
			walletClient
		);

		expect(hash).toBe('0xtx');
		const args = argsOf(writeContract);
		expect(args.amount0Min).toBe(0n);
		expect(args.amount1Min).toBe(0n);
	});

	it('carries the KalyChain gas floor', async () => {
		const service = makeService();
		const { publicClient, walletClient, writeContract } = makeClients([1n, 1n]);

		await service.decreaseLiquidity(
			{ tokenId: TOKEN_ID, liquidity: 500n, deadline: 20 },
			publicClient,
			walletClient
		);

		const req = writeContract.mock.calls[0][0];
		expect(req.maxPriorityFeePerGas).toBe(21_000_000_000n);
	});
});
