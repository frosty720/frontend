// ABI exports for KalySwap and multichain DEX support
// Organized by category for better maintainability

// Import hardhat compilation artifacts and extract ABIs
import PresaleFactoryArtifact from './launchpad/PresaleFactory.json';
import PresaleArtifact from './launchpad/Presale.json';
import FairlaunchFactoryArtifact from './launchpad/FairLaunchFactory.json';
import FairlaunchArtifact from './launchpad/Fairlaunch.json';
// V3 Launchpad ABIs
import PresaleV3FactoryArtifact from './launchpad/PresaleV3Factory.json';
import PresaleV3Artifact from './launchpad/PresaleV3.json';
import FairlaunchV3FactoryArtifact from './launchpad/FairLaunchV3Factory.json';
import FairlaunchV3Artifact from './launchpad/FairlaunchV3.json';
import V3LiquidityHelperArtifact from './launchpad/V3LiquidityHelper.json';
import StandardTokenFactoryArtifact from './tokens/StandardTokenFactory.json';
import LiquidityGeneratorTokenFactoryArtifact from './tokens/LiquidityGeneratorTokenFactory.json';
// V3-safe token stack, deployed to 3890 2026-08-25. RewardsToken replaces the
// BabyToken/BuybackBaby family: those funded dividends with a transfer fee, which a
// Uniswap V3 pool structurally rejects (see padV3/AUDIT-2026-08-25.md).
import TokenFactoryManagerArtifact from './tokens/TokenFactoryManager.json';
import RewardsTokenFactoryArtifact from './tokens/RewardsTokenFactory.json';
import RewardsTokenArtifact from './tokens/RewardsToken.json';
import KalyAntiBotArtifact from './tokens/KalyAntiBot.json';
import ERC20Artifact from './dex/erc20ABI.json';
import RouterArtifact from './dex/routerABI.json';
import FactoryArtifact from './dex/factoryABI.json';
import PairArtifact from './dex/pairABI.json';
import WKLCArtifact from './dex/wklcABI.json';
import StakingArtifact from './staking/stakingABI.json';

// PancakeSwap ABIs
import PancakeSwapRouterArtifact from './pancakeswap/router.json';
import PancakeSwapFactoryArtifact from './pancakeswap/factory.json';

// Uniswap V2 ABIs
import UniswapV2RouterArtifact from './uniswap-v2/router.json';
import UniswapV2FactoryArtifact from './uniswap-v2/factory.json';

// Extract ABIs from hardhat artifacts (they have .abi property)
// If it's a plain ABI array, use it directly
function extractABI(artifact: any) {
  return artifact.abi || artifact;
}

// Modern ES6 exports
export const PresaleFactoryABI = extractABI(PresaleFactoryArtifact);
export const PresaleABI = extractABI(PresaleArtifact);
export const FairlaunchFactoryABI = extractABI(FairlaunchFactoryArtifact);
export const FairlaunchABI = extractABI(FairlaunchArtifact);
// V3 Launchpad ABIs
export const PresaleV3FactoryABI = extractABI(PresaleV3FactoryArtifact);
export const PresaleV3ABI = extractABI(PresaleV3Artifact);
export const FairlaunchV3FactoryABI = extractABI(FairlaunchV3FactoryArtifact);
export const FairlaunchV3ABI = extractABI(FairlaunchV3Artifact);
export const V3LiquidityHelperABI = extractABI(V3LiquidityHelperArtifact);
export const StandardTokenFactoryABI = extractABI(StandardTokenFactoryArtifact);
export const LiquidityGeneratorTokenFactoryABI = extractABI(LiquidityGeneratorTokenFactoryArtifact);
export const TokenFactoryManagerABI = extractABI(TokenFactoryManagerArtifact);
export const RewardsTokenFactoryABI = extractABI(RewardsTokenFactoryArtifact);
export const RewardsTokenABI = extractABI(RewardsTokenArtifact);
export const KalyAntiBotABI = extractABI(KalyAntiBotArtifact);
export const ERC20ABI = extractABI(ERC20Artifact);
export const RouterABI = extractABI(RouterArtifact);
export const FactoryABI = extractABI(FactoryArtifact);
export const PairABI = extractABI(PairArtifact);
export const WKLCABI = extractABI(WKLCArtifact);
export const StakingABI = extractABI(StakingArtifact);

// PancakeSwap ABIs
export const PancakeSwapRouterABI = extractABI(PancakeSwapRouterArtifact);
export const PancakeSwapFactoryABI = extractABI(PancakeSwapFactoryArtifact);

// Uniswap V2 ABIs
export const UniswapV2RouterABI = extractABI(UniswapV2RouterArtifact);
export const UniswapV2FactoryABI = extractABI(UniswapV2FactoryArtifact);

