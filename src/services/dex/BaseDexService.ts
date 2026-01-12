// Base DEX service with common functionality
// This provides shared logic for all DEX implementations

import { IDexService, DexError, PairNotFoundError, UnsupportedTokenError } from './IDexService';
import { Token, QuoteResult, SwapParams, PairInfo, DexConfig } from '@/config/dex/types';
import { getContract, parseUnits, formatUnits } from 'viem';
import type { PublicClient, WalletClient } from 'viem';

export abstract class BaseDexService implements IDexService {
  protected config: DexConfig;

  constructor(config: DexConfig) {
    this.config = config;
  }

  // Abstract methods that must be implemented by subclasses
  abstract getName(): string;
  abstract getChainId(): number;
  abstract executeSwap(params: SwapParams, walletClient: WalletClient): Promise<string>;

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

  getSubgraphUrl(): string {
    return this.config.subgraphUrl;
  }

  isTokenSupported(tokenAddress: string): boolean {
    return this.config.tokens.some(token => 
      token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
  }

  getAmountOutMin(amountOut: string, slippageTolerance: number): string {
    const amount = parseFloat(amountOut);
    const slippageMultiplier = (100 - slippageTolerance) / 100;
    return (amount * slippageMultiplier).toString();
  }

  // Common quote implementation using router contract
  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: string, publicClient: PublicClient): Promise<QuoteResult> {
    try {
      // NOTE: Removed token validation - any token with a valid pair should be tradeable
      // The router contract will revert if the pair doesn't exist anyway

      // Get swap route
      const route = await this.getSwapRoute(tokenIn, tokenOut, publicClient);
      if (route.length === 0) {
        throw new PairNotFoundError(this.getName(), tokenIn.symbol, tokenOut.symbol);
      }

      // Debug logging
      console.log(`[${this.getName()}] Quote Debug:`, {
        tokenIn: `${tokenIn.symbol} (${tokenIn.address}) decimals: ${tokenIn.decimals}`,
        tokenOut: `${tokenOut.symbol} (${tokenOut.address}) decimals: ${tokenOut.decimals}`,
        amountIn,
        route: route.map((addr, i) => {
          const token = this.config.tokens.find(t => t.address.toLowerCase() === addr.toLowerCase());
          return `${i}: ${token?.symbol || 'Unknown'} (${addr})`;
        })
      });

      // Convert amount to proper units
      const amountInWei = parseUnits(amountIn, tokenIn.decimals);

      // Get quote from router contract
      if (!publicClient) {
        throw new DexError('Public client not available', 'NO_CLIENT', this.getName());
      }

      const routerContract = getContract({
        address: this.config.router as `0x${string}`,
        abi: this.config.routerABI,
        client: publicClient,
      });

      // Call getAmountsOut on router
      const amounts = await routerContract.read.getAmountsOut([amountInWei, route]) as bigint[];
      const amountOut = amounts[amounts.length - 1];

      // Debug logging for amounts
      console.log(`[${this.getName()}] Quote Amounts:`, {
        amountInWei: amountInWei.toString(),
        amounts: amounts.map((a, i) => `${i}: ${a.toString()}`),
        amountOut: amountOut.toString(),
        tokenOutDecimals: tokenOut.decimals
      });

      // Format output amount
      const formattedAmountOut = formatUnits(amountOut, tokenOut.decimals);

      // Calculate price impact
      const priceImpact = await this.calculatePriceImpact(tokenIn, tokenOut, amountIn, publicClient);

      return {
        amountOut: formattedAmountOut,
        priceImpact,
        route: route,
        gasEstimate: '200000', // Default gas estimate
      };
    } catch (error) {
      console.error('Quote error:', error);
      if (error instanceof DexError) {
        throw error;
      }
      throw new DexError(`Failed to get quote: ${error}`, 'QUOTE_FAILED', this.getName());
    }
  }

