import { describe, it, expect } from 'vitest';
import { KalySwapService } from '../KalySwapService';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import type { PublicClient } from 'viem';

const WKLC = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';
const USDT = '0x2CA775C77b922A51FCF3097F52bFFdbc0250D99A';
const ZERO = '0x0000000000000000000000000000000000000000';
const PAIR = '0x1a3d8b9fE0a77923a8330FfCe485Afd2b0B8bE7e';

const nativeKLC: Token = {
	chainId: CHAIN_IDS.KALYCHAIN,
	address: ZERO,
	decimals: 18,
	name: 'KalyCoin',
	symbol: 'KLC',
	logoURI: '',
	isNative: true,
};

const usdt: Token = {
	chainId: CHAIN_IDS.KALYCHAIN,
	address: USDT,
	decimals: 6,
	name: 'Tether USD',
	symbol: 'USDT',
	logoURI: '',
};

type ReadCall = { address: string; functionName: string; args: any[] };

function stubPublicClient(handler: (call: ReadCall) => any): { client: PublicClient; calls: ReadCall[] } {
	const calls: ReadCall[] = [];
	const client = {
		readContract: async (params: any) => {
			const call: ReadCall = {
				address: params.address,
				functionName: params.functionName,
				args: params.args,
			};
			calls.push(call);
			return handler(call);
		},
	} as unknown as PublicClient;
	return { client, calls };
}

describe('BaseDexService.getQuoteExactOutput (V2)', () => {
	const service = new KalySwapService();

	it('computes the required input via router.getAmountsIn on the forward route', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'getPair') return PAIR;
			if (call.functionName === 'getAmountsIn') {
				const [amountOut, path] = call.args;
				expect(amountOut).toBe(2500000n); // 2.5 USDT (6 decimals)
				// [requiredIn, ..., amountOut]
				return [1000n * 10n ** 18n, 2500000n];
			}
			// price impact helpers may read reserves; give them a sane pair
			if (call.functionName === 'getReserves') return [1000000n * 10n ** 18n, 2500n * 10n ** 6n, 0];
			if (call.functionName === 'token0') return WKLC;
			if (call.functionName === 'token1') return USDT;
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getQuoteExactOutput(nativeKLC, usdt, '2.5', client);

		expect(quote.amountIn).toBe('1000');
		const inCall = calls.find(c => c.functionName === 'getAmountsIn');
		expect(inCall).toBeDefined();
		// path is forward order (in → out) with the native token wrapped
		const [, path] = inCall!.args;
		expect(path.map((a: string) => a.toLowerCase())).toEqual([WKLC.toLowerCase(), USDT.toLowerCase()]);
	});

	it('throws PairNotFoundError when no route exists', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPair') return ZERO;
			throw new Error(`unexpected call ${call.functionName}`);
		});

		await expect(service.getQuoteExactOutput(nativeKLC, usdt, '2.5', client)).rejects.toThrow(/pair not found/i);
	});
});

describe('getQuoteExactOutput insufficient liquidity (V2)', () => {
	const service = new KalySwapService();

	it('throws InsufficientLiquidityError when the route exists but getAmountsIn reverts', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPair') return PAIR;
			if (call.functionName === 'getAmountsIn') {
				throw new Error('execution reverted: ds-math-sub-underflow');
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		await expect(service.getQuoteExactOutput(nativeKLC, usdt, '1000000', client))
			.rejects.toThrow(/insufficient liquidity/i);
	});
});
