/**
 * BaseV3Service - Base class for Uniswap V3 DEX implementations
 * Provides common V3 functionality like pool queries, quote fetching, and position management
 */

import { dexLogger as logger } from '@/lib/logger';
import {
    IV3DexService,
    V3PoolInfo,
    V3Position,
    V3QuoteResult,
    V3SwapParams,
    V3AddLiquidityParams,
    V3IncreaseLiquidityParams,
    V3DecreaseLiquidityParams,
    V3CollectParams,
    V3PoolNotFoundError,
    V3Route,
    V3MultiHopSwapParams,
} from './IV3DexService';
import { DexError, PairNotFoundError, InsufficientLiquidityError, SwapFailedError } from './IDexService';
import {
    Token,
    QuoteResult,
    ExactOutputQuoteResult,
    SwapParams,
    PairInfo,
    AddLiquidityParams,
    RemoveLiquidityParams,
    LiquidityPosition,
} from '@/config/dex/types';
import { V3DexConfig } from '@/config/dex/v3-config';
import { V3_FEE_TIERS, V3_TICK_SPACING, getTickSpacing, Q96 } from '@/config/dex/v3-constants';
import type { PublicClient, WalletClient } from 'viem';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { computePriceImpactFromProbe } from '@/utils/priceImpact';
import { kalyFeeOverrides } from '@/config/gas';

/**
 * Base class for V3 DEX services
 * Implements common V3 operations that can be shared across chains
 */
export abstract class BaseV3Service implements IV3DexService {
    protected config: V3DexConfig;

    constructor(config: V3DexConfig) {
        this.config = config;
    }

    // Abstract methods that must be implemented by subclasses
    abstract getName(): string;
    abstract getChainId(): number;
    abstract executeSwap(params: SwapParams, walletClient: WalletClient): Promise<string>;
    abstract createAndInitializePool(tokenA: Token, tokenB: Token, fee: number, sqrtPriceX96: bigint, walletClient: WalletClient): Promise<string>;

    getProtocolVersion(): 'v3' {
        return 'v3';
    }

    // Common implementations
    getTokenList(): Token[] {
        return this.config.tokens;
    }

    getRouterAddress(): string {
        return this.config.router;
    }

    getRouterABI(): any[] {
        return this.config.routerABI;
    }

    getFactoryAddress(): string {
        return this.config.factory;
    }

    getWethAddress(): string {
        return this.config.wethAddress;
    }

    /**
     * Address to use for pool discovery and quoting.
     * Native tokens have no pools — V3 pools/quotes always use the wrapped token.
     */
    getEffectiveTokenAddress(token: Token): string {
        if (token.isNative || token.address === '0x0000000000000000000000000000000000000000') {
            return this.getWethAddress();
        }
        return token.address;
    }

    getSubgraphUrl(): string {
        return this.config.subgraphUrl;
    }

    getQuoterAddress(): string {
        return this.config.quoter;
    }

    getPositionManagerAddress(): string {
        return this.config.positionManager;
    }

