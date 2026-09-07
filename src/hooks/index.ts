/**
 * Centralized exports for custom hooks.
 * Import from '@/hooks' for all hook needs.
 */

// Price and chart data hooks (TanStack Query powered)
export { useChartData, type PricePoint } from './useChartData';

// Token hooks
export { useTokenBalance } from './useTokenBalance';
export { useTokenLists } from './useTokenLists';

// Swap hooks
export { useV3Swap } from './useV3Swap';       // V3-specific swap hook

// Other hooks
export { usePairMarketStats } from './usePairMarketStats';

// Error handling
export { useErrorHandler, type AppError, type ErrorCategory } from './useErrorHandler';

// V3 Hooks
export { useV3Pools, useUserV3Positions, type V3Pool, type V3Position } from './v3/useV3Subgraph';
