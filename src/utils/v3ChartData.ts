/**
 * Pure transforms for V3 subgraph chart data.
 *
 * The Uniswap V3 subgraph stores poolHourData OHLC as pool.token0Price,
 * i.e. the amount of token0 per 1 token1 (verified against the deployed
 * KalyChain subgraph: WKLC/USDT pool close ≈ 402 WKLC per USDT).
 * Charts display the base token priced in the quote token, so when the
 * base token is token0 the candles must be inverted.
 */

export interface V3HourDatum {
	periodStartUnix: string | number;
	open: string;
	high: string;
	low: string;
	close: string;
	volumeUSD: string;
}

export interface V3PricePoint {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/**
 * V3 pools sort token0 < token1 by address. OHLC is token0-per-token1,
 * so a chart of the base token priced in the quote token needs inversion
 * exactly when the base token is token0.
 */
export function shouldInvertV3Price(baseTokenAddress: string, quoteTokenAddress: string): boolean {
	return baseTokenAddress.toLowerCase() < quoteTokenAddress.toLowerCase();
}

export function transformV3HourData(hourData: V3HourDatum[], invert: boolean): V3PricePoint[] {
	const points = hourData
		.map((hour) => {
			const time = typeof hour.periodStartUnix === 'number'
				? hour.periodStartUnix
				: parseInt(hour.periodStartUnix, 10);
			const open = parseFloat(hour.open);
			const high = parseFloat(hour.high);
			const low = parseFloat(hour.low);
			const close = parseFloat(hour.close);
			const volume = parseFloat(hour.volumeUSD) || 0;

			if (!Number.isFinite(time)) return null;
			if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) return null;

			if (invert) {
				// Reciprocal flips the ordering: raw low → inverted high
				return {
					time,
					open: 1 / open,
					high: 1 / low,
					low: 1 / high,
					close: 1 / close,
					volume,
				};
			}
			return { time, open, high, low, close, volume };
		})
		.filter((p): p is V3PricePoint => p !== null)
		.sort((a, b) => a.time - b.time);

	// Deduplicate by timestamp, keeping the last value
	return Array.from(
		points.reduce((map, point) => {
			map.set(point.time, point);
			return map;
		}, new Map<number, V3PricePoint>()).values()
	);
}
