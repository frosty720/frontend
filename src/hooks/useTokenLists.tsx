/**
 * Token Lists Hook - Dynamic token list management
 * Uses local token lists for KalyChain, fetches from external sources for other chains
 * Maintains compatibility with existing useTokens hook interface
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { tokenListService } from '@/services/tokenListService';
import { Token } from '@/config/dex/types';
import { KALYCHAIN_TOKENS } from '@/config/dex/tokens/kalychain';

// Enhanced token interface with additional metadata from subgraph
export interface EnhancedToken extends Token {
  tradeVolumeUSD?: string;
  totalLiquidity?: string;
  derivedKLC?: string;
  txCount?: string;
  priceUSD?: number;
}

// Hook return interface - matches existing useTokens interface
export interface UseTokenListsReturn {
  tokens: EnhancedToken[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getTokenByAddress: (address: string) => EnhancedToken | undefined;
  getTokenBySymbol: (symbol: string) => EnhancedToken | undefined;
  searchTokens: (query: string) => EnhancedToken[];
  getTokenWithMetadata: (address: string) => EnhancedToken | undefined;
  getTopTokensByVolume: (limit?: number) => EnhancedToken[];
}

// Hook return interface - matches existing useTokens interface
export interface UseTokenListsOptions {
  chainId?: number; // Optional chainId override for testing
}

/**
 * Hook for managing dynamic token lists
 * Fetches tokens from token lists and merges with subgraph data
 */