    isTokenSupported(tokenAddress: string): boolean {
        return this.config.tokens.some(
            (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
        );
    }

    getAmountOutMin(amountOut: string, slippageTolerance: number): string {
        const amount = parseFloat(amountOut);
        const minAmount = amount * (1 - slippageTolerance / 100);
        return minAmount.toString();
    }

    getFeeTiers(): number[] {
        return Object.values(V3_FEE_TIERS);
    }

    getTickSpacing(fee: number): number {
        return getTickSpacing(fee);
    }

    // V3 Pool Address Calculation
    async getV3PoolAddress(
        tokenA: Token,
        tokenB: Token,
        fee: number,
        publicClient: PublicClient
    ): Promise<string | null> {
        try {
            const factoryAddress = this.getFactoryAddress();

            // Native tokens must be wrapped for pool lookup
            const addressA = this.getEffectiveTokenAddress(tokenA);
            const addressB = this.getEffectiveTokenAddress(tokenB);

            // Sort tokens
            const [token0, token1] = addressA.toLowerCase() < addressB.toLowerCase()
                ? [addressA, addressB]
                : [addressB, addressA];

            const poolAddress = await publicClient.readContract({
                address: factoryAddress as `0x${string}`,
                abi: this.config.factoryABI,
                functionName: 'getPool',
                args: [token0 as `0x${string}`, token1 as `0x${string}`, fee],
            });

            if (poolAddress === '0x0000000000000000000000000000000000000000') {
                return null;
            }

            return poolAddress as string;
        } catch (error) {
            logger.error('Error getting V3 pool address:', error);
            return null;
        }
    }

    // V3 Pool Info
    async getV3PoolInfo(
        tokenA: Token,
        tokenB: Token,
        fee: number,
        publicClient: PublicClient
    ): Promise<V3PoolInfo | null> {
        try {
            const poolAddress = await this.getV3PoolAddress(tokenA, tokenB, fee, publicClient);
            if (!poolAddress) {
                return null;
            }

            // Get slot0 (sqrtPriceX96, tick, etc.)
            const slot0 = await publicClient.readContract({
                address: poolAddress as `0x${string}`,
                abi: this.config.poolABI,
                functionName: 'slot0',
                args: [],
            }) as unknown as [bigint, number, number, number, number, number, boolean];

            // Get liquidity
            const liquidity = await publicClient.readContract({
                address: poolAddress as `0x${string}`,
                abi: this.config.poolABI,
                functionName: 'liquidity',
                args: [],
            }) as unknown as bigint;

            // Get token addresses from pool
            const token0 = await publicClient.readContract({
                address: poolAddress as `0x${string}`,
                abi: this.config.poolABI,
                functionName: 'token0',
                args: [],
            }) as unknown as string;

            const token1 = await publicClient.readContract({
                address: poolAddress as `0x${string}`,
                abi: this.config.poolABI,
                functionName: 'token1',
                args: [],
            }) as unknown as string;

            const sqrtPriceX96 = slot0[0];
            const tick = slot0[1];

            // Decimals must follow the pool's token0/token1 order, which may
            // differ from the order tokenA/tokenB were passed in
            const tokenAIsToken0 =
                this.getEffectiveTokenAddress(tokenA).toLowerCase() === (token0 as string).toLowerCase();
            const [token0Decimals, token1Decimals] = tokenAIsToken0
                ? [tokenA.decimals, tokenB.decimals]
                : [tokenB.decimals, tokenA.decimals];

            // Calculate prices from sqrtPriceX96
            const { token0Price, token1Price } = this.sqrtPriceX96ToPrice(
                sqrtPriceX96,
                token0Decimals,
                token1Decimals
            );

            return {
                poolAddress,
                token0,
                token1,
                fee,
                tickSpacing: this.getTickSpacing(fee),
                liquidity,
                sqrtPriceX96,
                tick,
                token0Price,
                token1Price,
            };
        } catch (error) {
            logger.error('Error getting V3 pool info:', error);
            return null;
        }
    }

    // Convert sqrtPriceX96 to human-readable price
    sqrtPriceX96ToPrice(
        sqrtPriceX96: bigint,
        token0Decimals: number,
        token1Decimals: number
    ): { token0Price: string; token1Price: string } {
        // price = (sqrtPriceX96 / 2^96)^2
        // Adjusted for decimals
        const Q96_FLOAT = Number(Q96);
        const sqrtPrice = Number(sqrtPriceX96) / Q96_FLOAT;
        const rawPrice = sqrtPrice * sqrtPrice;

        // Adjust for decimal difference
        const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
        const token0Price = rawPrice * decimalAdjustment;
        const token1Price = 1 / token0Price;

        return {
            token0Price: token0Price.toString(),
            token1Price: token1Price.toString(),
        };
    }

    // Tick to Price conversion
    tickToPrice(tick: number, token0Decimals: number, token1Decimals: number): number {
        // price = 1.0001^tick
        const rawPrice = Math.pow(1.0001, tick);
        const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
        return rawPrice * decimalAdjustment;
    }

    // Price to Tick conversion
    priceToTick(price: number, token0Decimals: number, token1Decimals: number): number {
        // tick = log(price) / log(1.0001)
        const decimalAdjustment = Math.pow(10, token0Decimals - token1Decimals);
        const adjustedPrice = price / decimalAdjustment;
        return Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
    }

    // Calculate SqrtPriceX96 from human readable price
    calculateSqrtPriceX96(price: string, token0: Token, token1: Token): bigint {
        const priceNum = parseFloat(price);
        const decimalAdjustment = Math.pow(10, token0.decimals - token1.decimals);
        const adjustedPrice = priceNum / decimalAdjustment;
        const sqrtPrice = Math.sqrt(adjustedPrice);

        // Q96 = 2^96
        const Q96 = 79228162514264337593543950336n;

        // sqrtPriceX96 = sqrt(price) * 2^96
        // We use BigInt arithmetic for precision where possible, but for initial dev/test 
        // with standard JS numbers, we'll convert carefully.

        // Convert sqrtPrice to BigInt scaled up, then multiply
        const SCALE = 10n ** 18n;
        const sqrtPriceScaled = BigInt(Math.floor(sqrtPrice * 1e18));

        return (sqrtPriceScaled * Q96) / SCALE;
    }

    // Get V3 Quote
    async getV3Quote(
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        fee: number,
        publicClient: PublicClient
    ): Promise<V3QuoteResult> {
        try {
            const quoterAddress = this.getQuoterAddress();
            const amountInWei = parseUnits(amountIn, tokenIn.decimals);

            // Native tokens must be wrapped for quoting
            const tokenInAddress = this.getEffectiveTokenAddress(tokenIn);
            const tokenOutAddress = this.getEffectiveTokenAddress(tokenOut);

            // Call quoteExactInputSingle
            const result = await publicClient.readContract({
                address: quoterAddress as `0x${string}`,
                abi: this.config.quoterABI,
                functionName: 'quoteExactInputSingle',
                args: [{
                    tokenIn: tokenInAddress as `0x${string}`,
                    tokenOut: tokenOutAddress as `0x${string}`,
                    amountIn: amountInWei,
                    fee,
                    sqrtPriceLimitX96: BigInt(0),
                }],
            }) as [bigint, bigint, number, bigint];

            const [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] = result;

            const amountOutFormatted = formatUnits(amountOut, tokenOut.decimals);

            // Calculate price impact
            const inputValue = parseFloat(amountIn);
            const outputValue = parseFloat(amountOutFormatted);
            const priceImpact = ((inputValue - outputValue) / inputValue) * 100;

            return {
                amountOut: amountOutFormatted,
                priceImpact: Math.abs(priceImpact),
                route: [tokenInAddress, tokenOutAddress],
                sqrtPriceX96After,
                initializedTicksCrossed,
                gasEstimate: gasEstimate.toString(),
                fee,
            };
        } catch (error: any) {
            logger.error('Error getting V3 quote:', error);
            // detailed logging for debugging
            if (error.cause) {
                logger.error('V3 Quote Error Cause:', error.cause);
            }
            if (error.details) {
                logger.error('V3 Quote Error Details:', error.details);
            }

            throw new DexError(
                `Failed to get V3 quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'QUOTE_FAILED',
                this.getName()
            );
        }
    }

    // Standard getQuote implementation (uses best fee tier, falls back to multi-hop)
    async getQuote(
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        publicClient: PublicClient
    ): Promise<QuoteResult> {
        // Use findBestRoute which tries direct pools and multi-hop routes
        const result = await this.findBestRoute(tokenIn, tokenOut, amountIn, publicClient);

        if (!result) {
            throw new PairNotFoundError(this.getName(), tokenIn.symbol, tokenOut.symbol);
        }

        return {
            amountOut: result.quote.amountOut,
            priceImpact: await this.calculateRoutePriceImpact(
                tokenIn,
                tokenOut,
                amountIn,
                result.quote.amountOut,
                result.route,
                publicClient
            ),
            route: result.quote.route,
        };
    }

    /**
     * Price impact = execution rate vs the marginal rate of a small probe quote
     * through the same route. The raw quoter amounts alone cannot give impact —
     * they compare amounts of two different tokens.
     */
    private async calculateRoutePriceImpact(
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        amountOut: string,
        route: V3Route,
        publicClient: PublicClient
    ): Promise<number> {
        try {
            const probeAmount = (parseFloat(amountIn) / 100).toFixed(tokenIn.decimals);
            if (parseFloat(probeAmount) <= 0) {
                return 0;
            }

            const probeQuote = route.tokenPath.length === 2
                ? await this.getV3Quote(tokenIn, tokenOut, probeAmount, route.fees[0], publicClient)
                : await this.getMultiHopQuote(tokenIn, tokenOut, probeAmount, route, publicClient);

            return computePriceImpactFromProbe(amountIn, amountOut, probeAmount, probeQuote.amountOut);
        } catch (error) {
            logger.warn('Price impact probe failed, reporting 0:', error);
            return 0;
        }
    }

    // Execute V3 Swap
    async executeV3Swap(
        params: V3SwapParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string> {
        try {
            const routerAddress = this.getRouterAddress();
            const amountIn = parseUnits(params.amountIn, params.tokenIn.decimals);
            const amountOutMinimum = parseUnits(params.amountOutMinimum, params.tokenOut.decimals);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadline * 60);

            // Determine if native token involved
            const isNativeIn = params.tokenIn.isNative;
            const isNativeOut = params.tokenOut.isNative;

            // Build swap params
            const swapParams = {
                tokenIn: isNativeIn ? this.getWethAddress() : params.tokenIn.address,
                tokenOut: isNativeOut ? this.getWethAddress() : params.tokenOut.address,
                fee: params.fee,
                recipient: isNativeOut ? routerAddress : params.recipient, // If native out, send to router first
                amountIn,
                amountOutMinimum,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96 || BigInt(0),
            };

            // Encode the swap call
            const swapData = encodeFunctionData({
                abi: this.config.routerABI,
                functionName: 'exactInputSingle',
                args: [swapParams],
            });

            // If native out, we need to unwrap WETH after
            let calldata: `0x${string}`;
            if (isNativeOut) {
                const unwrapData = encodeFunctionData({
                    abi: this.config.routerABI,
                    functionName: 'unwrapWETH9',
                    args: [amountOutMinimum],
                });

                // Multicall: swap + unwrap
                calldata = encodeFunctionData({
                    abi: this.config.routerABI,
                    functionName: 'multicall',
                    args: [deadline, [swapData, unwrapData]],
                });
            } else {
                // Single swap with deadline
                calldata = encodeFunctionData({
                    abi: this.config.routerABI,
                    functionName: 'multicall',
                    args: [deadline, [swapData]],
                });
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
            const txHash = await walletClient.writeContract({
                // KalyChain advertises a ~0 priority fee; without this the wallet builds
                // the tx below the 21 gwei inclusion floor. No-op on other chains.
                ...kalyFeeOverrides(walletClient.chain?.id),
                address: routerAddress as `0x${string}`,
                abi: this.config.routerABI,
                functionName: 'multicall',
                args: [deadline, isNativeOut ? [swapData, encodeFunctionData({
                    abi: this.config.routerABI,
                    functionName: 'unwrapWETH9',
                    args: [amountOutMinimum],
                })] : [swapData]],
                value: isNativeIn ? amountIn : BigInt(0),
                gas: 300000n, // Explicit gas limit for swap
            } as any);

            return txHash;
        } catch (error) {
            logger.error('Error executing V3 swap:', error);
            throw new SwapFailedError(this.getName(), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    // Get user's V3 positions
    async getV3Positions(userAddress: string, publicClient: PublicClient): Promise<V3Position[]> {
        try {
            const positionManagerAddress = this.getPositionManagerAddress();

            // Get balance of NFTs
            const balance = await publicClient.readContract({
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'balanceOf',
                args: [userAddress as `0x${string}`],
            }) as unknown as bigint;

            const positions: V3Position[] = [];

            // Get each position
            for (let i = 0n; i < balance; i++) {
                const tokenId = await publicClient.readContract({
                    address: positionManagerAddress as `0x${string}`,
                    abi: this.config.positionManagerABI,
                    functionName: 'tokenOfOwnerByIndex',
                    args: [userAddress as `0x${string}`, i],
                }) as unknown as bigint;

                const position = await this.getV3Position(tokenId, publicClient);
                if (position) {
                    positions.push(position);
                }
            }

            return positions;
        } catch (error) {
            logger.error('Error getting V3 positions:', error);
            return [];
        }
    }

    // Get specific V3 position
    async getV3Position(tokenId: bigint, publicClient: PublicClient): Promise<V3Position | null> {
        try {
            const positionManagerAddress = this.getPositionManagerAddress();

            const position = await publicClient.readContract({
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'positions',
                args: [tokenId],
            }) as unknown as [bigint, `0x${string}`, `0x${string}`, `0x${string}`, number, number, number, bigint, bigint, bigint, bigint, bigint];

            const [
                nonce,
                operator,
                token0,
                token1,
                fee,
                tickLower,
                tickUpper,
                liquidity,
                feeGrowthInside0LastX128,
                feeGrowthInside1LastX128,
                tokensOwed0,
                tokensOwed1,
            ] = position;

            // Get owner
            const owner = await publicClient.readContract({
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'ownerOf',
                args: [tokenId],
            }) as unknown as string;

            return {
                tokenId,
                owner,
                token0,
                token1,
                fee,
                tickLower,
                tickUpper,
                liquidity,
                feeGrowthInside0LastX128,
                feeGrowthInside1LastX128,
                tokensOwed0,
                tokensOwed1,
            };
        } catch (error) {
            logger.error('Error getting V3 position:', error);
            return null;
        }
    }

    // Mint new V3 position
    async mintV3Position(
        params: V3AddLiquidityParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<{ tokenId: bigint; txHash: string }> {
        try {
            const positionManagerAddress = this.getPositionManagerAddress();
            const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadline * 60);

            // Sort tokens
            const [token0, token1] = params.token0.address.toLowerCase() < params.token1.address.toLowerCase()
                ? [params.token0, params.token1]
                : [params.token1, params.token0];

            const amount0Desired = parseUnits(params.amount0Desired, token0.decimals);
            const amount1Desired = parseUnits(params.amount1Desired, token1.decimals);
            const amount0Min = parseUnits(params.amount0Min, token0.decimals);
            const amount1Min = parseUnits(params.amount1Min, token1.decimals);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
            const txHash = await walletClient.writeContract({
                // KalyChain advertises a ~0 priority fee; without this the wallet builds
                // the tx below the 21 gwei inclusion floor. No-op on other chains.
                ...kalyFeeOverrides(walletClient.chain?.id),
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'mint',
                args: [{
                    token0: token0.address as `0x${string}`,
                    token1: token1.address as `0x${string}`,
                    fee: params.fee,
                    tickLower: params.tickLower,
                    tickUpper: params.tickUpper,
                    amount0Desired,
                    amount1Desired,
                    amount0Min,
                    amount1Min,
                    recipient: params.recipient as `0x${string}`,
                    deadline,
                }],
                gas: 3000000n, // Explicit gas limit for minting
            } as any);

            // For now, return 0n as tokenId - in production, parse from tx logs
            return { tokenId: 0n, txHash };
        } catch (error) {
            logger.error('Error minting V3 position:', error);
            throw new DexError(
                `Failed to mint V3 position: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'MINT_FAILED',
                this.getName()
            );
        }
    }

    // Read an ERC20 token's decimals on-chain
    async getTokenDecimals(tokenAddress: string, publicClient: PublicClient): Promise<number> {
        const ERC20_DECIMALS_ABI = [{
            inputs: [],
            name: 'decimals',
            outputs: [{ name: '', type: 'uint8' }],
            stateMutability: 'view',
            type: 'function',
        }] as const;

        const decimals = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_DECIMALS_ABI,
            functionName: 'decimals',
            args: [],
        }) as number;

