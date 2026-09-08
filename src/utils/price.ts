/**
 * Price Calculation Utilities for KalySwap
 * 
 * Centralizes all price calculation logic from reserves to ensure consistency
 * across the entire application. This is the SINGLE SOURCE OF TRUTH for
 * calculating prices from liquidity pool reserves.
 */

import { Token } from '@/config/dex/types';
import { getEffectiveAddress } from './tokens';

/**
 * Pair info from subgraph or contract
 */
export interface PairInfo {
  token0: { id: string; symbol?: string; decimals?: number };
  token1: { id: string; symbol?: string; decimals?: number };
  reserve0: string | number;
  reserve1: string | number;
}

/**
 * Options for price calculation
 */
export interface PriceCalculationOptions {
  /** If true, returns price in terms of tokenB per tokenA. Default: true */
  priceOfA?: boolean;
}

/**
 * Calculate price from pool reserves.
 * 
 * This is the SINGLE correct way to calculate price from reserves.
 * Uses ADDRESS comparison (not symbol) to determine token order.
 * 
 * @param tokenA - The token we want the price OF (base token)
 * @param pairInfo - Pair data containing token0/token1 addresses and reserves
 * @param options - Optional configuration
 * @returns Price of tokenA in terms of the other token, or 0 if calculation fails
 * 
 * @example
 * // Get price of KMT in USDT (how many USDT per 1 KMT)
 * const price = calculatePriceFromReserves(klcToken, pairInfo);
 * // If KMT is token0 and reserves are [1000 KMT, 50000 USDT]
 * // Returns 50 (50 USDT per KMT)
 * 
 * @example
 * // Get price of USDT in KMT (how many KMT per 1 USDT)
 * const price = calculatePriceFromReserves(usdtToken, pairInfo);
 * // Returns 0.02 (0.02 KMT per USDT)
 */
export function calculatePriceFromReserves(
  tokenA: Token,
  pairInfo: PairInfo | null | undefined,
  options: PriceCalculationOptions = {}
): number {
  const { priceOfA = true } = options;

  // Validate inputs
  if (!tokenA || !pairInfo) {
    return 0;
  }

  const reserve0 = typeof pairInfo.reserve0 === 'string' 
    ? parseFloat(pairInfo.reserve0) 
    : pairInfo.reserve0;
  const reserve1 = typeof pairInfo.reserve1 === 'string' 
    ? parseFloat(pairInfo.reserve1) 
    : pairInfo.reserve1;

  // Guard against zero/invalid reserves
  if (!reserve0 || !reserve1 || reserve0 <= 0 || reserve1 <= 0) {
    return 0;
  }

  // Use ADDRESS comparison - this is critical to avoid price inversion bugs
  // Symbol matching can fail if pairInfo doesn't load properly
  const tokenAAddress = getEffectiveAddress(tokenA).toLowerCase();
  const token0Address = pairInfo.token0?.id?.toLowerCase();

  if (!token0Address) {
    return 0;
  }

  // Determine if tokenA is token0 in the pair
  const isTokenAToken0 = token0Address === tokenAAddress;

  // Price calculation:
  // If tokenA is token0: price = reserve1 / reserve0 (how much token1 per token0)
  // If tokenA is token1: price = reserve0 / reserve1 (how much token0 per token1)
  const price = isTokenAToken0 
    ? reserve1 / reserve0 
    : reserve0 / reserve1;

  // If caller wants price of tokenB instead, invert
  return priceOfA ? price : (price > 0 ? 1 / price : 0);
}

/**
 * Calculate price from reserves using raw addresses.
 * Use this when you have addresses directly instead of Token objects.
 * 
 * @param tokenAddress - Address of the token we want the price OF
 * @param pairInfo - Pair data containing token0/token1 addresses and reserves
 * @returns Price of the token in terms of the other token
 */
export function calculatePriceFromReservesRaw(
  tokenAddress: string,
  pairInfo: PairInfo | null | undefined
): number {
  if (!tokenAddress || !pairInfo) {
    return 0;
  }

  const reserve0 = typeof pairInfo.reserve0 === 'string' 
    ? parseFloat(pairInfo.reserve0) 
    : pairInfo.reserve0;
  const reserve1 = typeof pairInfo.reserve1 === 'string' 
    ? parseFloat(pairInfo.reserve1) 
    : pairInfo.reserve1;

  if (!reserve0 || !reserve1 || reserve0 <= 0 || reserve1 <= 0) {
    return 0;
  }

  const normalizedAddress = tokenAddress.toLowerCase();
  const token0Address = pairInfo.token0?.id?.toLowerCase();

  if (!token0Address) {
    return 0;
  }

  const isToken0 = token0Address === normalizedAddress;

  return isToken0 ? reserve1 / reserve0 : reserve0 / reserve1;
}

/**
 * Calculate prices for both tokens in a pair.
 * 
 * @param pairInfo - Pair data containing token0/token1 addresses and reserves
 * @returns Object with token0Price and token1Price
 */
export function calculateBothPrices(
  pairInfo: PairInfo | null | undefined
): { token0Price: number; token1Price: number } {
  if (!pairInfo) {
    return { token0Price: 0, token1Price: 0 };
  }

  const reserve0 = typeof pairInfo.reserve0 === 'string' 
    ? parseFloat(pairInfo.reserve0) 
    : pairInfo.reserve0;
  const reserve1 = typeof pairInfo.reserve1 === 'string' 
    ? parseFloat(pairInfo.reserve1) 
    : pairInfo.reserve1;

  if (!reserve0 || !reserve1 || reserve0 <= 0 || reserve1 <= 0) {
    return { token0Price: 0, token1Price: 0 };
  }

  // token0Price = how much token1 you get for 1 token0
  // token1Price = how much token0 you get for 1 token1
  return {
    token0Price: reserve1 / reserve0,
    token1Price: reserve0 / reserve1,
  };
}

/**
 * Format a price for display with appropriate precision.
 * 
 * @param price - The price to format
 * @param options - Formatting options
 * @returns Formatted price string
 */
export function formatPrice(
  price: number,
  options: {
    minDecimals?: number;
    maxDecimals?: number;
    prefix?: string;
  } = {}
): string {
  const { minDecimals = 2, maxDecimals = 8, prefix = '' } = options;

  if (price === 0 || !isFinite(price)) {
    return `${prefix}0.00`;
  }

  // Determine appropriate decimal places based on magnitude
  let decimals = minDecimals;
  if (price < 0.0001) {
    decimals = maxDecimals;
  } else if (price < 0.01) {
    decimals = 6;
  } else if (price < 1) {
    decimals = 4;
  } else if (price >= 1000) {
    decimals = 2;
  }

  return `${prefix}${price.toLocaleString(undefined, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format price with USD symbol
 */
export function formatUsdPrice(price: number): string {
  return formatPrice(price, { prefix: '$' });
}

