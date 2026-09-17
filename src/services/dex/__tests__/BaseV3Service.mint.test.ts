/**
 * Opening a V3 position moves user funds. Each amount must stay with its own token when the pair is
 * sorted into pool order, native KMT must go in as msg.value against WKMT with a refund, a new pool
 * must be created in the same transaction, and gas must never drop below the measured floors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeFunctionData, parseAbi, type PublicClient, type WalletClient } from 'viem';
import { BaseV3Service } from '../BaseV3Service';
import type { V3DexConfig } from '@/config/dex/v3-config';
import type { Token } from '@/config/dex/types';
import type { V3AddLiquidityParams } from '../IV3DexService';
import { V3NonfungiblePositionManagerABI } from '@/config/abis';
import { KALYCHAIN_MIN_PRIORITY_FEE_WEI } from '@/config/gas';

class TestV3Service extends BaseV3Service {
	getName(): string { return 'TestService'; }
	getChainId(): number { return 3890; }
	executeSwap(): Promise<string> { return Promise.resolve('0x'); }
	createAndInitializePool(): Promise<string> { return Promise.resolve('0x'); }
}

const NPM = '0xCa4a8fC696ADAE8edC042cB9E32Cd7F0A28EBdf0';
const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b';
const USDT: Token = { chainId: 3890, address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', decimals: 6, symbol: 'USDT', name: 'Tether', logoURI: '' };
const WKMT_TOKEN: Token = { chainId: 3890, address: WKMT, decimals: 18, symbol: 'wKMT', name: 'Wrapped KMT', logoURI: '' };
const KMT: Token = { chainId: 3890, address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'KMT', name: 'KMT', logoURI: '', isNative: true };
const USER = '0x1111111111111111111111111111111111111111';
const abi = V3NonfungiblePositionManagerABI as never;
const refundAbi = parseAbi(['function refundETH() payable']);

let writeContract: ReturnType<typeof vi.fn<unknown[], Promise<string>>>;
let estimateContractGas: ReturnType<typeof vi.fn<unknown[], Promise<bigint>>>;
let service: TestV3Service;

function params(overrides: Partial<V3AddLiquidityParams>): V3AddLiquidityParams {
	return {
		token0: WKMT_TOKEN,
		token1: USDT,
		fee: 3000,
		tickLower: -887220,
		tickUpper: 887220,
		amount0Desired: '100',
		amount1Desired: '20',
		amount0Min: '99.5',
		amount1Min: '19.9',
		recipient: USER,
		deadline: 20,
		...overrides,
	};
}

async function mint(p: V3AddLiquidityParams) {
	await service.mintV3Position(p, { estimateContractGas } as unknown as PublicClient, { writeContract, account: { address: USER }, chain: { id: 3890 } } as unknown as WalletClient);
	const request = writeContract.mock.calls[0][0] as { args: readonly unknown[]; [key: string]: unknown };
	const calls = (request.args[0] as `0x${string}`[]).map((data) => {
		try {
			return decodeFunctionData({ abi, data }) as { functionName: string; args: readonly unknown[] };
		} catch {
			return decodeFunctionData({ abi: refundAbi, data }) as { functionName: string; args: readonly unknown[] };
		}
	});
	return { request, calls };
}

describe('BaseV3Service.mintV3Position', () => {
	beforeEach(() => {
		writeContract = vi.fn<unknown[], Promise<string>>(async () => '0xhash');
		estimateContractGas = vi.fn<unknown[], Promise<bigint>>(async () => 400_000n);
		service = new TestV3Service({ positionManager: NPM, positionManagerABI: V3NonfungiblePositionManagerABI, wethAddress: WKMT } as unknown as V3DexConfig);
	});

	it('keeps each amount and minimum with its own token when the caller’s order is not pool order', async () => {
		// Caller order: WKMT (A), USDT (B). Pool order: USDT (0x63…) < WKMT (0xf9…).
		const { request, calls } = await mint(params({}));
		expect(request.address).toBe(NPM);
		expect(request.functionName).toBe('multicall');
		expect(request.value).toBe(0n);
		expect(calls.map((c) => c.functionName)).toEqual(['mint']);
		const m = calls[0].args[0] as Record<string, unknown>;
		expect((m.token0 as string).toLowerCase()).toBe(USDT.address.toLowerCase());
		expect((m.token1 as string).toLowerCase()).toBe(WKMT.toLowerCase());
		expect(m.amount0Desired).toBe(20_000_000n); // 20 USDT at 6 decimals
		expect(m.amount1Desired).toBe(100n * 10n ** 18n); // 100 WKMT at 18 decimals
		expect(m.amount0Min).toBe(19_900_000n);
		expect(m.amount1Min).toBe(995n * 10n ** 17n);
		expect((m.recipient as string).toLowerCase()).toBe(USER);
		expect(request.maxPriorityFeePerGas).toBe(KALYCHAIN_MIN_PRIORITY_FEE_WEI);
	});

	it('sends native KMT as value against WKMT and refunds the unused part', async () => {
		const { request, calls } = await mint(params({ token0: USDT, token1: KMT, amount0Desired: '20', amount1Desired: '100', amount0Min: '0', amount1Min: '0' }));
		expect(request.value).toBe(100n * 10n ** 18n);
		expect(calls.map((c) => c.functionName)).toEqual(['mint', 'refundETH']);
		const m = calls[0].args[0] as Record<string, unknown>;
		expect((m.token1 as string).toLowerCase()).toBe(WKMT.toLowerCase());
		expect(m.amount1Desired).toBe(100n * 10n ** 18n);
	});

	it('creates and initialises the pool first when a starting price is given', async () => {
		const sqrtPriceX96 = 175651280628475597865072411508591304n;
		estimateContractGas.mockResolvedValue(5_300_000n);
		const { request, calls } = await mint(params({ sqrtPriceX96 }));
		expect(calls.map((c) => c.functionName)).toEqual(['createAndInitializePoolIfNecessary', 'mint']);
		const [t0, t1, fee, price] = calls[0].args as [string, string, number, bigint];
		expect([t0.toLowerCase(), t1.toLowerCase(), fee, price]).toEqual([USDT.address.toLowerCase(), WKMT.toLowerCase(), 3000, sqrtPriceX96]);
		expect(request.gas).toBe(7_950_000n);
	});

	it('never goes below the measured gas floors, and falls back when estimation fails', async () => {
		await mint(params({}));
		expect((writeContract.mock.calls[0][0] as { gas: bigint }).gas).toBe(900_000n);

		writeContract.mockClear();
		estimateContractGas.mockRejectedValue(new Error('execution reverted'));
		await mint(params({ sqrtPriceX96: 2n ** 96n }));
		expect((writeContract.mock.calls[0][0] as { gas: bigint }).gas).toBe(7_500_000n);

		writeContract.mockClear();
		estimateContractGas.mockResolvedValue(100n);
		await mint(params({ sqrtPriceX96: 2n ** 96n }));
		expect((writeContract.mock.calls[0][0] as { gas: bigint }).gas).toBe(7_000_000n);
	});

	it('refuses KMT paired with WKMT (the same pool token)', async () => {
		await expect(service.mintV3Position(params({ token0: KMT, token1: WKMT_TOKEN }), { estimateContractGas } as unknown as PublicClient, { writeContract } as unknown as WalletClient)).rejects.toThrow(/same asset/);
		expect(writeContract).not.toHaveBeenCalled();
	});
});
