/**
 * `utils/tokens.ts` kept its own copy of KalyChain's wrapped-native address. Across the
 * 3890 relaunch that copy went stale, and the stale value — 3888's WKLC,
 * 0x069255299Bb… — is the HYPERLANE MAILBOX on 3890. Because the local map was consulted
 * before the contract-config fallback, every native-KMT lookup resolved to the mailbox.
 *
 * These pin the address to the deployed contract config, so a copy can't drift again.
 */
import { describe, it, expect } from 'vitest';
import { getEffectiveAddress, getWrappedNativeAddress, normalizeSymbol, symbolsMatch } from '../tokens';
import { getContractAddress, MAINNET_CONTRACTS } from '@/config/contracts';
import { CHAIN_IDS } from '@/config/chains';
import type { Token } from '@/config/dex/types';

const HYPERLANE_MAILBOX = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';

const nativeKMT: Token = {
	chainId: CHAIN_IDS.KALYCHAIN,
	address: '0x0000000000000000000000000000000000000000',
	decimals: 18,
	name: 'KalyChain Monetary Token',
	symbol: 'KMT',
	logoURI: '',
	isNative: true,
};

describe('wrapped native on KalyChain', () => {
	it('resolves native KMT to the deployed WKMT, not a hardcoded copy', () => {
		const expected = getContractAddress('WKLC', CHAIN_IDS.KALYCHAIN);
		expect(expected).toMatch(/^0x[0-9a-fA-F]{40}$/);
		expect(getEffectiveAddress(nativeKMT).toLowerCase()).toBe(expected.toLowerCase());
		expect(getWrappedNativeAddress(CHAIN_IDS.KALYCHAIN).toLowerCase()).toBe(expected.toLowerCase());
	});

	it('never resolves to the Hyperlane mailbox — the exact bug', () => {
		expect(getEffectiveAddress(nativeKMT).toLowerCase()).not.toBe(HYPERLANE_MAILBOX.toLowerCase());
		expect(getWrappedNativeAddress(CHAIN_IDS.KALYCHAIN).toLowerCase())
			.not.toBe(HYPERLANE_MAILBOX.toLowerCase());
	});

	it('agrees with the contract config, which is the single source', () => {
		expect(getWrappedNativeAddress(CHAIN_IDS.KALYCHAIN).toLowerCase())
			.toBe(MAINNET_CONTRACTS.WKLC.toLowerCase());
	});

	it('leaves a non-native token untouched', () => {
		const usdt: Token = { ...nativeKMT, address: MAINNET_CONTRACTS.USDT, symbol: 'USDT', isNative: false, decimals: 6 };
		expect(getEffectiveAddress(usdt)).toBe(MAINNET_CONTRACTS.USDT);
	});

	it('still resolves the other chains from their literals', () => {
		expect(getWrappedNativeAddress(56).toLowerCase()).toBe('0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c');
		expect(getWrappedNativeAddress(42161).toLowerCase()).toBe('0x82af49447d8a07e3bd95bd0d56f35241523fbab1');
	});
});

describe('native symbol normalisation', () => {
	it('unwraps WKMT to KMT', () => {
		expect(normalizeSymbol('WKMT')).toBe('KMT');
		expect(normalizeSymbol('wKMT')).toBe('KMT');
		expect(symbolsMatch('KMT', 'wKMT')).toBe(true);
	});

	it('still unwraps the pre-relaunch WKLC, so old cached data does not become a new token', () => {
		expect(normalizeSymbol('WKLC')).toBe('KLC');
		expect(symbolsMatch('KLC', 'WKLC')).toBe(true);
	});

	it('does not treat KMT and KLC as the same asset', () => {
		expect(symbolsMatch('KMT', 'KLC')).toBe(false);
	});
});
