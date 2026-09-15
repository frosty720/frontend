/** The dedicated Vaults dApp (buy, monitor, claim). */
export const VAULTS_APP_URL = 'https://vaults.kalychain.io';

/** Vault contracts on KalyChain 3890 (kalychain-ops/files/kmt-3890/addresses.json → vaults). */
export const VAULT_MANAGER_ADDRESS = '0xDA2A7a2D504949896e709F546B6Bc06C2E7c5982' as const;
export const REWARDS_POOL_ADDRESS = '0x82eeCEcF8C3bbD94A3A11Abe04Ce3F49BbA35E52' as const;

/** Vault subgraph: ownership and purchase history. Env-overridable like the V3 subgraph. */
export const VAULT_SUBGRAPH_URL =
	process.env.NEXT_PUBLIC_VAULT_SUBGRAPH_URL || 'https://app.kalyswap.io/subgraphs/name/vault-subgraph-kmt';

/** Tier names by on-chain tier index (VaultManager.tiers(i)), same order as the Vaults dApp. */
export const VAULT_TIER_NAMES = [
	'Starter',
	'Basic',
	'Pro 1K',
	'Pro 5K',
	'Premium 10K',
	'Premium 25K',
	'Elite 50K',
	'Whale 100K',
] as const;

export function vaultTierName(tier: number): string {
	return VAULT_TIER_NAMES[tier] ?? `Tier ${tier}`;
}
