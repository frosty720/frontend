/**
 * Token List Configuration
 * Centralized configuration for all token list URLs and settings
 */

import { TokenListConfig } from '@/services/tokenListService';

// Backend API endpoints for token lists (avoids CORS issues)
const TOKEN_LIST_URLS = {
  // KalyChain token lists (via backend proxy)
  KALYSWAP_DEFAULT: '/api/token-lists/kalyswap-default',

  // External token lists (via backend proxy)
  PANCAKESWAP_EXTENDED: '/api/token-lists/pancakeswap-extended',
  UNISWAP_DEFAULT: '/api/token-lists/uniswap-default',
  CAMELOT_ARBITRUM: '/api/token-lists/camelot-arbitrum',

  // Future token lists (disabled for now)
  KALYSWAP_EXTENDED: '/api/token-lists/kalyswap-extended',
  KALYSWAP_COMMUNITY: '/api/token-lists/kalyswap-community'
};

/**
 * Token list configurations per chain
 * Higher priority lists override lower priority ones for duplicate tokens
 */
export const TOKEN_LIST_CONFIGS: Record<number, TokenListConfig[]> = {
  // KalyChain (3890)
  [CHAIN_IDS.KALYCHAIN]: [
    {
      name: 'KalySwap Default',
      url: TOKEN_LIST_URLS.KALYSWAP_DEFAULT,
      priority: 100,
      enabled: true
    }
    // Future token lists can be added here:
    // {
    //   name: 'KalySwap Extended',
    //   url: TOKEN_LIST_URLS.KALYSWAP_EXTENDED,
    //   priority: 90,
    //   enabled: false
    // },
    // {
    //   name: 'KalySwap Community',
    //   url: TOKEN_LIST_URLS.KALYSWAP_COMMUNITY,
    //   priority: 80,
    //   enabled: false
    // }
  ],

  // KMT relaunch chain (3890) - no remote list published yet; useTokenLists falls back to
  // the bundled KMT_TOKENS. Add a hosted list here when one exists.

  // Binance Smart Chain (56) - Use official PancakeSwap token list
  56: [
    {
      name: 'PancakeSwap Extended',
      url: TOKEN_LIST_URLS.PANCAKESWAP_EXTENDED,
      priority: 100,
      enabled: true
    }
  ],

  // Arbitrum (42161) - Use official Camelot token list
  42161: [
    {
      name: 'Camelot Arbitrum',
      url: TOKEN_LIST_URLS.CAMELOT_ARBITRUM,
      priority: 100,
      enabled: true
    }
  ]
};

/**
 * Token list settings
 */
export const TOKEN_LIST_SETTINGS = {
  // Cache settings
  CACHE_TTL: 30 * 60 * 1000, // 30 minutes
  
  // Request settings
  REQUEST_TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 2,
  
  // Validation settings
  MAX_TOKENS_PER_LIST: 10000,
  MIN_TOKEN_SYMBOL_LENGTH: 1,
  MAX_TOKEN_SYMBOL_LENGTH: 20,
  MIN_TOKEN_NAME_LENGTH: 1,
  MAX_TOKEN_NAME_LENGTH: 100,
  
  // UI settings
  DEFAULT_TOKENS_TO_SHOW: 50,
  SEARCH_MIN_QUERY_LENGTH: 1
};

/**
 * Get token list configurations for a specific chain
 */
export function getTokenListConfigs(chainId: number): TokenListConfig[] {
  return TOKEN_LIST_CONFIGS[chainId] || [];
}

/**
 * Get enabled token list configurations for a specific chain
 */
export function getEnabledTokenListConfigs(chainId: number): TokenListConfig[] {
  return getTokenListConfigs(chainId).filter(config => config.enabled);
}

/**
 * Check if a chain has token list support
 */
export function hasTokenListSupport(chainId: number): boolean {
  return getEnabledTokenListConfigs(chainId).length > 0;
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(TOKEN_LIST_CONFIGS).map(Number);
}

/**
 * Token list metadata for UI display
 * @deprecated Use CHAIN_METADATA from '@/config/chains' instead
 * This is kept for backward compatibility but will be removed in a future release.
 */
import { CHAIN_METADATA, RPC_URLS, CHAIN_IDS } from './chains';

export const TOKEN_LIST_METADATA = {
  [CHAIN_IDS.KALYCHAIN]: {
    name: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].name,
    symbol: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].symbol,
    logo: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].logo,
    explorer: CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].explorer,
    rpc: RPC_URLS[CHAIN_IDS.KALYCHAIN]
  },
  [CHAIN_IDS.BSC]: {
    name: CHAIN_METADATA[CHAIN_IDS.BSC].name,
    symbol: CHAIN_METADATA[CHAIN_IDS.BSC].symbol,
    logo: CHAIN_METADATA[CHAIN_IDS.BSC].logo,
    explorer: CHAIN_METADATA[CHAIN_IDS.BSC].explorer,
    rpc: RPC_URLS[CHAIN_IDS.BSC]
  },
  [CHAIN_IDS.ARBITRUM]: {
    name: CHAIN_METADATA[CHAIN_IDS.ARBITRUM].name,
    symbol: CHAIN_METADATA[CHAIN_IDS.ARBITRUM].symbol,
    logo: CHAIN_METADATA[CHAIN_IDS.ARBITRUM].logo,
    explorer: CHAIN_METADATA[CHAIN_IDS.ARBITRUM].explorer,
    rpc: RPC_URLS[CHAIN_IDS.ARBITRUM]
  }
};

// Export URLs for external use
export { TOKEN_LIST_URLS };
