/**
 * useV3Swap - Hook for V3 swap operations
 * Handles quotes, swaps, and approvals specifically for Uniswap V3 style DEXes
 */

import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { encodeFunctionData, parseUnits, getContract, maxUint256 } from 'viem';
import { Token, QuoteResult, ExactOutputQuoteResult, SwapParams } from '@/config/dex/types';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { V3QuoteResult } from '@/services/dex/IV3DexService';
import { ERC20_ABI, WKLC_ABI } from '@/config/abis';
import { useState, useCallback, useMemo } from 'react';
import { swapLogger as logger } from '@/lib/logger';
import { CHAIN_IDS } from '@/config/chains';
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';

// Helper to check if tokens are Native <-> Wrapped Native (same as useDexSwap)
const isWrapOperation = (tokenIn: Token, tokenOut: Token, wethAddress: string) => {
    const isNativeIn = tokenIn.isNative;
    const isWethIn = tokenIn.address.toLowerCase() === wethAddress.toLowerCase();
    const isNativeOut = tokenOut.isNative;
    const isWethOut = tokenOut.address.toLowerCase() === wethAddress.toLowerCase();

    return (isNativeIn && isWethOut) || (isWethIn && isNativeOut);
};

// Extended return type for V3 with additional V3-specific data
interface UseV3SwapReturn {
    // Standard swap operations
    getQuote: (tokenIn: Token, tokenOut: Token, amountIn: string) => Promise<QuoteResult>;
    getQuoteExactOutput: (tokenIn: Token, tokenOut: Token, amountOut: string) => Promise<ExactOutputQuoteResult>;
    executeSwap: (params: SwapParams) => Promise<string>;
    checkApproval: (token: Token, amount: string) => Promise<boolean>;
    approveToken: (token: Token, amount?: string) => Promise<string>;

    // V3-specific operations
    getV3Quote: (tokenIn: Token, tokenOut: Token, amountIn: string, fee?: number) => Promise<V3QuoteResult>;
    getBestFeeTier: (tokenIn: Token, tokenOut: Token) => Promise<number>;

    // State
    isLoading: boolean;
    error: string | null;

    // Service access for advanced operations
    service: ReturnType<typeof getKalySwapV3Service>;
}

