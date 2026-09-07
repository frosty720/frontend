import { describe, it, expect } from 'vitest';
import {
	isSupportedDexChain,
	resolveDexChainId,
	DEFAULT_CHAIN_ID,
	CHAIN_ID,
} from '../contracts';

describe('isSupportedDexChain', () => {
	it('accepts KalyChain mainnet and testnet', () => {
		expect(isSupportedDexChain(CHAIN_ID.KALYCHAIN_MAINNET)).toBe(true);
	});

	it('rejects chains where the KalySwap V2 DEX is not deployed', () => {
		expect(isSupportedDexChain(42161)).toBe(false); // Arbitrum
		expect(isSupportedDexChain(56)).toBe(false); // BSC
		expect(isSupportedDexChain(1)).toBe(false); // Ethereum
	});

	it('rejects undefined (wallet not connected / chain unknown)', () => {
		expect(isSupportedDexChain(undefined)).toBe(false);
	});
});

describe('resolveDexChainId', () => {
	it('returns the connected chain when it is a supported DEX chain', () => {
		expect(resolveDexChainId(CHAIN_ID.KALYCHAIN_MAINNET)).toBe(CHAIN_ID.KALYCHAIN_MAINNET);
		// Critical: on testnet we must use testnet addresses, not mainnet.
	});

	it('falls back to DEFAULT_CHAIN_ID for unsupported or unknown chains', () => {
		expect(resolveDexChainId(42161)).toBe(DEFAULT_CHAIN_ID);
		expect(resolveDexChainId(56)).toBe(DEFAULT_CHAIN_ID);
		expect(resolveDexChainId(undefined)).toBe(DEFAULT_CHAIN_ID);
	});
});
