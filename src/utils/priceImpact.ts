'use client';

import { parseUnits, formatUnits, getContract, PublicClient } from 'viem';
import { getContractAddress, DEFAULT_CHAIN_ID } from '@/config/contracts';
import { FACTORY_ABI, PAIR_ABI } from '@/config/abis';
import { contractLogger } from '@/lib/logger';

interface Token {
  address: string;
  decimals: number;
  symbol: string;
  isNative?: boolean;
}

interface PairReserves {
  reserve0: bigint;
  reserve1: bigint;
  token0: string;
  token1: string;
}

interface PriceImpactResult {
  priceImpact: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  warning: string | null;
}

/**
 * Get the pair address for two tokens from the factory contract
 * Uses the multichain DEX configuration system
 */
export async function getPairAddress(
  publicClient: PublicClient,
  tokenA: Token,
  tokenB: Token
): Promise<string | null> {
  try {
    // Get current chain ID
    const chainId = await publicClient.getChainId();

    // Import DEX config dynamically to avoid circular dependencies
    const { getDexConfig } = await import('@/config/dex');
    const dexConfig = getDexConfig(chainId);

    if (!dexConfig) {
      contractLogger.debug(`⚠️ getPairAddress: Chain ${chainId} not supported for DEX operations`);
      return null;
    }

    const factoryContract = getContract({
      address: dexConfig.factory as `0x${string}`,
      abi: dexConfig.factoryABI,
      client: publicClient,
    });

    // Get actual token addresses (handle native tokens)
    const addressA = tokenA.isNative ? dexConfig.wethAddress : tokenA.address;
    const addressB = tokenB.isNative ? dexConfig.wethAddress : tokenB.address;

    const pairAddress = await factoryContract.read.getPair([addressA, addressB]);

    // Check if pair exists (address is not zero)
    if (pairAddress === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return pairAddress as string;
  } catch (error) {
    contractLogger.error('Error getting pair address:', error);
    return null;
  }
}

/**
 * Get reserves for a trading pair
 */
export async function getPairReserves(
  publicClient: PublicClient,
  pairAddress: string
): Promise<PairReserves | null> {
  try {
    const pairContract = getContract({
      address: pairAddress as `0x${string}`,
      abi: PAIR_ABI,
      client: publicClient,
    });

    // Get reserves and token addresses
    const [reserves, token0, token1] = await Promise.all([
      pairContract.read.getReserves([]),
      pairContract.read.token0([]),
      pairContract.read.token1([]),
    ]);

    return {
      reserve0: (reserves as [bigint, bigint, number])[0],
      reserve1: (reserves as [bigint, bigint, number])[1],
      token0: (token0 as string).toLowerCase(),
      token1: (token1 as string).toLowerCase(),
    };
  } catch (error) {
    contractLogger.error('Error getting pair reserves:', error);
    return null;
  }
}

/**
 * Calculate price impact using the constant product formula (x * y = k)
 */
export function calculatePriceImpactFromReserves(
  inputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): string {
  try {
    // Ensure we have valid reserves
    if (reserveIn === BigInt(0) || reserveOut === BigInt(0) || inputAmount === BigInt(0)) {
      return '0';
    }

    // Calculate the current price (reserveOut / reserveIn)
    const currentPrice = Number(formatUnits(reserveOut, 18)) / Number(formatUnits(reserveIn, 18));

    // Calculate new reserves after the swap
    // Using the constant product formula: (x + dx) * (y - dy) = x * y
    // Where dx is input amount and dy is output amount
    const newReserveIn = reserveIn + inputAmount;
    
    // Calculate output amount: dy = y * dx / (x + dx)
    const outputAmount = (reserveOut * inputAmount) / newReserveIn;
    const newReserveOut = reserveOut - outputAmount;

    // Calculate new price
    const newPrice = Number(formatUnits(newReserveOut, 18)) / Number(formatUnits(newReserveIn, 18));

    // Calculate price impact as percentage
    const priceImpact = Math.abs((newPrice - currentPrice) / currentPrice) * 100;

    return priceImpact.toFixed(4);
  } catch (error) {
    contractLogger.error('Error calculating price impact:', error);
    return '0';
  }
}

/**
 * Calculate price impact by comparing a trade's execution rate against the
 * marginal rate observed on a small "probe" quote through the same route.
 * Rates are amountOut/amountIn in human units, so it works across any
 * token pair, decimals, or hop count. Negative impact (favorable rounding)
 * and degenerate inputs return 0.
 */
export function computePriceImpactFromProbe(
  amountIn: string,
  amountOut: string,
  probeAmountIn: string,
  probeAmountOut: string
): number {
  const tradeIn = parseFloat(amountIn);
  const tradeOut = parseFloat(amountOut);
  const probeIn = parseFloat(probeAmountIn);
  const probeOut = parseFloat(probeAmountOut);

  if (!isFinite(tradeIn) || !isFinite(tradeOut) || !isFinite(probeIn) || !isFinite(probeOut)) {
    return 0;
  }
  if (tradeIn <= 0 || probeIn <= 0 || probeOut <= 0) {
    return 0;
  }

  const executionRate = tradeOut / tradeIn;
  const marginalRate = probeOut / probeIn;
  const impact = (1 - executionRate / marginalRate) * 100;

  return impact > 0 ? impact : 0;
}

/**
 * Get price impact severity and warning message
 */
export function getPriceImpactSeverity(priceImpact: string): PriceImpactResult {
  const impact = parseFloat(priceImpact);

  if (impact >= 15) {
    return {
      priceImpact,
      severity: 'critical',
      warning: 'Critical price impact! This trade will significantly move the market. Consider breaking it into smaller trades.'
    };
  } else if (impact >= 5) {
    return {
      priceImpact,
      severity: 'high',
      warning: 'High price impact. This trade will noticeably affect the token price.'
    };
  } else if (impact >= 1) {
    return {
      priceImpact,
      severity: 'medium',
      warning: 'Moderate price impact. Consider the effect on token price.'
    };
  } else if (impact >= 0.1) {
    return {
      priceImpact,
      severity: 'low',
      warning: null
    };
  } else {
    return {
      priceImpact,
      severity: 'low',
      warning: null
    };
  }
}

/**
 * Calculate comprehensive price impact for a token swap
 */
export async function calculatePriceImpact(
  publicClient: PublicClient,
  inputAmount: string,
  fromToken: Token,
  toToken: Token
): Promise<PriceImpactResult> {
  try {
    // Convert input amount to proper decimals
    const amountIn = parseUnits(inputAmount, fromToken.decimals);

    // Get pair address
    const pairAddress = await getPairAddress(publicClient, fromToken, toToken);
    if (!pairAddress) {
      return {
        priceImpact: '0',
        severity: 'low',
        warning: 'No liquidity pool found for this pair.'
      };
    }

    // Get pair reserves
    const reserves = await getPairReserves(publicClient, pairAddress);
    if (!reserves) {
      return {
        priceImpact: '0',
        severity: 'low',
        warning: 'Unable to fetch pool reserves.'
      };
    }

    // Get DEX config for current chain
    const chainId = await publicClient.getChainId();
    const { getDexConfig } = await import('@/config/dex');
    const dexConfig = getDexConfig(chainId);

    if (!dexConfig) {
      return {
        priceImpact: '0',
        severity: 'low',
        warning: `Chain ${chainId} not supported for price impact calculation.`
      };
    }

    // Determine which token is token0 and token1
    const fromTokenAddress = fromToken.isNative ? dexConfig.wethAddress : fromToken.address;
    const toTokenAddress = toToken.isNative ? dexConfig.wethAddress : toToken.address;

    let reserveIn: bigint;
    let reserveOut: bigint;

    if (fromTokenAddress.toLowerCase() === reserves.token0) {
      reserveIn = reserves.reserve0;
      reserveOut = reserves.reserve1;
    } else if (fromTokenAddress.toLowerCase() === reserves.token1) {
      reserveIn = reserves.reserve1;
      reserveOut = reserves.reserve0;
    } else {
      return {
        priceImpact: '0',
        severity: 'low',
        warning: 'Token not found in pair reserves.'
      };
    }

    // Calculate price impact
    const priceImpact = calculatePriceImpactFromReserves(amountIn, reserveIn, reserveOut);

    // Get severity and warning
    return getPriceImpactSeverity(priceImpact);

  } catch (error) {
    contractLogger.error('Error calculating price impact:', error);
    return {
      priceImpact: '0',
      severity: 'low',
      warning: 'Error calculating price impact.'
    };
  }
}

/**
 * Format price impact for display
 */
export function formatPriceImpact(priceImpact: string): string {
  const impact = parseFloat(priceImpact);
  if (impact < 0.01) {
    return '<0.01%';
  }
  return `${impact.toFixed(2)}%`;
}

/**
 * Get color class for price impact severity
 */
export function getPriceImpactColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (severity) {
    case 'low':
      return 'text-green-600';
    case 'medium':
      return 'text-yellow-600';
    case 'high':
      return 'text-orange-600';
    case 'critical':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}
