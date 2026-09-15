'use client';

import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { vaultManagerAbi } from '@/config/abis/vaults';
import { VAULT_MANAGER_ADDRESS, VAULT_SUBGRAPH_URL, VAULT_TIER_NAMES } from '@/config/vaults';
import { querySubgraph } from '@/lib/subgraph-query';
import { countByTier } from '@/utils/vaults';

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
