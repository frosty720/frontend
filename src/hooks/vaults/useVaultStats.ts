'use client';

import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { polPoolAbi, polPositionManagerAbi, vaultManagerAbi } from '@/config/abis/vaults';
import { KALYSWAP_V3_CONFIG } from '@/config/dex/v3-config';
import {
	POL_POSITION_MANAGER_ADDRESS,
	VAULT_MANAGER_ADDRESS,
	VAULT_STABLES,
	VAULT_SUBGRAPH_URL,
	VAULT_TIER_NAMES,
	VAULT_TREASURY_ADDRESS,
	WRAPPED_NATIVE_ADDRESS,
} from '@/config/vaults';
import { querySubgraph } from '@/lib/subgraph-query';
import { cumulativePol, polPositionUsd, type PolPoint } from '@/utils/vaultPol';
import { countByTier, DEFAULT_FEE_SPLIT, splitPurchase, type FeeSplit } from '@/utils/vaults';

export interface VaultTier {
	index: number;
	name: string;
	priceUsd: number;
	aprPct: number;
	/** VaultManager.tierCapBps: lifetime ROI cap in bps of the price (25000 = 250%); 0 when unset. */
	capBps: number;
	active: boolean;
}

/** Every tier from VaultManager.tiers(i) and tierCapBps(i), plus whether sales are paused. */
export function useVaultTiers() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['vaultTiers'],
		enabled: Boolean(client),
		staleTime: 300_000,
		queryFn: async (): Promise<{ tiers: VaultTier[]; paused: boolean }> => {
			const paused = await client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'paused' });
			const tiers = await Promise.all(
				VAULT_TIER_NAMES.map(async (name, index) => {
					const [[priceUsd, aprBps, , , active], capBps] = await Promise.all([
						client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'tiers', args: [BigInt(index)] }),
						client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'tierCapBps', args: [BigInt(index)] }),
					]);
					return { index, name, priceUsd: Number(priceUsd), aprPct: Number(aprBps) / 100, capBps: Number(capBps), active };
				}),
			);
			return { tiers, paused };
		},
	});
}

export interface VaultProtocolStats {
	activeVaults: number;
	tierCounts: Map<number, number>;
	/** KMT claimed by vault holders since the relaunch (vault subgraph). */
	claimedKmt: number;
}

/**
 * Live vaults come from the vault subgraph; their tiers are read on-chain (the subgraph's
 * migration handler recorded carried-over vaults as tier 0). The reads go out as one batched request.
 */
export function useVaultProtocolStats() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['vaultProtocolStats'],
		enabled: Boolean(client),
		staleTime: 300_000,
		queryFn: async (): Promise<VaultProtocolStats> => {
			const data = await querySubgraph<{ vaults: { tokenId: string; claimedKlc: string }[] }>(
				VAULT_SUBGRAPH_URL,
				'{ vaults(first: 1000) { tokenId claimedKlc } }',
			);
			const tiers = await Promise.all(
				data.vaults.map((vault) =>
					client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'tierOf', args: [BigInt(vault.tokenId)] }),
				),
			);
			return {
				activeVaults: data.vaults.length,
				tierCounts: countByTier(tiers.map(Number)),
				claimedKmt: data.vaults.reduce((sum, vault) => sum + Number(formatUnits(BigInt(vault.claimedKlc || '0'), 18)), 0),
			};
		},
	});
}

/** The live VaultManager fee split; changes only through a governed setFeeSplit. */
export function useVaultFeeSplit() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['vaultFeeSplit'],
		enabled: Boolean(client),
		staleTime: 3_600_000,
		queryFn: async (): Promise<FeeSplit> => {
			const read = (functionName: 'n1Bps' | 'n2Bps' | 'n3Bps' | 'devBps' | 'daoBps') =>
				client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName });
			const [n1Bps, n2Bps, n3Bps, devBps, daoBps] = await Promise.all([read('n1Bps'), read('n2Bps'), read('n3Bps'), read('devBps'), read('daoBps')]);
			return { n1Bps, n2Bps, n3Bps, devBps, daoBps };
		},
	});
}

export interface PolStats {
	totalUsd: number;
	perPool: { symbol: string; usd: number }[];
}

/**
 * Live mark-to-market value of every WKMT/stable position the DAO treasury owns (each buy mints its
 * own LP NFT), priced at its own pool's spot with stables at $1. Other positions are ignored.
 */
