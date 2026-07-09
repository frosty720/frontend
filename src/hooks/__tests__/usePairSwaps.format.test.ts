import { describe, it, expect } from 'vitest';
import { formatV3Swap, V3SubgraphSwap } from '../usePairSwaps';

// Real shape from the deployed v3 subgraph (WKLC/USDT pool):
// amount0 > 0 = token0 entered the pool (user sold token0)
const sellSwap: V3SubgraphSwap = {
	id: '0xd08e00b9ba96703a76f5f0472c2afc2f5821f6a198a7982aef2f61e774d63218-9',
	timestamp: '1783599023',
	transaction: { id: '0xd08e00b9ba96703a76f5f0472c2afc2f5821f6a198a7982aef2f61e774d63218', blockNumber: '51597000' },
	pool: {
		id: '0x3848c7c8d088549194a264cb1d639258abe406a9',
		token0: { id: '0x069255299bb729399f3cecabdc73d15d3d10a2a3', symbol: 'WKLC', decimals: '18' },
		token1: { id: '0x2ca775c77b922a51fcf3097f52bffdbc0250d99a', symbol: 'USDT', decimals: '6' },
	},
	origin: '0x7e093ba1474b79481f9b87d66c99a819f25e82e2',
	sender: '0x11d665a40132e9813796adce031ff5e4bc2735ee',
	recipient: '0x43f77d11f50d36458d9bc1b3b6ce1a22020d386d',
	amount0: '500',
	amount1: '-1.238829',
	amountUSD: '1.368362177606320930612005351112101',
};

describe('formatV3Swap', () => {
	it('maps a token0→token1 swap as SELL with signed display amounts', () => {
		const formatted = formatV3Swap(sellSwap);

		expect(formatted.type).toBe('SELL');
		expect(formatted.token0Amount).toBe('-500.000000');
		expect(formatted.token1Amount).toBe('+1.238829');
		expect(formatted.token0Symbol).toBe('WKLC');
		expect(formatted.token1Symbol).toBe('USDT');
		expect(formatted.hash).toBe(sellSwap.transaction.id);
		expect(formatted.pairAddress).toBe(sellSwap.pool.id);
		expect(formatted.amountUSD).toBeCloseTo(1.368, 3);
		// "my transactions" filtering matches on from/to — origin is the user wallet
		expect(formatted.from).toBe(sellSwap.origin);
		expect(formatted.timestamp.getTime()).toBe(1783599023 * 1000);
	});

	it('maps a token1→token0 swap as BUY', () => {
		const buySwap: V3SubgraphSwap = {
			...sellSwap,
			amount0: '-500',
			amount1: '1.238829',
		};

		const formatted = formatV3Swap(buySwap);

		expect(formatted.type).toBe('BUY');
		expect(formatted.token0Amount).toBe('+500.000000');
		expect(formatted.token1Amount).toBe('-1.238829');
	});
});
