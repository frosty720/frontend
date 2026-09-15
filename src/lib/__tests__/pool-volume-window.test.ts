import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const request = vi.fn();
vi.mock('graphql-request', () => ({
	GraphQLClient: vi.fn().mockImplementation(() => ({ request })),
}));

import { getV3PoolStats, poolVolumeWindowStart, V3_POOL_STATS_QUERY } from '@/lib/subgraph-client';

const NOW = Date.UTC(2026, 8, 14, 12, 30, 0);
const POOL = {
	id: '0xpool',
	token0: { id: '0xa', symbol: 'USDT' },
	token1: { id: '0xb', symbol: 'WKMT' },
	token0Price: '5',
	token1Price: '0.2',
	totalValueLockedUSD: '100',
};

describe('pair 24h volume window', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		request.mockReset();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts exactly 24 hours before now, in unix seconds', () => {
		expect(poolVolumeWindowStart(NOW)).toBe(NOW / 1000 - 86_400);
	});

	it('bounds the hourly candles by time, not by count', () => {
		expect(V3_POOL_STATS_QUERY).toMatch(/periodStartUnix_gte:\s*\$since/);
	});

	it('asks for candles since 24h ago and sums only what the subgraph returns for that window', async () => {
		request.mockResolvedValue({ pool: POOL, poolHourDatas: [{ volumeUSD: '10.5' }, { volumeUSD: '4.5' }] });
		const stats = await getV3PoolStats('0xPOOL', 'https://subgraph.test');
		expect(request).toHaveBeenCalledWith(V3_POOL_STATS_QUERY, {
			poolId: '0xpool',
			poolAddress: '0xpool',
			since: NOW / 1000 - 86_400,
		});
		expect(stats?.volume24h).toBe(15);
	});

	it('reports zero volume when no candle started in the window', async () => {
		request.mockResolvedValue({ pool: POOL, poolHourDatas: [] });
		expect((await getV3PoolStats('0xpool', 'https://subgraph.test'))?.volume24h).toBe(0);
	});
});
