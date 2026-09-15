import { describe, it, expect } from 'vitest';
import { makeFormat } from '../format';
import { interpolate } from '../interpolate';

describe('makeFormat', () => {
	it('formats USD per locale', () => {
		expect(makeFormat('en').usd(1234.5)).toBe('$1,234.50');
		// fr-FR uses a narrow no-break space as the thousands separator and puts the symbol last.
		expect(makeFormat('fr').usd(1234.5).replace(/[\u202f\u00a0]/g, ' ')).toBe('1 234,50 $US');
	});
	it('compacts large USD values', () => {
		expect(makeFormat('en').usd(1_240_000, { compact: true })).toBe('$1.24M');
	});
	it('formats percentages and plain numbers', () => {
		expect(makeFormat('en').pct(48.123)).toBe('48.12%');
		expect(makeFormat('en').number(124500)).toBe('124,500');
		expect(makeFormat('fr').number(124500).replace(/[\u202f\u00a0]/g, ' ')).toBe('124 500');
	});
});

describe('interpolate', () => {
	it('substitutes every placeholder and leaves unknown ones visible', () => {
		expect(interpolate('Source: {name} · {name}', { name: 'subgraph' })).toBe('Source: subgraph · subgraph');
		expect(interpolate('Hi {who}', {})).toBe('Hi {who}');
	});
});