export function usePolStats() {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['vaultPolStats'],
		enabled: Boolean(client),
		staleTime: 30_000,
		refetchInterval: 60_000,
		queryFn: async (): Promise<PolStats> => {
			const npm = { address: POL_POSITION_MANAGER_ADDRESS, abi: polPositionManagerAbi } as const;
			const balance = await client!.readContract({ ...npm, functionName: 'balanceOf', args: [VAULT_TREASURY_ADDRESS] });
			const ids = await Promise.all(
				Array.from({ length: Number(balance) }, (_, i) =>
					client!.readContract({ ...npm, functionName: 'tokenOfOwnerByIndex', args: [VAULT_TREASURY_ADDRESS, BigInt(i)] }),
				),
			);
			const [positions, slot0s] = await Promise.all([
				Promise.all(ids.map((id) => client!.readContract({ ...npm, functionName: 'positions', args: [id] }))),
				Promise.all(VAULT_STABLES.map((stable) => client!.readContract({ address: stable.pool, abi: polPoolAbi, functionName: 'slot0' }))),
			]);

			const wrapped = WRAPPED_NATIVE_ADDRESS.toLowerCase();
			const sums = new Map<string, number>();
			for (const [, , token0, token1, , tickLower, tickUpper, liquidity] of positions) {
				if (liquidity === 0n) continue;
				const stableIsToken0 = token0.toLowerCase() !== wrapped;
				const other = (stableIsToken0 ? token1 : token0).toLowerCase();
				const stableAddress = (stableIsToken0 ? token0 : token1).toLowerCase();
				const index = VAULT_STABLES.findIndex((stable) => stable.address.toLowerCase() === stableAddress);
				if (index < 0 || other !== wrapped) continue;
				const stable = VAULT_STABLES[index];
				const usd = polPositionUsd({ liquidity, sqrtPriceX96: slot0s[index][0], tickLower, tickUpper, stableIsToken0, stableDecimals: stable.decimals });
				sums.set(stable.symbol, (sums.get(stable.symbol) ?? 0) + usd);
			}
			const perPool = Array.from(sums, ([symbol, usd]) => ({ symbol, usd }));
			return { totalUsd: perPool.reduce((sum, pool) => sum + pool.usd, 0), perPool };
		},
	});
}

/** Cumulative POL added per purchase (USD at deposit), from the vault subgraph. */
export function usePolHistory(split: FeeSplit | undefined) {
	return useQuery({
		queryKey: ['vaultPolHistory', split],
		staleTime: 60_000,
		refetchInterval: 120_000,
		queryFn: async (): Promise<PolPoint[]> => {
			const data = await querySubgraph<{ vaults: { paid: string; stable: string; createdAtTimestamp: string }[] }>(
				VAULT_SUBGRAPH_URL,
				'{ vaults(first: 1000, orderBy: createdAtTimestamp, orderDirection: asc) { paid stable createdAtTimestamp } }',
			);
			const decimals = new Map(VAULT_STABLES.map((stable) => [stable.address.toLowerCase(), stable.decimals]));
			const polShare = splitPurchase(1, split ?? DEFAULT_FEE_SPLIT).pol;
			return cumulativePol(
				data.vaults.map((vault) => ({
					paidUsd: Number(vault.paid) / 10 ** (decimals.get(vault.stable?.toLowerCase()) ?? 18),
					t: Number(vault.createdAtTimestamp),
				})),
				polShare,
			);
		},
	});
}

/** Whole-pool TVL of the vault pools (everyone's liquidity, not just the DAO's), from the V3 subgraph. */
export function useVaultPoolTvl() {
	return useQuery({
		queryKey: ['vaultPoolTvl'],
		staleTime: 30_000,
		refetchInterval: 60_000,
		queryFn: async (): Promise<number> => {
			const ids = VAULT_STABLES.map((stable) => `"${stable.pool.toLowerCase()}"`).join(',');
			const data = await querySubgraph<{ pools: { totalValueLockedUSD: string }[] }>(
				KALYSWAP_V3_CONFIG.subgraphUrl,
				`{ pools(where: { id_in: [${ids}] }) { totalValueLockedUSD } }`,
			);
			return data.pools.reduce((sum, pool) => sum + Number(pool.totalValueLockedUSD), 0);
		},
	});
}
