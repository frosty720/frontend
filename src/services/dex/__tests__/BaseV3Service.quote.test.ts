import { describe, it, expect } from 'vitest';
import { KalySwapV3Service } from '../KalySwapV3Service';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import type { PublicClient } from 'viem';

const WKLC = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';
const USDT = '0x2CA775C77b922A51FCF3097F52bFFdbc0250D99A';
const ZERO = '0x0000000000000000000000000000000000000000';
const POOL = '0x3848c7C8d088549194a264CB1D639258Abe406a9';

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

// Stub viem PublicClient at the network boundary, capturing readContract calls
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

describe('getIntermediateTokens', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);
	const TESTNET_BUSD = '0xA510Df56F2aa3f7241da94F2cF053C1bf02E1168';

	it('returns WKLC and config-listed routing stables, never the testnet BUSD address', () => {
		const intermediates = service.getIntermediateTokens().map(a => a.toLowerCase());

		expect(intermediates).toContain(WKLC.toLowerCase());
		expect(intermediates).toContain(USDT.toLowerCase());
		expect(intermediates).not.toContain(TESTNET_BUSD.toLowerCase());
		expect(intermediates).not.toContain(ZERO);
	});
});

describe('getV3PoolInfo price orientation', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);

	const wklcToken: Token = {
		chainId: CHAIN_IDS.KALYCHAIN,
		address: WKLC,
		decimals: 18,
		name: 'Wrapped KLC',
		symbol: 'wKLC',
		logoURI: '',
	};

	// Pool state: token0 = WKLC (18 dec), token1 = USDT (6 dec), 1 WKLC = 0.0025 USDT
	// raw token1/token0 = 0.0025 * 10^(6-18) = 2.5e-15; sqrtPriceX96 = sqrt(2.5e-15) * 2^96
	const SQRT_PRICE_X96 = 3961408125713216879677n;

	function poolStubClient() {
		return stubPublicClient((call) => {
			switch (call.functionName) {
				case 'getPool': return POOL;
				case 'slot0': return [SQRT_PRICE_X96, 0, 0, 0, 0, 0, false];
				case 'liquidity': return 1000000n;
				case 'token0': return WKLC;
				case 'token1': return USDT;
				default: throw new Error(`unexpected call ${call.functionName}`);
			}
		});
	}

	it('returns the same token0Price regardless of the order tokens are passed in', async () => {
		const a = await service.getV3PoolInfo(wklcToken, usdt, 3000, poolStubClient().client);
		const b = await service.getV3PoolInfo(usdt, wklcToken, 3000, poolStubClient().client);

		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		// price of token0 (WKLC) denominated in token1 (USDT)
		expect(parseFloat(a!.token0Price)).toBeCloseTo(0.0025, 6);
		expect(parseFloat(b!.token0Price)).toBeCloseTo(0.0025, 6);
	});
});

describe('BaseV3Service quote path with native KLC', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);

	it('getV3PoolAddress queries the factory with WKLC, not the zero address', async () => {
		const { client, calls } = stubPublicClient(() => POOL);

		const pool = await service.getV3PoolAddress(nativeKLC, usdt, 3000, client);

		expect(pool).toBe(POOL);
		const getPool = calls.find(c => c.functionName === 'getPool');
		expect(getPool).toBeDefined();
		const [token0, token1] = getPool!.args;
		// WKLC (0x0692…) sorts before USDT (0x2CA7…)
		expect(token0.toLowerCase()).toBe(WKLC.toLowerCase());
		expect(token1.toLowerCase()).toBe(USDT.toLowerCase());
	});

	it('getV3Quote calls the quoter with WKLC as tokenIn for native KLC', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'quoteExactInputSingle') {
				// [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
				return [2500000n, 0n, 1, 100000n];
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getV3Quote(nativeKLC, usdt, '1000', 3000, client);

		const quoterCall = calls.find(c => c.functionName === 'quoteExactInputSingle');
		expect(quoterCall).toBeDefined();
		expect(quoterCall!.args[0].tokenIn.toLowerCase()).toBe(WKLC.toLowerCase());
		expect(quoterCall!.args[0].tokenOut.toLowerCase()).toBe(USDT.toLowerCase());
		expect(quote.amountOut).toBe('2.5');
		// route should carry effective (wrapped) addresses
		expect(quote.route.map(a => a.toLowerCase())).toEqual([WKLC.toLowerCase(), USDT.toLowerCase()]);
	});

	it('getQuote reports price impact vs marginal rate, not raw amount difference', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				if (
					t0.toLowerCase() === WKLC.toLowerCase() &&
					t1.toLowerCase() === USDT.toLowerCase() &&
					fee === 3000
				) {
					return POOL;
				}
				return ZERO;
			}
			if (call.functionName === 'quoteExactInputSingle') {
				const amountIn = call.args[0].amountIn as bigint;
				// Marginal rate 0.0025 USDT/KLC; the 1000-KLC trade fills at 0.0024 (4% impact)
				if (amountIn === 1000n * 10n ** 18n) return [2400000n, 0n, 1, 100000n];
				return [(amountIn / 10n ** 18n) * 2500n, 0n, 1, 100000n];
			}
			if (call.functionName === 'quoteExactInput') {
				throw new Error('no multi-hop pool');
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getQuote(nativeKLC, usdt, '1000', client);

		expect(quote.amountOut).toBe('2.4');
		// Old bug: ((1000 - 2.4) / 1000) * 100 ≈ 99.76% — must be ~4% instead
		expect(quote.priceImpact).toBeCloseTo(4, 3);
	});

	it('findBestRoute finds a direct native-KLC/USDT route and skips WKLC as intermediate', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				// Only the WKLC/USDT 3000 pool exists
				if (
					t0.toLowerCase() === WKLC.toLowerCase() &&
					t1.toLowerCase() === USDT.toLowerCase() &&
					fee === 3000
				) {
					return POOL;
				}
				return ZERO;
			}
			if (call.functionName === 'quoteExactInputSingle') {
				return [2500000n, 0n, 1, 100000n];
			}
			if (call.functionName === 'quoteExactInput') {
				throw new Error('no multi-hop pool');
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const result = await service.findBestRoute(nativeKLC, usdt, '1000', client);

		expect(result).not.toBeNull();
		expect(result!.route.tokenPath.map(a => a.toLowerCase())).toEqual([
			WKLC.toLowerCase(),
			USDT.toLowerCase(),
		]);
		expect(result!.route.fees).toEqual([3000]);
		// encoded path must embed the wrapped address, never the zero address
		expect(result!.route.encodedPath.toLowerCase()).toContain(WKLC.slice(2).toLowerCase());
		expect(result!.route.encodedPath).not.toContain(ZERO.slice(2));

		// WKLC must not be probed as an intermediate hop for a native-KLC swap
		const intermediateProbes = calls.filter(
			c =>
				c.functionName === 'getPool' &&
				c.args[0].toLowerCase() === WKLC.toLowerCase() &&
				c.args[1].toLowerCase() === WKLC.toLowerCase()
		);
		expect(intermediateProbes).toHaveLength(0);
	});
});
