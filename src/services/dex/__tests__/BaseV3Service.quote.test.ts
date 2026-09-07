import { describe, it, expect } from 'vitest';
import { KalySwapV3Service } from '../KalySwapV3Service';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';
import type { PublicClient } from 'viem';

const WKMT = '0xf90F0Bd56558Ac12F7FC285571D38181d2feD69b';
const USDT = '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172';
const DAI = '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6';
const ZERO = '0x0000000000000000000000000000000000000000';
const POOL = '0x3848c7C8d088549194a264CB1D639258Abe406a9';
const POOL2 = '0xDDE87f8835a05812C3a0E6b687aB59F04452CB3d';

const nativeKMT: Token = {
	chainId: CHAIN_IDS.KALYCHAIN,
	address: ZERO,
	decimals: 18,
	name: 'KalyCoin',
	symbol: 'KMT',
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

	it('returns WKMT and config-listed routing stables, never the testnet BUSD address', () => {
		const intermediates = service.getIntermediateTokens().map(a => a.toLowerCase());

		expect(intermediates).toContain(WKMT.toLowerCase());
		expect(intermediates).toContain(USDT.toLowerCase());
		expect(intermediates).not.toContain(TESTNET_BUSD.toLowerCase());
		expect(intermediates).not.toContain(ZERO);
	});
});

describe('getV3PoolInfo price orientation', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);

	const wklcToken: Token = {
		chainId: CHAIN_IDS.KALYCHAIN,
		address: WKMT,
		decimals: 18,
		name: 'Wrapped KMT',
		symbol: 'wKMT',
		logoURI: '',
	};

	// Pool state: token0 = WKMT (18 dec), token1 = USDT (6 dec), 1 WKMT = 0.0025 USDT
	// raw token1/token0 = 0.0025 * 10^(6-18) = 2.5e-15; sqrtPriceX96 = sqrt(2.5e-15) * 2^96
	const SQRT_PRICE_X96 = 3961408125713216879677n;

	function poolStubClient() {
		return stubPublicClient((call) => {
			switch (call.functionName) {
				case 'getPool': return POOL;
				case 'slot0': return [SQRT_PRICE_X96, 0, 0, 0, 0, 0, false];
				case 'liquidity': return 1000000n;
				case 'token0': return WKMT;
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
		// price of token0 (WKMT) denominated in token1 (USDT)
		expect(parseFloat(a!.token0Price)).toBeCloseTo(0.0025, 6);
		expect(parseFloat(b!.token0Price)).toBeCloseTo(0.0025, 6);
	});
});

