// Camelot DEX service implementation
// Handles all Camelot V2-specific operations on Arbitrum

import { BaseDexService } from './BaseDexService';
import { SwapParams, Token, QuoteResult } from '@/config/dex/types';
import { UNISWAP_V2_CONFIG } from '@/config/dex/uniswap-v2';
import { DexError, SwapFailedError } from './IDexService';
import { getContract, parseUnits, createPublicClient, http } from 'viem';
import type { WalletClient, PublicClient } from 'viem';
import { arbitrum } from 'viem/chains';
import { chainRpcUrls } from '@/config/wagmi.config';

export class UniswapV2Service extends BaseDexService {
  // WETH contract address on Arbitrum
  private readonly WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  constructor() {
    super(UNISWAP_V2_CONFIG);
  }

  getName(): string {
    return 'Camelot';
  }

  getChainId(): number {
    return 42161; // Arbitrum
  }

  /**
   * Check if this is a wrap operation (ETH → WETH)
   */
  private isWrapOperation(tokenIn: Token, tokenOut: Token): boolean {
    const isFromETH = tokenIn.isNative === true;
    const isToWETH = tokenOut.symbol.toUpperCase() === 'WETH' ||
                     tokenOut.address.toLowerCase() === this.WETH_ADDRESS.toLowerCase();
    return isFromETH && isToWETH;
  }