export function useTokenLists(options: UseTokenListsOptions = {}): UseTokenListsReturn {
  // Use provided chainId or fallback to KalyChain
  const chainId = options.chainId || 3888;
  const [tokens, setTokens] = useState<EnhancedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debug: Log chainId changes
  useEffect(() => {
    console.log('🔗 useTokenLists chainId changed:', {
      providedChainId: options.chainId,
      effectiveChainId: chainId
    });
  }, [options.chainId, chainId]);



  /**
   * Fetch tokens from subgraph (existing logic from useTokens)
   */
  const fetchTokensFromSubgraph = useCallback(async (): Promise<EnhancedToken[]> => {
    try {
      console.log('🔍 Fetching tokens from DEX subgraph...');

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetTokens {
              tokens(
                first: 100
                orderBy: tradeVolumeUSD
                orderDirection: desc
                where: { tradeVolumeUSD_gt: "0" }
              ) {
                id
                symbol
                name
                decimals
                tradeVolumeUSD
                totalLiquidity
                derivedKLC
                txCount
              }
            }
          `
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.errors) {
          console.error('GraphQL errors:', result.errors);
          return [];
        }

        if (result.data && result.data.tokens) {
          const subgraphTokens: EnhancedToken[] = result.data.tokens.map((token: any) => ({
            chainId,
            address: token.id,
            symbol: token.symbol,
            name: token.name,
            decimals: parseInt(token.decimals),
            logoURI: `https://raw.githubusercontent.com/kalycoinproject/tokens/main/assets/${chainId}/${token.id}/logo_24.png`,
            // Enhanced subgraph data
            tradeVolumeUSD: token.tradeVolumeUSD,
            totalLiquidity: token.totalLiquidity,
            derivedKLC: token.derivedKLC,
            txCount: token.txCount,
            priceUSD: undefined // Price calculation requires real-time KLC price from market
          }));

          console.log(`✅ Fetched ${subgraphTokens.length} tokens from subgraph`);
          return subgraphTokens;
        }
      }
      
      return [];
    } catch (err) {
      console.error('❌ Error fetching tokens from subgraph:', err);
      return [];
    }
  }, [chainId]);

  /**
   * Merge token lists with subgraph data
   * Prioritizes token list data but enhances with subgraph metadata
   */
  const mergeTokenLists = useCallback((tokenListTokens: Token[], subgraphTokens: EnhancedToken[]): EnhancedToken[] => {
    const tokenMap = new Map<string, EnhancedToken>();

    // First, add all token list tokens
    tokenListTokens.forEach(token => {
      const key = token.address.toLowerCase();
      tokenMap.set(key, {
        ...token,
        // Initialize enhanced fields
        tradeVolumeUSD: undefined,
        totalLiquidity: undefined,
        derivedKLC: undefined,
        txCount: undefined,
        priceUSD: undefined
      });
    });

    // Then enhance with subgraph data and add new subgraph tokens
    subgraphTokens.forEach(token => {
      const key = token.address.toLowerCase();
      const existingToken = tokenMap.get(key);

      if (existingToken) {
        // Enhance existing token list token with subgraph data
        tokenMap.set(key, {
          ...existingToken,
          tradeVolumeUSD: token.tradeVolumeUSD,
          totalLiquidity: token.totalLiquidity,
          derivedKLC: token.derivedKLC,
          txCount: token.txCount,
          priceUSD: token.priceUSD
        });
      } else {
        // Add new token from subgraph
        tokenMap.set(key, token);
      }
    });

    return Array.from(tokenMap.values());
  }, []);

  /**
   * Add native tokens if not present in token lists
   * Supports KLC (KalyChain), BNB (BSC), ETH (Arbitrum)
   */
  const addNativeTokenIfMissing = useCallback((tokens: EnhancedToken[]): EnhancedToken[] => {
    // Check if native token is already present
    const hasNativeToken = tokens.some(token =>
      token.address === '0x0000000000000000000000000000000000000000' ||
      token.isNative
    );

    if (!hasNativeToken) {
      let nativeToken: EnhancedToken | null = null;

      // Define native tokens for each supported chain
      switch (chainId) {
        case 3888: // KalyChain
          nativeToken = {
            chainId: 3888,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            name: 'KalyCoin',
            symbol: 'KLC',
            logoURI: '/tokens/klc.png',
            isNative: true
          };
          break;

        case 56: // BSC
          nativeToken = {
            chainId: 56,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            name: 'BNB',
            symbol: 'BNB',
            logoURI: '/tokens/bnb.png',
            isNative: true
          };
          break;

        case 42161: // Arbitrum
          nativeToken = {
            chainId: 42161,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            name: 'Ethereum',
            symbol: 'ETH',
            logoURI: '/tokens/eth.png',
            isNative: true
          };
          break;

        default:
          console.log(`⚠️ No native token defined for chain ${chainId}`);
          break;
      }

      if (nativeToken) {
        console.log(`✅ Adding native token ${nativeToken.symbol} for chain ${chainId}`);
        return [nativeToken, ...tokens];
      }
    }

    return tokens;
  }, [chainId]);

  /**
   * Main token fetching function
   */
  const fetchTokens = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      console.log(`🚀 Loading tokens for chain ${chainId}`);

      let tokenListTokens: Token[];

      // For KalyChain, use local token list directly (no network calls needed)
      if (chainId === 3888) {
        tokenListTokens = [...KALYCHAIN_TOKENS];
        console.log(`📋 Using local KalyChain token list: ${tokenListTokens.length} tokens`);
      } else {
        // For other chains, fetch from external sources
        tokenListTokens = await tokenListService.getTokensForChain(chainId);

        // For BSC, ensure BUSD is included (it was deprecated but still has liquidity)
        if (chainId === 56) {
          const hasBUSD = tokenListTokens.some(t => t.symbol === 'BUSD');
          if (!hasBUSD) {
            console.log('⚠️ BUSD not in token list, adding manually');
            tokenListTokens.push({
              chainId: 56,
              address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
              decimals: 18,
              name: 'BUSD Token',
              symbol: 'BUSD',
              logoURI: '/tokens/busd.png'
            });
          }
        }
      }

      // Skip subgraph tokens for now due to GraphQL schema mismatch
      const subgraphTokens: EnhancedToken[] = [];

      // Merge token lists with subgraph data
      let allTokens = mergeTokenLists(tokenListTokens, subgraphTokens);

      // Add native token if missing
      allTokens = addNativeTokenIfMissing(allTokens);

      console.log(`✅ Successfully loaded ${allTokens.length} tokens for chain ${chainId}`);
      setTokens(allTokens);

    } catch (err) {
      console.error('❌ Error loading tokens:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tokens');

      // Fallback: use local tokens for KalyChain, or try service for other chains
      try {
        let fallbackTokens: Token[];
        if (chainId === 3888) {
          fallbackTokens = [...KALYCHAIN_TOKENS];
          console.log(`⚠️ Using local KalyChain tokens as fallback: ${fallbackTokens.length} tokens`);
        } else {
          fallbackTokens = await tokenListService.getTokensForChain(chainId);
        }

        const enhancedFallbackTokens = fallbackTokens.map(token => ({
          ...token,
          tradeVolumeUSD: undefined,
          totalLiquidity: undefined,
          derivedKLC: undefined,
          txCount: undefined,
          priceUSD: undefined
        }));

        setTokens(addNativeTokenIfMissing(enhancedFallbackTokens));
        console.log(`⚠️ Using fallback tokens: ${enhancedFallbackTokens.length} tokens loaded`);
      } catch (fallbackErr) {
        console.error('❌ Fallback token loading also failed:', fallbackErr);
        setTokens([]);
      }
    } finally {
      setLoading(false);
    }
  }, [chainId, fetchTokensFromSubgraph, mergeTokenLists, addNativeTokenIfMissing]);

  // Load tokens when chain changes
  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Utility functions - maintain compatibility with existing useTokens interface
  const getTokenByAddress = useCallback((address: string): EnhancedToken | undefined => {
    return tokens.find(token =>
      token.address.toLowerCase() === address.toLowerCase()
    );
  }, [tokens]);

  const getTokenBySymbol = useCallback((symbol: string): EnhancedToken | undefined => {
    return tokens.find(token =>
      token.symbol.toLowerCase() === symbol.toLowerCase()
    );
  }, [tokens]);

  const searchTokens = useCallback((query: string): EnhancedToken[] => {
    if (!query.trim()) return tokens;
    
    const lowerQuery = query.toLowerCase();
    return tokens.filter(token =>
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.name.toLowerCase().includes(lowerQuery) ||
      token.address.toLowerCase().includes(lowerQuery)
    );
  }, [tokens]);

  const getTokenWithMetadata = useCallback((address: string): EnhancedToken | undefined => {
    return getTokenByAddress(address);
  }, [getTokenByAddress]);

  const getTopTokensByVolume = useCallback((limit: number = 10): EnhancedToken[] => {
    return tokens
      .filter(token => token.tradeVolumeUSD && parseFloat(token.tradeVolumeUSD) > 0)
      .sort((a, b) => parseFloat(b.tradeVolumeUSD || '0') - parseFloat(a.tradeVolumeUSD || '0'))
      .slice(0, limit);
  }, [tokens]);

  return {
    tokens,
    loading,
    error,
    refetch: fetchTokens,
    getTokenByAddress,
    getTokenBySymbol,
    searchTokens,
    getTokenWithMetadata,
    getTopTokensByVolume
  };
}