describe('BaseV3Service quote path with native KMT', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);

	it('getV3PoolAddress queries the factory with WKMT, not the zero address', async () => {
		const { client, calls } = stubPublicClient(() => POOL);

		const pool = await service.getV3PoolAddress(nativeKMT, usdt, 3000, client);

		expect(pool).toBe(POOL);
		const getPool = calls.find(c => c.functionName === 'getPool');
		expect(getPool).toBeDefined();
		const [token0, token1] = getPool!.args;
		// The service sorts, and USDT (0x6318…) sorts before WKMT (0xf90f…). Assert on the
		// SET so this does not break again the next time an address changes.
		expect([token0.toLowerCase(), token1.toLowerCase()].sort())
			.toEqual([WKMT.toLowerCase(), USDT.toLowerCase()].sort());
		// the native placeholder must never reach the factory
		expect([token0, token1]).not.toContain('0x0000000000000000000000000000000000000000');
	});

	it('getV3Quote calls the quoter with WKMT as tokenIn for native KMT', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'quoteExactInputSingle') {
				// [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
				return [2500000n, 0n, 1, 100000n];
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getV3Quote(nativeKMT, usdt, '1000', 3000, client);

		const quoterCall = calls.find(c => c.functionName === 'quoteExactInputSingle');
		expect(quoterCall).toBeDefined();
		expect(quoterCall!.args[0].tokenIn.toLowerCase()).toBe(WKMT.toLowerCase());
		expect(quoterCall!.args[0].tokenOut.toLowerCase()).toBe(USDT.toLowerCase());
		expect(quote.amountOut).toBe('2.5');
		// route should carry effective (wrapped) addresses
		expect(quote.route.map(a => a.toLowerCase())).toEqual([WKMT.toLowerCase(), USDT.toLowerCase()]);
	});

	it('getQuote reports price impact vs marginal rate, not raw amount difference', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				const pair = [t0.toLowerCase(), t1.toLowerCase()].sort().join('/');
				if (
					pair === [WKMT.toLowerCase(), USDT.toLowerCase()].sort().join('/') &&
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

		const quote = await service.getQuote(nativeKMT, usdt, '1000', client);

		expect(quote.amountOut).toBe('2.4');
		// Old bug: ((1000 - 2.4) / 1000) * 100 ≈ 99.76% — must be ~4% instead
		expect(quote.priceImpact).toBeCloseTo(4, 3);
	});

	it('findBestRoute finds a direct native-KMT/USDT route and skips WKMT as intermediate', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				// Only the WKMT/USDT 3000 pool exists
				if (
					[t0.toLowerCase(), t1.toLowerCase()].sort().join('/') ===
					[WKMT.toLowerCase(), USDT.toLowerCase()].sort().join('/') &&
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

		const result = await service.findBestRoute(nativeKMT, usdt, '1000', client);

		expect(result).not.toBeNull();
		expect(result!.route.tokenPath.map(a => a.toLowerCase())).toEqual([
			WKMT.toLowerCase(),
			USDT.toLowerCase(),
		]);
		expect(result!.route.fees).toEqual([3000]);
		// encoded path must embed the wrapped address, never the zero address
		expect(result!.route.encodedPath.toLowerCase()).toContain(WKMT.slice(2).toLowerCase());
		expect(result!.route.encodedPath).not.toContain(ZERO.slice(2));

		// WKMT must not be probed as an intermediate hop for a native-KMT swap
		const intermediateProbes = calls.filter(
			c =>
				c.functionName === 'getPool' &&
				c.args[0].toLowerCase() === WKMT.toLowerCase() &&
				c.args[1].toLowerCase() === WKMT.toLowerCase()
		);
		expect(intermediateProbes).toHaveLength(0);
	});
});