        return Number(decimals);
    }

    // Increase liquidity
    async increaseLiquidity(
        params: V3IncreaseLiquidityParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string> {
        const positionManagerAddress = this.getPositionManagerAddress();
        const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadline * 60);

        // Get position so we can resolve the real token0/token1 decimals.
        // The position struct already returns token0/token1 in sorted order,
        // matching the amount0/amount1 ordering expected by increaseLiquidity.
        const position = await this.getV3Position(params.tokenId, publicClient);
        if (!position) throw new Error('Position not found');

        const [decimals0, decimals1] = await Promise.all([
            this.getTokenDecimals(position.token0, publicClient),
            this.getTokenDecimals(position.token1, publicClient),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const txHash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: positionManagerAddress as `0x${string}`,
            abi: this.config.positionManagerABI,
            functionName: 'increaseLiquidity',
            args: [{
                tokenId: params.tokenId,
                amount0Desired: parseUnits(params.amount0Desired, decimals0),
                amount1Desired: parseUnits(params.amount1Desired, decimals1),
                amount0Min: parseUnits(params.amount0Min, decimals0),
                amount1Min: parseUnits(params.amount1Min, decimals1),
                deadline,
            }],
            gas: 3000000n,
        } as any);

        return txHash;
    }

    /** Default protection when the caller does not supply explicit minimums. */
    protected static readonly DEFAULT_REMOVE_SLIPPAGE_PCT = 0.5;

    /** Reduce `amount` by `tolerancePct`, in integer maths. */
    private applySlippageFloor(amount: bigint, tolerancePct: number): bigint {
        if (amount === 0n) return 0n;
        // basis points, so 0.5% -> 9950/10000
        const keptBps = BigInt(Math.round((100 - tolerancePct) * 100));
        return (amount * keptBps) / 10_000n;
    }

    /**
     * Ask the position manager what this withdrawal would actually return, without
     * sending anything. `decreaseLiquidity` returns (amount0, amount1), so a static
     * call gives exact expected amounts to derive minimums from.
     */
    private async simulateDecrease(
        positionManagerAddress: string,
        tokenId: bigint,
        liquidity: bigint,
        deadline: bigint,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<{ amount0: bigint; amount1: bigint } | null> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
            const { result } = await publicClient.simulateContract({
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'decreaseLiquidity',
                args: [{ tokenId, liquidity, amount0Min: 0n, amount1Min: 0n, deadline }],
                account: walletClient.account,
            } as any);
            const [amount0, amount1] = result as unknown as [bigint, bigint];
            return { amount0, amount1 };
        } catch (error) {
            logger.warn('decreaseLiquidity simulation failed; falling back to zero minimums', error);
            return null;
        }
    }

    // Decrease liquidity
    async decreaseLiquidity(
        params: V3DecreaseLiquidityParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string> {
        const positionManagerAddress = this.getPositionManagerAddress();
        const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadline * 60);

        // The minimums are denominated in the POSITION's tokens, which are not always
        // 18 decimals — KMT/USDT has a 6-decimal token0. This used to hardcode 18,
        // which would have inflated the minimum by 1e12 and reverted every withdrawal
        // the moment a non-zero minimum was passed.
        const position = await this.getV3Position(params.tokenId, publicClient);
        if (!position) throw new Error('Position not found');

        const [decimals0, decimals1] = await Promise.all([
            this.getTokenDecimals(position.token0, publicClient),
            this.getTokenDecimals(position.token1, publicClient),
        ]);

        let amount0Min: bigint;
        let amount1Min: bigint;

        if (params.amount0Min !== undefined && params.amount1Min !== undefined) {
            amount0Min = parseUnits(params.amount0Min, decimals0);
            amount1Min = parseUnits(params.amount1Min, decimals1);
        } else {
            // Derive protection from what the withdrawal actually returns right now.
            const tolerance = params.slippageTolerance ?? BaseV3Service.DEFAULT_REMOVE_SLIPPAGE_PCT;
            const expected = await this.simulateDecrease(
                positionManagerAddress,
                params.tokenId,
                params.liquidity,
                deadline,
                publicClient,
                walletClient
            );
            // A failed simulation must not block a withdrawal; it just means this one
            // goes out unprotected, and the warning above says so.
            amount0Min = expected ? this.applySlippageFloor(expected.amount0, tolerance) : 0n;
            amount1Min = expected ? this.applySlippageFloor(expected.amount1, tolerance) : 0n;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const txHash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: positionManagerAddress as `0x${string}`,
            abi: this.config.positionManagerABI,
            functionName: 'decreaseLiquidity',
            args: [{
                tokenId: params.tokenId,
                liquidity: params.liquidity,
                amount0Min,
                amount1Min,
                deadline,
            }],
            gas: 3000000n,
        } as any);

        return txHash;
    }

    // Collect fees
    async collectFees(
        params: V3CollectParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string> {
        const positionManagerAddress = this.getPositionManagerAddress();

        let gasLimit: bigint;

        // Construct the params object exactly as the ABI expects (struct)
        const collectParams = {
            tokenId: params.tokenId,
            recipient: params.recipient as `0x${string}`,
            amount0Max: params.amount0Max,
            amount1Max: params.amount1Max
        };

        try {
            const gasEstimate = await publicClient.estimateContractGas({
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'collect',
                args: [collectParams], // Wrapped in array as it's the first argument (tuple)
                account: walletClient.account
            });

            // Add 20% buffer for safety
            gasLimit = (gasEstimate * 120n) / 100n;
        } catch (error) {
            // Fallback to hardcoded limit if estimation fails
            logger.warn('Gas estimation failed for collectFees, using fallback:', error);
            gasLimit = 3000000n;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const txHash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: positionManagerAddress as `0x${string}`,
            abi: this.config.positionManagerABI,
            functionName: 'collect',
            args: [collectParams], // Wrapped in array as it's the first argument (tuple)
            gas: gasLimit,
        } as any);

        return txHash;
    }

    // Simulate collection to get real-time pending fees (static call)
    async getClaimableFees(
        tokenId: bigint,
        recipient: string,
        publicClient: PublicClient
    ): Promise<{ amount0: bigint, amount1: bigint }> {
        try {
            const positionManagerAddress = this.getPositionManagerAddress();
            const maxUint128 = 340282366920938463463374607431768211455n;

            const collectParams = {
                tokenId: tokenId,
                recipient: recipient as `0x${string}`,
                amount0Max: maxUint128,
                amount1Max: maxUint128
            };

            // Simulate the call to see what WOULD be collected without spending gas
            const { result } = await publicClient.simulateContract({
                address: positionManagerAddress as `0x${string}`,
                abi: this.config.positionManagerABI,
                functionName: 'collect',
                args: [collectParams],
                account: recipient as `0x${string}`, // Simulate as the owner
            });

            // Result is [amount0, amount1]
            const [amount0, amount1] = result as [bigint, bigint];

            return { amount0, amount1 };
        } catch (error) {
            logger.warn(`Failed to simulate fees for token ${tokenId}:`, error);
            return { amount0: 0n, amount1: 0n };
        }
    }

    // Get unclaimed fees
    async getUnclaimedFees(
        tokenId: bigint,
        publicClient: PublicClient
    ): Promise<{ amount0: bigint; amount1: bigint }> {
        // This is a simplified version - full implementation requires pool state analysis
        const position = await this.getV3Position(tokenId, publicClient);
        if (!position) {
            return { amount0: 0n, amount1: 0n };
        }
        return {
            amount0: position.tokensOwed0,
            amount1: position.tokensOwed1,
        };
    }

    // ===== V2 Interface Compatibility (not used in V3 but required by interface) =====

    async getPairAddress(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<string | null> {
        // Return the best pool (0.3% fee tier by default)
        return this.getV3PoolAddress(tokenA, tokenB, V3_FEE_TIERS.MEDIUM, publicClient);
    }

    async getPairInfo(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<PairInfo | null> {
        const poolInfo = await this.getV3PoolInfo(tokenA, tokenB, V3_FEE_TIERS.MEDIUM, publicClient);
        if (!poolInfo) return null;

        // Sort tokens to match pool's token0/token1 order
        const [sortedTokenA, sortedTokenB] = tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
            ? [tokenA, tokenB]
            : [tokenB, tokenA];

        return {
            pairAddress: poolInfo.poolAddress,
            token0: sortedTokenA,
            token1: sortedTokenB,
            reserve0: '0', // V3 doesn't have reserves like V2
            reserve1: '0',
            totalSupply: '0', // Not applicable for V3 concentrated liquidity
        };
    }

    async calculatePriceImpact(tokenIn: Token, tokenOut: Token, amountIn: string, publicClient: PublicClient): Promise<number> {
        try {
            const quote = await this.getQuote(tokenIn, tokenOut, amountIn, publicClient);
            return quote.priceImpact;
        } catch {
            return 0;
        }
    }

    // ===== Multi-hop routing helpers =====

    /**
     * Encode a V3 swap path as packed bytes.
     * Format: address(20) + fee(3) + address(20) [+ fee(3) + address(20) ...]
     */
    encodePath(tokens: string[], fees: number[]): `0x${string}` {
        if (tokens.length < 2 || fees.length !== tokens.length - 1) {
            throw new Error('Invalid path: tokens.length must equal fees.length + 1');
        }
        let encoded = '0x';
        for (let i = 0; i < tokens.length; i++) {
            encoded += tokens[i].slice(2).toLowerCase();
            if (i < fees.length) {
                encoded += fees[i].toString(16).padStart(6, '0');
            }
        }
        return encoded as `0x${string}`;
    }

    /**
     * Get intermediate tokens to try for multi-hop routing.
     * Returns token addresses that may serve as bridges between arbitrary pairs.
     */
    getIntermediateTokens(): string[] {
        const wklc = this.getWethAddress(); // WKLC

        // Routing stables come from the chain's token list, never hardcoded —
        // limited to symbols with real pool liquidity to bound RPC probes per quote.
        const ROUTING_STABLE_SYMBOLS = ['USDT', 'USDC', 'KUSD', 'BUSD'];
        const stables = this.config.tokens
            .filter((t) => !t.isNative && ROUTING_STABLE_SYMBOLS.includes(t.symbol))
            .map((t) => t.address);

        return [wklc, ...stables.filter((a) => a.toLowerCase() !== wklc.toLowerCase())];
    }

    /**
     * Get a multi-hop quote using QuoterV2.quoteExactInput with an encoded path.
     */
    async getMultiHopQuote(
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        route: V3Route,
        publicClient: PublicClient
    ): Promise<V3QuoteResult> {
        try {
            const quoterAddress = this.getQuoterAddress();
            const amountInWei = parseUnits(amountIn, tokenIn.decimals);

            const result = await publicClient.readContract({
                address: quoterAddress as `0x${string}`,
                abi: this.config.quoterABI,
                functionName: 'quoteExactInput',
                args: [route.encodedPath, amountInWei],
            }) as [bigint, bigint[], number[], bigint];

            const [amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate] = result;

            const amountOutFormatted = formatUnits(amountOut, tokenOut.decimals);

            // Calculate price impact
            const inputValue = parseFloat(amountIn);
            const outputValue = parseFloat(amountOutFormatted);
            const priceImpact = ((inputValue - outputValue) / inputValue) * 100;

            // Use the last sqrtPriceX96 from the list (final pool state)
            const sqrtPriceX96After = sqrtPriceX96AfterList.length > 0
                ? sqrtPriceX96AfterList[sqrtPriceX96AfterList.length - 1]
                : 0n;

            // Sum initialized ticks crossed
            const initializedTicksCrossed = initializedTicksCrossedList.reduce((a, b) => a + b, 0);

            return {
                amountOut: amountOutFormatted,
                priceImpact: Math.abs(priceImpact),
                route: route.tokenPath,
                sqrtPriceX96After,
                initializedTicksCrossed,
                gasEstimate: gasEstimate.toString(),
                fee: route.fees[0], // Primary fee (first hop)
            };
        } catch (error: any) {
            logger.error('Error getting multi-hop V3 quote:', error);
            throw new DexError(
                `Failed to get multi-hop V3 quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'QUOTE_FAILED',
                this.getName()
            );
        }
    }

    /**
     * Find the best multi-hop route for a token pair.
     * Tries direct pools first, then 2-hop routes through intermediate tokens.
     * Returns the best route with quote, or null if no route is found.
     */
    async findBestRoute(
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        publicClient: PublicClient
    ): Promise<{ route: V3Route; quote: V3QuoteResult } | null> {
        const feeTiers = this.getFeeTiers();
        let bestResult: { route: V3Route; quote: V3QuoteResult } | null = null;

        // Native tokens must be wrapped for routing/quoting (execution handles wrap/unwrap)
        const effectiveIn = this.getEffectiveTokenAddress(tokenIn);
        const effectiveOut = this.getEffectiveTokenAddress(tokenOut);

        // 1. Try all direct pools (single-hop)
        for (const fee of feeTiers) {
            try {
                const pool = await this.getV3PoolAddress(tokenIn, tokenOut, fee, publicClient);
                if (!pool) continue;

                const route: V3Route = {
                    tokenPath: [effectiveIn, effectiveOut],
                    fees: [fee],
                    encodedPath: this.encodePath([effectiveIn, effectiveOut], [fee]),
                };

                const quote = await this.getV3Quote(tokenIn, tokenOut, amountIn, fee, publicClient);

                if (!bestResult || parseFloat(quote.amountOut) > parseFloat(bestResult.quote.amountOut)) {
                    bestResult = { route, quote };
                }
            } catch {
                continue;
            }
        }

        // 2. Try 2-hop routes through intermediate tokens
        const intermediateTokens = this.getIntermediateTokens();
        const addressIn = effectiveIn.toLowerCase();
        const addressOut = effectiveOut.toLowerCase();

        for (const intermediate of intermediateTokens) {
            // Skip if intermediate is the same as input or output
            if (intermediate.toLowerCase() === addressIn || intermediate.toLowerCase() === addressOut) {
                continue;
            }

            // Try all combinations of fee tiers for both hops
            for (const fee1 of feeTiers) {
                for (const fee2 of feeTiers) {
                    try {
                        // Check both legs have pools
                        const [pool1, pool2] = await Promise.all([
                            this.getV3PoolAddress(
                                tokenIn,
                                { address: intermediate } as Token,
                                fee1,
                                publicClient
                            ),
                            this.getV3PoolAddress(
                                { address: intermediate } as Token,
                                tokenOut,
                                fee2,
                                publicClient
                            ),
                        ]);

                        if (!pool1 || !pool2) continue;

                        const route: V3Route = {
                            tokenPath: [effectiveIn, intermediate, effectiveOut],
                            fees: [fee1, fee2],
                            encodedPath: this.encodePath(
                                [effectiveIn, intermediate, effectiveOut],
                                [fee1, fee2]
                            ),
                        };

                        const quote = await this.getMultiHopQuote(
                            tokenIn,
                            tokenOut,
                            amountIn,
                            route,
                            publicClient
                        );

                        if (!bestResult || parseFloat(quote.amountOut) > parseFloat(bestResult.quote.amountOut)) {
                            bestResult = { route, quote };
                            logger.debug('Found better multi-hop route:', {
                                path: route.tokenPath,
                                fees: route.fees,
                                amountOut: quote.amountOut,
                            });
                        }
                    } catch {
                        // This fee-tier combination doesn't work, continue
                        continue;
                    }
                }
            }
        }

        return bestResult;
    }

    /**
     * Reverse quote: how much tokenIn is needed to receive exactly amountOut.
     * Mirrors findBestRoute (direct pools first, then 2-hop) and picks the
     * route requiring the LEAST input. Quote-only — execution stays exact-input.
     */
    async getQuoteExactOutput(
        tokenIn: Token,
        tokenOut: Token,
        amountOut: string,
        publicClient: PublicClient
    ): Promise<ExactOutputQuoteResult> {
        const best = await this.findBestRouteExactOutput(tokenIn, tokenOut, amountOut, publicClient);

        if (!best) {
            // Distinguish "no pool at all" from "pool exists but can't fill this amount"
            for (const fee of this.getFeeTiers()) {
                const pool = await this.getV3PoolAddress(tokenIn, tokenOut, fee, publicClient);
                if (pool) {
                    throw new InsufficientLiquidityError(this.getName(), tokenIn.symbol, tokenOut.symbol);
                }
            }
            throw new PairNotFoundError(this.getName(), tokenIn.symbol, tokenOut.symbol);
        }

        const amountIn = formatUnits(best.amountInWei, tokenIn.decimals);

        // Price impact via marginal probe, same approach as getQuote
        let priceImpact = 0;
        try {
            const probeOut = (parseFloat(amountOut) / 100).toFixed(tokenOut.decimals);
            if (parseFloat(probeOut) > 0) {
                const probeInWei = await this.quoteExactOutputForRoute(
                    tokenIn, tokenOut, probeOut, best.route, publicClient
                );
                priceImpact = computePriceImpactFromProbe(
                    amountIn,
                    amountOut,
                    formatUnits(probeInWei, tokenIn.decimals),
                    probeOut
                );
            }
        } catch (error) {
            logger.warn('Exact-output price impact probe failed, reporting 0:', error);
        }

        return {
            amountIn,
            priceImpact,
            route: best.route.tokenPath,
        };
    }

    /**
     * Find the exact-output route needing the least input.
     * NOTE: route.encodedPath here is the QUOTER path, encoded in reverse
     * order (tokenOut → tokenIn) as V3 exact-output requires — do not pass
     * it to exact-input execution.
     */
    async findBestRouteExactOutput(
        tokenIn: Token,
        tokenOut: Token,
        amountOut: string,
        publicClient: PublicClient
    ): Promise<{ route: V3Route; amountInWei: bigint } | null> {
        const feeTiers = this.getFeeTiers();
        const effectiveIn = this.getEffectiveTokenAddress(tokenIn);
        const effectiveOut = this.getEffectiveTokenAddress(tokenOut);
        let best: { route: V3Route; amountInWei: bigint } | null = null;

        // 1. Direct pools (single-hop)
        for (const fee of feeTiers) {
            try {
                const pool = await this.getV3PoolAddress(tokenIn, tokenOut, fee, publicClient);
                if (!pool) continue;

                const route: V3Route = {
                    tokenPath: [effectiveIn, effectiveOut],
                    fees: [fee],
                    // reverse order for exact-output quoting
                    encodedPath: this.encodePath([effectiveOut, effectiveIn], [fee]),
                };

                const amountInWei = await this.quoteExactOutputForRoute(
                    tokenIn, tokenOut, amountOut, route, publicClient
                );

                if (!best || amountInWei < best.amountInWei) {
                    best = { route, amountInWei };
                }
            } catch {
                continue;
            }
        }

        // 2. 2-hop routes through intermediate tokens
        const intermediateTokens = this.getIntermediateTokens();
        const addressIn = effectiveIn.toLowerCase();
        const addressOut = effectiveOut.toLowerCase();

        for (const intermediate of intermediateTokens) {
            if (intermediate.toLowerCase() === addressIn || intermediate.toLowerCase() === addressOut) {
                continue;
            }

            for (const fee1 of feeTiers) {
                for (const fee2 of feeTiers) {
                    try {
                        const [pool1, pool2] = await Promise.all([
                            this.getV3PoolAddress(tokenIn, { address: intermediate } as Token, fee1, publicClient),
                            this.getV3PoolAddress({ address: intermediate } as Token, tokenOut, fee2, publicClient),
                        ]);

                        if (!pool1 || !pool2) continue;

                        const route: V3Route = {
                            tokenPath: [effectiveIn, intermediate, effectiveOut],
                            fees: [fee1, fee2],
                            // reverse order for exact-output quoting: out → mid → in
                            encodedPath: this.encodePath(
                                [effectiveOut, intermediate, effectiveIn],
                                [fee2, fee1]
                            ),
                        };

                        const amountInWei = await this.quoteExactOutputForRoute(
                            tokenIn, tokenOut, amountOut, route, publicClient
                        );

                        if (!best || amountInWei < best.amountInWei) {
                            best = { route, amountInWei };
                        }
                    } catch {
                        continue;
                    }
                }
            }
        }

        return best;
    }

    /**
     * Raw exact-output quoter call for a route built by findBestRouteExactOutput.
     * Returns the required input amount in wei.
     */
    private async quoteExactOutputForRoute(
        tokenIn: Token,
        tokenOut: Token,
        amountOut: string,
        route: V3Route,
        publicClient: PublicClient
    ): Promise<bigint> {
        const quoterAddress = this.getQuoterAddress();
        const amountOutWei = parseUnits(amountOut, tokenOut.decimals);

        if (route.tokenPath.length === 2) {
            const result = await publicClient.readContract({
                address: quoterAddress as `0x${string}`,
                abi: this.config.quoterABI,
                functionName: 'quoteExactOutputSingle',
                args: [{
                    tokenIn: this.getEffectiveTokenAddress(tokenIn) as `0x${string}`,
                    tokenOut: this.getEffectiveTokenAddress(tokenOut) as `0x${string}`,
                    amount: amountOutWei,
                    fee: route.fees[0],
                    sqrtPriceLimitX96: BigInt(0),
                }],
            }) as [bigint, bigint, number, bigint];
            return result[0];
        }

        const result = await publicClient.readContract({
            address: quoterAddress as `0x${string}`,
            abi: this.config.quoterABI,
            functionName: 'quoteExactOutput',
            args: [route.encodedPath, amountOutWei],
        }) as [bigint, bigint[], number[], bigint];
        return result[0];
    }

    /**
     * Execute a multi-hop V3 swap using SwapRouter02.exactInput
     */
    async executeV3MultiHopSwap(
        params: V3MultiHopSwapParams,
        publicClient: PublicClient,
        walletClient: WalletClient
    ): Promise<string> {
        try {
            const routerAddress = this.getRouterAddress();
            const amountIn = parseUnits(params.amountIn, params.tokenIn.decimals);
            const amountOutMinimum = parseUnits(params.amountOutMinimum, params.tokenOut.decimals);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadline * 60);

            const isNativeIn = params.tokenIn.isNative;
            const isNativeOut = params.tokenOut.isNative;

            // For native token swaps, replace native address with WETH in the path
            let encodedPath = params.route.encodedPath;
            if (isNativeIn || isNativeOut) {
                const weth = this.getWethAddress();
                const tokens = params.route.tokenPath.map((t) => {
                    const token = { address: t } as Token;
                    if (isNativeIn && t.toLowerCase() === params.tokenIn.address.toLowerCase()) {
                        return weth;
                    }
                    if (isNativeOut && t.toLowerCase() === params.tokenOut.address.toLowerCase()) {
                        return weth;
                    }
                    return t;
                });
                encodedPath = this.encodePath(tokens, params.route.fees);
            }

            // Build exactInput params
            const exactInputParams = {
                path: encodedPath,
                recipient: isNativeOut ? routerAddress : params.recipient, // If native out, send to router first
                amountIn,
                amountOutMinimum,
            };

            // Encode the swap call
            const swapData = encodeFunctionData({
                abi: this.config.routerABI,
                functionName: 'exactInput',
                args: [exactInputParams],
            });

            // If native out, unwrap WETH after the swap
            const calls: `0x${string}`[] = [swapData];
            if (isNativeOut) {
                const unwrapData = encodeFunctionData({
                    abi: this.config.routerABI,
                    functionName: 'unwrapWETH9',
                    args: [amountOutMinimum],
                });
                calls.push(unwrapData);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
            const txHash = await walletClient.writeContract({
                // KalyChain advertises a ~0 priority fee; without this the wallet builds
                // the tx below the 21 gwei inclusion floor. No-op on other chains.
                ...kalyFeeOverrides(walletClient.chain?.id),
                address: routerAddress as `0x${string}`,
                abi: this.config.routerABI,
                functionName: 'multicall',
                args: [deadline, calls],
                value: isNativeIn ? amountIn : BigInt(0),
                gas: 500000n, // Higher gas limit for multi-hop swaps
            } as any);

            return txHash;
        } catch (error) {
            logger.error('Error executing multi-hop V3 swap:', error);
            throw new SwapFailedError(this.getName(), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    async getSwapRoute(tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]> {
        // 1. Check direct pools across all fee tiers
        for (const fee of this.getFeeTiers()) {
            const pool = await this.getV3PoolAddress(tokenIn, tokenOut, fee, publicClient);
            if (pool) {
                return [tokenIn.address, tokenOut.address];
            }
        }

        // 2. Try multi-hop routes through intermediate tokens
        const intermediateTokens = this.getIntermediateTokens();
        const feeTiers = this.getFeeTiers();
        const addressIn = tokenIn.address.toLowerCase();
        const addressOut = tokenOut.address.toLowerCase();

        for (const intermediate of intermediateTokens) {
            if (intermediate.toLowerCase() === addressIn || intermediate.toLowerCase() === addressOut) {
                continue;
            }

            for (const fee1 of feeTiers) {
                for (const fee2 of feeTiers) {
                    const [pool1, pool2] = await Promise.all([
                        this.getV3PoolAddress(tokenIn, { address: intermediate } as Token, fee1, publicClient),
                        this.getV3PoolAddress({ address: intermediate } as Token, tokenOut, fee2, publicClient),
                    ]);

                    if (pool1 && pool2) {
                        return [tokenIn.address, intermediate, tokenOut.address];
                    }
                }
            }
        }

        return [];
    }

    async canSwapDirectly(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<boolean> {
        // Check all fee tiers
        for (const fee of this.getFeeTiers()) {
            const pool = await this.getV3PoolAddress(tokenA, tokenB, fee, publicClient);
            if (pool) return true;
        }
        return false;
    }

    // Liquidity operations (V2 interface - throw for now, use V3-specific methods)
    async addLiquidity(params: AddLiquidityParams, publicClient: PublicClient, walletClient: WalletClient): Promise<string> {
        throw new Error('Use mintV3Position for V3 liquidity. V2-style addLiquidity not supported.');
    }

    async removeLiquidity(params: RemoveLiquidityParams, publicClient: PublicClient, walletClient: WalletClient): Promise<string> {
        throw new Error('Use decreaseLiquidity for V3. V2-style removeLiquidity not supported.');
    }

    async getUserLiquidityPositions(userAddress: string, publicClient: PublicClient): Promise<LiquidityPosition[]> {
        // Convert V3 positions to V2-compatible format
        const v3Positions = await this.getV3Positions(userAddress, publicClient);
        const tokens = this.getTokenList();

        return v3Positions.map(pos => {
            // Find matching Token objects, or create minimal placeholders
            const token0Info = tokens.find(t => t.address.toLowerCase() === pos.token0.toLowerCase());
            const token1Info = tokens.find(t => t.address.toLowerCase() === pos.token1.toLowerCase());

            const placeholderToken = (address: string): Token => ({
                chainId: 0,
                address,
                decimals: 18,
                name: 'Unknown',
                symbol: 'UNK',
                logoURI: '',
            });

            return {
                pairAddress: '', // Not applicable for V3
                token0: token0Info ?? placeholderToken(pos.token0),
                token1: token1Info ?? placeholderToken(pos.token1),
                lpBalance: pos.liquidity.toString(),
                reserve0: '0', // Not applicable for V3
                reserve1: '0',
                totalSupply: '0',
                share: '0', // Not applicable for V3
            };
        });
    }

    async calculateOptimalLiquidityAmounts(
        tokenA: Token,
        tokenB: Token,
        amountA: string,
        publicClient: PublicClient
    ): Promise<{ amountB: string; isNewPair: boolean }> {
        // For V3, this depends on tick range
        // Simplified: return 1:1 ratio based on current price
        const poolInfo = await this.getV3PoolInfo(tokenA, tokenB, V3_FEE_TIERS.MEDIUM, publicClient);
        if (!poolInfo) {
            return { amountB: amountA, isNewPair: true };
        }
        const amountB = (parseFloat(amountA) * parseFloat(poolInfo.token0Price)).toString();
        return { amountB, isNewPair: false };
    }

    async approveToken(token: Token, amount: string, walletClient: WalletClient): Promise<string> {
        const spender = this.getPositionManagerAddress(); // Approve position manager for V3
        const amountWei = parseUnits(amount, token.decimals);

        const ERC20_APPROVE_ABI = [{
            inputs: [
                { name: 'spender', type: 'address' },
                { name: 'amount', type: 'uint256' }
            ],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function'
        }] as const;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WalletClient may lack chain config
        return await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: token.address as `0x${string}`,
            abi: ERC20_APPROVE_ABI,
            functionName: 'approve',
            args: [spender as `0x${string}`, amountWei],
        } as any);
    }

    async checkApproval(token: Token, owner: string, amount: string, publicClient: PublicClient): Promise<boolean> {
        const spender = this.getPositionManagerAddress();
        const amountWei = parseUnits(amount, token.decimals);

        const ERC20_ALLOWANCE_ABI = [{
            inputs: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' }
            ],
            name: 'allowance',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
        }];

        const allowance = await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: ERC20_ALLOWANCE_ABI,
            functionName: 'allowance',
            args: [owner as `0x${string}`, spender as `0x${string}`],
        }) as bigint;

        return allowance >= amountWei;
    }
}
