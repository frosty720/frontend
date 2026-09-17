import { parseAbi } from 'viem';

/** The VaultManager calls the KalySwap UI makes (full ABI lives in the vaults-core repo). */
export const vaultManagerAbi = parseAbi([
	'function tiers(uint256) view returns (uint256 priceUSD, uint16 aprBps, uint256 weight, string metadataURI, bool active)',
	'function tierOf(uint256) view returns (uint8)',
	'function nextTokenId() view returns (uint256)',
	'function paused() view returns (bool)',
	'function tierCapBps(uint256) view returns (uint256)',
	'function klcUsdPrice() view returns (uint256)',
	'function sponsorOf(address) view returns (address)',
	'function n1Bps() view returns (uint16)',
	'function n2Bps() view returns (uint16)',
	'function n3Bps() view returns (uint16)',
	'function devBps() view returns (uint16)',
	'function daoBps() view returns (uint16)',
	'function purchase(uint8 tier, address stable, uint256 deadline) returns (uint256)',
	'function purchase(uint8 tier, address stable, uint256 deadline, address referrer) returns (uint256)',
]);

export const rewardsPoolAbi = parseAbi([
	'function earned(uint256 tokenId) view returns (uint256)',
	'function earnedUsdOf(uint256 tokenId) view returns (uint256)',
	'function capUsdOf(uint256 tokenId) view returns (uint256)',
	'function isMatured(uint256 tokenId) view returns (bool)',
	'function claimMany(uint256[] tokenIds)',
]);

/** NonfungiblePositionManager reads used to value the DAO treasury's POL positions. */
export const polPositionManagerAbi = parseAbi([
	'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 fg0, uint256 fg1, uint128 tokensOwed0, uint128 tokensOwed1)',
	'function balanceOf(address) view returns (uint256)',
	'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
]);

export const polPoolAbi = parseAbi([
	'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e)',
]);
