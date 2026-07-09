/**
 * useSwap - Unified swap hook that routes to V2 or V3 based on protocol version
 * This is the main hook that components should use for swap operations
 */

import { useCallback, useMemo } from 'react';
import { Token, QuoteResult, ExactOutputQuoteResult, SwapParams } from '@/config/dex/types';
import { useProtocolVersion } from '@/contexts/ProtocolVersionContext';
import { useDexSwap } from './useDexSwap';
import { useV3Swap } from './useV3Swap';
import { CHAIN_IDS } from '@/config/chains';
import { swapLogger as logger } from '@/lib/logger';

interface UseSwapReturn {
    // Core swap operations
    getQuote: (tokenIn: Token, tokenOut: Token, amountIn: string) => Promise<QuoteResult>;
    getQuoteExactOutput: (tokenIn: Token, tokenOut: Token, amountOut: string) => Promise<ExactOutputQuoteResult>;
    executeSwap: (params: SwapParams) => Promise<string>;
    checkApproval: (token: Token, amount: string, spender?: string) => Promise<boolean>;
    approveToken: (token: Token, spender?: string, amount?: string) => Promise<string>;

    // Protocol info
    protocolVersion: 'v2' | 'v3';
    isV3: boolean;
    isV3Supported: boolean;

    // State
    isLoading: boolean;
    error: string | null;
}

/**
 * Unified swap hook that automatically uses V2 or V3 based on user selection
 */
export function useSwap(chainId: number = CHAIN_IDS.KALYCHAIN): UseSwapReturn {
    const { protocolVersion, isV3, isV3Supported } = useProtocolVersion();

    // Initialize both hooks
    const v2Swap = useDexSwap(chainId);
    const v3Swap = useV3Swap(chainId);

    // Select active hook based on protocol version
    const activeHook = useMemo(() => {
        return isV3 && isV3Supported ? v3Swap : v2Swap;
    }, [isV3, isV3Supported, v2Swap, v3Swap]);

    /**
     * Get a quote using the active protocol
     */
    const getQuote = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountIn: string
    ): Promise<QuoteResult> => {
        logger.debug(`Getting quote using ${protocolVersion}...`);
        return activeHook.getQuote(tokenIn, tokenOut, amountIn);
    }, [activeHook, protocolVersion]);

    /**
     * Get a reverse (exact-output) quote using the active protocol
     */
    const getQuoteExactOutput = useCallback(async (
        tokenIn: Token,
        tokenOut: Token,
        amountOut: string
    ): Promise<ExactOutputQuoteResult> => {
        logger.debug(`Getting exact-output quote using ${protocolVersion}...`);
        return activeHook.getQuoteExactOutput(tokenIn, tokenOut, amountOut);
    }, [activeHook, protocolVersion]);

    /**
     * Execute a swap using the active protocol
     */
    const executeSwap = useCallback(async (params: SwapParams): Promise<string> => {
        logger.debug(`Executing swap using ${protocolVersion}...`);
        return activeHook.executeSwap(params);
    }, [activeHook, protocolVersion]);

    /**
     * Check approval using the active protocol
     * Note: For V2, spender is required; for V3, it uses the router automatically
     */
    const checkApproval = useCallback(async (
        token: Token,
        amount: string,
        spender?: string
    ): Promise<boolean> => {
        if (isV3 && isV3Supported) {
            return v3Swap.checkApproval(token, amount);
        } else {
            if (!spender) {
                throw new Error('Spender address required for V2 approval check');
            }
            return v2Swap.checkApproval(token, amount, spender);
        }
    }, [isV3, isV3Supported, v2Swap, v3Swap]);

    /**
     * Approve token using the active protocol
     * Note: For V2, spender is required; for V3, it uses the router automatically
     */
    const approveToken = useCallback(async (
        token: Token,
        spender?: string,
        amount?: string
    ): Promise<string> => {
        if (isV3 && isV3Supported) {
            return v3Swap.approveToken(token, amount);
        } else {
            if (!spender) {
                throw new Error('Spender address required for V2 approval');
            }
            return v2Swap.approveToken(token, spender, amount);
        }
    }, [isV3, isV3Supported, v2Swap, v3Swap]);

    return {
        getQuote,
        getQuoteExactOutput,
        executeSwap,
        checkApproval,
        approveToken,
        protocolVersion,
        isV3,
        isV3Supported,
        isLoading: activeHook.isLoading,
        error: activeHook.error,
    };
}

export default useSwap;
