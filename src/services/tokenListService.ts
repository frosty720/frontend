/**
 * Token List Service - Dynamic token list fetching and management
 * Implements PancakeSwap-style token list loading with caching and validation
 */

import { fetchJSON } from '@/utils/networkUtils';
import { Token } from '@/config/dex/types';
import { TOKEN_LIST_CONFIGS, TOKEN_LIST_SETTINGS } from '@/config/tokenLists';

// Token List Schema - follows Uniswap token list standard
export interface TokenList {
  name: string;
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  timestamp: string;
  logoURI: string;
  keywords: string[];
  tokens: Token[];
}

// Token List Configuration
export interface TokenListConfig {
  name: string;
  url: string;
  priority: number; // Higher priority lists override lower ones
  enabled: boolean;
}

// Cache interface
interface CacheEntry {
  data: TokenList;
  timestamp: number;
}

/**
 * Token List Service Class
 * Handles fetching, caching, and validation of token lists
 */
class TokenListService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = TOKEN_LIST_SETTINGS.CACHE_TTL;
  private readonly REQUEST_TIMEOUT = TOKEN_LIST_SETTINGS.REQUEST_TIMEOUT;
  private readonly MAX_RETRIES = TOKEN_LIST_SETTINGS.MAX_RETRIES;

  /**
   * Fetch a token list from URL with caching
   */
  async fetchTokenList(url: string): Promise<TokenList | null> {
    try {
      // Check cache first
      const cached = this.cache.get(url);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`📋 Using cached token list from ${url}`);
        return cached.data;
      }

      console.log(`🔍 Fetching token list from ${url}`);

      // For /api/ URLs, use relative paths in browser (Next.js rewrites handle proxying)
      // For server-side, use the configured API URL
      let apiUrl: string;
      if (url.startsWith('/api/')) {
        if (typeof window !== 'undefined') {
          // In browser: use relative URL - Next.js rewrites will proxy to backend
          apiUrl = url;
        } else {
          // Server-side: need absolute URL
          const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'https://app.kalyswap.io';
          apiUrl = `${baseUrl}${url}`;
        }
      } else {
        apiUrl = url;
      }

      console.log(`🔍 Resolved API URL: ${apiUrl}`);

      const tokenList = await fetchJSON<TokenList>(apiUrl, {
        timeout: this.REQUEST_TIMEOUT,
        retries: this.MAX_RETRIES,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KalySwap/1.0'
        }
      });

      // Validate token list schema
      if (this.validateTokenList(tokenList)) {
        // Cache the result
        this.cache.set(url, { 
          data: tokenList, 
          timestamp: Date.now() 
        });
        
        console.log(`✅ Successfully fetched and cached token list: ${tokenList.name} (${tokenList.tokens.length} tokens)`);
        return tokenList;
      } else {
        console.error(`❌ Invalid token list schema from ${url}`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Failed to fetch token list from ${url}:`, error);
      return null;
    }
  }

  /**
   * Get all tokens for a specific chain from configured token lists
   */
  async getTokensForChain(chainId: number): Promise<Token[]> {
    const configs = TOKEN_LIST_CONFIGS[chainId] || [];
    const enabledConfigs = configs.filter(c => c.enabled);
    
    if (enabledConfigs.length === 0) {
      console.warn(`⚠️ No token list configurations found for chain ${chainId}`);
      return [];
    }

    console.log(`🔍 Loading tokens for chain ${chainId} from ${enabledConfigs.length} token lists`);

    const allTokens: Array<Token & { priority: number }> = [];
    
    // Fetch all enabled token lists for this chain
    for (const config of enabledConfigs) {
      const tokenList = await this.fetchTokenList(config.url);
      if (tokenList) {
        // Filter tokens for this specific chain and add priority
        const chainTokens = tokenList.tokens
          .filter(token => token.chainId === chainId)
          .map(token => ({ ...token, priority: config.priority }));
        
        allTokens.push(...chainTokens);
        console.log(`📋 Added ${chainTokens.length} tokens from ${config.name}`);
      }
    }

    // Remove duplicates, prioritizing higher priority lists
    const deduplicatedTokens = this.deduplicateTokens(allTokens);
    
    console.log(`✅ Loaded ${deduplicatedTokens.length} unique tokens for chain ${chainId}`);
    return deduplicatedTokens;
  }

  /**
   * Get token list configurations for a chain
   */
  getTokenListConfigs(chainId: number): TokenListConfig[] {
    return TOKEN_LIST_CONFIGS[chainId] || [];
  }

  /**
   * Clear cache for a specific URL or all cache
   */
  clearCache(url?: string): void {
    if (url) {
      this.cache.delete(url);
      console.log(`🗑️ Cleared cache for ${url}`);
    } else {
      this.cache.clear();
      console.log('🗑️ Cleared all token list cache');
    }
  }

  /**
   * Validate token list follows the standard schema
   */
  private validateTokenList(tokenList: any): tokenList is TokenList {
    if (!tokenList || typeof tokenList !== 'object') {
      return false;
    }

    // Check required fields
    if (typeof tokenList.name !== 'string' ||
        !tokenList.version ||
        typeof tokenList.version.major !== 'number' ||
        typeof tokenList.version.minor !== 'number' ||
        typeof tokenList.version.patch !== 'number' ||
        !Array.isArray(tokenList.tokens)) {
      return false;
    }

    // Validate each token
    return tokenList.tokens.every((token: any) => this.validateToken(token));
  }

  /**
   * Validate individual token follows the Token interface
   */
  private validateToken(token: any): token is Token {
    return token &&
           typeof token.address === 'string' &&
           typeof token.symbol === 'string' &&
           typeof token.name === 'string' &&
           typeof token.decimals === 'number' &&
           typeof token.chainId === 'number' &&
           typeof token.logoURI === 'string' &&
           token.address.length > 0 &&
           token.symbol.length > 0 &&
           token.name.length > 0 &&
           token.decimals >= 0 &&
           token.chainId > 0;
  }

  /**
   * Remove duplicate tokens, prioritizing higher priority lists
   */
  private deduplicateTokens(tokens: Array<Token & { priority: number }>): Token[] {
    const tokenMap = new Map<string, Token & { priority: number }>();

    // Process tokens, keeping highest priority version of each
    for (const token of tokens) {
      const key = `${token.chainId}-${token.address.toLowerCase()}`;
      const existing = tokenMap.get(key);
      
      if (!existing || token.priority > existing.priority) {
        tokenMap.set(key, token);
      }
    }

    // Return tokens without priority field
    return Array.from(tokenMap.values()).map(({ priority, ...token }) => token);
  }
}

// Export singleton instance
export const tokenListService = new TokenListService();
