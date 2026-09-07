/**
 * IV3DexService - Interface for Uniswap V3 DEX service implementations
 * Extends IDexService with V3-specific operations
 */

import { Token, QuoteResult } from '@/config/dex/types';
import { IDexService } from './IDexService';
import type { PublicClient, WalletClient } from 'viem';

// V3-specific types
export interface V3PoolInfo {
    poolAddress: string;
    token0: string;
    token1: string;
    fee: number;
    tickSpacing: number;
    liquidity: bigint;
    sqrtPriceX96: bigint;
    tick: number;
    token0Price: string;
    token1Price: string;
}

export interface V3Position {
    tokenId: bigint;
    owner: string;
    token0: string;
    token1: string;
    fee: number;
    tickLower: number;
    tickUpper: number;
    liquidity: bigint;
    feeGrowthInside0LastX128: bigint;
    feeGrowthInside1LastX128: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
}

export interface V3QuoteResult extends QuoteResult {
    sqrtPriceX96After: bigint;
    initializedTicksCrossed: number;
    gasEstimate: string; // Override as string for compatibility
    fee: number;
}

export interface V3SwapParams {
    tokenIn: Token;
    tokenOut: Token;
    fee: number;
    recipient: string;
    amountIn: string;
    amountOutMinimum: string;
    sqrtPriceLimitX96?: bigint;
    deadline: number;
}

export interface V3AddLiquidityParams {
    token0: Token;
    token1: Token;
    fee: number;
    tickLower: number;
    tickUpper: number;
    amount0Desired: string;
    amount1Desired: string;
    amount0Min: string;
    amount1Min: string;
    recipient: string;
    deadline: number;
}

export interface V3IncreaseLiquidityParams {
    tokenId: bigint;
    amount0Desired: string;
    amount1Desired: string;
    amount0Min: string;
    amount1Min: string;
    deadline: number;
}

export interface V3DecreaseLiquidityParams {
    tokenId: bigint;
    liquidity: bigint;
    /**
     * Explicit minimums, in human units of the position's own token0/token1.
     * Omit them and the service simulates the withdrawal to learn what the position
     * actually returns, then applies `slippageTolerance` — passing '0' here means NO
     * protection at all, which is what the UI used to do.
     */
    amount0Min?: string;
    amount1Min?: string;
    /** Percent, e.g. 0.5 for 0.5%. Only used when the minimums are omitted. */
    slippageTolerance?: number;
    deadline: number;
}

export interface V3CollectParams {
    tokenId: bigint;
    recipient: string;
    amount0Max: bigint;
    amount1Max: bigint;
}

/**
 * Represents a multi-hop swap route through V3 pools
 */
export interface V3Route {
    /** Ordered token addresses in the path (e.g., [tokenIn, intermediate, tokenOut]) */
    tokenPath: string[];
    /** Fee tier for each hop (length = tokenPath.length - 1) */
    fees: number[];
    /** Encoded path bytes for QuoterV2/SwapRouter02 */
    encodedPath: `0x${string}`;
}

export interface V3MultiHopSwapParams {
    tokenIn: Token;
    tokenOut: Token;
    route: V3Route;
    recipient: string;
    amountIn: string;
    amountOutMinimum: string;
    deadline: number;
}

export interface IV3DexService extends IDexService {
    /**
     * Get V3 protocol version identifier
     */
    getProtocolVersion(): 'v3';

    /**
     * Get the quoter contract address
     */
    getQuoterAddress(): string;

    /**
     * Get the position manager address
     */
    getPositionManagerAddress(): string;

    /**
     * Get V3 pool address for a token pair and fee tier
     */
    getV3PoolAddress(
        tokenA: Token,
        tokenB: Token,
        fee: number,
        publicClient: PublicClient
    ): Promise<string | null>;

    /**
     * Get V3 pool information
     */
    getV3PoolInfo(
        tokenA: Token,
        tokenB: Token,
        fee: number,
        publicClient: PublicClient
    ): Promise<V3PoolInfo | null>;

    /**
     * Get V3 quote with additional details
     */
    getV3Quote(
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        fee: number,
        publicClient: PublicClient
    ): Promise<V3QuoteResult>;

    /**
     * Execute a V3 swap
     */
    executeV3Swap(
        params: V3SwapParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string>;

    /**
     * Get user's V3 positions (NFTs)
     */
    getV3Positions(
        userAddress: string,
        publicClient: PublicClient
    ): Promise<V3Position[]>;

    /**
     * Get a specific V3 position by token ID
     */
    getV3Position(
        tokenId: bigint,
        publicClient: PublicClient
    ): Promise<V3Position | null>;

    /**
     * Create a new V3 liquidity position (mint NFT)
     */
    mintV3Position(
        params: V3AddLiquidityParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<{ tokenId: bigint; txHash: string }>;

    /**
     * Add liquidity to an existing V3 position
     */
    increaseLiquidity(
        params: V3IncreaseLiquidityParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string>;

    /**
     * Remove liquidity from a V3 position
     */
    decreaseLiquidity(
        params: V3DecreaseLiquidityParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string>;

    /**
     * Collect fees from a V3 position
     */
    collectFees(
        params: V3CollectParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string>;

    /**
     * Get uncollected fees for a position
     */
    getUnclaimedFees(
        tokenId: bigint,
        publicClient: PublicClient
    ): Promise<{ amount0: bigint; amount1: bigint }>;

    /**
     * Get available fee tiers
     */
    getFeeTiers(): number[];

    /**
     * Get tick spacing for a fee tier
     */
    getTickSpacing(fee: number): number;

    /**
     * Convert price to tick
     */
    priceToTick(price: number, token0Decimals: number, token1Decimals: number): number;

    /**
     * Convert tick to price
     */
    tickToPrice(tick: number, token0Decimals: number, token1Decimals: number): number;

    /**
     * Calculate SqrtPriceX96 from human readable price
     */
    calculateSqrtPriceX96(price: string, token0: Token, token1: Token): bigint;

    /**
     * Create and initialize V3 pool
     */
    createAndInitializePool(
        tokenA: Token,
        tokenB: Token,
        fee: number,
        sqrtPriceX96: bigint,
        walletClient: WalletClient
    ): Promise<string>;
}


// V3-specific errors
export class V3PoolNotFoundError extends Error {
    constructor(tokenA: string, tokenB: string, fee: number) {
        super(`V3 Pool not found for ${tokenA}/${tokenB} with fee ${fee}`);
        this.name = 'V3PoolNotFoundError';
    }
}

export class V3PositionNotFoundError extends Error {
    constructor(tokenId: string) {
        super(`V3 Position not found: ${tokenId}`);
        this.name = 'V3PositionNotFoundError';
    }
}

export class V3SlippageError extends Error {
    constructor(expected: string, actual: string) {
        super(`V3 Slippage exceeded: expected ${expected}, got ${actual}`);
        this.name = 'V3SlippageError';
    }
}
