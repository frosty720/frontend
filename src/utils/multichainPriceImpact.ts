// Multichain price impact utilities
// Simple utilities for formatting and displaying price impact from DEX services

/**
 * Format price impact for display
 * @param priceImpact - Price impact as a percentage (0-100)
 * @returns Formatted string with appropriate precision
 */
export function formatPriceImpact(priceImpact: number): string {
  if (priceImpact === 0) return '0.00%';
  if (priceImpact < 0.01) return '< 0.01%';
  if (priceImpact < 1) return `${priceImpact.toFixed(2)}%`;
  if (priceImpact < 10) return `${priceImpact.toFixed(1)}%`;
  return `${priceImpact.toFixed(0)}%`;
}

/**
 * Get color class for price impact display
 * @param priceImpact - Price impact as a percentage (0-100)
 * @returns CSS color class
 */
export function getPriceImpactColor(priceImpact: number): string {
  if (priceImpact < 1) return 'text-green-400';
  if (priceImpact < 3) return 'text-yellow-400';
  if (priceImpact < 5) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get price impact severity level
 * @param priceImpact - Price impact as a percentage (0-100)
 * @returns Severity level
 */
export function getPriceImpactSeverity(priceImpact: number): 'low' | 'medium' | 'high' | 'critical' {
  if (priceImpact < 1) return 'low';
  if (priceImpact < 3) return 'medium';
  if (priceImpact < 5) return 'high';
  return 'critical';
}

/**
 * Check if price impact requires warning
 * @param priceImpact - Price impact as a percentage (0-100)
 * @returns True if warning should be shown
 */
export function shouldWarnPriceImpact(priceImpact: number): boolean {
  return priceImpact >= 3;
}

/**
 * Get price impact warning message
 * @param priceImpact - Price impact as a percentage (0-100)
 * @returns Warning message or null if no warning needed
 */
export function getPriceImpactWarning(priceImpact: number): string | null {
  if (priceImpact < 3) return null;
  if (priceImpact < 5) return 'High price impact. You may lose a significant portion of your tokens.';
  if (priceImpact < 15) return 'Very high price impact. You will lose a significant portion of your tokens.';
  return 'Extremely high price impact. This swap is not recommended.';
}

/**
 * Calculate minimum amount out with slippage
 * @param amountOut - Expected output amount
 * @param slippageTolerance - Slippage tolerance as percentage (e.g., 0.5 for 0.5%)
 * @returns Minimum amount out accounting for slippage
 */
export function calculateMinAmountOut(amountOut: string, slippageTolerance: number): string {
  const amount = parseFloat(amountOut);
  if (isNaN(amount) || amount <= 0) return '0';

  const slippageMultiplier = (100 - slippageTolerance) / 100;
  const minAmount = amount * slippageMultiplier;

  return minAmount.toString();
}

/**
 * Validate slippage tolerance
 * @param slippage - Slippage tolerance as percentage
 * @returns True if valid, false otherwise
 */
export function isValidSlippage(slippage: number): boolean {
  return slippage >= 0.1 && slippage <= 50;
}

/**
 * Get recommended slippage for token pair
 * @param tokenASymbol - Symbol of first token
 * @param tokenBSymbol - Symbol of second token
 * @returns Recommended slippage percentage
 */
export function getRecommendedSlippage(tokenASymbol: string, tokenBSymbol: string): number {
  // Stablecoin pairs typically have lower slippage
  const stablecoins = ['USDT', 'USDC', 'USDC.e', 'DAI', 'BUSD', 'FRAX'];
  const isStablePair = stablecoins.includes(tokenASymbol) && stablecoins.includes(tokenBSymbol);
  
  if (isStablePair) {
    return 0.1; // 0.1% for stablecoin pairs
  }

  // Major token pairs
  const majorTokens = ['ETH', 'WETH', 'BTC', 'WBTC', 'BNB', 'WBNB', 'KLC', 'wKLC'];
  const isMajorPair = majorTokens.includes(tokenASymbol) || majorTokens.includes(tokenBSymbol);
  
  if (isMajorPair) {
    return 0.5; // 0.5% for major token pairs
  }

  // Default for other pairs
  return 1.0; // 1.0% for other pairs
}

/**
 * Format number with appropriate decimal places for display
 * Always human-readable - no scientific notation
 * @param value - Number to format
 * @param maxDecimals - Maximum decimal places
 * @returns Formatted string
 */
export function formatDisplayNumber(value: number, maxDecimals: number = 6): string {
  if (value === 0) return '0';

  // Use compact notation for large numbers
  if (value >= 1000000000) {
    return (value / 1000000000).toFixed(2) + 'B';
  }
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + 'M';
  }
  if (value >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toFixed(Math.min(4, maxDecimals));
  }
  if (value >= 0.0001) {
    return value.toFixed(Math.min(6, maxDecimals));
  }

  // For very small numbers, show full decimal (up to 10 places), trim trailing zeros
  if (value > 0) {
    return value.toFixed(10).replace(/\.?0+$/, '');
  }

  return value.toFixed(2);
}