// Legacy exports for backward compatibility
export const PRESALE_FACTORY_ABI = PresaleFactoryABI;
export const PRESALE_ABI = PresaleABI;
export const FAIRLAUNCH_FACTORY_ABI = FairlaunchFactoryABI;
export const FAIRLAUNCH_ABI = FairlaunchABI;
export const PRESALE_V3_FACTORY_ABI = PresaleV3FactoryABI;
export const PRESALE_V3_ABI = PresaleV3ABI;
export const FAIRLAUNCH_V3_FACTORY_ABI = FairlaunchV3FactoryABI;
export const FAIRLAUNCH_V3_ABI = FairlaunchV3ABI;
export const V3_LIQUIDITY_HELPER_ABI = V3LiquidityHelperABI;
export const STANDARD_TOKEN_FACTORY_ABI = StandardTokenFactoryABI;
export const LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI = LiquidityGeneratorTokenFactoryABI;
export const TOKEN_FACTORY_MANAGER_ABI = TokenFactoryManagerABI;
export const REWARDS_TOKEN_FACTORY_ABI = RewardsTokenFactoryABI;
export const REWARDS_TOKEN_ABI = RewardsTokenABI;
export const KALY_ANTIBOT_ABI = KalyAntiBotABI;
export const ERC20_ABI = ERC20ABI;
export const ROUTER_ABI = RouterABI;
export const FACTORY_ABI = FactoryABI;
export const PAIR_ABI = PairABI;
export const WKLC_ABI = WKLCABI;
export const STAKING_ABI = StakingABI;

// PancakeSwap legacy exports
export const PANCAKESWAP_ROUTER_ABI = PancakeSwapRouterABI;
export const PANCAKESWAP_FACTORY_ABI = PancakeSwapFactoryABI;

// Uniswap V2 legacy exports
export const UNISWAP_V2_ROUTER_ABI = UniswapV2RouterABI;
export const UNISWAP_V2_FACTORY_ABI = UniswapV2FactoryABI;

// Contract ABIs object for easy access
export const CONTRACT_ABIS = {
  PRESALE_FACTORY: PRESALE_FACTORY_ABI,
  PRESALE: PRESALE_ABI,
  FAIRLAUNCH_FACTORY: FAIRLAUNCH_FACTORY_ABI,
  FAIRLAUNCH: FAIRLAUNCH_ABI,
  STANDARD_TOKEN_FACTORY: STANDARD_TOKEN_FACTORY_ABI,
  LIQUIDITY_GENERATOR_TOKEN_FACTORY: LIQUIDITY_GENERATOR_TOKEN_FACTORY_ABI,
  ERC20: ERC20_ABI,
  ROUTER: ROUTER_ABI,
  FACTORY: FACTORY_ABI,
  PAIR: PAIR_ABI,
  WKLC: WKLC_ABI,
  STAKING: STAKING_ABI,
  // PancakeSwap ABIs
  PANCAKESWAP_ROUTER: PANCAKESWAP_ROUTER_ABI,
  PANCAKESWAP_FACTORY: PANCAKESWAP_FACTORY_ABI,
  // Uniswap V2 ABIs
  UNISWAP_V2_ROUTER: UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V2_FACTORY: UNISWAP_V2_FACTORY_ABI,
} as const;

// Helper function to get ABI by contract name
export function getContractABI(contractName: keyof typeof CONTRACT_ABIS) {
  return CONTRACT_ABIS[contractName];
}

// ============== V3 ABIs ==============
// V3 ABI imports
import V3SwapRouter02Artifact from './v3/SwapRouter02.json';
import V3QuoterV2Artifact from './v3/QuoterV2.json';
import V3MigratorArtifact from './v3/V3Migrator.json';
import V3CoreFactoryArtifact from './v3/V3CoreFactory.json';
import V3PoolArtifact from './v3/Pool.json';
import V3NonfungiblePositionManagerArtifact from './v3/NonfungiblePositionManager.json';
import V3StakerArtifact from './v3/V3Staker.json';

// V3 Modern ES6 exports
export const V3SwapRouter02ABI = extractABI(V3SwapRouter02Artifact);
export const V3QuoterV2ABI = extractABI(V3QuoterV2Artifact);
export const V3MigratorABI = extractABI(V3MigratorArtifact);
export const V3CoreFactoryABI = extractABI(V3CoreFactoryArtifact);
export const V3PoolABI = extractABI(V3PoolArtifact);
export const V3NonfungiblePositionManagerABI = extractABI(V3NonfungiblePositionManagerArtifact);
export const V3StakerABI = extractABI(V3StakerArtifact);

// V3 Legacy exports for backward compatibility
export const V3_SWAP_ROUTER_02_ABI = V3SwapRouter02ABI;
export const V3_QUOTER_V2_ABI = V3QuoterV2ABI;
export const V3_MIGRATOR_ABI = V3MigratorABI;
export const V3_CORE_FACTORY_ABI = V3CoreFactoryABI;
export const V3_POOL_ABI = V3PoolABI;
export const V3_NONFUNGIBLE_POSITION_MANAGER_ABI = V3NonfungiblePositionManagerABI;
export const V3_STAKER_ABI = V3StakerABI;

// V3 Contract ABIs object
export const V3_CONTRACT_ABIS = {
  SWAP_ROUTER_02: V3_SWAP_ROUTER_02_ABI,
  QUOTER_V2: V3_QUOTER_V2_ABI,
  MIGRATOR: V3_MIGRATOR_ABI,
  CORE_FACTORY: V3_CORE_FACTORY_ABI,
  POOL: V3_POOL_ABI,
  NONFUNGIBLE_POSITION_MANAGER: V3_NONFUNGIBLE_POSITION_MANAGER_ABI,
  STAKER: V3_STAKER_ABI,
} as const;

// Helper function to get V3 ABI by contract name
export function getV3ContractABI(contractName: keyof typeof V3_CONTRACT_ABIS) {
  return V3_CONTRACT_ABIS[contractName];
}
