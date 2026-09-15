import { parseAbi } from 'viem';

/** The VaultManager reads the KalySwap UI needs (full ABI lives in the vaults-core repo). */
export const vaultManagerAbi = parseAbi([
	'function tiers(uint256) view returns (uint256 priceUSD, uint16 aprBps, uint256 weight, string metadataURI, bool active)',
	'function tierOf(uint256) view returns (uint8)',
	'function nextTokenId() view returns (uint256)',
	'function paused() view returns (bool)',
	'function tierCapBps(uint256) view returns (uint256)',
]);

export const rewardsPoolAbi = parseAbi([
	'function earned(uint256 tokenId) view returns (uint256)',
	'function isMatured(uint256 tokenId) view returns (bool)',
	'function claimMany(uint256[] tokenIds)',
]);
