/**
 * The V3-safe token stack (RewardsTokenFactory, RewardsToken, KalyAntiBot) is deployed
 * on 3890 but had no ABI in the frontend at all, so the token-creation UI could not
 * reach it. These pin the call shapes the UI depends on, all taken from the forge build
 * that was verified byte-identical to the deployed contracts.
 */
import { describe, it, expect } from 'vitest';
import {
	STANDARD_TOKEN_FACTORY_ABI,
	REWARDS_TOKEN_FACTORY_ABI,
	REWARDS_TOKEN_ABI,
	KALY_ANTIBOT_ABI,
	TOKEN_FACTORY_MANAGER_ABI,
} from '@/config/abis';

type AbiEntry = { type?: string; name?: string; inputs?: { type: string; indexed?: boolean; name?: string }[] };

const sigs = (abi: AbiEntry[]) =>
	new Set(
		abi
			.filter((e) => e.type === 'function')
			.map((e) => `${e.name}(${(e.inputs ?? []).map((i) => i.type).join(',')})`)
	);

const event = (abi: AbiEntry[], name: string) =>
	abi.find((e) => e.type === 'event' && e.name === name);

describe('RewardsTokenFactory ABI', () => {
	const abi = REWARDS_TOKEN_FACTORY_ABI as AbiEntry[];

	it('exposes the create() the UI calls', () => {
		expect(sigs(abi).has('create(string,string,uint8,uint256,address,uint256)')).toBe(true);
	});

	it('exposes flatFee() so the fee is read from the contract, not a constant', () => {
		expect(sigs(abi).has('flatFee()')).toBe(true);
	});

	it('emits the new token at topics[1], matching TOKEN_TYPES.rewards', () => {
		const e = event(abi, 'TokenCreated')!;
		const indexed = (e.inputs ?? []).filter((i) => i.indexed).map((i) => i.name);
		// topics[0] is the signature, so the first indexed arg is topics[1]
		expect(indexed[0]).toBe('tokenAddress');
	});
});

describe('StandardTokenFactory ABI', () => {
	it('keeps the create() signature the UI builds args for', () => {
		expect(sigs(STANDARD_TOKEN_FACTORY_ABI as AbiEntry[]).has('create(string,string,uint8,uint256)')).toBe(true);
	});

	it('also emits the new token at topics[1]', () => {
		const e = event(STANDARD_TOKEN_FACTORY_ABI as AbiEntry[], 'TokenCreated')!;
		expect((e.inputs ?? []).filter((i) => i.indexed)[0].name).toBe('tokenAddress');
	});
});

describe('RewardsToken ABI', () => {
	const abi = REWARDS_TOKEN_ABI as AbiEntry[];

	it('is funded by explicit deposits, not a transfer fee', () => {
		const s = sigs(abi);
		expect(s.has('depositRewards(uint256)')).toBe(true);
		expect(s.has('claim()')).toBe(true);
		expect(s.has('withdrawableRewardsOf(address)')).toBe(true);
	});

	it('has no fee-setting surface at all — that is what makes it V3-tradeable', () => {
		const names = abi.filter((e) => e.type === 'function').map((e) => e.name ?? '');
		expect(names.filter((n) => /setFee|setTax|Fee\(/i.test(n))).toEqual([]);
	});
});

describe('KalyAntiBot ABI', () => {
	const abi = KALY_ANTIBOT_ABI as AbiEntry[];

	it('implements the PinkAntiBot surface AntiBotStandardToken calls', () => {
		const s = sigs(abi);
		expect(s.has('setTokenOwner(address)')).toBe(true);
		expect(s.has('onPreTransferCheck(address,address,uint256)')).toBe(true);
	});

	it('exposes the hard limits that stop it becoming a honeypot switch', () => {
		const s = sigs(abi);
		expect(s.has('MAX_PROTECTION_WINDOW()')).toBe(true);
		expect(s.has('MIN_CAP_BPS()')).toBe(true);
		expect(s.has('disable(address)')).toBe(true);
	});
});

describe('TokenFactoryManager ABI', () => {
	it('exposes the ownership registry the factories write to', () => {
		expect(sigs(TOKEN_FACTORY_MANAGER_ABI as AbiEntry[]).has('assignTokensToOwner(address,address,uint8)')).toBe(true);
	});
});
