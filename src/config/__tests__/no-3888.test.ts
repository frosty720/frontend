/**
 * KalyChain relaunched on chain id 3890. The 3888 fleet and every contract on it are
 * gone — not archived, not a fallback.
 *
 * Stale 3888 values survived the config migration inside V2-era code the compiler never
 * forced anyone to look at, and one of them was actively wrong: `utils/tokens.ts` mapped
 * KalyChain's wrapped native to 3888's WKLC, which on 3890 is the HYPERLANE MAILBOX.
 * This walks the source so that class of leftover fails CI instead of shipping.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

/** Contracts that existed only on 3888. */
const DEAD_ADDRESSES: Record<string, string> = {
	'0x069255299bb729399f3cecabdc73d15d3d10a2a3': '3888 WKLC (the Hyperlane mailbox on 3890)',
	'0x2ca775c77b922a51fcf3097f52bffdbc0250d99a': '3888 USDT',
	'0x9cab0c396cf0f4325913f2269a0b72bd4d46e3a9': '3888 USDC',
	'0x183f288bf7eebe1a3f318f4681df4a70ef32b2f3': '3888 V2 router',
	'0xd42af909d323d88e0e933b6c50d3e91c279004ca': '3888 V2 factory',
};

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.tsx?$/.test(entry)) out.push(full);
	}
	return out;
}

/** Strip comments so prose about the migration doesn't trip the guard. */
function code(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')) // trailing comments, not URLs
		.join('\n');
}

const files = walk(SRC);

describe('no 3888 remnants', () => {
	it.each(Object.entries(DEAD_ADDRESSES))('%s (%s) appears nowhere in code', (addr, what) => {
		const offenders = files
			.filter((f) => code(readFileSync(f, 'utf8')).toLowerCase().includes(addr))
			.map((f) => f.replace(SRC, 'src'));
		expect(offenders, `${what} still referenced`).toEqual([]);
	});

	it('no source file hardcodes the dead 3888 RPC', () => {
		// Six farming hooks did this, bypassing chain config entirely.
		const offenders = files
			.filter((f) => /https:\/\/rpc2?\.kalychain\.io/.test(code(readFileSync(f, 'utf8'))))
			.map((f) => f.replace(SRC, 'src'));
		expect(offenders).toEqual([]);
	});

	it('no source file hardcodes a 3888 chain id', () => {
		const offenders = files
			.filter((f) => /\b(3888|3889)\b/.test(code(readFileSync(f, 'utf8'))))
			.map((f) => f.replace(SRC, 'src'));
		expect(offenders).toEqual([]);
	});
});
