import { describe, it, expect } from 'vitest';
import { transformV3HourData, shouldInvertV3Price } from '../v3ChartData';

const WKLC = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';
const USDT = '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A';

describe('shouldInvertV3Price', () => {
	it('inverts when the base token is token0 (subgraph OHLC is token0-per-token1)', () => {
		// WKLC sorts before USDT → WKLC is token0; charting WKLC in USDT needs inversion
		expect(shouldInvertV3Price(WKLC, USDT)).toBe(true);
	});

	it('does not invert when the base token is token1', () => {
		// USDT is token1 here; a USDT-based chart of close (USDT per WKLC)... base=USDT vs quote=WKLC
		expect(shouldInvertV3Price(USDT, WKLC)).toBe(false);
	});
});

describe('transformV3HourData', () => {
	// Real shape from the deployed v3 subgraph: close ≈ 402 WKLC per USDT
	const hourData = [
		{ periodStartUnix: '1783598400', open: '400', high: '410', low: '395', close: '402', volumeUSD: '52.7' },
		{ periodStartUnix: '1783594800', open: '398', high: '404', low: '396', close: '400', volumeUSD: '10' },
	];

	it('passes values through when no inversion is needed, sorted ascending', () => {
		const points = transformV3HourData(hourData, false);

		expect(points).toHaveLength(2);
		expect(points[0].time).toBe(1783594800);
		expect(points[1].time).toBe(1783598400);
		expect(points[1].close).toBe(402);
		expect(points[1].volume).toBeCloseTo(52.7);
	});

	it('inverts prices and swaps high/low when inverting', () => {
		const points = transformV3HourData(hourData, true);

		const latest = points[1];
		expect(latest.close).toBeCloseTo(1 / 402, 10);
		expect(latest.open).toBeCloseTo(1 / 400, 10);
		// inverted high must come from the raw LOW and stay >= inverted low
		expect(latest.high).toBeCloseTo(1 / 395, 10);
		expect(latest.low).toBeCloseTo(1 / 410, 10);
		expect(latest.high).toBeGreaterThanOrEqual(latest.low);
	});

	it('drops zero/invalid candles instead of producing Infinity or NaN', () => {
		const dirty = [
			...hourData,
			{ periodStartUnix: '1783591200', open: '0', high: '0', low: '0', close: '0', volumeUSD: '0' },
			{ periodStartUnix: '1783587600', open: 'x', high: 'x', low: 'x', close: 'x', volumeUSD: '0' },
		];

		const points = transformV3HourData(dirty, true);

		expect(points).toHaveLength(2);
		for (const p of points) {
			expect(Number.isFinite(p.close)).toBe(true);
			expect(p.close).toBeGreaterThan(0);
		}
	});

	it('deduplicates candles with the same timestamp, keeping the last', () => {
		const dup = [
			{ periodStartUnix: '1783598400', open: '1', high: '1', low: '1', close: '1', volumeUSD: '1' },
			{ periodStartUnix: '1783598400', open: '2', high: '2', low: '2', close: '2', volumeUSD: '2' },
		];

		const points = transformV3HourData(dup, false);

		expect(points).toHaveLength(1);
		expect(points[0].close).toBe(2);
	});
});
