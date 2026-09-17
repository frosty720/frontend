'use client';

import { useQuery } from '@tanstack/react-query';
import { parseAbi, zeroAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { KALYSWAP_V3_CONFIG } from '@/config/dex/v3-config';
import { V3_FEE_TIERS } from '@/config/dex/v3-constants';
import type { Token } from '@/config/dex/types';

const POOL_SLOT0_ABI = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)']);

/** Pool address lookups use the wrapped token for native KMT. */
export function effectiveAddress(token: Token): `0x${string}` {
	const native = token.isNative || token.address === zeroAddress;
	return (native ? KALYSWAP_V3_CONFIG.wethAddress : token.address) as `0x${string}`;
}

export type V3PoolState =
	| { status: 'none' }
	/** Created but never initialised: it still needs a starting price. */
	| { status: 'uninitialized'; address: `0x${string}` }
	| { status: 'ready'; address: `0x${string}`; sqrtPriceX96: bigint; tick: number };

function sortedPair(tokenA: Token, tokenB: Token): [`0x${string}`, `0x${string}`] {
	const a = effectiveAddress(tokenA);
	const b = effectiveAddress(tokenB);
	return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/**
 * Whether a pool exists for the pair and fee tier, and its live price. Read errors surface as query
 * errors — never as "no pool", which would invite the user to set a price for a pool that exists.
 */
export function useV3PoolState(tokenA: Token | null, tokenB: Token | null, fee: number) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const pair = tokenA && tokenB ? sortedPair(tokenA, tokenB) : null;
	return useQuery({
		queryKey: ['v3PoolState', pair?.[0].toLowerCase(), pair?.[1].toLowerCase(), fee],
		enabled: Boolean(client && pair && pair[0].toLowerCase() !== pair[1].toLowerCase()),
		staleTime: 15_000,
		refetchInterval: 30_000,
		queryFn: async (): Promise<V3PoolState> => {
			const address = (await client!.readContract({
				address: KALYSWAP_V3_CONFIG.factory as `0x${string}`,
				abi: KALYSWAP_V3_CONFIG.factoryABI,
				functionName: 'getPool',
				args: [pair![0], pair![1], fee],
			})) as `0x${string}`;
			if (address === zeroAddress) return { status: 'none' };
			const [sqrtPriceX96, tick] = await client!.readContract({ address, abi: POOL_SLOT0_ABI, functionName: 'slot0' });
			if (sqrtPriceX96 === 0n) return { status: 'uninitialized', address };
			return { status: 'ready', address, sqrtPriceX96, tick };
		},
	});
}

/** Which fee tiers already have a pool for the pair (created, initialised or not). */
export function useV3ExistingFeeTiers(tokenA: Token | null, tokenB: Token | null) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	const pair = tokenA && tokenB ? sortedPair(tokenA, tokenB) : null;
	return useQuery({
		queryKey: ['v3ExistingFeeTiers', pair?.[0].toLowerCase(), pair?.[1].toLowerCase()],
		enabled: Boolean(client && pair && pair[0].toLowerCase() !== pair[1].toLowerCase()),
		staleTime: 30_000,
		queryFn: async (): Promise<Set<number>> => {
			const fees = Object.values(V3_FEE_TIERS);
			const pools = await Promise.all(
				fees.map((fee) =>
					client!.readContract({
						address: KALYSWAP_V3_CONFIG.factory as `0x${string}`,
						abi: KALYSWAP_V3_CONFIG.factoryABI,
						functionName: 'getPool',
						args: [pair![0], pair![1], fee],
					}),
				),
			);
			return new Set(fees.filter((_, i) => pools[i] !== zeroAddress));
		},
	});
}
