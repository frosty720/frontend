import { contractLogger } from '@/lib/logger';
// Bridge Helper Functions - Utility functions for bridge operations
// This file contains utility functions adapted from Hyperlane bridge UI

import { TokenAmount } from '@hyperlane-xyz/sdk';
import { formatUnits, parseUnits, isAddress, TransactionReceipt, Log } from 'viem';
import BigNumber from 'bignumber.js';

export const bridgeHelpers = {
  // Format token amount for display
  formatAmount: (amount: string | bigint, decimals: number = 18, maxDecimals: number = 4): string => {
    try {
      const formatted = formatUnits(BigInt(amount), decimals);
      const bn = new BigNumber(formatted);
      return bn.toFixed(maxDecimals, BigNumber.ROUND_DOWN);
    } catch {
      return '0';
    }
  },

  // Format TokenAmount for display
  formatTokenAmount: (tokenAmount: TokenAmount | null, maxDecimals: number = 4): string => {
    if (!tokenAmount) return '0';
    try {
      const formatted = tokenAmount.getDecimalFormattedAmount();
      const bn = new BigNumber(formatted);
      return bn.toFixed(maxDecimals, BigNumber.ROUND_DOWN);
    } catch {
      return '0';
    }
  },

  // Parse amount string to wei
  parseAmount: (amount: string, decimals: number = 18): bigint => {
    try {
      return parseUnits(amount, decimals);
    } catch {
      return BigInt(0);
    }
  },

  // Validate Ethereum address
  validateAddress: (address: string): boolean => {
    return isAddress(address);
  },

  // Calculate max amount considering fees
  calculateMaxAmount: (balance: TokenAmount | null, fees: TokenAmount | null): string => {
    if (!balance) return '0';

    try {
      const balanceAmount = new BigNumber(balance.getDecimalFormattedAmount());

      if (!fees || fees.token.symbol !== balance.token.symbol) {
        return balanceAmount.toFixed(4, BigNumber.ROUND_DOWN);
      }

      const feeAmount = new BigNumber(fees.getDecimalFormattedAmount());
      const maxAmount = balanceAmount.minus(feeAmount);

      return maxAmount.isPositive() ? maxAmount.toFixed(4, BigNumber.ROUND_DOWN) : '0';
    } catch {
      return '0';
    }
  },

  // Get chain display name
  getChainDisplayName: (chainName: string): string => {
    const chainDisplayNames: Record<string, string> = {
      kalychain: 'KalyChain',
      arbitrum: 'Arbitrum One',
      bsc: 'BNB Smart Chain',
      polygon: 'Polygon',
    };
    return chainDisplayNames[chainName] || chainName;
  },

  // Get token display name with symbol
  getTokenDisplayName: (tokenName: string, symbol: string): string => {
    return `${tokenName} (${symbol})`;
  },

  // Truncate address for display
  truncateAddress: (address: string, startLength: number = 6, endLength: number = 4): string => {
    if (!address || address.length <= startLength + endLength) return address;
    return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
  },

  // Check if amount is valid
  isValidAmount: (amount: string): boolean => {
    if (!amount || amount === '0') return false;
    const num = Number(amount);
    return !isNaN(num) && num > 0 && isFinite(num);
  },

  // Get transaction explorer URL
  getTransactionUrl: (txHash: string, chainName: string): string => {
    const explorerUrls: Record<string, string> = {
      kalychain: 'https://kalyscan.io/tx/',
      arbitrum: 'https://arbiscan.io/tx/',
      bsc: 'https://bscscan.com/tx/',
      polygon: 'https://polygonscan.com/tx/',
    };
    const baseUrl = explorerUrls[chainName];
    return baseUrl ? `${baseUrl}${txHash}` : '';
  },

  // Get token symbol from address or denomination
  getTokenSymbol: (addressOrDenom: string): string => {
    // Known token addresses from warp routes configuration
    const knownTokens: Record<string, string> = {
      // KLC addresses
      '0x8A1ABbB167b149F2493C8141091028fD812Da6E4': 'KLC', // KalyChain
      '0x7542c62565f48520A34Cf79884656efDEdD38176': 'KLC', // Arbitrum
      '0x02CF1778c07584D92b610E0C03fA285DfD00c354': 'KLC', // BSC
      '0x285C14145EB75A1918B48f93E126139ea1a0f294': 'KLC', // Polygon

      // BNB addresses
      '0x8d0e034611B691683377d2fC9958122a30F7DAab': 'BNB', // BSC
      '0x0e2318b62a096AC68ad2D7F37592CBf0cA9c4Ddb': 'BNB', // KalyChain

      // DAI addresses
      '0x1e59F72de6c00c456f7F42708FE8b6b0782E84C6': 'DAI', // Arbitrum
      '0x7379A18963039eA1284050b585f422e8156c9eC0': 'DAI', // BSC
      '0x6E92CAC380F7A7B86f4163fad0df2F277B16Edc6': 'DAI', // KalyChain
      '0x1E71a8d870F0C491d4fCC965A59493b8B7564949': 'DAI', // Polygon
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1': 'DAI', // Arbitrum collateral
      '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3': 'DAI', // BSC collateral
      '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063': 'DAI', // Polygon collateral

      // ETH addresses
      '0x14CFC15Da10d5cfC6A494E183c795067573C7F51': 'ETH', // Arbitrum
      '0xF29AD0640731c50d0c7C999D1f8d5Ffb9E2A3da3': 'ETH', // BSC
      '0xfdbB253753dDE60b11211B169dC872AaE672879b': 'ETH', // KalyChain
      '0xb974461a9ef2Ff3F408798f551929647ceaB13b4': 'ETH', // Polygon
      '0x2170Ed0880ac9A755fd29B2688956BD959F933F8': 'ETH', // BSC collateral
      '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619': 'ETH', // Polygon collateral

      // POL addresses
      '0x706C9a63d7c8b7Aaf85DDCca52654645f470E8Ac': 'POL', // KalyChain
      '0x0a6364152EA7a487C697a36Eb2522f48bC62fB4c': 'POL', // Polygon

      // USDC addresses
      '0xD0a1d1b8E10625eE7Ed4Be4Aa7afA7f169411FBd': 'USDC', // Arbitrum
      '0x9cAb0c396cF0F4325913f2269a0b72BD4d46E3A9': 'USDC', // KalyChain
      '0xB3dF48224FA257D55e01342592f9A24cefc2628e': 'USDC', // Polygon
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831': 'USDC', // Arbitrum collateral
      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359': 'USDC', // Polygon collateral

      // USDT addresses
      '0x2CA775C77B922A51FcF3097F52bFFdbc0250D99A': 'USDT', // KalyChain
      '0xFDb3307a16442ed5A7C040AE1600a3B3D3C8e7D9': 'USDT', // Arbitrum
      '0x2f7c83FC82A0e39A997c262e5BAB13176C275104': 'USDT', // Polygon
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 'USDT', // Arbitrum collateral
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': 'USDT', // Polygon collateral

      // WBTC addresses
      '0x3CDbaBE5Bf4E6cfE10A2A326E0ad31b2d16398D4': 'WBTC', // Arbitrum
      '0xaA77D4a26d432B82DB07F8a47B7f7F623fd92455': 'WBTC', // KalyChain
      '0xfF00e814A0dCB9a614585c212C78Fdc596d02e47': 'WBTC', // Polygon
      '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': 'WBTC', // Arbitrum collateral
      '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6': 'WBTC', // Polygon collateral
    };
    return knownTokens[addressOrDenom] || 'UNKNOWN';
  },

  // Debounce function for input handling
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  // Extract message ID from transaction receipt using Hyperlane utilities
  extractMessageIdFromReceipt: (receipt: TransactionReceipt, originChain: string): string | null => {
    try {
      // TODO: Use proper Hyperlane utility function
      // const messageId = tryGetMsgIdFromTransferReceipt(originChain, receipt);
      // For now, use simplified extraction

      // Look for Hyperlane message dispatch events
      // The message ID is typically in the first topic of the DispatchId event
      const dispatchEvents = receipt.logs.filter((log: Log) => {
        // Hyperlane DispatchId event signature
        const dispatchIdTopic = '0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a';
        return log.topics[0] === dispatchIdTopic;
      });

      if (dispatchEvents.length > 0) {
        // The message ID is typically the first topic after the event signature
        const messageId = dispatchEvents[0].topics[1];
        return messageId || null;
      }

      // Fallback: look for any event that might contain a message ID
      for (const log of receipt.logs) {
        if (log.topics.length > 1) {
          const potentialMessageId = log.topics[1];
          // Basic validation: message ID should be 32 bytes (64 hex chars + 0x)
          if (potentialMessageId && potentialMessageId.length === 66) {
            return potentialMessageId;
          }
        }
      }

      return null;
    } catch (error) {
      contractLogger.error('Error extracting message ID from receipt:', error);
      return null;
    }
  },

  // Copy text to clipboard
  copyToClipboard: async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        textArea.remove();
        return success;
      }
    } catch (error) {
      contractLogger.error('Failed to copy to clipboard:', error);
      return false;
    }
  },

  // Timeout utilities for long-running operations
  withTimeout: async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  },

  // Retry with exponential backoff
  retryWithBackoff: async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 10000
  ): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  },

  // Wait for condition with timeout
  waitForCondition: async (
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 30000,
    intervalMs: number = 1000
  ): Promise<void> => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await condition();
      if (result) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  },
};
