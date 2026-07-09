// Custom hook for DEX swap operations with proper client injection

import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { parseUnits, getContract, maxUint256 } from 'viem';
import { Token, QuoteResult, ExactOutputQuoteResult, SwapParams } from '@/config/dex/types';
import { DexService } from '@/services/dex/DexService';
import { ERC20_ABI } from '@/config/abis';
import { useState, useCallback } from 'react';
import { swapLogger } from '@/lib/logger';
import { WKLC_ABI } from '@/config/abis';

// Helper to check if tokens are Native <-> Wrapped Native
const isWrapOperation = (tokenIn: Token, tokenOut: Token, wethAddress: string) => {
  const isNativeIn = tokenIn.isNative;
  const isWethIn = tokenIn.address.toLowerCase() === wethAddress.toLowerCase();
  const isNativeOut = tokenOut.isNative;
  const isWethOut = tokenOut.address.toLowerCase() === wethAddress.toLowerCase();

  return (isNativeIn && isWethOut) || (isWethIn && isNativeOut);
};

interface UseDexSwapReturn {
  getQuote: (tokenIn: Token, tokenOut: Token, amountIn: string) => Promise<QuoteResult>;
  getQuoteExactOutput: (tokenIn: Token, tokenOut: Token, amountOut: string) => Promise<ExactOutputQuoteResult>;
  executeSwap: (params: SwapParams) => Promise<string>;
  checkApproval: (token: Token, amount: string, spender: string) => Promise<boolean>;
  approveToken: (token: Token, spender: string, amount?: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useDexSwap(chainId: number): UseDexSwapReturn {
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get a quote for swapping tokens
   */
  const getQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): Promise<QuoteResult> => {
    try {
      setError(null);

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      const service = await DexService.getDexService(chainId);

      // Check for Wrap/Unwrap operation first
      const wethAddress = await service.getWethAddress();
      if (isWrapOperation(tokenIn, tokenOut, wethAddress)) {
        return {
          amountOut: amountIn, // 1:1 ratio
          priceImpact: 0,
          route: [tokenIn.address, tokenOut.address],
          gasEstimate: '50000'
        };
      }

      const quote = await service.getQuote(tokenIn, tokenOut, amountIn, publicClient);

      return quote;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to get quote';
      setError(errorMessage);
      throw err;
    }
  }, [chainId, publicClient]);

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

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      const service = await DexService.getDexService(chainId);

      // Wrap/Unwrap is always 1:1
      const wethAddress = await service.getWethAddress();
      if (isWrapOperation(tokenIn, tokenOut, wethAddress)) {
        return {
          amountIn: amountOut,
          priceImpact: 0,
          route: [tokenIn.address, tokenOut.address],
          gasEstimate: '50000'
        };
      }

      return await service.getQuoteExactOutput(tokenIn, tokenOut, amountOut, publicClient);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to get exact-output quote';
      setError(errorMessage);
      throw err;
    }
  }, [chainId, publicClient]);

  /**
   * Check if token is approved for spending
   */
  const checkApproval = useCallback(async (
    token: Token,
    amount: string,
    spender: string
  ): Promise<boolean> => {
    try {
      if (!publicClient || !walletClient) {
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

      const tokenContract = getContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        client: publicClient,
      });

      const allowance = await tokenContract.read.allowance([
        account.address,
        spender as `0x${string}`
      ]) as bigint;

      const amountBigInt = parseUnits(amount, token.decimals);

      return allowance >= amountBigInt;
    } catch (err: any) {
      swapLogger.error('Check approval error:', err);
      return false;
    }
  }, [publicClient, walletClient]);

  /**
   * Approve token for spending
   */
  const approveToken = useCallback(async (
    token: Token,
    spender: string,
    amount?: string
  ): Promise<string> => {
    try {
      if (!walletClient) {
        throw new Error('Wallet client not available');
      }

      // Native tokens don't need approval
      if (token.isNative) {
        throw new Error('Native tokens do not require approval');
      }

      const tokenContract = getContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        client: walletClient,
      });

      // Use max uint256 for unlimited approval if no amount specified
      const approvalAmount = amount
        ? parseUnits(amount, token.decimals)
        : maxUint256;

      swapLogger.debug(`Approving ${token.symbol} for ${spender}...`);

      const txHash = await tokenContract.write.approve([
        spender as `0x${string}`,
        approvalAmount
      ]) as string;

      swapLogger.debug(`Approval transaction sent: ${txHash}`);

      // Wait for transaction confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        swapLogger.debug(`Approval confirmed: ${txHash}`);
      }

      return txHash;
    } catch (err: any) {
      swapLogger.error('Approve token error:', err);
      throw err;
    }
  }, [walletClient, publicClient]);

  /**
   * Execute a swap using external wallet (MetaMask, etc.)
   */
  const executeExternalWalletSwap = useCallback(async (params: SwapParams): Promise<string> => {
    try {
      if (!walletClient) {
        throw new Error('Wallet client not available');
      }

      const service = await DexService.getDexService(chainId);
      const routerAddress = service.getRouterAddress();

      // Check for Wrap/Unwrap
      const wethAddress = await service.getWethAddress();
      if (isWrapOperation(params.tokenIn, params.tokenOut, wethAddress)) {
        const isWrap = params.tokenIn.isNative;
        const amountWei = parseUnits(params.amountIn, params.tokenIn.decimals);

        if (isWrap) {
          // Deposit (Wrap)
          return await walletClient.writeContract({
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
        const isApproved = await checkApproval(params.tokenIn, params.amountIn, routerAddress);

        if (!isApproved) {
          swapLogger.debug(`Token not approved. Requesting approval for ${params.tokenIn.symbol}...`);
          await approveToken(params.tokenIn, routerAddress);
          swapLogger.debug(`Approval successful for ${params.tokenIn.symbol}`);
        }
      }

      // Get or calculate route
      let route = params.route;
      if (!route && publicClient) {
        route = await service.getSwapRoute(params.tokenIn, params.tokenOut, publicClient);
      }

      // Add route to params
      const paramsWithRoute = { ...params, route };

      const txHash = await service.executeSwap(paramsWithRoute, walletClient);
      return txHash;
    } catch (err: any) {
      swapLogger.error('External wallet swap error:', err);
      throw err;
    }
  }, [chainId, walletClient, publicClient, checkApproval, approveToken]);

  /**
   * Execute a token swap
   */
  const executeSwap = useCallback(async (params: SwapParams): Promise<string> => {
    try {
      setIsLoading(true);
      setError(null);

      const txHash = await executeExternalWalletSwap(params);

      return txHash;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to execute swap';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [executeExternalWalletSwap]);

  return {
    getQuote,
    getQuoteExactOutput,
    executeSwap,
    checkApproval,
    approveToken,
    isLoading,
    error
  };
}