export function useV3Swap(chainId: number = CHAIN_IDS.KALYCHAIN): UseV3SwapReturn {
    const publicClient = usePublicClient({ chainId });
    const { data: walletClient } = useWalletClient({ chainId });
    const { connector } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get V3 service instance (null if V3 not supported on this chain)
    const service = useMemo(() => getKalySwapV3Service(chainId), [chainId]);

    /**
     * Get the best fee tier for a token pair based on liquidity
     */
    const getBestFeeTier = useCallback(async (
        tokenIn: Token,
        tokenOut: Token
    ): Promise<number> => {
        try {
            if (!service) throw new Error('V3 not available on this chain');
            if (!publicClient) throw new Error('Public client not available');

            return await service.getOptimalFeeTier(tokenIn, tokenOut, publicClient);
        } catch (err: any) {
            logger.error('Error getting best fee tier:', err);
            return 3000;
        }
    }, [service, publicClient]);

    /**
     * Get a V3-specific quote with additional details
     */
    const getV3Quote = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string,
        fee?: number
    ): Promise<V3QuoteResult> => {
        try {
            setError(null);

            if (!service) throw new Error('V3 not available on this chain');
            if (!publicClient) throw new Error('Public client not available');

            // If no fee specified, find the best one
            const feeTier = fee || await getBestFeeTier(tokenIn, tokenOut);

            const quote = await service.getV3Quote(
                tokenIn,
                tokenOut,
                amountIn,
                feeTier,
                publicClient
            );

            logger.debug('V3 Quote:', {
                amountOut: quote.amountOut,
                priceImpact: quote.priceImpact,
                fee: quote.fee,
                gasEstimate: quote.gasEstimate,
            });

            return quote;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to get V3 quote';
            setError(errorMessage);
            throw err;
        }
    }, [service, publicClient, getBestFeeTier]);

    /**
     * Get a standard quote (finds best fee tier automatically)
     */
    const getQuote = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string
    ): Promise<QuoteResult> => {
        try {
            setError(null);

            if (!service) throw new Error('V3 not available on this chain');
            if (!publicClient) throw new Error('Public client not available');

            // Wrap/Unwrap is always 1:1 — never route KLC<->WKLC through pools
            if (isWrapOperation(tokenIn, tokenOut, service.getWethAddress())) {
                return {
                    amountOut: amountIn,
                    priceImpact: 0,
                    route: [tokenIn.address, tokenOut.address],
                    gasEstimate: '50000'
                };
            }

            // Use the service's getQuote which tries all fee tiers
            const quote = await service.getQuote(tokenIn, tokenOut, amountIn, publicClient);

            logger.debug('V3 Quote (best tier):', {
                amountOut: quote.amountOut,
                priceImpact: quote.priceImpact,
            });

            return quote;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to get quote';
            setError(errorMessage);
            throw err;
        }
    }, [service, publicClient]);

    /**
     * Reverse quote: required input for an exact output (quote-only)
     */
    const getQuoteExactOutput = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountOut: string
    ): Promise<ExactOutputQuoteResult> => {
        try {
            setError(null);

            if (!service) throw new Error('V3 not available on this chain');
            if (!publicClient) throw new Error('Public client not available');

            // Wrap/Unwrap is always 1:1
            if (isWrapOperation(tokenIn, tokenOut, service.getWethAddress())) {
                return {
                    amountIn: amountOut,
                    priceImpact: 0,
                    route: [tokenIn.address, tokenOut.address],
                    gasEstimate: '50000'
                };
            }

            const quote = await service.getQuoteExactOutput(tokenIn, tokenOut, amountOut, publicClient);

            logger.debug('V3 exact-output quote:', {
                amountIn: quote.amountIn,
                priceImpact: quote.priceImpact,
            });

            return quote;
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to get exact-output quote';
            setError(errorMessage);
            throw err;
        }
    }, [service, publicClient]);

    /**
     * Check if token is approved for the V3 SwapRouter
     */
    const checkApproval = useCallback(async (
        token: Token,
        amount: string
    ): Promise<boolean> => {
        try {
            if (!service || !publicClient || !walletClient) {
                return false;
            }

            // Native tokens don't need approval
            if (token.isNative) {
                return true;
            }

            const account = walletClient.account;
            if (!account) {
                return false;
            }

            const routerAddress = service.getRouterAddress();

            const tokenContract = getContract({
                address: token.address as `0x${string}`,
                abi: ERC20_ABI,
                client: publicClient,
            });

            const allowance = await tokenContract.read.allowance([
                account.address,
                routerAddress as `0x${string}`
            ]) as bigint;

            const amountBigInt = parseUnits(amount, token.decimals);

            return allowance >= amountBigInt;
        } catch (err: any) {
            logger.error('V3 check approval error:', err);
            return false;
        }
    }, [service, publicClient, walletClient]);

    /**
     * Approve token for the V3 SwapRouter
     */
    const approveToken = useCallback(async (
        token: Token,
        amount?: string
    ): Promise<string> => {
        try {
            if (!service) throw new Error('V3 not available on this chain');
            if (!walletClient) throw new Error('Wallet client not available');

            // Native tokens don't need approval
            if (token.isNative) {
                throw new Error('Native tokens do not require approval');
            }

            const routerAddress = service.getRouterAddress();

            const tokenContract = getContract({
                address: token.address as `0x${string}`,
                abi: ERC20_ABI,
                client: walletClient,
            });

            // Use max uint256 for unlimited approval if no amount specified
            const approvalAmount = amount
                ? parseUnits(amount, token.decimals)
                : maxUint256;

            logger.debug(`V3: Approving ${token.symbol} for SwapRouter02...`);

            const txHash = await tokenContract.write.approve([
                routerAddress as `0x${string}`,
                approvalAmount
            ]) as string;

            logger.debug(`V3 Approval transaction sent: ${txHash}`);

            // Wait for transaction confirmation
            if (publicClient) {
                await assertTxSucceeded(publicClient, txHash);
                logger.debug(`V3 Approval confirmed: ${txHash}`);
            }

            return txHash;
        } catch (err: any) {
            logger.error('V3 approve token error:', err);
            throw err;
        }
    }, [service, walletClient, publicClient]);

    /**
     * Execute a V3 swap
     */
    const executeSwap = useCallback(async (params: SwapParams): Promise<string> => {
        try {
            setIsLoading(true);
            setError(null);

            if (!service) throw new Error('V3 not available on this chain');
            if (!walletClient) throw new Error('Wallet client not available');
            if (!publicClient) throw new Error('Public client not available');

            logger.debug('🔄 V3 Swap starting:', {
                tokenIn: params.tokenIn.symbol,
                tokenOut: params.tokenOut.symbol,
                amountIn: params.amountIn,
                slippage: params.slippageTolerance,
            });

            // Wrap/Unwrap goes straight to the WKLC contract, not the router
            const wethAddress = service.getWethAddress();
            if (isWrapOperation(params.tokenIn, params.tokenOut, wethAddress)) {
                const amountWei = parseUnits(params.amountIn, params.tokenIn.decimals);

                if (params.tokenIn.isNative) {
                    // Deposit (Wrap)
                    return await walletClient.writeContract({
                      // KalyChain advertises a ~0 priority fee; without this the wallet builds
                      // the tx below the 21 gwei inclusion floor. No-op on other chains.
                      ...kalyFeeOverrides(walletClient.chain?.id),
                        address: wethAddress as `0x${string}`,
                        abi: WKLC_ABI,
                        functionName: 'deposit',
                        args: [],
                        value: amountWei,
                        gas: 100000n,
                    });
                } else {
                    // Withdraw (Unwrap)
                    return await walletClient.writeContract({
                      // KalyChain advertises a ~0 priority fee; without this the wallet builds
                      // the tx below the 21 gwei inclusion floor. No-op on other chains.
                      ...kalyFeeOverrides(walletClient.chain?.id),
                        address: wethAddress as `0x${string}`,
                        abi: WKLC_ABI,
                        functionName: 'withdraw',
                        args: [amountWei],
                        gas: 100000n,
                    });
                }
            }

            // Check and handle approval for non-native tokens
            if (!params.tokenIn.isNative) {
                const isApproved = await checkApproval(params.tokenIn, params.amountIn);

                if (!isApproved) {
                    logger.debug(`V3: Token not approved. Requesting approval for ${params.tokenIn.symbol}...`);
                    await approveToken(params.tokenIn);
                    logger.debug(`V3: Approval successful for ${params.tokenIn.symbol}`);
                }
            }

            // Execute the swap
            const txHash = await service.executeSwap(params, walletClient);

            logger.debug(`✅ V3 Swap successful: ${txHash}`);

            return txHash;
        } catch (err: any) {
            const errorMessage = err.message || 'V3 swap failed';
            logger.error('❌ V3 Swap error:', err);
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [service, walletClient, publicClient, checkApproval, approveToken]);

    return {
        getQuote,
        getQuoteExactOutput,
        executeSwap,
        checkApproval,
        approveToken,
        getV3Quote,
        getBestFeeTier,
        isLoading,
        error,
        service,
    };
}

export default useV3Swap;