  // Common pair address calculation using factory contract
  async getPairAddress(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<string | null> {
    try {
      if (!publicClient) {
        throw new DexError('Public client not available', 'NO_CLIENT', this.getName());
      }

      const factoryContract = getContract({
        address: this.config.factory as `0x${string}`,
        abi: this.config.factoryABI,
        client: publicClient,
      });

      // Handle native tokens by using wrapped address
      const addressA = tokenA.isNative ? this.getWethAddress() : tokenA.address;
      const addressB = tokenB.isNative ? this.getWethAddress() : tokenB.address;

      const pairAddress = await factoryContract.read.getPair([
        addressA as `0x${string}`,
        addressB as `0x${string}`
      ]) as string;

      // Return null if pair doesn't exist (address is zero)
      if (pairAddress === '0x0000000000000000000000000000000000000000') {
        return null;
      }

      return pairAddress;
    } catch (error) {
      console.error('Get pair address error:', error);
      return null;
    }
  }

  // Common pair info implementation
  async getPairInfo(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<PairInfo | null> {
    try {
      const pairAddress = await this.getPairAddress(tokenA, tokenB, publicClient);
      if (!pairAddress) {
        return null;
      }

      if (!publicClient) {
        throw new DexError('Public client not available', 'NO_CLIENT', this.getName());
      }

      // Get pair contract to read reserves
      const pairContract = getContract({
        address: pairAddress as `0x${string}`,
        abi: [
          {
            "inputs": [],
            "name": "getReserves",
            "outputs": [
              {"internalType": "uint112", "name": "_reserve0", "type": "uint112"},
              {"internalType": "uint112", "name": "_reserve1", "type": "uint112"},
              {"internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32"}
            ],
            "stateMutability": "view",
            "type": "function"
          },
          {
            "inputs": [],
            "name": "totalSupply",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
          }
        ],
        client: publicClient,
      });

      const [reserves, totalSupply] = await Promise.all([
        pairContract.read.getReserves() as Promise<[bigint, bigint, number]>,
        pairContract.read.totalSupply() as Promise<bigint>
      ]);

      return {
        token0: tokenA,
        token1: tokenB,
        pairAddress,
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
        totalSupply: totalSupply.toString(),
      };
    } catch (error) {
      console.error('Get pair info error:', error);
      return null;
    }
  }

  // Common price impact calculation
  async calculatePriceImpact(tokenIn: Token, tokenOut: Token, amountIn: string, publicClient: PublicClient): Promise<number> {
    try {
      const pairAddress = await this.getPairAddress(tokenIn, tokenOut, publicClient);
      if (!pairAddress) {
        return 0; // No liquidity, can't calculate impact
      }

      // Get the pair contract to read token0 address and reserves
      const pairContract = getContract({
        address: pairAddress as `0x${string}`,
        abi: [
          {
            "inputs": [],
            "name": "getReserves",
            "outputs": [
              {"internalType": "uint112", "name": "_reserve0", "type": "uint112"},
              {"internalType": "uint112", "name": "_reserve1", "type": "uint112"},
              {"internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32"}
            ],
            "stateMutability": "view",
            "type": "function"
          },
          {
            "inputs": [],
            "name": "token0",
            "outputs": [{"internalType": "address", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
          }
        ],
        client: publicClient,
      });

      const [reserves, token0Address] = await Promise.all([
        pairContract.read.getReserves() as Promise<[bigint, bigint, number]>,
        pairContract.read.token0() as Promise<string>
      ]);

      // Determine which reserve corresponds to tokenIn
      const tokenInAddress = tokenIn.isNative ? this.getWethAddress() : tokenIn.address;
      const isTokenInToken0 = token0Address.toLowerCase() === tokenInAddress.toLowerCase();

      // Get the correct reserve for tokenIn based on actual pair ordering
      const reserveIn = isTokenInToken0 ? reserves[0] : reserves[1];
      const reserveInFormatted = parseFloat(formatUnits(reserveIn, tokenIn.decimals));

      const amountInValue = parseFloat(amountIn);

      // Calculate price impact using constant product formula
      // Impact = amountIn / (reserveIn + amountIn) * 100
      const priceImpact = (amountInValue / (reserveInFormatted + amountInValue)) * 100;
      return Math.min(priceImpact, 100); // Cap at 100%
    } catch (error) {
      console.error('Price impact calculation error:', error);
      return 0;
    }
  }

  // Common swap route calculation
  async getSwapRoute(tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]> {
    // Handle native tokens
    const addressIn = tokenIn.isNative ? this.getWethAddress() : tokenIn.address;
    const addressOut = tokenOut.isNative ? this.getWethAddress() : tokenOut.address;

    // Check if direct pair exists
    const directPairExists = await this.canSwapDirectly(tokenIn, tokenOut, publicClient);
    if (directPairExists) {
      return [addressIn, addressOut];
    }

    // Try routing through WETH/native token
    const wethAddress = this.getWethAddress();
    if (addressIn !== wethAddress && addressOut !== wethAddress) {
      const wethToken = this.config.tokens.find(t => t.address.toLowerCase() === wethAddress.toLowerCase());
      if (wethToken) {
        const canRouteViaWeth = await Promise.all([
          this.canSwapDirectly(tokenIn, wethToken, publicClient),
          this.canSwapDirectly(wethToken, tokenOut, publicClient)
        ]);

        if (canRouteViaWeth[0] && canRouteViaWeth[1]) {
          return [addressIn, wethAddress, addressOut];
        }
      }
    }

    // No route found
    return [];
  }

  // Common direct swap check
  async canSwapDirectly(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<boolean> {
    const pairAddress = await this.getPairAddress(tokenA, tokenB, publicClient);
    return pairAddress !== null;
  }
}
