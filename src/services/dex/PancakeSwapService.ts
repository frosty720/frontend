// PancakeSwap DEX service implementation
// Handles all PancakeSwap-specific operations on BSC

import { BaseDexService } from './BaseDexService';
import { SwapParams, Token, QuoteResult } from '@/config/dex/types';
import { PANCAKESWAP_CONFIG } from '@/config/dex/pancakeswap';
import { DexError, SwapFailedError } from './IDexService';
import { getContract, parseUnits, createPublicClient, http } from 'viem';
import type { WalletClient, PublicClient } from 'viem';
import { bsc } from 'viem/chains';
import { chainRpcUrls } from '@/config/wagmi.config';

export class PancakeSwapService extends BaseDexService {
  // WBNB contract address on BSC
  private readonly WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

  constructor() {
    super(PANCAKESWAP_CONFIG);
  }

  getName(): string {
    return 'PancakeSwap';
  }

  getChainId(): number {
    return 56; // BSC
  }

  /**
   * Check if this is a wrap operation (BNB → WBNB)
   */
  private isWrapOperation(tokenIn: Token, tokenOut: Token): boolean {
    const isFromBNB = tokenIn.isNative === true;
    const isToWBNB = tokenOut.symbol.toUpperCase() === 'WBNB' ||
                     tokenOut.address.toLowerCase() === this.WBNB_ADDRESS.toLowerCase();
    return isFromBNB && isToWBNB;
  }

  /**
   * Check if this is an unwrap operation (WBNB → BNB)
   */
  private isUnwrapOperation(tokenIn: Token, tokenOut: Token): boolean {
    const isFromWBNB = tokenIn.symbol.toUpperCase() === 'WBNB' ||
                       tokenIn.address.toLowerCase() === this.WBNB_ADDRESS.toLowerCase();
    const isToBNB = tokenOut.isNative === true;
    return isFromWBNB && isToBNB;
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
        // BNB → WBNB: Call deposit() with BNB value
        console.log('🔄 Wrapping BNB to WBNB via WBNB contract...');

        // WBNB ABI for deposit function
        const WBNB_ABI = [
          {
            "inputs": [],
            "name": "deposit",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
          }
        ] as const;

        txHash = await walletClient.writeContract({
          address: this.WBNB_ADDRESS as `0x${string}`,
          abi: WBNB_ABI,
          functionName: 'deposit',
          args: [],
          value: amountIn,
          account,
          chain: undefined
        });

        console.log(`✅ Wrap transaction sent: ${txHash}`);
        return txHash;

      } else if (isUnwrap) {
        // WBNB → BNB: Call withdraw()
        console.log('🔄 Unwrapping WBNB to BNB via WBNB contract...');

        // WBNB ABI for withdraw function
        const WBNB_ABI = [
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
          address: this.WBNB_ADDRESS as `0x${string}`,
          abi: WBNB_ABI,
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
      if (params.tokenIn.isNative) {
        // BNB to Token
        txHash = await walletClient.writeContract({
          address: this.config.router as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'swapExactETHForTokens',
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
        // Token to BNB
        txHash = await walletClient.writeContract({
          address: this.config.router as `0x${string}`,
          abi: this.config.routerABI,
          functionName: 'swapExactTokensForETH',
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
      console.error('PancakeSwap executeSwap error:', error);
      if (error instanceof DexError) {
        throw error;
      }
      throw new SwapFailedError(this.getName(), error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // PancakeSwap-specific helper methods
  async getBNBPrice(): Promise<number> {
    try {
      // Get BNB/USDT pair price
      const bnbToken = this.config.tokens.find(t => t.isNative);
      const usdtToken = this.config.tokens.find(t => t.symbol === 'USDT');

      if (!bnbToken || !usdtToken) {
        return 0;
      }

      // Create a public client for reading data
      const publicClient = createPublicClient({
        chain: bsc,
        transport: http(chainRpcUrls[this.getChainId() as keyof typeof chainRpcUrls])
      });

      const pairInfo = await this.getPairInfo(bnbToken, usdtToken, publicClient);
      if (!pairInfo) {
        return 0;
      }

      // Calculate price from reserves
      const bnbReserve = parseFloat(pairInfo.reserve0);
      const usdtReserve = parseFloat(pairInfo.reserve1);

      return usdtReserve / bnbReserve;
    } catch (error) {
      console.error('Error getting BNB price:', error);
      return 0;
    }
  }

  async getCAKEPrice(): Promise<number> {
    try {
      // Get CAKE/BNB pair price, then convert to USD
      const cakeToken = this.config.tokens.find(t => t.symbol === 'CAKE');
      const bnbToken = this.config.tokens.find(t => t.isNative);

      if (!cakeToken || !bnbToken) {
        return 0;
      }

      // Create a public client for reading data
      const publicClient = createPublicClient({
        chain: bsc,
        transport: http(chainRpcUrls[this.getChainId() as keyof typeof chainRpcUrls])
      });

      const pairInfo = await this.getPairInfo(cakeToken, bnbToken, publicClient);
      if (!pairInfo) {
        return 0;
      }

      // Calculate CAKE price in BNB
      const cakeReserve = parseFloat(pairInfo.reserve0);
      const bnbReserve = parseFloat(pairInfo.reserve1);
      const cakePriceInBNB = bnbReserve / cakeReserve;

      // Get BNB price in USD
      const bnbPriceUSD = await this.getBNBPrice();

      return cakePriceInBNB * bnbPriceUSD;
    } catch (error) {
      console.error('Error getting CAKE price:', error);
      return 0;
    }
  }

  // Override route calculation for PancakeSwap-specific routing
  async getSwapRoute(tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]> {
    const addressIn = tokenIn.isNative ? this.getWethAddress() : tokenIn.address;
    const addressOut = tokenOut.isNative ? this.getWethAddress() : tokenOut.address;

    // Check direct pair first
    const directPairExists = await this.canSwapDirectly(tokenIn, tokenOut, publicClient);
    if (directPairExists) {
      return [addressIn, addressOut];
    }

    // Try routing through WBNB
    const wbnbAddress = this.getWethAddress();
    if (addressIn !== wbnbAddress && addressOut !== wbnbAddress) {
      const wbnbToken = this.config.tokens.find(t => t.address.toLowerCase() === wbnbAddress.toLowerCase());
      if (wbnbToken) {
        const canRouteViaWBNB = await Promise.all([
          this.canSwapDirectly(tokenIn, wbnbToken, publicClient),
          this.canSwapDirectly(wbnbToken, tokenOut, publicClient)
        ]);

        if (canRouteViaWBNB[0] && canRouteViaWBNB[1]) {
          return [addressIn, wbnbAddress, addressOut];
        }
      }
    }

    // Try routing through USDT (major stablecoin on BSC)
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

    // Try routing through BUSD (BSC-specific stablecoin)
    const busdToken = this.config.tokens.find(t => t.symbol === 'BUSD');
    if (busdToken && addressIn !== busdToken.address && addressOut !== busdToken.address) {
      const canRouteViaBUSD = await Promise.all([
        this.canSwapDirectly(tokenIn, busdToken, publicClient),
        this.canSwapDirectly(busdToken, tokenOut, publicClient)
      ]);

      if (canRouteViaBUSD[0] && canRouteViaBUSD[1]) {
        return [addressIn, busdToken.address, addressOut];
      }
    }

    // No route found
    return [];
  }
}
