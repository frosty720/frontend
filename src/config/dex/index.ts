import { CHAIN_IDS } from '@/config/chains';
import { walletLogger } from '@/lib/logger';
// Central DEX Configuration System
// This is the single source of truth for all DEX contracts across chains

import { DexConfig, SupportedDexChainId, isSupportedDexChain, Token } from './types';
import { KALYSWAP_CONFIG } from './kalyswap';
import { PANCAKESWAP_CONFIG } from './pancakeswap';
import { UNISWAP_V2_CONFIG } from './uniswap-v2';

// Main DEX configuration mapping
export const DEX_CONFIGS: Record<SupportedDexChainId, DexConfig> = {
  [CHAIN_IDS.KALYCHAIN]: KALYSWAP_CONFIG,   // KalyChain (3890, V3 only)
  56: PANCAKESWAP_CONFIG,   // BSC
  42161: UNISWAP_V2_CONFIG, // Arbitrum
};

// Helper functions for DEX configuration

/**
 * Get DEX configuration for a specific chain
 */
export function getDexConfig(chainId: number): DexConfig | null {
  if (!isSupportedDexChain(chainId)) {
    walletLogger.warn(`Chain ${chainId} is not supported for DEX operations`);
    return null;
  }
  return DEX_CONFIGS[chainId];
}

/**
 * Get DEX name for a specific chain
 */
export function getDexName(chainId: number): string {
  const config = getDexConfig(chainId);
  return config?.name || 'Unknown DEX';
}

/**
 * Get router address for a specific chain
 */
export function getRouterAddress(chainId: number): string | null {
  const config = getDexConfig(chainId);
  return config?.router || null;
}

/**
 * Get factory address for a specific chain
 */
export function getFactoryAddress(chainId: number): string | null {
  const config = getDexConfig(chainId);
  return config?.factory || null;
}

/**
 * Get wrapped native token address for a specific chain
 */
export function getWethAddress(chainId: number): string | null {
  const config = getDexConfig(chainId);
  return config?.wethAddress || null;
}

/**
 * Get subgraph URL for a specific chain
 */
export function getSubgraphUrl(chainId: number): string | null {
  const config = getDexConfig(chainId);
  return config?.subgraphUrl || null;
}

/**
 * Get token list for a specific chain
 */
export function getTokenList(chainId: number): Token[] {
  const config = getDexConfig(chainId);
  return config?.tokens || [];
}

/**
 * Get router ABI for a specific chain
 */
export function getRouterABI(chainId: number): any[] {
  const config = getDexConfig(chainId);
  return config?.routerABI || [];
}

/**
 * Get factory ABI for a specific chain
 */
export function getFactoryABI(chainId: number): any[] {
  const config = getDexConfig(chainId);
  return config?.factoryABI || [];
}

/**
 * Get native token info for a specific chain
 */
export function getNativeToken(chainId: number): { symbol: string; name: string; decimals: number } | null {
  const config = getDexConfig(chainId);
  return config?.nativeToken || null;
}

/**
 * Find token by address across all chains
 */
export function findTokenByAddress(address: string, chainId?: number): Token | null {
  if (chainId) {
    const tokens = getTokenList(chainId);
    return tokens.find(token =>
      token.address.toLowerCase() === address.toLowerCase()
    ) || null;
  }

  // Search across all chains
  for (const [chain, config] of Object.entries(DEX_CONFIGS)) {
    const token = config.tokens.find(token =>
      token.address.toLowerCase() === address.toLowerCase()
    );
    if (token) return token;
  }

  return null;
}

/**
 * Find token by symbol on a specific chain
 */
export function findTokenBySymbol(symbol: string, chainId: number): Token | null {
  const tokens = getTokenList(chainId);
  return tokens.find(token =>
    token.symbol.toLowerCase() === symbol.toLowerCase()
  ) || null;
}

/**
 * Check if a chain supports DEX operations
 */
export function isChainSupported(chainId: number): boolean {
  return isSupportedDexChain(chainId);
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(DEX_CONFIGS).map(Number);
}

/**
 * Get default token pair for a chain (usually native token and main stablecoin)
 */
export function getDefaultTokenPair(chainId: number): { tokenA: Token; tokenB: Token } | null {
  const tokens = getTokenList(chainId);
  if (tokens.length < 2) return null;

  const nativeToken = tokens.find(token => token.isNative);

  // Find stablecoin based on chain preference
  let stablecoin;
  if (chainId === 56) {
    // BSC: Prefer BUSD (better liquidity for BNB pairs), fallback to USDT, then USDC
    stablecoin = tokens.find(token => token.symbol === 'BUSD') ||
      tokens.find(token => token.symbol === 'USDT') ||
      tokens.find(token => token.symbol === 'USDC');
  } else {
    // Other chains: Prefer USDT, then USDC, then BUSD
    stablecoin = tokens.find(token =>
      token.symbol === 'USDT' || token.symbol === 'USDC' || token.symbol === 'BUSD'
    );
  }

  if (nativeToken && stablecoin) {
    return { tokenA: nativeToken, tokenB: stablecoin };
  }

  // Fallback to first two tokens
  return { tokenA: tokens[0], tokenB: tokens[1] };
}

// Re-export types and constants
export * from './types';
export { KALYSWAP_CONFIG, KALYSWAP_CONSTANTS } from './kalyswap';
export { PANCAKESWAP_CONFIG, PANCAKESWAP_CONSTANTS } from './pancakeswap';
export { UNISWAP_V2_CONFIG, UNISWAP_V2_CONSTANTS } from './uniswap-v2';

// Re-export token lists
export { KALYCHAIN_TOKENS } from './tokens/kalychain';
export { BSC_TOKENS } from './tokens/bsc';
export { ARBITRUM_TOKENS } from './tokens/arbitrum';
