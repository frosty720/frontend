// KalySwap DEX service implementation
// Handles all KalySwap-specific operations on KalyChain

import { BaseDexService } from './BaseDexService';
import { SwapParams, Token, QuoteResult } from '@/config/dex/types';
import { KALYSWAP_CONFIG } from '@/config/dex/kalyswap';
import { DexError, SwapFailedError } from './IDexService';
import { getContract, parseUnits, createPublicClient, http } from 'viem';
import type { WalletClient, PublicClient } from 'viem';
import { chainRpcUrls } from '@/config/wagmi.config';
import { kalychain } from '@/config/chains';

export class KalySwapService extends BaseDexService {
  // WKLC contract address on KalyChain
  private readonly WKLC_ADDRESS = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';

  constructor() {
    super(KALYSWAP_CONFIG);
  }

  getName(): string {
    return 'KalySwap';
  }

  getChainId(): number {
    return 3888; // KalyChain
  }

  /**
   * Check if this is a wrap operation (KLC → WKLC)
   */
  private isWrapOperation(tokenIn: Token, tokenOut: Token): boolean {
    const isFromKLC = tokenIn.isNative === true;
    const isToWKLC = tokenOut.symbol.toUpperCase() === 'WKLC' ||
                     tokenOut.address.toLowerCase() === this.WKLC_ADDRESS.toLowerCase();
    return isFromKLC && isToWKLC;
  }

  /**
   * Check if this is an unwrap operation (WKLC → KLC)
   */
  private isUnwrapOperation(tokenIn: Token, tokenOut: Token): boolean {
    const isFromWKLC = tokenIn.symbol.toUpperCase() === 'WKLC' ||
                       tokenIn.address.toLowerCase() === this.WKLC_ADDRESS.toLowerCase();
    const isToKLC = tokenOut.isNative === true;
    return isFromWKLC && isToKLC;
  }