describe('getQuoteExactOutput', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);

	it('quotes native KMT input for an exact USDT output, picking the route needing the least input', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				const isWklcUsdt =
					[t0.toLowerCase(), t1.toLowerCase()].sort().join('/') === [WKMT.toLowerCase(), USDT.toLowerCase()].sort().join('/');
				// Two direct pools: 500 needs less input than 3000
				if (isWklcUsdt && (fee === 500 || fee === 3000)) return POOL;
				return ZERO;
			}
			if (call.functionName === 'quoteExactOutputSingle') {
				const { amount, fee } = call.args[0];
				// probe (1% of 2.5 USDT = 25000n raw) prices at marginal rate
				if (amount === 25000n) return [10n * 10n ** 18n, 0n, 1, 100000n];
				// full 2.5 USDT: fee 500 needs 900 KLC, fee 3000 needs 1000 KLC
				if (amount === 2500000n) {
					return [(fee === 500 ? 900n : 1000n) * 10n ** 18n, 0n, 1, 100000n];
				}
				throw new Error(`unexpected amount ${amount}`);
			}
			if (call.functionName === 'quoteExactOutput') {
				throw new Error('no multi-hop pool');
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getQuoteExactOutput(nativeKMT, usdt, '2.5', client);

		expect(quote.amountIn).toBe('900');
		// quoter must receive the wrapped address, never 0x0
		const outCall = calls.find(c => c.functionName === 'quoteExactOutputSingle');
		expect(outCall!.args[0].tokenIn.toLowerCase()).toBe(WKMT.toLowerCase());
		expect(outCall!.args[0].tokenOut.toLowerCase()).toBe(USDT.toLowerCase());
		// execution rate 2.5/900 vs marginal 0.025/10 = 0.0025 → ~(1 - 0.002778/0.0025) < 0 → clamped, but
		// fee-500 route is BETTER than marginal probe here; use fee-3000 style check instead:
		expect(quote.route.map(a => a.toLowerCase())).toEqual([WKMT.toLowerCase(), USDT.toLowerCase()]);
	});

	it('encodes multi-hop exact-output paths in reverse order (tokenOut → tokenIn)', async () => {
		const { client, calls } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				if (fee !== 3000) return ZERO;
				// the service sorts, so match on the pair, not on slot order
				const pair = [t0.toLowerCase(), t1.toLowerCase()].sort().join('/');
				const key = (x: string, y: string) => [x.toLowerCase(), y.toLowerCase()].sort().join('/');
				if (pair === key(WKMT, USDT)) return POOL;
				if (pair === key(USDT, DAI)) return POOL2;
				return ZERO;
			}
			if (call.functionName === 'quoteExactOutputSingle') {
				throw new Error('no direct pool');
			}
			if (call.functionName === 'quoteExactOutput') {
				const [, amount] = call.args;
				if (amount === 10n * 10n ** 16n) return [10n * 10n ** 18n, [], [], 100000n]; // probe: 0.1 DAI
				return [1000n * 10n ** 18n, [], [], 100000n]; // 10 DAI costs 1000 KLC
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getQuoteExactOutput(nativeKMT, { ...usdt, address: DAI, symbol: 'DAI', decimals: 18 }, '10', client);

		expect(quote.amountIn).toBe('1000');
		// display route stays in forward order
		expect(quote.route.map(a => a.toLowerCase())).toEqual([
			WKMT.toLowerCase(), USDT.toLowerCase(), DAI.toLowerCase(),
		]);
		// but the quoter path must be encoded output-first: DAI → USDT → WKMT
		const outCall = calls.find(c => c.functionName === 'quoteExactOutput');
		const path = (outCall!.args[0] as string).toLowerCase();
		const daiPos = path.indexOf(DAI.slice(2).toLowerCase());
		const usdtPos = path.indexOf(USDT.slice(2).toLowerCase());
		const wklcPos = path.indexOf(WKMT.slice(2).toLowerCase());
		expect(daiPos).toBeGreaterThan(-1);
		expect(daiPos).toBeLessThan(usdtPos);
		expect(usdtPos).toBeLessThan(wklcPos);
		expect(path).not.toContain(ZERO.slice(2));
	});

	it('reports price impact from the marginal probe rate', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				if (
					[t0.toLowerCase(), t1.toLowerCase()].sort().join('/') ===
					[WKMT.toLowerCase(), USDT.toLowerCase()].sort().join('/') &&
					fee === 3000
				) return POOL;
				return ZERO;
			}
			if (call.functionName === 'quoteExactOutputSingle') {
				const { amount } = call.args[0];
				if (amount === 25000n) return [10n * 10n ** 18n, 0n, 1, 100000n];  // marginal: 0.0025
				if (amount === 2500000n) return [1250n * 10n ** 18n, 0n, 1, 100000n]; // execution: 0.002
				throw new Error(`unexpected amount ${amount}`);
			}
			if (call.functionName === 'quoteExactOutput') {
				throw new Error('no multi-hop pool');
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		const quote = await service.getQuoteExactOutput(nativeKMT, usdt, '2.5', client);

		expect(quote.amountIn).toBe('1250');
		expect(quote.priceImpact).toBeCloseTo(20, 3);
	});
});

describe('getQuoteExactOutput insufficient liquidity', () => {
	const service = new KalySwapV3Service(CHAIN_IDS.KALYCHAIN);

	it('throws InsufficientLiquidityError (not PairNotFound) when pools exist but cannot fill the amount', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') {
				const [t0, t1, fee] = call.args;
				if (
					[t0.toLowerCase(), t1.toLowerCase()].sort().join('/') ===
					[WKMT.toLowerCase(), USDT.toLowerCase()].sort().join('/') &&
					fee === 3000
				) return POOL;
				return ZERO;
			}
			// every exact-output quote reverts: pool can't provide the requested amount
			if (call.functionName === 'quoteExactOutputSingle' || call.functionName === 'quoteExactOutput') {
				throw new Error('execution reverted');
			}
			throw new Error(`unexpected call ${call.functionName}`);
		});

		await expect(service.getQuoteExactOutput(nativeKMT, usdt, '10000', client))
			.rejects.toThrow(/insufficient liquidity/i);
	});

	it('still throws PairNotFound when no pool exists at all', async () => {
		const { client } = stubPublicClient((call) => {
			if (call.functionName === 'getPool') return ZERO;
			throw new Error(`unexpected call ${call.functionName}`);
		});

		await expect(service.getQuoteExactOutput(nativeKMT, usdt, '10000', client))
			.rejects.toThrow(/pair not found/i);
	});
});
