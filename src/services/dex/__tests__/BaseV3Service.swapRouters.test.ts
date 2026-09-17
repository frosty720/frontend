/**
 * Two router shapes, one swap path. Uniswap's SwapRouter02 (KalyChain, Arbitrum) keeps the deadline
 * on the multicall; PancakeSwap V3 forked the ORIGINAL SwapRouter, which puts the deadline inside
 * the swap struct, takes a recipient on unwrapWETH9 and only has multicall(bytes[]). Verified
 * against both deployed bytecodes on 2026-09-17: sending the wrong shape hits a selector that is
 * not there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeFunctionData, type PublicClient, type WalletClient } from 'viem';
import { CHAIN_IDS } from '@/config/chains';
import { getV3Config } from '@/config/dex/v3-config';
import type { Token } from '@/config/dex/types';
import { getKalySwapV3Service } from '../KalySwapV3Service';

const USER = '0x1111111111111111111111111111111111111111';
const token = (chainId: number, address: string, symbol: string, decimals = 18, isNative = false): Token => ({
	chainId, address, symbol, name: symbol, decimals, logoURI: '', ...(isNative ? { isNative: true } : {}),
});

let writeContract: ReturnType<typeof vi.fn<unknown[], Promise<string>>>;
const walletClient = () => ({ writeContract, account: { address: USER }, chain: { id: 0 } }) as unknown as WalletClient;

async function swap(chainId: number, tokenIn: Token, tokenOut: Token) {
	const service = getKalySwapV3Service(chainId)!;
	await service.executeV3Swap(
		{ tokenIn, tokenOut, fee: 500, amountIn: '1', amountOutMinimum: '0.9', recipient: USER, deadline: 20 },
		{} as PublicClient,
		walletClient(),
	);
	const request = writeContract.mock.calls[0][0] as { address: string; args: readonly unknown[]; value: bigint; abi: readonly unknown[] };
	return { request, config: getV3Config(chainId)! };
}

describe('executeV3Swap builds calldata for the router the chain actually has', () => {
	beforeEach(() => {
		writeContract = vi.fn<unknown[], Promise<string>>(async () => '0xhash');
	});

	it('Arbitrum (SwapRouter02): deadline rides on the multicall, not in the swap struct', async () => {
		const weth = token(CHAIN_IDS.ARBITRUM, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 'WETH');
		const usdc = token(CHAIN_IDS.ARBITRUM, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC', 6);
		const { request, config } = await swap(CHAIN_IDS.ARBITRUM, weth, usdc);

		expect(request.address).toBe(config.router);
		// multicall(uint256 deadline, bytes[] data)
		expect(request.args).toHaveLength(2);
		expect(typeof request.args[0]).toBe('bigint');
		const calls = request.args[1] as `0x${string}`[];
		expect(calls).toHaveLength(1);
		const swapCall = decodeFunctionData({ abi: config.routerABI, data: calls[0] });
		expect(swapCall.functionName).toBe('exactInputSingle');
		expect(swapCall.args![0]).not.toHaveProperty('deadline');
		expect(request.value).toBe(0n);
	});

	it('BSC (PancakeSwap V3): deadline inside the struct and a plain multicall(bytes[])', async () => {
		const wbnb = token(CHAIN_IDS.BSC, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'WBNB');
		const usdt = token(CHAIN_IDS.BSC, '0x55d398326f99059fF775485246999027B3197955', 'USDT');
		const { request, config } = await swap(CHAIN_IDS.BSC, wbnb, usdt);

		expect(request.address).toBe(config.router);
		// multicall(bytes[] data) — one argument, no deadline
		expect(request.args).toHaveLength(1);
		const calls = request.args[0] as `0x${string}`[];
		const swapCall = decodeFunctionData({ abi: config.routerABI, data: calls[0] });
		expect(swapCall.functionName).toBe('exactInputSingle');
		const params = swapCall.args![0] as { deadline: bigint; fee: number };
		expect(typeof params.deadline).toBe('bigint');
		expect(params.fee).toBe(500);
	});

	it('unwraps to native with the argument list each router expects', async () => {
		// Arbitrum: unwrapWETH9(amountMinimum)
		const arbNative = token(CHAIN_IDS.ARBITRUM, '0x0000000000000000000000000000000000000000', 'ETH', 18, true);
		const usdc = token(CHAIN_IDS.ARBITRUM, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC', 6);
		const arb = await swap(CHAIN_IDS.ARBITRUM, usdc, arbNative);
		const arbCalls = arb.request.args[1] as `0x${string}`[];
		expect(arbCalls).toHaveLength(2);
		const arbUnwrap = decodeFunctionData({ abi: arb.config.routerABI, data: arbCalls[1] });
		expect(arbUnwrap.functionName).toBe('unwrapWETH9');
		expect(arbUnwrap.args).toHaveLength(1);

		writeContract.mockClear();

		// BSC: unwrapWETH9(amountMinimum, recipient) — the user, not the router
		const bnb = token(CHAIN_IDS.BSC, '0x0000000000000000000000000000000000000000', 'BNB', 18, true);
		const usdt = token(CHAIN_IDS.BSC, '0x55d398326f99059fF775485246999027B3197955', 'USDT');
		const bsc = await swap(CHAIN_IDS.BSC, usdt, bnb);
		const bscCalls = bsc.request.args[0] as `0x${string}`[];
		expect(bscCalls).toHaveLength(2);
		const bscUnwrap = decodeFunctionData({ abi: bsc.config.routerABI, data: bscCalls[1] });
		expect(bscUnwrap.functionName).toBe('unwrapWETH9');
		expect(bscUnwrap.args).toEqual([900000000000000000n, USER]);
	});

	it('sends the native amount as value when paying with the chain’s own coin', async () => {
		const bnb = token(CHAIN_IDS.BSC, '0x0000000000000000000000000000000000000000', 'BNB', 18, true);
		const usdt = token(CHAIN_IDS.BSC, '0x55d398326f99059fF775485246999027B3197955', 'USDT');
		const { request, config } = await swap(CHAIN_IDS.BSC, bnb, usdt);
		expect(request.value).toBe(10n ** 18n);
		const calls = request.args[0] as `0x${string}`[];
		const params = decodeFunctionData({ abi: config.routerABI, data: calls[0] }).args![0] as { tokenIn: string };
		// The pool trades the wrapped token, never the zero address.
		expect(params.tokenIn).toBe(config.wethAddress);
	});
});
