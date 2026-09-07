/**
 * Uniswap V3 Constants for KalySwap
 * These constants define the fee tiers and tick spacing for V3 pools.
 */

// V3 Fee Tiers (in basis points, where 10000 = 100%)
export const V3_FEE_TIERS = {
    LOWEST: 100,    // 0.01% - Best for very stable pairs (e.g., USDC/USDT)
    LOW: 500,       // 0.05% - Good for stable pairs (e.g., WKLC/stable)
    MEDIUM: 3000,   // 0.3%  - Standard for most pairs
    HIGH: 10000,    // 1%    - For exotic/volatile pairs
} as const;

// Human-readable fee tier labels
export const V3_FEE_TIER_LABELS: Record<number, string> = {
    [V3_FEE_TIERS.LOWEST]: '0.01%',
    [V3_FEE_TIERS.LOW]: '0.05%',
    [V3_FEE_TIERS.MEDIUM]: '0.3%',
    [V3_FEE_TIERS.HIGH]: '1%',
};

// Fee tier descriptions for UI
export const V3_FEE_TIER_DESCRIPTIONS: Record<number, string> = {
    [V3_FEE_TIERS.LOWEST]: 'Best for very stable pairs',
    [V3_FEE_TIERS.LOW]: 'Best for stable pairs',
    [V3_FEE_TIERS.MEDIUM]: 'Best for most pairs',
    [V3_FEE_TIERS.HIGH]: 'Best for exotic pairs',
};

// Default fee tier for new positions
export const V3_DEFAULT_FEE_TIER = V3_FEE_TIERS.MEDIUM;

// Tick spacing for each fee tier (determined by Uniswap V3 design)
export const V3_TICK_SPACING: Record<number, number> = {
    [V3_FEE_TIERS.LOWEST]: 1,      // 0.01% - tick spacing 1
    [V3_FEE_TIERS.LOW]: 10,        // 0.05% - tick spacing 10
    [V3_FEE_TIERS.MEDIUM]: 60,     // 0.3%  - tick spacing 60
    [V3_FEE_TIERS.HIGH]: 200,      // 1%    - tick spacing 200
};

// Get tick spacing for a given fee
export function getTickSpacing(fee: number): number {
    return V3_TICK_SPACING[fee] || 60; // Default to medium tier spacing
}

// V3 Math constants
export const Q96 = 2n ** 96n;
export const Q192 = 2n ** 192n;
export const Q128 = 2n ** 128n;

// Min and max ticks (from Uniswap V3)
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

// Min and max sqrt price (from Uniswap V3)
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

// V3 contract deploy info (KalyChain, chain id 3890)
export const V3_DEPLOY_INFO = {
    startBlock: 1615,
    chainId: 3890,
    deployDate: '2026-08-21',
} as const;

export type FeeTier = typeof V3_FEE_TIERS[keyof typeof V3_FEE_TIERS];
