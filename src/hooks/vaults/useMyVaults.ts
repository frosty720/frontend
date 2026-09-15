'use client';

import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { rewardsPoolAbi, vaultManagerAbi } from '@/config/abis/vaults';
import { REWARDS_POOL_ADDRESS, VAULT_MANAGER_ADDRESS, VAULT_SUBGRAPH_URL, vaultTierName } from '@/config/vaults';
import { isLowercaseAddress, querySubgraph } from '@/lib/subgraph-query';

export interface MyVault {
	id: bigint;
	tier: number;
	tierName: string;
	/** Tier price in whole USD (VaultManager.tiers().priceUSD). */
	priceUsd: number;
	aprPct: number;
	/** Unclaimed KMT (RewardsPool.earned). */
	claimableKmt: number;
	/** RewardsPool.earned in wei — what a claim would pay out. */
	earnedWei: bigint;
	/** RewardsPool.isMatured: the ROI cap is reached and the vault earns nothing more. */
	matured: boolean;
}

/** Vault token ids currently owned by `owner`, from the vault subgraph (no log scan). */
export async function fetchOwnedVaultIds(subgraphUrl: string, owner: string): Promise<bigint[]> {
	const address = owner.toLowerCase();
	if (!isLowercaseAddress(address)) return [];
	const data = await querySubgraph<{ vaults: { tokenId: string }[] }>(
		subgraphUrl,
		`{ vaults(first: 1000, where: { owner: "${address}" }, orderBy: tokenId) { tokenId } }`,
	);
	return data.vaults.map((vault) => BigInt(vault.tokenId));
}

/** The connected wallet's vaults: ownership from the subgraph, tier, claimable KMT and maturity live from the contracts. */
export function useMyVaults(owner: string | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['myVaults', owner?.toLowerCase()],
		enabled: Boolean(owner && client),
		staleTime: 30_000,
		refetchInterval: 60_000,
		queryFn: async (): Promise<MyVault[]> => {
			const ids = await fetchOwnedVaultIds(VAULT_SUBGRAPH_URL, owner as string);
			const perVault = await Promise.all(
				ids.map(async (id) => {
					const [tier, earned, matured] = await Promise.all([
						client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'tierOf', args: [id] }),
						client!.readContract({ address: REWARDS_POOL_ADDRESS, abi: rewardsPoolAbi, functionName: 'earned', args: [id] }),
						client!.readContract({ address: REWARDS_POOL_ADDRESS, abi: rewardsPoolAbi, functionName: 'isMatured', args: [id] }),
					]);
					return { id, tier: Number(tier), earned, matured };
				}),
			);
			const tierIds = Array.from(new Set(perVault.map((vault) => vault.tier)));
			const tierData = new Map(
				await Promise.all(
					tierIds.map(async (tier) => {
						const [priceUsd, aprBps] = await client!.readContract({
							address: VAULT_MANAGER_ADDRESS,
							abi: vaultManagerAbi,
							functionName: 'tiers',
							args: [BigInt(tier)],
						});
						return [tier, { priceUsd: Number(priceUsd), aprPct: Number(aprBps) / 100 }] as const;
					}),
				),
			);
			return perVault.map((vault) => ({
				id: vault.id,
				tier: vault.tier,
				tierName: vaultTierName(vault.tier),
				priceUsd: tierData.get(vault.tier)?.priceUsd ?? 0,
				aprPct: tierData.get(vault.tier)?.aprPct ?? 0,
				claimableKmt: Number(formatUnits(vault.earned, 18)),
				earnedWei: vault.earned,
				matured: vault.matured,
			}));
		},
	});
}
