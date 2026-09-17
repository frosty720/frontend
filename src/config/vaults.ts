import { MAINNET_CONTRACTS } from '@/config/contracts';

/** Vault contracts on KalyChain 3890 (kalychain-ops/files/kmt-3890/addresses.json → vaults). */
export const VAULT_MANAGER_ADDRESS = '0xDA2A7a2D504949896e709F546B6Bc06C2E7c5982' as const;
export const REWARDS_POOL_ADDRESS = '0x82eeCEcF8C3bbD94A3A11Abe04Ce3F49BbA35E52' as const;

/** DAO Treasury: owner of every POL position the vault purchases create. */
export const VAULT_TREASURY_ADDRESS = '0xDF8CFefEa7DaA5E5B23c262A461aCcA6356BCA90' as const;
export const POL_POSITION_MANAGER_ADDRESS = MAINNET_CONTRACTS.V3_NONFUNGIBLE_POSITION_MANAGER as `0x${string}`;
export const WRAPPED_NATIVE_ADDRESS = MAINNET_CONTRACTS.WKLC as `0x${string}`;

export interface VaultStable {
	symbol: string;
	address: `0x${string}`;
	decimals: number;
	/** The KMT/stable V3 pool the VaultManager deploys this stable's POL into. */
	pool: `0x${string}`;
}

/** Stables the VaultManager accepts (`stables(addr).enabled`) — USDT only, as in the Vaults dApp. */
export const VAULT_STABLES: readonly VaultStable[] = [
	{ symbol: 'USDT', address: MAINNET_CONTRACTS.USDT as `0x${string}`, decimals: 6, pool: '0xa9Ac6D3c75A883Cc5D6EfE7EbB973c68174bA61F' },
];

/** Purchases sign with a 10-minute deadline, like the Vaults dApp. */
export const VAULT_PURCHASE_DEADLINE_SECONDS = 600;

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