  /**
   * Check if this is an unwrap operation (WETH → ETH)
   */
  private isUnwrapOperation(tokenIn: Token, tokenOut: Token): boolean {
    const isFromWETH = tokenIn.symbol.toUpperCase() === 'WETH' ||
                       tokenIn.address.toLowerCase() === this.WETH_ADDRESS.toLowerCase();
    const isToETH = tokenOut.isNative === true;
    return isFromWETH && isToETH;
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
        priceImpact: '0',
        executionPrice: '1.0'
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
        // ETH → WETH: Call deposit() with ETH value
        console.log('🔄 Wrapping ETH to WETH via WETH contract...');

        // WETH ABI for deposit function
        const WETH_ABI = [
          {
            "inputs": [],
            "name": "deposit",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
          }
        ] as const;

        txHash = await walletClient.writeContract({
          address: this.WETH_ADDRESS as `0x${string}`,
          abi: WETH_ABI,
          functionName: 'deposit',
          args: [],
          value: amountIn,
          account,
          chain: undefined
        });

        console.log(`✅ Wrap transaction sent: ${txHash}`);
        return txHash;

      } else if (isUnwrap) {
        // WETH → ETH: Call withdraw()
        console.log('🔄 Unwrapping WETH to ETH via WETH contract...');

        // WETH ABI for withdraw function
        const WETH_ABI = [
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
          address: this.WETH_ADDRESS as `0x${string}`,
          abi: WETH_ABI,
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
        // ETH to Token
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
        // Token to ETH
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
      console.error('Uniswap V2 executeSwap error:', error);
      if (error instanceof DexError) {
        throw error;
      }
      throw new SwapFailedError(this.getName(), error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Uniswap V2-specific helper methods
  async getETHPrice(): Promise<number> {
    try {
      // Get ETH/USDC pair price
      const ethToken = this.config.tokens.find(t => t.isNative);
      const usdcToken = this.config.tokens.find(t => t.symbol === 'USDC');

      if (!ethToken || !usdcToken) {
        return 0;
      }

      // Create a public client for reading data
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(chainRpcUrls[this.getChainId() as keyof typeof chainRpcUrls])
      });

      const pairInfo = await this.getPairInfo(ethToken, usdcToken, publicClient);
      if (!pairInfo) {
        return 0;
      }

      // Calculate price from reserves
      const ethReserve = parseFloat(pairInfo.reserve0);
      const usdcReserve = parseFloat(pairInfo.reserve1);

      return usdcReserve / ethReserve;
    } catch (error) {
      console.error('Error getting ETH price:', error);
      return 0;
    }
  }

  async getARBPrice(): Promise<number> {
    try {
      // Get ARB/ETH pair price, then convert to USD
      const arbToken = this.config.tokens.find(t => t.symbol === 'ARB');
      const ethToken = this.config.tokens.find(t => t.isNative);

      if (!arbToken || !ethToken) {
        return 0;
      }

      // Create a public client for reading data
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(chainRpcUrls[this.getChainId() as keyof typeof chainRpcUrls])
      });

      const pairInfo = await this.getPairInfo(arbToken, ethToken, publicClient);
      if (!pairInfo) {
        return 0;
      }

      // Calculate ARB price in ETH
      const arbReserve = parseFloat(pairInfo.reserve0);
      const ethReserve = parseFloat(pairInfo.reserve1);
      const arbPriceInETH = ethReserve / arbReserve;

      // Get ETH price in USD
      const ethPriceUSD = await this.getETHPrice();

      return arbPriceInETH * ethPriceUSD;
    } catch (error) {
      console.error('Error getting ARB price:', error);
      return 0;
    }
  }

  // Override route calculation for Uniswap V2-specific routing
  async getSwapRoute(tokenIn: Token, tokenOut: Token, publicClient: PublicClient): Promise<string[]> {
    const addressIn = tokenIn.isNative ? this.getWethAddress() : tokenIn.address;
    const addressOut = tokenOut.isNative ? this.getWethAddress() : tokenOut.address;

    console.log(`[${this.getName()}] Finding route:`, {
      tokenIn: `${tokenIn.symbol} (${addressIn})`,
      tokenOut: `${tokenOut.symbol} (${addressOut})`
    });

    // Check direct pair first
    const directPairExists = await this.canSwapDirectly(tokenIn, tokenOut, publicClient);
    console.log(`[${this.getName()}] Direct pair exists:`, directPairExists);
    if (directPairExists) {
      return [addressIn, addressOut];
    }

    // Try routing through WETH
    const wethAddress = this.getWethAddress();
    if (addressIn !== wethAddress && addressOut !== wethAddress) {
      const wethToken = this.config.tokens.find(t => t.address.toLowerCase() === wethAddress.toLowerCase());
      if (wethToken) {
        const canRouteViaWETH = await Promise.all([
          this.canSwapDirectly(tokenIn, wethToken, publicClient),
          this.canSwapDirectly(wethToken, tokenOut, publicClient)
        ]);

        console.log(`[${this.getName()}] Can route via WETH:`, canRouteViaWETH);
        if (canRouteViaWETH[0] && canRouteViaWETH[1]) {
          return [addressIn, wethAddress, addressOut];
        }
      }
    }

    // Try routing through USDC (major stablecoin on Arbitrum)
    const usdcToken = this.config.tokens.find(t => t.symbol === 'USDC');
    if (usdcToken && addressIn !== usdcToken.address && addressOut !== usdcToken.address) {
      const canRouteViaUSDC = await Promise.all([
        this.canSwapDirectly(tokenIn, usdcToken, publicClient),
        this.canSwapDirectly(usdcToken, tokenOut, publicClient)
      ]);

      console.log(`[${this.getName()}] Can route via USDC:`, canRouteViaUSDC);
      if (canRouteViaUSDC[0] && canRouteViaUSDC[1]) {
        return [addressIn, usdcToken.address, addressOut];
      }
    }

    // Try routing through USDT
    const usdtToken = this.config.tokens.find(t => t.symbol === 'USDT');
    if (usdtToken && addressIn !== usdtToken.address && addressOut !== usdtToken.address) {
      const canRouteViaUSDT = await Promise.all([
        this.canSwapDirectly(tokenIn, usdtToken, publicClient),
        this.canSwapDirectly(usdtToken, tokenOut, publicClient)
      ]);

      console.log(`[${this.getName()}] Can route via USDT:`, canRouteViaUSDT);
      if (canRouteViaUSDT[0] && canRouteViaUSDT[1]) {
        return [addressIn, usdtToken.address, addressOut];
      }
    }

    // No route found
    return [];
  }
}
