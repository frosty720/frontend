/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, afterEach } from 'vitest';
import type { Token } from '@/config/dex/types';
import { KALYSWAP_V3_CONFIG } from '@/config/dex/v3-config';

type Call = { address: string; functionName: string; args?: readonly unknown[] };
let readContract: (call: Call) => unknown;
vi.mock('wagmi', () => ({ usePublicClient: () => ({ readContract: async (call: Call) => readContract(call) }) }));

import { effectiveAddress, useV3ExistingFeeTiers, useV3PoolState } from '../useV3PoolState';

const ZERO = '0x0000000000000000000000000000000000000000';
const KMT: Token = { chainId: 3890, address: ZERO, decimals: 18, symbol: 'KMT', name: 'KMT', logoURI: '', isNative: true };
const USDT: Token = { chainId: 3890, address: '0x6318EcDbae6B469D39C38949eDC671f4bA8A6172', decimals: 6, symbol: 'USDT', name: 'Tether', logoURI: '' };
const POOL = '0xa9Ac6D3c75A883Cc5D6EfE7EbB973c68174bA61F';

function wrapper({ children }: { children: React.ReactNode }) {
	return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

afterEach(cleanup);

describe('useV3PoolState', () => {
	it('looks the pool up by the sorted wrapped pair and reports its live price', async () => {
		let getPoolArgs: readonly unknown[] = [];
		readContract = ({ functionName, args }) => {
			if (functionName === 'getPool') {
				getPoolArgs = args!;
				return POOL;
			}
			return [123n, -42, 0, 0, 0, 0, true];
		};
		const { result } = renderHook(() => useV3PoolState(KMT, USDT, 3000), { wrapper });
		await waitFor(() => expect(result.current.data).toBeDefined());
		expect(getPoolArgs).toEqual([USDT.address, KALYSWAP_V3_CONFIG.wethAddress, 3000]);
		expect(result.current.data).toEqual({ status: 'ready', address: POOL, sqrtPriceX96: 123n, tick: -42 });
	});

	it('distinguishes a missing pool from a created-but-uninitialised one', async () => {
		readContract = () => ZERO;
		const none = renderHook(() => useV3PoolState(KMT, USDT, 500), { wrapper });
		await waitFor(() => expect(none.result.current.data).toEqual({ status: 'none' }));

		readContract = ({ functionName }) => (functionName === 'getPool' ? POOL : [0n, 0, 0, 0, 0, 0, false]);
		const uninit = renderHook(() => useV3PoolState(KMT, USDT, 10000), { wrapper });
		await waitFor(() => expect(uninit.result.current.data).toEqual({ status: 'uninitialized', address: POOL }));
	});

	it('surfaces a failed read as an error, never as a missing pool', async () => {
		readContract = () => {
			throw new Error('rpc down');
		};
		const { result } = renderHook(() => useV3PoolState(KMT, USDT, 3000), { wrapper });
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});

	it('does not query KMT against wKMT (the same pool token)', () => {
		readContract = vi.fn();
		const wkmt: Token = { ...USDT, address: KALYSWAP_V3_CONFIG.wethAddress, symbol: 'wKMT', decimals: 18 };
		const { result } = renderHook(() => useV3PoolState(KMT, wkmt, 3000), { wrapper });
		expect(result.current.fetchStatus).toBe('idle');
		expect(effectiveAddress(KMT)).toBe(KALYSWAP_V3_CONFIG.wethAddress);
	});
});

describe('useV3ExistingFeeTiers', () => {
	it('lists the tiers that already have a pool', async () => {
		readContract = ({ args }) => ([500, 3000].includes(args![2] as number) ? POOL : ZERO);
		const { result } = renderHook(() => useV3ExistingFeeTiers(KMT, USDT), { wrapper });
		await waitFor(() => expect(result.current.data).toBeDefined());
		expect([...result.current.data!].sort()).toEqual([3000, 500].sort());
	});
});
