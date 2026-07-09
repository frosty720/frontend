import { dexLogger } from '@/lib/logger';
// Base DEX service with common functionality
// This provides shared logic for all DEX implementations

import { IDexService, DexError, PairNotFoundError, InsufficientLiquidityError, SwapFailedError } from './IDexService';
import { Token, QuoteResult, ExactOutputQuoteResult, SwapParams, PairInfo, DexConfig, AddLiquidityParams, RemoveLiquidityParams, LiquidityPosition } from '@/config/dex/types';
import { getContract, parseUnits, formatUnits, maxUint256 } from 'viem';
import type { PublicClient, WalletClient } from 'viem';

// ERC20 ABI for token approvals
const ERC20_ABI = [
  {
    "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Pair ABI for liquidity operations
const PAIR_ABI = [
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
  },
  {
    "inputs": [],
    "name": "token0",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "token1",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

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
      dexLogger.debug(`[${this.getName()}] Quote Debug:`, {
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
      dexLogger.debug(`[${this.getName()}] Quote Amounts:`, {
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
      dexLogger.error('Quote error:', error);
      if (error instanceof DexError) {
        throw error;
      }
      throw new DexError(`Failed to get quote: ${error}`, 'QUOTE_FAILED', this.getName());
    }
  }

  // Reverse quote: how much tokenIn is needed to receive exactly amountOut.
  // Quote-only — execution stays exact-input.
  async getQuoteExactOutput(tokenIn: Token, tokenOut: Token, amountOut: string, publicClient: PublicClient): Promise<ExactOutputQuoteResult> {
    try {
      const route = await this.getSwapRoute(tokenIn, tokenOut, publicClient);
      if (route.length === 0) {
        throw new PairNotFoundError(this.getName(), tokenIn.symbol, tokenOut.symbol);
      }

      if (!publicClient) {
        throw new DexError('Public client not available', 'NO_CLIENT', this.getName());
      }

      const amountOutWei = parseUnits(amountOut, tokenOut.decimals);

      const routerContract = getContract({
        address: this.config.router as `0x${string}`,
        abi: this.config.routerABI,
        client: publicClient,
      });

      // getAmountsIn returns [requiredIn, ..., amountOut] along the forward path.
      // It reverts when the reserves can't provide the requested output.
      let amounts: bigint[];
      try {
        amounts = await routerContract.read.getAmountsIn([amountOutWei, route]) as bigint[];
      } catch {
        throw new InsufficientLiquidityError(this.getName(), tokenIn.symbol, tokenOut.symbol);
      }
      const amountIn = formatUnits(amounts[0], tokenIn.decimals);

      const priceImpact = await this.calculatePriceImpact(tokenIn, tokenOut, amountIn, publicClient);

      return {
        amountIn,
        priceImpact,
        route,
        gasEstimate: '200000',
      };
    } catch (error) {
      dexLogger.error('Exact-output quote error:', error);
      if (error instanceof DexError) {
        throw error;
      }
      throw new DexError(`Failed to get exact-output quote: ${error}`, 'QUOTE_FAILED', this.getName());
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
      dexLogger.error('Get pair address error:', error);
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
      dexLogger.error('Get pair info error:', error);
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
      dexLogger.error('Price impact calculation error:', error);
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

  // ===============================
  // Liquidity Operations
  // ===============================

  /**
   * Add liquidity to a token pair
   */
  async addLiquidity(
    params: AddLiquidityParams,
    publicClient: PublicClient,
    walletClient: WalletClient
  ): Promise<string> {
    try {
      const { tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline } = params;

      const routerAddress = this.getRouterAddress();
      const wethAddress = this.getWethAddress();

      // Convert amounts to proper units
      const amountADesiredWei = parseUnits(amountADesired, tokenA.decimals);
      const amountBDesiredWei = parseUnits(amountBDesired, tokenB.decimals);
      const amountAMinWei = parseUnits(amountAMin, tokenA.decimals);
      const amountBMinWei = parseUnits(amountBMin, tokenB.decimals);
      const deadlineBigInt = BigInt(deadline);

      // Check if either token is native
      const isTokenANative = tokenA.isNative === true;
      const isTokenBNative = tokenB.isNative === true;

      const account = walletClient.account;
      if (!account) {
        throw new SwapFailedError(this.getName(), 'No account connected');
      }

      let hash: `0x${string}`;

      if (isTokenANative || isTokenBNative) {
        // Use addLiquidityKLC/addLiquidityETH
        const token = isTokenANative ? tokenB : tokenA;
        const tokenAmount = isTokenANative ? amountBDesiredWei : amountADesiredWei;
        const tokenAmountMin = isTokenANative ? amountBMinWei : amountAMinWei;
        const nativeAmount = isTokenANative ? amountADesiredWei : amountBDesiredWei;
        const nativeAmountMin = isTokenANative ? amountAMinWei : amountBMinWei;

        hash = await walletClient.writeContract({
          address: routerAddress as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'addLiquidityKLC',
          args: [token.address, tokenAmount, tokenAmountMin, nativeAmountMin, to, deadlineBigInt],
          value: nativeAmount,
          account,
          chain: walletClient.chain,
        });
      } else {
        // Use addLiquidity for token-token pairs
        hash = await walletClient.writeContract({
          address: routerAddress as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'addLiquidity',
          args: [
            tokenA.address,
            tokenB.address,
            amountADesiredWei,
            amountBDesiredWei,
            amountAMinWei,
            amountBMinWei,
            to,
            deadlineBigInt
          ],
          account,
          chain: walletClient.chain,
        });
      }

      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (error) {
      dexLogger.error('Add liquidity error:', error);
      throw new SwapFailedError(this.getName(), `Add liquidity failed: ${error}`);
    }
  }

  /**
   * Remove liquidity from a token pair
   */
  async removeLiquidity(
    params: RemoveLiquidityParams,
    publicClient: PublicClient,
    walletClient: WalletClient
  ): Promise<string> {
    try {
      const { tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline } = params;

      const routerAddress = this.getRouterAddress();
      const wethAddress = this.getWethAddress();

      // Convert amounts to proper units
      const liquidityWei = parseUnits(liquidity, 18); // LP tokens are always 18 decimals
      const amountAMinWei = parseUnits(amountAMin, tokenA.decimals);
      const amountBMinWei = parseUnits(amountBMin, tokenB.decimals);
      const deadlineBigInt = BigInt(deadline);

      const account = walletClient.account;
      if (!account) {
        throw new SwapFailedError(this.getName(), 'No account connected');
      }

      // Determine if this is a native token pair
      const addressA = tokenA.isNative ? wethAddress : tokenA.address;
      const addressB = tokenB.isNative ? wethAddress : tokenB.address;
      const isNativePair = addressA === wethAddress || addressB === wethAddress;

      let hash: `0x${string}`;

      if (isNativePair) {
        // Use removeLiquidityKLC/removeLiquidityETH
        const token = addressA === wethAddress ? tokenB : tokenA;
        const tokenAmountMin = addressA === wethAddress ? amountBMinWei : amountAMinWei;
        const nativeAmountMin = addressA === wethAddress ? amountAMinWei : amountBMinWei;

        hash = await walletClient.writeContract({
          address: routerAddress as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'removeLiquidityKLC',
          args: [token.address, liquidityWei, tokenAmountMin, nativeAmountMin, to, deadlineBigInt],
          account,
          chain: walletClient.chain,
        });
      } else {
        // Use removeLiquidity for token-token pairs
        hash = await walletClient.writeContract({
          address: routerAddress as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'removeLiquidity',
          args: [
            tokenA.address,
            tokenB.address,
            liquidityWei,
            amountAMinWei,
            amountBMinWei,
            to,
            deadlineBigInt
          ],
          account,
          chain: walletClient.chain,
        });
      }

      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (error) {
      dexLogger.error('Remove liquidity error:', error);
      throw new SwapFailedError(this.getName(), `Remove liquidity failed: ${error}`);
    }
  }

  /**
   * Get user's liquidity positions
   * Note: This is a basic implementation. For full functionality, use subgraph queries.
   */
  async getUserLiquidityPositions(
    _userAddress: string,
    _publicClient: PublicClient
  ): Promise<LiquidityPosition[]> {
    // This would require iterating over all pairs or using a subgraph
    // For now, return empty array - callers should use subgraph for this
    dexLogger.warn('[DexService] getUserLiquidityPositions: Use subgraph for full functionality');
    return [];
  }

  /**
   * Calculate optimal amounts for adding liquidity based on current reserves
   */
  async calculateOptimalLiquidityAmounts(
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    publicClient: PublicClient
  ): Promise<{ amountB: string; isNewPair: boolean }> {
    try {
      const pairInfo = await this.getPairInfo(tokenA, tokenB, publicClient);

      if (!pairInfo) {
        // New pair - any ratio is valid
        return { amountB: amountA, isNewPair: true };
      }

      const reserve0 = BigInt(pairInfo.reserve0);
      const reserve1 = BigInt(pairInfo.reserve1);

      if (reserve0 === 0n || reserve1 === 0n) {
        return { amountB: amountA, isNewPair: true };
      }

      // Determine if tokenA is token0 or token1
      const addressA = tokenA.isNative ? this.getWethAddress() : tokenA.address;
      const isTokenAToken0 = pairInfo.token0.address.toLowerCase() === addressA.toLowerCase();

      const reserveA = isTokenAToken0 ? reserve0 : reserve1;
      const reserveB = isTokenAToken0 ? reserve1 : reserve0;

      // Calculate optimal amountB
      const amountAWei = parseUnits(amountA, tokenA.decimals);
      const optimalAmountBWei = (amountAWei * reserveB) / reserveA;
      const amountB = formatUnits(optimalAmountBWei, tokenB.decimals);

      return { amountB, isNewPair: false };
    } catch (error) {
      dexLogger.error('Calculate optimal amounts error:', error);
      return { amountB: amountA, isNewPair: true };
    }
  }

  /**
   * Approve token for router spending
   */
  async approveToken(
    token: Token,
    amount: string,
    walletClient: WalletClient
  ): Promise<string> {
    try {
      if (token.isNative) {
        throw new DexError('Cannot approve native token', 'INVALID_OPERATION', this.getName());
      }

      const account = walletClient.account;
      if (!account) {
        throw new SwapFailedError(this.getName(), 'No account connected');
      }

      const routerAddress = this.getRouterAddress();
      const approveAmount = amount === 'max' ? maxUint256 : parseUnits(amount, token.decimals);

      const hash = await walletClient.writeContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress as `0x${string}`, approveAmount],
        account,
        chain: walletClient.chain,
      });

      return hash;
    } catch (error) {
      dexLogger.error('Approve token error:', error);
      throw new SwapFailedError(this.getName(), `Approve failed: ${error}`);
    }
  }

  /**
   * Check token approval status
   */
  async checkApproval(
    token: Token,
    owner: string,
    amount: string,
    publicClient: PublicClient
  ): Promise<boolean> {
    try {
      if (token.isNative) {
        return true; // Native tokens don't need approval
      }

      const routerAddress = this.getRouterAddress();
      const requiredAmount = parseUnits(amount, token.decimals);

      const tokenContract = getContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        client: publicClient,
      });

      const allowance = await tokenContract.read.allowance([
        owner as `0x${string}`,
        routerAddress as `0x${string}`
      ]) as bigint;

      return allowance >= requiredAmount;
    } catch (error) {
      dexLogger.error('Check approval error:', error);
      return false;
    }
  }
}
