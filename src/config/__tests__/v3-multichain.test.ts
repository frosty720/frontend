/**
 * Swaps on Arbitrum and BSC route through the same V3 engine as KalyChain. Every address here was
 * verified on-chain on 2026-09-17 with this repo's own ABIs, and the two facts that differ per DEX —
 * PancakeSwap's 0.25% middle tier and its original-SwapRouter interface — are what this pins.
 */
import { describe, it, expect } from 'vitest';
import { CHAIN_IDS } from '@/config/chains';
import { getV3Config, isV3Available } from '@/config/dex/v3-config';

describe('V3 config per chain', () => {
	it('serves KalyChain, Arbitrum and BSC, and nothing else', () => {
		expect(getV3Config(CHAIN_IDS.KALYCHAIN)?.name).toBe('KalySwap V3');
		expect(getV3Config(CHAIN_IDS.ARBITRUM)?.name).toBe('Uniswap V3');
		expect(getV3Config(CHAIN_IDS.BSC)?.name).toBe('PancakeSwap V3');
		expect(getV3Config(CHAIN_IDS.POLYGON)).toBeNull();
		expect(getV3Config(1)).toBeNull();
		for (const chainId of [CHAIN_IDS.KALYCHAIN, CHAIN_IDS.ARBITRUM, CHAIN_IDS.BSC]) {
			expect(isV3Available(chainId)).toBe(true);
		}
	});

	it('carries the verified Arbitrum Uniswap V3 addresses', () => {
		const config = getV3Config(CHAIN_IDS.ARBITRUM)!;
		expect(config.factory).toBe('0x1F98431c8aD98523631AE4a59f267346ea31F984');
		expect(config.quoter).toBe('0x61fFE014bA17989E743c5F6cB21bF9697530B21e');
		expect(config.router).toBe('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45');
		expect(config.wethAddress).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');
		expect(config.routerKind).toBe('swapRouter02');
		expect(Object.values(config.feeTiers)).toEqual([100, 500, 3000, 10000]);
	});

	it('carries the verified BSC PancakeSwap V3 addresses, with its 0.25% tier', () => {
		const config = getV3Config(CHAIN_IDS.BSC)!;
		expect(config.factory).toBe('0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865');
		expect(config.quoter).toBe('0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997');
		expect(config.router).toBe('0x1b81D678ffb9C0263b24A97847620C99d213eB14');
		expect(config.wethAddress).toBe('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
		// PancakeSwap has no 0.3% pool; quoting one would find nothing.
		expect(Object.values(config.feeTiers)).toEqual([100, 500, 2500, 10000]);
		expect(Object.values(config.feeTiers)).not.toContain(3000);
		expect(config.routerKind).toBe('swapRouter');
	});

	it('gives every chain its own tokens and native currency', () => {
		expect(getV3Config(CHAIN_IDS.ARBITRUM)!.nativeToken.symbol).toBe('ETH');
		expect(getV3Config(CHAIN_IDS.BSC)!.nativeToken.symbol).toBe('BNB');
		expect(getV3Config(CHAIN_IDS.KALYCHAIN)!.nativeToken.symbol).toBe('KMT');
		for (const chainId of [CHAIN_IDS.ARBITRUM, CHAIN_IDS.BSC]) {
			const config = getV3Config(chainId)!;
			expect(config.tokens.length).toBeGreaterThan(2);
			expect(config.tokens.every((token) => token.chainId === chainId)).toBe(true);
		}
	});

	it('leaves the subgraph and staker empty off KalyChain, so those panels skip instead of guessing', () => {
		for (const chainId of [CHAIN_IDS.ARBITRUM, CHAIN_IDS.BSC]) {
			expect(getV3Config(chainId)!.subgraphUrl).toBe('');
			expect(getV3Config(chainId)!.staker).toBe('');
		}
		expect(getV3Config(CHAIN_IDS.KALYCHAIN)!.subgraphUrl).toContain('v3-subgraph');
	});
});
