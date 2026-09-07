import { CHAIN_IDS } from '@/config/chains';
/**
 * Token utility functions for KalySwap
 * 
 * Centralizes token-related logic like symbol matching, address normalization,
 * and wrapped/native token handling.
 */

import { Token } from '@/config/dex/types';
import { getContractAddress } from '@/config/contracts';

/**
 * Wrapped native token per chain.
 *
 * KalyChain is deliberately ABSENT: its address lives in the contract config, and a copy
 * here went stale across the 3890 relaunch. The stale copy was 3888's WKLC
 * (0x069255299Bb…) — which on 3890 is the HYPERLANE MAILBOX, not a token — and because
 * this map was consulted before the config fallback, every native-KMT lookup resolved to
 * the mailbox. Chains below have no entry in our contract config, so they stay literal.
 */
const WRAPPED_NATIVE_TOKENS: Record<number, { symbol: string; wrappedSymbol: string; wrappedAddress: string }> = {
  56: { symbol: 'BNB', wrappedSymbol: 'WBNB', wrappedAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
  42161: { symbol: 'ETH', wrappedSymbol: 'WETH', wrappedAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  1: { symbol: 'ETH', wrappedSymbol: 'WETH', wrappedAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
};

// Native token address (zero address)
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Normalize a token symbol by removing the 'W' prefix (for wrapped tokens)
 * and converting to uppercase.
 * 
 * Examples:
 *   normalizeSymbol('WKMT') => 'KMT'
 *   normalizeSymbol('wKMT') => 'KMT'
 *   normalizeSymbol('KMT')  => 'KMT'
 *   normalizeSymbol('USDT') => 'USDT'
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol) return '';
  const upper = symbol.toUpperCase();
  // Handle wrapped native tokens (WKLC -> KLC, WETH -> ETH, WBNB -> BNB)
  if (upper.startsWith('W') && upper.length > 1) {
    const unwrapped = upper.slice(1);
    // Check if this is actually a wrapped native token pattern
    // KLC is kept alongside KMT so pre-relaunch symbols in cached/user data still
    // normalise instead of being treated as unrelated tokens.
    if (['KMT', 'KLC', 'ETH', 'BNB', 'MATIC', 'AVAX', 'FTM'].includes(unwrapped)) {
      return unwrapped;
    }
  }
  return upper;
}

/**
 * Check if two token symbols match, accounting for wrapped/native variants.
 * 
 * Examples:
 *   symbolsMatch('KMT', 'WKMT')   => true
 *   symbolsMatch('wKMT', 'KMT')   => true
 *   symbolsMatch('USDT', 'USDC')  => false
 *   symbolsMatch('ETH', 'WETH')   => true
 */
export function symbolsMatch(symbolA: string, symbolB: string): boolean {
  if (!symbolA || !symbolB) return false;
  return normalizeSymbol(symbolA) === normalizeSymbol(symbolB);
}

/**
 * Check if a token is the native token (has zero address or isNative flag)
 */
export function isNativeToken(token: Token): boolean {
  return token.isNative === true || 
    token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Check if a token is a wrapped native token
 */
export function isWrappedNativeToken(token: Token): boolean {
  const chainConfig = WRAPPED_NATIVE_TOKENS[token.chainId];
  if (chainConfig) {
    return token.address.toLowerCase() === chainConfig.wrappedAddress.toLowerCase() ||
      token.symbol.toUpperCase() === chainConfig.wrappedSymbol;
  }
  // KalyChain has no literal entry — its address comes from the contract config, so the
  // three helpers here must all fall through to the same source.
  try {
    const wrapped = getContractAddress('WKLC', token.chainId);
    if (!wrapped) return false;
    if (token.address.toLowerCase() === wrapped.toLowerCase()) return true;
  } catch {
    // fall through to the symbol check
  }
  const upper = token.symbol.toUpperCase();
  return upper.startsWith('W') && normalizeSymbol(upper) !== upper;
}

/**
 * Get the effective address for a token (wrapped address for native tokens)
 * This is needed when interacting with DEX contracts which use wrapped tokens.
 * 
 * Example:
 *   getEffectiveAddress(nativeKMT) => the chain's WKMT address, from contract config
 *   getEffectiveAddress(USDT)      => the token's own address, unchanged
 */
export function getEffectiveAddress(token: Token): string {
  if (isNativeToken(token)) {
    const chainConfig = WRAPPED_NATIVE_TOKENS[token.chainId];
    if (chainConfig) {
      return chainConfig.wrappedAddress;
    }
    // Fallback to contracts config
    try {
      return getContractAddress('WKLC', token.chainId);
    } catch {
      return token.address;
    }
  }
  return token.address;
}

/**
 * Get the wrapped token address for a chain
 */
export function getWrappedNativeAddress(chainId: number): string {
  const chainConfig = WRAPPED_NATIVE_TOKENS[chainId];
  if (chainConfig) {
    return chainConfig.wrappedAddress;
  }
  // Fallback to contracts config for KalyChain
  try {
    return getContractAddress('WKLC', chainId);
  } catch {
    throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

/**
 * Compare two addresses case-insensitively
 */
export function addressesEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Check if two tokens are the same (by address or native equivalence)
 */
export function tokensEqual(tokenA: Token, tokenB: Token): boolean {
  if (tokenA.chainId !== tokenB.chainId) return false;
  
  // Both native
  if (isNativeToken(tokenA) && isNativeToken(tokenB)) return true;
  
  // Check effective addresses (handles native/wrapped equivalence)
  return addressesEqual(getEffectiveAddress(tokenA), getEffectiveAddress(tokenB));
}

/**
 * Format a token address for display (0x1234...5678)
 */
export function formatTokenAddress(address: string, chars: number = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Get display symbol for a token (handles native vs wrapped display)
 */
export function getDisplaySymbol(token: Token, preferNative: boolean = true): string {
  if (preferNative && isWrappedNativeToken(token)) {
    return normalizeSymbol(token.symbol);
  }
  return token.symbol;
}

