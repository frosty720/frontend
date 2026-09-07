/**
 * KalyChain transactions must carry an explicit 21 gwei floor, and every receipt must
 * be checked for revert. Both were absent app-wide until 2026-08-26; these tests exist
 * so a new call site cannot quietly reintroduce either gap.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CHAIN_IDS } from '@/config/chains';
import {
	kalyFeeOverrides,
	kalyLegacyGasPrice,
	isKalyChainFamily,
	KALYCHAIN_MIN_PRIORITY_FEE_WEI,
	KALYCHAIN_MAX_FEE_WEI,
} from '@/config/gas';

const SRC = join(__dirname, '..', '..');
const GWEI = 1_000_000_000n;

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.tsx?$/.test(entry)) out.push(full);
	}
	return out;
}

describe('KalyChain gas floor', () => {
	it('is at least 21 gwei', () => {
		expect(KALYCHAIN_MIN_PRIORITY_FEE_WEI).toBeGreaterThanOrEqual(21n * GWEI);
	});

	it('keeps maxFeePerGas above the tip but not wildly above it', () => {
		// gasLimit × maxFeePerGas is the wallet's spend ceiling; an inflated ceiling makes
		// cheap transactions look unaffordable.
		expect(KALYCHAIN_MAX_FEE_WEI).toBeGreaterThan(KALYCHAIN_MIN_PRIORITY_FEE_WEI);
		expect(KALYCHAIN_MAX_FEE_WEI).toBeLessThanOrEqual(KALYCHAIN_MIN_PRIORITY_FEE_WEI * 2n);
	});

	it('applies to every KalyChain-family chain', () => {
		for (const id of [CHAIN_IDS.KALYCHAIN]) {
			expect(isKalyChainFamily(id)).toBe(true);
			const fees = kalyFeeOverrides(id);
			expect(fees.maxPriorityFeePerGas).toBeGreaterThanOrEqual(21n * GWEI);
			expect(fees.maxFeePerGas).toBeGreaterThanOrEqual(fees.maxPriorityFeePerGas!);
			expect(kalyLegacyGasPrice(id).gasPrice).toBeGreaterThanOrEqual(21n * GWEI);
		}
	});

	it('does NOT pin fees on other chains', () => {
		// 21 gwei on BSC or Arbitrum would badly overpay.
		for (const id of [56, 42161, undefined, null]) {
			expect(isKalyChainFamily(id as number)).toBe(false);
			expect(kalyFeeOverrides(id as number)).toEqual({});
			expect(kalyLegacyGasPrice(id as number)).toEqual({});
		}
	});
});

describe('no un-guarded transaction call sites', () => {
	const files = walk(SRC);

	it('every walletClient.writeContract spreads the fee overrides', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			const lines = text.split('\n');
			lines.forEach((line, i) => {
				if (!/await\s+walletClient\.writeContract\(\{\s*$/.test(line)) return;
				// the spread is inserted directly inside the object literal
				const window = lines.slice(i + 1, i + 6).join('\n');
				if (!window.includes('kalyFeeOverrides(')) {
					offenders.push(`${file.replace(SRC, 'src')}:${i + 1}`);
				}
			});
		}
		expect(offenders).toEqual([]);
	});

	it('no source file awaits a raw waitForTransactionReceipt', () => {
		// assertTxSucceeded (src/utils/transactions.ts) is the only sanctioned caller —
		// viem resolves that promise for REVERTED transactions too.
		const offenders: string[] = [];
		for (const file of files) {
			if (file.endsWith(join('utils', 'transactions.ts'))) continue;
			if (readFileSync(file, 'utf8').includes('waitForTransactionReceipt')) {
				offenders.push(file.replace(SRC, 'src'));
			}
		}
		expect(offenders).toEqual([]);
	});
});
