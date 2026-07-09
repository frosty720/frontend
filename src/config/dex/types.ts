import { CHAIN_IDS } from '@/config/chains';
// Types for DEX configuration system

export interface Token {
  chainId: number;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  isNative?: boolean;
  coingeckoId?: string; // CoinGecko coin ID for dynamic chart data
  // Optional balance field (populated by wallet queries)
  balance?: string;
  // Optional subgraph data fields
  tradeVolumeUSD?: string;
  totalLiquidity?: string;
  derivedKLC?: string;
  txCount?: string;
  priceUSD?: string;
}

export interface DexConfig {
  name: string;
  factory: string;
  router: string;
  quoter?: string; // For V3 DEXes
  subgraphUrl: string;
  tokens: Token[];
  routerABI: any;
  factoryABI: any;
  wethAddress: string; // Wrapped native token address
  nativeToken: {
    symbol: string;
    name: string;
    decimals: number;
  };
}

export interface QuoteResult {
  amountOut: string;
  priceImpact: number;
  route: string[];
  gasEstimate?: string;
}

// Reverse (exact-output) quote: how much input is needed for a desired output
export interface ExactOutputQuoteResult {
  amountIn: string;
  priceImpact: number;
  route: string[];
  gasEstimate?: string;
}

export interface SwapParams {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOutMin: string;
  to: string;
  deadline: number;
  slippageTolerance: number;
  route?: string[]; // Optional pre-calculated route
}

export interface PairInfo {
  token0: Token;
  token1: Token;
  pairAddress: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
}

// Liquidity operation parameters
export interface AddLiquidityParams {
  tokenA: Token;
  tokenB: Token;
  amountADesired: string;
  amountBDesired: string;
  amountAMin: string;
  amountBMin: string;
  to: string;
  deadline: number;
  slippageTolerance: number;
}

export interface RemoveLiquidityParams {
  tokenA: Token;
  tokenB: Token;
  liquidity: string;
  amountAMin: string;
  amountBMin: string;
  to: string;
  deadline: number;
}

export interface LiquidityPosition {
  pairAddress: string;
  token0: Token;
  token1: Token;
  lpBalance: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  share: string; // User's share of the pool as a percentage
}

// DEX Protocol Types
export type DexProtocol = 'kalyswap' | 'pancakeswap' | 'uniswap-v2';

// Supported Chain IDs
export const SUPPORTED_DEX_CHAINS = [CHAIN_IDS.KALYCHAIN, CHAIN_IDS.KALYCHAIN_TESTNET, 56, 42161] as const;
export type SupportedDexChainId = typeof SUPPORTED_DEX_CHAINS[number];

// Helper function to check if chain supports DEX
export function isSupportedDexChain(chainId: number): chainId is SupportedDexChainId {
  return SUPPORTED_DEX_CHAINS.includes(chainId as SupportedDexChainId);
}
