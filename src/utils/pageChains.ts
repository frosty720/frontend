/**
 * Which networks each page can actually be used on.
 *
 * The network badge used to call anything but KalyChain "Wrong network", so bridging from Arbitrum —
 * exactly what the bridge is for — looked broken (2026-09-17). Only pages that read or write
 * KalyChain contracts require KalyChain.
 */
import { CHAIN_IDS } from '@/config/chains';
import type { NavKey } from '@/components/shell/nav';

/** Chains the bridge can move funds from or to. */
export const BRIDGE_CHAINS: readonly number[] = [CHAIN_IDS.KALYCHAIN, CHAIN_IDS.ARBITRUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON];

/** Chains with a DEX the swap page can quote and route on. */
export const SWAP_CHAINS: readonly number[] = [CHAIN_IDS.KALYCHAIN, CHAIN_IDS.ARBITRUM, CHAIN_IDS.BSC, CHAIN_IDS.POLYGON];

/**
 * The chains this page works on. Everything not listed here is KalyChain-only: vaults, pools, farm,
 * stake and the launchpad all read KalyChain contracts, and the dashboard summarises them.
 */
export function chainsForPage(page: NavKey | null): readonly number[] {
	if (page === 'bridge') return BRIDGE_CHAINS;
	if (page === 'swap') return SWAP_CHAINS;
	return [CHAIN_IDS.KALYCHAIN];
}

/** Whether the connected chain is one this page can be used on. */
export function isChainOkForPage(page: NavKey | null, chainId: number | undefined): boolean {
	return chainId !== undefined && chainsForPage(page).includes(chainId);
}
