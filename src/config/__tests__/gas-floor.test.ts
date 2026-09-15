/**
 * KalyChain transactions must carry an explicit 21 gwei floor, and every receipt must
 * be checked for revert. Both were absent app-wide until 2026-08-26; these tests exist
 * so a new call site cannot quietly reintroduce either gap.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { CHAIN_IDS } from '@/config/chains';
import {
	kalyFeeOverrides,
	kalyLegacyGasPrice,
	isKalyChainFamily,
	KALYCHAIN_MIN_PRIORITY_FEE_WEI,
	KALYCHAIN_MAX_FEE_WEI,
} from '@/config/gas';

const SRC = join(__dirname, '..', '..');
const FRONTEND = join(SRC, '..');
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

/** Every way this codebase can put a transaction on chain through viem, wagmi or thirdweb. */
const WRITE_CALL = /\b(writeContract|writeContractAsync|sendTransaction|sendTransactionAsync|deployContract)\s*\(/g;

const FEE_SPREAD = /\.\.\.\s*kalyFeeOverrides\(/;

interface SanctionedWrite {
	/** Path relative to the frontend root. */
	file: string;
	/** The call exactly as written, whitespace collapsed. */
	call: string;
	reason: string;
}

/**
 * Writes that legitimately do not spread `kalyFeeOverrides(` at the call. Keep this list
 * short: each entry must say where the floor is applied instead, and that place must be
 * tested.
 */
const SANCTIONED_WRITES: readonly SanctionedWrite[] = [
	{
		file: 'src/hooks/useWallet.ts',
		call: 'sendTransaction(wagmiTx)',
		reason:
			'wagmiTx comes from hyperlaneToWagmiTx, which enforces the KalyChain floor on fees the ' +
			'Hyperlane SDK supplied or left out (src/hooks/__tests__/useWallet.test.ts). Bridge and ' +
			'KMT staking writes go through here.',
	},
];

/** Index of the character after the `)` that closes the `(` at `open`. Skips string literals. */
function callEnd(source: string, open: number): number {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const c = source[i];
		if (c === "'" || c === '"' || c === '`') {
			for (i++; i < source.length && source[i] !== c; i++) {
				if (source[i] === '\\') i++;
			}
			continue;
		}
		if (c === '(') depth++;
		else if (c === ')' && --depth === 0) return i + 1;
	}
	return source.length;
}

function isCommentOrDefinition(source: string, matchStart: number, end: number): boolean {
	const lineStart = source.lastIndexOf('\n', matchStart) + 1;
	const prefix = source.slice(lineStart, matchStart);
	if (/^\s*(\*|\/\/|\/\*)/.test(prefix) || /(^|\s)\/\//.test(prefix)) return true;
	if (/(^|\s)function\s*\*?\s*$/.test(prefix)) return true;
	// `async sendTransaction(tx) {` or `sendTransaction(tx): Promise<Hash>` in a class,
	// object literal or interface — a declaration, not a call.
	return /^\s*(async\s+)?$/.test(prefix) && /^[ \t]*[:{]/.test(source.slice(end));
}

/** `file:line name(...)` for each write in `source` that neither spreads the fee overrides nor is sanctioned. */
function findUnguardedWrites(source: string, file: string): string[] {
	const offenders: string[] = [];
	for (const match of source.matchAll(WRITE_CALL)) {
		const start = match.index ?? 0;
		const open = start + match[0].length - 1;
		const end = callEnd(source, open);
		if (isCommentOrDefinition(source, start, end)) continue;

		const call = source.slice(start, end);
		if (FEE_SPREAD.test(call)) continue;

		const normalized = call.replace(/\s+/g, '');
		const sanctioned = SANCTIONED_WRITES.some(
			(s) => s.file === file && s.call.replace(/\s+/g, '') === normalized,
		);
		if (sanctioned) continue;

		const line = source.slice(0, start).split('\n').length;
		offenders.push(`${file}:${line} ${match[1]}(...)`);
	}
	return offenders;
}

describe('the write-call matcher', () => {
	const scan = (source: string, file = 'src/sample.ts') => findUnguardedWrites(source, file);

	it('flags a writeContract without the fee spread, on any receiver', () => {
		expect(scan(`const hash = await walletClient.writeContract({ address, abi, functionName: 'approve', args })`)).toEqual([
			'src/sample.ts:1 writeContract(...)',
		]);
		expect(scan(`await client.writeContract(request)`)).toHaveLength(1);
		expect(scan(`writeContract({ address })`)).toHaveLength(1);
	});

	it('flags every other write form', () => {
		const source = [
			'await writeContractAsync({ address, abi })',
			'await sendTransaction({ to, data })',
			'await sendTransactionAsync(tx)',
			'await walletClient.deployContract({ abi, bytecode })',
		].join('\n');
		expect(scan(source)).toEqual([
			'src/sample.ts:1 writeContractAsync(...)',
			'src/sample.ts:2 sendTransaction(...)',
			'src/sample.ts:3 sendTransactionAsync(...)',
			'src/sample.ts:4 deployContract(...)',
		]);
	});

	it('accepts a spread anywhere inside the call object, past nested parens and strings', () => {
		const source = `await walletClient.writeContract({
			functionName: 'swap(uint256)',
			label: ")",
			args: [BigInt(amount), getDeadline(now())],
			...kalyFeeOverrides(chainId),
		})`;
		expect(scan(source)).toEqual([]);
	});

	it('does not credit a spread that sits outside the call', () => {
		const source = `await walletClient.writeContract({ address, abi })
		const fees = { ...kalyFeeOverrides(chainId) }`;
		expect(scan(source)).toHaveLength(1);
	});

	it('flags a write inside a ternary', () => {
		expect(scan('const hash = ok ? await writeContractAsync({ address }) : undefined')).toHaveLength(1);
	});

	it('ignores comments and declarations', () => {
		const source = [
			'// fall back to writeContract(request) when the service is missing',
			' * wraps sendTransaction(tx) for the bridge',
			'  async sendTransaction(tx) {',
			'  sendTransactionAsync(tx: Tx): Promise<Hash>',
			'function deployContract(options) {',
		].join('\n');
		expect(scan(source)).toEqual([]);
	});

	it('honours the allow-list only in the file it names', () => {
		const source = '      const result = await sendTransaction(wagmiTx)';
		expect(scan(source, 'src/hooks/useWallet.ts')).toEqual([]);
		expect(scan(source, 'src/hooks/somewhereElse.ts')).toHaveLength(1);
	});
});

describe('no un-guarded transaction call sites', () => {
	const files = walk(SRC);
	const sources = new Map(files.map((f) => [relative(FRONTEND, f), readFileSync(f, 'utf8')]));

	it('finds the write call sites it is meant to guard', () => {
		// A matcher that silently matched nothing would pass the next test forever.
		const total = [...sources.values()].reduce((n, text) => n + [...text.matchAll(WRITE_CALL)].length, 0);
		expect(total).toBeGreaterThanOrEqual(40);
	});

	it('every write spreads kalyFeeOverrides or is a sanctioned path', () => {
		const offenders = [...sources].flatMap(([file, text]) => findUnguardedWrites(text, file));
		expect(offenders).toEqual([]);
	});

	it('every allow-list entry still exists and has a reason', () => {
		for (const entry of SANCTIONED_WRITES) {
			const text = sources.get(entry.file);
			expect(text, `${entry.file} is gone`).toBeDefined();
			expect(text!.replace(/\s+/g, ''), `${entry.call} is gone from ${entry.file}`).toContain(entry.call.replace(/\s+/g, ''));
			expect(entry.reason.length).toBeGreaterThan(20);
		}
	});

	it('the bridge signing path (useWallet.signTransaction) enforces the fee floor', () => {
		// The bridge does not use walletClient.writeContract: Hyperlane hands it populated
		// transactions that go out through wagmi sendTransaction in useWallet. That path
		// carried no fee fields until 2026-09-10 and the in-app wallet priced them at ~0.
		const text = sources.get('src/hooks/useWallet.ts')!;
		expect(text).toContain('const wagmiTx = hyperlaneToWagmiTx(');
		expect(text).toContain('isKalyChainFamily(');
		expect(text).toContain('KALYCHAIN_MIN_PRIORITY_FEE_WEI');
		expect(text).toContain('KALYCHAIN_MAX_FEE_WEI');
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
