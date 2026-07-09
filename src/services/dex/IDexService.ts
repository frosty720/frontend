// Interface for DEX service implementations
// This provides a common interface for all DEX protocols (KalySwap, PancakeSwap, Uniswap V2)

import { Token, QuoteResult, ExactOutputQuoteResult, SwapParams, PairInfo, AddLiquidityParams, RemoveLiquidityParams, LiquidityPosition } from '@/config/dex/types';
import type { PublicClient, WalletClient } from 'viem';

export interface IDexService {
  /**
   * Get the name of the DEX
   */
  getName(): string;

  /**
   * Get the chain ID this DEX operates on
   */
  getChainId(): number;

  /**
   * Get a quote for swapping tokens
   * @param tokenIn Input token
   * @param tokenOut Output token
   * @param amountIn Amount of input token
   * @param publicClient Public client for blockchain interactions
   * @returns Quote result with expected output amount and price impact
   */
  getQuote(tokenIn: Token, tokenOut: Token, amountIn: string, publicClient: PublicClient): Promise<QuoteResult>;
  getQuoteExactOutput(tokenIn: Token, tokenOut: Token, amountOut: string, publicClient: PublicClient): Promise<ExactOutputQuoteResult>;

  /**
   * Execute a token swap
   * @param params Swap parameters
   * @param walletClient Wallet client for signing transactions
   * @returns Transaction hash
   */
  executeSwap(params: SwapParams, walletClient: WalletClient): Promise<string>;

  /**
   * Get the pair address for two tokens
   * @param tokenA First token
   * @param tokenB Second token
   * @param publicClient Public client for blockchain interactions
   * @returns Pair address or null if pair doesn't exist
   */
  getPairAddress(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<string | null>;

  /**
   * Get pair information including reserves
   * @param tokenA First token
   * @param tokenB Second token
   * @param publicClient Public client for blockchain interactions
   * @returns Pair information or null if pair doesn't exist
   */
  getPairInfo(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<PairInfo | null>;

  /**
   * Get the list of supported tokens
   * @returns Array of supported tokens
   */
  getTokenList(): Token[];

  /**
   * Get the router contract address
   * @returns Router contract address
   */
  getRouterAddress(): string;

  /**
   * Get the router contract ABI
   * @returns Router contract ABI
   */
  getRouterABI(): any[];

  /**
   * Get the factory contract address
   * @returns Factory contract address
   */
  getFactoryAddress(): string;

  /**
   * Get the wrapped native token address
   * @returns Wrapped native token address (WETH, WBNB, wKLC, etc.)
   */
  getWethAddress(): string;

  /**
   * Check if a token is supported by this DEX
   * @param tokenAddress Token contract address
   * @returns True if token is supported
   */
  isTokenSupported(tokenAddress: string): boolean;

  /**
   * Get the subgraph URL for this DEX
   * @returns Subgraph URL
   */
  getSubgraphUrl(): string;

  /**
   * Calculate price impact for a swap
   * @param tokenIn Input token
   * @param tokenOut Output token
   * @param amountIn Amount of input token
   * @param publicClient Public client for blockchain interactions
   * @returns Price impact percentage
   */
  calculatePriceImpact(tokenIn: Token, tokenOut: Token, amountIn: string, publicClient: PublicClient): Promise<number>;

  /**
   * Get the minimum amount out for a swap with slippage tolerance
   * @param amountOut Expected output amount
   * @param slippageTolerance Slippage tolerance percentage (e.g., 0.5 for 0.5%)
   * @returns Minimum amount out
   */
  getAmountOutMin(amountOut: string, slippageTolerance: number): string;

  /**
   * Check if two tokens can be swapped directly (pair exists)
   * @param tokenA First token
   * @param tokenB Second token
   * @param publicClient Public client for blockchain interactions
   * @returns True if direct swap is possible
   */
  canSwapDirectly(tokenA: Token, tokenB: Token, publicClient: PublicClient): Promise<boolean>;

  /**
   * Get the best route for swapping tokens (may include intermediate tokens)
   * @param tokenIn Input token
   * @param tokenOut Output token
   * @param publicClient Public client for blockchain interactions
   * @returns Array of token addresses representing the swap route
   */
  getSwapRoute(tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]>;

  // ===============================
  // Liquidity Operations
  // ===============================

  /**
   * Add liquidity to a token pair
   * @param params Add liquidity parameters
   * @param publicClient Public client for blockchain interactions
   * @param walletClient Wallet client for signing transactions
   * @returns Transaction hash
   */
  addLiquidity(params: AddLiquidityParams, publicClient: PublicClient, walletClient: WalletClient): Promise<string>;

  /**
   * Remove liquidity from a token pair
   * @param params Remove liquidity parameters
   * @param publicClient Public client for blockchain interactions
   * @param walletClient Wallet client for signing transactions
   * @returns Transaction hash
   */
  removeLiquidity(params: RemoveLiquidityParams, publicClient: PublicClient, walletClient: WalletClient): Promise<string>;

  /**
   * Get user's liquidity positions
   * @param userAddress User's wallet address
   * @param publicClient Public client for blockchain interactions
   * @returns Array of liquidity positions
   */
  getUserLiquidityPositions(userAddress: string, publicClient: PublicClient): Promise<LiquidityPosition[]>;

  /**
   * Calculate optimal amounts for adding liquidity based on current reserves
   * @param tokenA First token
   * @param tokenB Second token
   * @param amountA Amount of first token
   * @param publicClient Public client for blockchain interactions
   * @returns Optimal amount of token B
   */
  calculateOptimalLiquidityAmounts(
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    publicClient: PublicClient
  ): Promise<{ amountB: string; isNewPair: boolean }>;

  /**
   * Approve token for router spending
   * @param token Token to approve
   * @param amount Amount to approve (use MaxUint256 for unlimited)
   * @param walletClient Wallet client for signing transactions
   * @returns Transaction hash
   */
  approveToken(token: Token, amount: string, walletClient: WalletClient): Promise<string>;

  /**
   * Check token approval status
   * @param token Token to check
   * @param owner Owner address
   * @param amount Amount to check approval for
   * @param publicClient Public client for blockchain interactions
   * @returns True if approved for at least the specified amount
   */
  checkApproval(token: Token, owner: string, amount: string, publicClient: PublicClient): Promise<boolean>;
}

// Error types for DEX operations
export class DexError extends Error {
  constructor(message: string, public code: string, public dexName: string) {
    super(message);
    this.name = 'DexError';
  }
}

export class InsufficientLiquidityError extends DexError {
  constructor(dexName: string, tokenA: string, tokenB: string) {
    super(`Insufficient liquidity for ${tokenA}/${tokenB} pair`, 'INSUFFICIENT_LIQUIDITY', dexName);
  }
}

export class PairNotFoundError extends DexError {
  constructor(dexName: string, tokenA: string, tokenB: string) {
    super(`Pair not found for ${tokenA}/${tokenB}`, 'PAIR_NOT_FOUND', dexName);
  }
}

export class UnsupportedTokenError extends DexError {
  constructor(dexName: string, tokenAddress: string) {
    super(`Token ${tokenAddress} is not supported`, 'UNSUPPORTED_TOKEN', dexName);
  }
}

export class SwapFailedError extends DexError {
  constructor(dexName: string, reason: string) {
    super(`Swap failed: ${reason}`, 'SWAP_FAILED', dexName);
  }
}
