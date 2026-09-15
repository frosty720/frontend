/**
 * "Current holdings valued over time": today's balances multiplied by each token's historical USD
 * price from the V3 subgraph. This is NOT realised portfolio history — amounts are held constant.
 */

export type HistoryRange = '1D' | '1W' | '1M' | '1Y';

export const HISTORY_RANGES: readonly HistoryRange[] = ['1D', '1W', '1M', '1Y'];

const HOUR = 3_600;
const DAY = 86_400;

export interface RangeSpec {
	/** `hour` reads tokenHourDatas (periodStartUnix), `day` reads tokenDayDatas (date). */
	granularity: 'hour' | 'day';
	step: number;
	buckets: number;
}

/** A token's USD price as recorded for the bucket starting at `t` (unix seconds). */
export interface PricePoint {
	t: number;
	price: number;
}

/** Price points per token, keyed by lowercase (wrapped-native-resolved) address. */
export type PriceHistory = Record<string, PricePoint[]>;

export interface Holding {
	id: string;
	amount: number;
}

export interface ValuePoint {
	t: number;
	value: number;
}

export interface PortfolioSeries {
	points: ValuePoint[];
	/** Held token ids with no price at or before the end of the range — left out of the chart. */
	unpriced: string[];
}

export function rangeSpec(range: HistoryRange): RangeSpec {
	switch (range) {
		case '1D':
			return { granularity: 'hour', step: HOUR, buckets: 24 };
		case '1W':
			return { granularity: 'day', step: DAY, buckets: 7 };
		case '1M':
			return { granularity: 'day', step: DAY, buckets: 30 };
		case '1Y':
			return { granularity: 'day', step: DAY, buckets: 365 };
	}
}

/**
 * Bucket start times, oldest first, ending with the bucket that contains `nowSec`. The subgraph
 * keys hour buckets by floor(ts / 3600) × 3600 and day buckets by the UTC day start, so the grid
 * lines up with its records exactly.
 */
export function timeGrid(range: HistoryRange, nowSec: number): number[] {
	const { step, buckets } = rangeSpec(range);
	const last = Math.floor(nowSec / step) * step;
	return Array.from({ length: buckets + 1 }, (_, i) => last - (buckets - i) * step);
}

/** One entry per token id (lowercased), amounts summed; non-positive amounts dropped. */
export function mergeHoldings(holdings: Holding[]): Holding[] {
	const totals = new Map<string, number>();
	for (const { id, amount } of holdings) {
		if (!(amount > 0)) continue;
		const key = id.toLowerCase();
		totals.set(key, (totals.get(key) ?? 0) + amount);
	}
	return Array.from(totals, ([id, amount]) => ({ id, amount }));
}

/** Latest price recorded at or before `t` (points sorted oldest first); null when there is none. */
export function priceAt(points: PricePoint[], t: number): number | null {
	let price: number | null = null;
	for (const point of points) {
		if (point.t > t) break;
		price = point.price;
	}
	return price;
}

/**
 * Value of the holdings at each grid time. Buckets with no trade carry the last known price
 * forward. A holding with no price anywhere up to the end of the range is left out (and listed in
 * `unpriced`); grid times before every remaining holding has a price are dropped rather than
 * charted as a misleading dip.
 */
export function buildPortfolioSeries(holdings: Holding[], history: PriceHistory, grid: number[]): PortfolioSeries {
	const end = grid[grid.length - 1] ?? 0;
	const merged = mergeHoldings(holdings);
	const sorted = new Map<string, PricePoint[]>();
	const priced: Holding[] = [];
	const unpriced: string[] = [];

	for (const holding of merged) {
		const points = (history[holding.id] ?? [])
			.filter((point) => Number.isFinite(point.price) && point.price > 0)
			.sort((a, b) => a.t - b.t);
		if (points.length > 0 && points[0].t <= end) {
			sorted.set(holding.id, points);
			priced.push(holding);
		} else {
			unpriced.push(holding.id);
		}
	}

	const points: ValuePoint[] = [];
	if (priced.length === 0) return { points, unpriced };
	for (const t of grid) {
		let value = 0;
		let complete = true;
		for (const holding of priced) {
			const price = priceAt(sorted.get(holding.id) ?? [], t);
			if (price === null) {
				complete = false;
				break;
			}
			value += holding.amount * price;
		}
		if (complete) points.push({ t, value });
	}
	return { points, unpriced };
}

/** A line needs at least two points. */
export function hasEnoughHistory(points: ValuePoint[]): boolean {
	return points.length >= 2;
}

/**
 * SVG path data for an area chart in a `width` × `height` box: time on x, value on y, with
 * `inset` of headroom top and bottom. A flat series draws through the middle. Null under two points.
 */
export function chartPaths(points: ValuePoint[], width: number, height: number, inset = 0): { line: string; area: string } | null {
	if (!hasEnoughHistory(points)) return null;
	const t0 = points[0].t;
	const span = points[points.length - 1].t - t0 || 1;
	const values = points.map((point) => point.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const usable = height - 2 * inset;
	const x = (t: number) => ((t - t0) / span) * width;
	const y = (value: number) => (max === min ? height / 2 : inset + (1 - (value - min) / (max - min)) * usable);
	const coords = points.map((point) => `${x(point.t).toFixed(2)},${y(point.value).toFixed(2)}`);
	const line = `M${coords.join(' L')}`;
	const area = `${line} L${x(points[points.length - 1].t).toFixed(2)},${height} L0.00,${height} Z`;
	return { line, area };
}