  /**
   * Override getQuote to handle wrap/unwrap operations with 1:1 ratio
   */
  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: string, publicClient: PublicClient): Promise<QuoteResult> {
    // Check if this is a wrap or unwrap operation
    if (this.isWrapOperation(tokenIn, tokenOut) || this.isUnwrapOperation(tokenIn, tokenOut)) {
      console.log('🔄 Wrap/Unwrap operation detected - returning 1:1 ratio');

      return {
        amountOut: amountIn, // 1:1 ratio
        route: [tokenIn.address, tokenOut.address],
        priceImpact: 0
      };
    }

    // For regular swaps, use the base implementation
    return super.getQuote(tokenIn, tokenOut, amountIn, publicClient);
  }

  async executeSwap(params: SwapParams, walletClient: WalletClient): Promise<string> {
    try {
      if (!walletClient) {
        throw new DexError('Wallet client not available', 'NO_WALLET', this.getName());
      }

      // Get account from wallet client
      const account = walletClient.account;
      if (!account) {
        throw new DexError('No account found in wallet client', 'NO_ACCOUNT', this.getName());
      }

      // Convert amounts to proper units
      const amountIn = parseUnits(params.amountIn, params.tokenIn.decimals);

      let txHash: string;

      // Check if this is a wrap or unwrap operation
      const isWrap = this.isWrapOperation(params.tokenIn, params.tokenOut);
      const isUnwrap = this.isUnwrapOperation(params.tokenIn, params.tokenOut);

      if (isWrap) {
        // KLC → WKLC: Call deposit() with KLC value
        console.log('🔄 Wrapping KLC to WKLC via WKLC contract...');

        // WKLC ABI for deposit function
        const WKLC_ABI = [
          {
            "inputs": [],
            "name": "deposit",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
          }
        ] as const;

        txHash = await walletClient.writeContract({
          address: this.WKLC_ADDRESS as `0x${string}`,
          abi: WKLC_ABI,
          functionName: 'deposit',
          args: [],
          value: amountIn,
          account,
          chain: undefined
        });

        console.log(`✅ Wrap transaction sent: ${txHash}`);
        return txHash;

      } else if (isUnwrap) {
        // WKLC → KLC: Call withdraw()
        console.log('🔄 Unwrapping WKLC to KLC via WKLC contract...');

        // WKLC ABI for withdraw function
        const WKLC_ABI = [
          {
            "inputs": [
              {
                "internalType": "uint256",
                "name": "wad",
                "type": "uint256"
              }
            ],
            "name": "withdraw",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ] as const;

        txHash = await walletClient.writeContract({
          address: this.WKLC_ADDRESS as `0x${string}`,
          abi: WKLC_ABI,
          functionName: 'withdraw',
          args: [amountIn],
          account,
          chain: undefined
        });

        console.log(`✅ Unwrap transaction sent: ${txHash}`);
        return txHash;
      }

      // Regular DEX swap logic
      // Get swap route
      const route = params.route || await this.getSwapRoute(params.tokenIn, params.tokenOut, walletClient as any);
      if (route.length === 0) {
        throw new SwapFailedError(this.getName(), 'No swap route available');
      }

      const amountOutMin = parseUnits(params.amountOutMin, params.tokenOut.decimals);

      // Calculate deadline (current time + deadline minutes)
      const deadline = Math.floor(Date.now() / 1000) + (params.deadline * 60);

      // Handle different swap scenarios
      // KalySwap uses KLC instead of ETH in function names
      if (params.tokenIn.isNative) {
        // KLC to Token
        txHash = await walletClient.writeContract({
          address: this.config.router as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'swapExactKLCForTokens',
          args: [
            amountOutMin,
            route,
            params.to as `0x${string}`,
            BigInt(deadline)
          ],
          value: amountIn,
          account,
          chain: undefined
        });
      } else if (params.tokenOut.isNative) {
        // Token to KLC
        txHash = await walletClient.writeContract({
          address: this.config.router as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'swapExactTokensForKLC',
          args: [
            amountIn,
            amountOutMin,
            route,
            params.to as `0x${string}`,
            BigInt(deadline)
          ],
          account,
          chain: undefined
        });
      } else {
        // Token to Token
        txHash = await walletClient.writeContract({
          address: this.config.router as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'swapExactTokensForTokens',
          args: [
            amountIn,
            amountOutMin,
            route,
            params.to as `0x${string}`,
            BigInt(deadline)
          ],
          account,
          chain: undefined
        });
      }

      return txHash;
    } catch (error) {
      console.error('KalySwap executeSwap error:', error);
      if (error instanceof DexError) {
        throw error;
      }
      throw new SwapFailedError(this.getName(), error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // KalySwap-specific helper methods
  async getKLCPrice(): Promise<number> {
    try {
      // Get KLC/USDT pair price
      const klcToken = this.config.tokens.find(t => t.isNative);
      const usdtToken = this.config.tokens.find(t => t.symbol === 'USDT');

      if (!klcToken || !usdtToken) {
        return 0;
      }

      // Create a public client for reading data
      const publicClient = createPublicClient({
        chain: kalychain,
        transport: http(chainRpcUrls[this.getChainId() as keyof typeof chainRpcUrls])
      });

      const pairInfo = await this.getPairInfo(klcToken, usdtToken, publicClient);
      if (!pairInfo) {
        return 0;
      }

      // Calculate price from reserves
      const klcReserve = parseFloat(pairInfo.reserve0);
      const usdtReserve = parseFloat(pairInfo.reserve1);

      return usdtReserve / klcReserve;
    } catch (error) {
      console.error('Error getting KLC price:', error);
      return 0;
    }
  }

  async getKSWAPPrice(): Promise<number> {
    try {
      // Get KSWAP/KLC pair price, then convert to USD
      const kswapToken = this.config.tokens.find(t => t.symbol === 'KSWAP');
      const klcToken = this.config.tokens.find(t => t.isNative);

      if (!kswapToken || !klcToken) {
        return 0;
      }

      // Create a public client for reading data
      const publicClient = createPublicClient({
        chain: kalychain,
        transport: http(chainRpcUrls[this.getChainId() as keyof typeof chainRpcUrls])
      });

      const pairInfo = await this.getPairInfo(kswapToken, klcToken, publicClient);
      if (!pairInfo) {
        return 0;
      }

      // Calculate KSWAP price in KLC
      const kswapReserve = parseFloat(pairInfo.reserve0);
      const klcReserve = parseFloat(pairInfo.reserve1);
      const kswapPriceInKLC = klcReserve / kswapReserve;

      // Get KLC price in USD
      const klcPriceUSD = await this.getKLCPrice();

      return kswapPriceInKLC * klcPriceUSD;
    } catch (error) {
      console.error('Error getting KSWAP price:', error);
      return 0;
    }
  }

  // Override route calculation for KalySwap-specific routing
  async getSwapRoute(tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]> {
    const addressIn = tokenIn.isNative ? this.getWethAddress() : tokenIn.address;
    const addressOut = tokenOut.isNative ? this.getWethAddress() : tokenOut.address;

    // Check direct pair first
    const directPairExists = await this.canSwapDirectly(tokenIn, tokenOut, publicClient);
    if (directPairExists) {
      return [addressIn, addressOut];
    }

    // Try routing through wKLC
    const wklcAddress = this.getWethAddress();
    if (addressIn !== wklcAddress && addressOut !== wklcAddress) {
      const wklcToken = this.config.tokens.find(t => t.address.toLowerCase() === wklcAddress.toLowerCase());
      if (wklcToken) {
        const canRouteViaWKLC = await Promise.all([
          this.canSwapDirectly(tokenIn, wklcToken, publicClient),
          this.canSwapDirectly(wklcToken, tokenOut, publicClient)
        ]);

        if (canRouteViaWKLC[0] && canRouteViaWKLC[1]) {
          return [addressIn, wklcAddress, addressOut];
        }
      }
    }

    // Try routing through USDT (major stablecoin on KalyChain)
    const usdtToken = this.config.tokens.find(t => t.symbol === 'USDT');
    if (usdtToken && addressIn !== usdtToken.address && addressOut !== usdtToken.address) {
      const canRouteViaUSDT = await Promise.all([
        this.canSwapDirectly(tokenIn, usdtToken, publicClient),
        this.canSwapDirectly(usdtToken, tokenOut, publicClient)
      ]);

      if (canRouteViaUSDT[0] && canRouteViaUSDT[1]) {
        return [addressIn, usdtToken.address, addressOut];
      }
    }

    // No route found
    return [];
  }
}
