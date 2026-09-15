import { describe, it, expect } from 'vitest';
import { resolveGasLimit, withHeadroom } from '../gasLimit';

const bounds = { floor: 800_000n, fallback: 900_000n };

describe('resolveGasLimit', () => {
	it('pads a live estimate by 50% when that is above the floor', async () => {
		expect(await resolveGasLimit(async () => 1_000_000n, bounds)).toBe(1_500_000n);
	});

	it('never goes below the floor for a low estimate', async () => {
		expect(await resolveGasLimit(async () => 100_000n, bounds)).toBe(800_000n);
	});

	it('uses the fallback when estimation throws or returns zero', async () => {
		expect(await resolveGasLimit(async () => { throw new Error('execution reverted'); }, bounds)).toBe(900_000n);
		expect(await resolveGasLimit(async () => 0n, bounds)).toBe(900_000n);
	});

	it('lets a real estimate exceed the fallback', async () => {
		expect(await resolveGasLimit(async () => 700_000n, bounds)).toBe(1_050_000n);
	});
});

describe('withHeadroom', () => {
	it('adds half, rounding down', () => {
		expect(withHeadroom(3n)).toBe(4n);
		expect(withHeadroom(200_000n)).toBe(300_000n);
	});
});
