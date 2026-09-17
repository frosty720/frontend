'use client';

import { useQuery } from '@tanstack/react-query';
import { zeroAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { vaultManagerAbi } from '@/config/abis/vaults';
import { VAULT_MANAGER_ADDRESS, VAULT_STABLES, VAULT_SUBGRAPH_URL } from '@/config/vaults';
import { useVaultFeeSplit } from '@/hooks/vaults/useVaultStats';
import { querySubgraph } from '@/lib/subgraph-query';
import {
	AFFILIATE_GRAPH_QUERY,
	affiliateStats,
	leaderboard,
	parseAffiliateGraph,
	type AffiliateGraphData,
	type AffiliateStats,
	type LeaderRow,
} from '@/utils/vaultAffiliate';

const STABLE_DECIMALS = new Map(VAULT_STABLES.map((stable) => [stable.address.toLowerCase(), stable.decimals]));

/** Sponsor edges + paid commission legs, one vault-subgraph query shared by both affiliate views. */
function useAffiliateGraph() {
	const split = useVaultFeeSplit();
	return useQuery({
		queryKey: ['vaultAffiliateGraph', split.data],
		staleTime: 30_000,
		refetchInterval: 60_000,
		queryFn: async () =>
			parseAffiliateGraph(
				await querySubgraph<AffiliateGraphData>(VAULT_SUBGRAPH_URL, AFFILIATE_GRAPH_QUERY),
				(stable) => STABLE_DECIMALS.get(stable),
				split.data,
			),
	});
}

/** One address's referrals, downline, commissions by level, rank, loyalty and activity. */
export function useAffiliateStats(address: string | undefined): { data: AffiliateStats | undefined; isLoading: boolean; isError: boolean } {
	const graph = useAffiliateGraph();
	const data = graph.data && address ? affiliateStats(address, graph.data.edges, graph.data.legs, graph.data.head) : undefined;
	return { data, isLoading: graph.isLoading, isError: graph.isError };
}

/** Top affiliates by commission, then referrals. */
export function useAffiliateLeaderboard(): { data: LeaderRow[] | undefined; isLoading: boolean; isError: boolean } {
	const graph = useAffiliateGraph();
	const data = graph.data ? leaderboard(graph.data.edges, graph.data.legs) : undefined;
	return { data, isLoading: graph.isLoading, isError: graph.isError };
}

/** The address's sponsor straight from the VaultManager; null when it has none. */
export function useVaultSponsor(address: `0x${string}` | undefined) {
	const client = usePublicClient({ chainId: CHAIN_IDS.KALYCHAIN });
	return useQuery({
		queryKey: ['vaultSponsor', address?.toLowerCase()],
		enabled: Boolean(client && address),
		queryFn: async (): Promise<string | null> => {
			const sponsor = await client!.readContract({ address: VAULT_MANAGER_ADDRESS, abi: vaultManagerAbi, functionName: 'sponsorOf', args: [address!] });
			return sponsor === zeroAddress ? null : sponsor;
		},
	});
}
