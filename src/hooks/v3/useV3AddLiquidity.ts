import { useState, useCallback } from 'react';
import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { V3AddLiquidityParams, V3IncreaseLiquidityParams } from '@/services/dex/IV3DexService';
import { Token } from '@/config/dex/types';
import { poolLogger } from '@/lib/logger';
import { UserError } from '@/lib/userError';
import { useErrorText } from '@/i18n/errorText';
import { minimumAmount } from '@/utils/newPosition';
import { assertTxSucceeded } from '@/utils/transactions';

export interface UseV3AddLiquidityParams {
    token0: Token;
    token1: Token;
    fee: number;
    tokenId?: bigint; // If provided, we are increasing liquidity
    /** New pools only: create and initialise the pool at this price in the same transaction. */
    sqrtPriceX96?: bigint;
}

export interface UseV3AddLiquidityReturn {
    addLiquidity: (
        amount0Desired: string,
        amount1Desired: string,
        tickLower?: number,
        tickUpper?: number,
        slippageTolerance?: number,
        deadlineMinutes?: number
    ) => Promise<string | null>;
    isLoading: boolean;
    error: string | null;
}

export const useV3AddLiquidity = ({
    token0,
    token1,
    fee,
    tokenId,
    sqrtPriceX96
}: UseV3AddLiquidityParams): UseV3AddLiquidityReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { address, chainId } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const describeError = useErrorText();

    // Integer maths: a float minimum can round above what the pool actually takes and revert the mint.
    const calculateMinAmount = (amount: string, slippage: number, decimals: number): string => {
        if (!amount || parseFloat(amount) === 0) return '0';
        return formatUnits(minimumAmount(parseUnits(amount, decimals), Math.round(slippage * 100)), decimals);
    };

    const addLiquidity = useCallback(async (
        amount0Desired: string,
        amount1Desired: string,
        tickLower?: number,
        tickUpper?: number,
        slippageTolerance: number = 0.5,
        deadlineMinutes: number = 20
    ) => {
        setIsLoading(true);
        setError(null);

        try {
            if (!address || !walletClient || !publicClient) {
                throw new UserError('walletNotConnected');
            }

            const v3Service = getKalySwapV3Service(chainId);
            if (!v3Service) throw new UserError('v3Unavailable');
            const amount0Min = calculateMinAmount(amount0Desired, slippageTolerance, token0.decimals);
            const amount1Min = calculateMinAmount(amount1Desired, slippageTolerance, token1.decimals);

            if (tokenId) {
                // Increase Liquidity
                const params: V3IncreaseLiquidityParams = {
                    tokenId,
                    amount0Desired,
                    amount1Desired,
                    amount0Min,
                    amount1Min,
                    deadline: deadlineMinutes
                };

                const txHash = await v3Service.increaseLiquidity(params, publicClient, walletClient);
                await assertTxSucceeded(publicClient, txHash, 'addLiquidity');
                return txHash;
            } else {
                // Mint New Position
                if (tickLower === undefined || tickUpper === undefined) {
                    throw new UserError('tickRangeRequired');
                }

                const params: V3AddLiquidityParams = {
                    token0,
                    token1,
                    fee,
                    tickLower,
                    tickUpper,
                    amount0Desired,
                    amount1Desired,
                    amount0Min,
                    amount1Min,
                    recipient: address,
                    deadline: deadlineMinutes,
                    sqrtPriceX96
                };

                const { txHash } = await v3Service.mintV3Position(params, publicClient, walletClient);
                // A mined-but-reverted mint must not read as success.
                await assertTxSucceeded(publicClient, txHash, 'addLiquidity');
                return txHash;
            }

        } catch (err: any) {
            poolLogger.error('Add V3 Liquidity Error:', err);
            setError(describeError(err));
            // Re-throw or return null? Returning null allows UI to handle it by checking return value,
            // but we also set error state.
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [address, chainId, publicClient, walletClient, token0, token1, fee, tokenId, sqrtPriceX96, describeError]);

    return {
        addLiquidity,
        isLoading,
        error
    };
};
