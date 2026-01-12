'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getPairMarketStats } from '@/lib/subgraph-client';
import { usePriceDataContext } from '@/contexts/PriceDataContext';
import { fetchGraphQL, safeApiCall, isNetworkError } from '@/utils/networkUtils';

interface Token {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  isNative?: boolean;
  name: string;
  logoURI: string;
}

interface PairMarketStats {
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  pairAddress: string | null;
  isLoading: boolean;
  error: string | null;
}

// WKLC address for native KLC conversion
const WKLC_ADDRESS = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3';

/**
 * Hook to get market stats for a specific trading pair
 * Industry standard: Always shows the same price/stats regardless of token order
 */
export function usePairMarketStats(tokenA?: Token, tokenB?: Token): PairMarketStats {
  const [price, setPrice] = useState<number>(0);
  const [volume24h, setVolume24h] = useState<number>(0);
  const [liquidity, setLiquidity] = useState<number>(0);
  const [pairAddress, setPairAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Use shared price change from context
  const { priceChange24h } = usePriceDataContext();

  // Normalize token order to ensure consistent stats regardless of swap direction
  // This ensures KLC/USDT and USDT/KLC show the same price/volume/liquidity
  // IMPORTANT: Stablecoins should always be normalizedTokenB (quote token)
  // so price shows "stablecoin per token" = USD price of the token
  const [normalizedTokenA, normalizedTokenB] = useMemo(() => {
    if (!tokenA || !tokenB) return [tokenA, tokenB];

    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'KUSD'];
    const isTokenAStable = stablecoins.includes(tokenA.symbol);
    const isTokenBStable = stablecoins.includes(tokenB.symbol);

    // If tokenA is a stablecoin and tokenB is not, swap them
    // so the stablecoin is always the quote (normalizedTokenB)
    if (isTokenAStable && !isTokenBStable) {
      return [tokenB, tokenA];
    }
    // If tokenB is a stablecoin and tokenA is not, keep order
    if (isTokenBStable && !isTokenAStable) {
      return [tokenA, tokenB];
    }

    // If both or neither are stablecoins, sort by address for consistency
    const addrA = tokenA.address.toLowerCase();
    const addrB = tokenB.address.toLowerCase();
    return addrA < addrB ? [tokenA, tokenB] : [tokenB, tokenA];
  }, [tokenA?.address, tokenA?.symbol, tokenB?.address, tokenB?.symbol]);

  // Convert native KLC to WKLC address
  const getTokenAddress = useCallback((token: Token): string => {
    if (token.isNative || token.address === '0x0000000000000000000000000000000000000000') {
      return WKLC_ADDRESS;
    }
    return token.address;
  }, []);

  // Dynamic pair lookup - no hardcoding!
  const findPairAddress = useCallback(async (tokenA: Token, tokenB: Token): Promise<string> => {
    const addressA = getTokenAddress(tokenA).toLowerCase();
    const addressB = getTokenAddress(tokenB).toLowerCase();

    console.log(`🔍 Looking for pair: ${tokenA.symbol}/${tokenB.symbol} (${addressA}/${addressB})`);

    try {
      // Get all pairs and find the one that matches our tokens
      const { getPairsData } = await import('@/lib/subgraph-client');
      const pairs = await getPairsData(100, 'txCount', 'desc'); // Get many pairs to ensure we find it

      const matchingPair = pairs.find((pair: any) => {
        const token0Addr = pair.token0.id.toLowerCase();
        const token1Addr = pair.token1.id.toLowerCase();

        return (token0Addr === addressA && token1Addr === addressB) ||
               (token0Addr === addressB && token1Addr === addressA);
      });

      if (matchingPair) {
        console.log(`✅ Found pair: ${tokenA.symbol}/${tokenB.symbol} at ${matchingPair.id}`);
        return matchingPair.id;
      }

      console.log(`❌ No pair found for ${tokenA.symbol}/${tokenB.symbol}`);
      return '';
    } catch (error) {
      console.error('Error finding pair:', error);
      return '';
    }
  }, [getTokenAddress]);

  // Fetch market stats from GeckoTerminal for BSC and Arbitrum
  const fetchGeckoTerminalStats = useCallback(async (
    chainId: number,
    tokenA: Token,
    tokenB: Token
  ) => {
    try {
      console.log(`🦎 Fetching GeckoTerminal stats for ${tokenA.symbol}/${tokenB.symbol} on chain ${chainId}`);

      // Import GeckoTerminal client functions
      const { findPoolAddress: findGeckoPool, getPoolInfo } = await import('@/lib/geckoterminal-client');

      // Find the pool address
      const poolAddress = await findGeckoPool(chainId, tokenA, tokenB);

      if (!poolAddress) {
        console.log(`⚠️ No GeckoTerminal pool found for ${tokenA.symbol}/${tokenB.symbol} - pair may not have liquidity`);
        // Reset stats to zero instead of showing error
        setPrice(0);
        setVolume24h(0);
        setLiquidity(0);
        setPairAddress(null);
        setIsLoading(false);
        return;
      }

      setPairAddress(poolAddress);
      console.log(`✅ Found GeckoTerminal pool: ${poolAddress}`);

      // Get pool info with market stats
      const poolInfo = await getPoolInfo(chainId, poolAddress);

      if (!poolInfo?.attributes) {
        console.warn('⚠️ No pool attributes found - pool may not be indexed yet');
        // Reset stats to zero instead of showing error
        setPrice(0);
        setVolume24h(0);
        setLiquidity(0);
        setIsLoading(false);
        return;
      }

      const attrs = poolInfo.attributes;

      // Get base and quote token addresses from pool
      const poolBaseToken = poolInfo.relationships?.base_token?.data?.id?.split('_')[1]?.toLowerCase();
      const poolQuoteToken = poolInfo.relationships?.quote_token?.data?.id?.split('_')[1]?.toLowerCase();

      // GeckoTerminal provides:
      // - base_token_price_usd: BASE token price in USD
      // - base_token_price_quote_currency: BASE token price in QUOTE token terms
      // - base_token_price_native_currency: BASE token price in native token
      const baseTokenPriceUsd = parseFloat(attrs.base_token_price_usd || '0');
      const baseTokenPriceInQuote = parseFloat(attrs.base_token_price_quote_currency || '0');

      console.log('🔍 GeckoTerminal pool structure:', {
        userPair: `${tokenA.symbol}/${tokenB.symbol}`,
        poolBase: poolBaseToken,
        poolQuote: poolQuoteToken,
        baseTokenPriceUsd,
        baseTokenPriceInQuote,
        allAttributes: Object.keys(attrs)
      });

      // For market stats display, we want to show the price in USD terms
      // Use the base token's USD price directly
      const currentPrice = baseTokenPriceUsd;

      const priceChange = parseFloat(attrs.price_change_percentage?.h24 || '0');
      const volume = parseFloat(attrs.volume_usd?.h24 || '0');
      const tvl = parseFloat(attrs.reserve_in_usd || '0');

      console.log(`📊 GeckoTerminal Market Stats for ${tokenA.symbol}/${tokenB.symbol}:`, {
        price: `$${currentPrice.toFixed(2)}`,
        priceChange24h: `${priceChange.toFixed(2)}%`,
        volume24h: `$${volume.toLocaleString()}`,
        liquidity: `$${tvl.toLocaleString()}`
      });

      // Update state
      setPrice(currentPrice);
      setVolume24h(volume);
      setLiquidity(tvl);
      // Note: priceChange24h comes from context, set by TradingChart

      setIsLoading(false);
    } catch (error) {
      // Only log actual errors, not 404s (missing pools are expected)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('404')) {
        console.error('❌ Error fetching GeckoTerminal stats:', error);
        setError('Failed to fetch market stats');
      } else {
        console.log(`⚠️ Pool not found on GeckoTerminal for ${tokenA.symbol}/${tokenB.symbol}`);
      }

      // Reset stats to zero
      setPrice(0);
      setVolume24h(0);
      setLiquidity(0);
      setPairAddress(null);
      setIsLoading(false);
    }
  }, []);

  const fetchPairStats = useCallback(async () => {
    if (!normalizedTokenA || !normalizedTokenB) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Determine chainId from tokens for multichain support
      const chainId = normalizedTokenA.chainId || normalizedTokenB.chainId || 3888;

      console.log(`📊 Fetching pair stats (normalized order) for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol} on chain ${chainId}`);

      // For BSC and Arbitrum, use GeckoTerminal API
      if (chainId === 56 || chainId === 42161) {
        await fetchGeckoTerminalStats(chainId, normalizedTokenA, normalizedTokenB);
        return;
      }

      // For KalyChain, use subgraph (existing logic)
      // Use normalized tokens for consistent pair lookup
      const foundPairAddress = await findPairAddress(normalizedTokenA, normalizedTokenB);

      if (!foundPairAddress) {
        console.log(`⚠️ No pair found for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol} - this is normal for tokens without liquidity`);
        setIsLoading(false);
        return; // Exit gracefully instead of throwing error
      }

      setPairAddress(foundPairAddress);

      console.log(`📊 Fetching KalyChain pair stats for ${normalizedTokenA.symbol}/${normalizedTokenB.symbol} (${foundPairAddress})`);

      const stats = await getPairMarketStats(foundPairAddress, chainId);

      if (!stats) {
        throw new Error('Failed to fetch pair stats');
      }

      // Get real 24hr volume using the same method as admin panel
      let real24hrVolume = 0;

      // Get KLC price from DEX data (ONLY for KalyChain)
      let klcPriceUSD = 0.0003; // Default fallback price for KalyChain

      // Only calculate KLC price for KalyChain (chainId 3888)
      if (chainId === 3888) {
        try {
          // Calculate KLC price from WKLC/USDT pair reserves
          const reserve0 = parseFloat(stats.pair.reserve0);
          const reserve1 = parseFloat(stats.pair.reserve1);

          if (reserve0 > 0 && reserve1 > 0) {
            // Check if this is the WKLC/USDT pair we can use for KLC pricing
            const isWklcUsdtPair = (stats.pair.token0.symbol === 'WKLC' && stats.pair.token1.symbol === 'USDT') ||
                                   (stats.pair.token0.symbol === 'USDT' && stats.pair.token1.symbol === 'WKLC');

            if (isWklcUsdtPair) {
              // Calculate KLC price from this pair's reserves
              if (stats.pair.token0.symbol === 'WKLC') {
                klcPriceUSD = reserve1 / reserve0; // USDT per WKLC
              } else {
                klcPriceUSD = reserve0 / reserve1; // USDT per WKLC
              }
              console.log(`📊 Using KLC price from DEX reserves: $${klcPriceUSD.toFixed(6)}`);
            }
          }

          // Sanity check for reasonable KLC price range
          if (klcPriceUSD < 0.0001 || klcPriceUSD > 0.01) {
            console.warn(`KLC price ${klcPriceUSD} outside reasonable range, using fallback`);
            klcPriceUSD = 0.0003;
          }

        } catch (priceError) {
          console.warn('Failed to calculate KLC price from DEX, using fallback:', priceError);
          klcPriceUSD = 0.0003; // Use fallback price
        }
      }

      // Get volume data - only use backend GraphQL for KalyChain
      if (chainId === 3888) {
        try {
          // Query the backend for real 24hr volume using the same method as admin
          // Use the actual token symbols from the pair data, not the input tokens
          const token0Symbol = stats.pair.token0.symbol;
          const token1Symbol = stats.pair.token1.symbol;

          console.log(`🔍 KalyChain: Using pair token symbols: ${token0Symbol}/${token1Symbol} for volume calculation`);

          // Backend GraphQL call with proper error handling
          const volumeData = await fetchGraphQL<any>(
            'https://app.kalyswap.io/api/graphql',
            `
              query GetPairVolume($pairs: [PairInput!]!, $klcPriceUSD: Float!) {
                multiplePairs24hrVolume(pairs: $pairs, klcPriceUSD: $klcPriceUSD) {
                  pairAddress
                  token0Symbol
                  token1Symbol
                  volume24hrUSD
                  swapCount
                }
              }
            `,
            {
              pairs: [{
                address: foundPairAddress.toLowerCase(),
                token0Symbol: token0Symbol,
                token1Symbol: token1Symbol
              }],
              klcPriceUSD: klcPriceUSD
            },
            { timeout: 8000, retries: 1 }
          );

          const pairVolumeData = volumeData?.multiplePairs24hrVolume?.[0];

          if (pairVolumeData) {
            real24hrVolume = parseFloat(pairVolumeData.volume24hrUSD) || 0;
            console.log(`✅ Real 24hr volume for ${tokenA?.symbol}/${tokenB?.symbol}: $${real24hrVolume.toFixed(2)}`);
          }
        } catch (volumeError) {
          console.error('Failed to fetch real 24hr volume from backend:', volumeError);

          // Handle network errors gracefully
          if (isNetworkError(volumeError)) {
            console.warn('Network error fetching volume, using fallback');
          }

          // Fallback to subgraph volume if available
          real24hrVolume = stats.volume24h || 0;
        }
      } else {
        // For non-KalyChain networks, use GeckoTerminal volume data
        console.log(`🦎 Using GeckoTerminal volume for chain ${chainId}`);
        // Volume will be fetched from GeckoTerminal in the chart component
        // For now, use subgraph volume as fallback
        real24hrVolume = stats.volume24h || 0;
      }

      // Calculate price from reserves using NORMALIZED tokens for consistency
      const reserve0 = parseFloat(stats.pair.reserve0);
      const reserve1 = parseFloat(stats.pair.reserve1);

      let calculatedPrice = 0;
      if (reserve0 > 0 && reserve1 > 0) {
        // Use normalized tokens to ensure consistent price calculation
        const token0Address = getTokenAddress(normalizedTokenA);
        const token1Address = getTokenAddress(normalizedTokenB);

        if (stats.pair.token0.id.toLowerCase() === token0Address.toLowerCase()) {
          // normalizedTokenA is token0, normalizedTokenB is token1
          calculatedPrice = reserve1 / reserve0; // normalizedTokenB per normalizedTokenA
        } else {
          // normalizedTokenA is token1, normalizedTokenB is token0
          calculatedPrice = reserve0 / reserve1; // normalizedTokenB per normalizedTokenA
        }

        console.log(`💰 Price calculation (normalized):`, {
          displayPair: tokenA && tokenB ? `${tokenA.symbol}/${tokenB.symbol}` : 'unknown',
          normalizedPair: `${normalizedTokenA.symbol}/${normalizedTokenB.symbol}`,
          token0: stats.pair.token0.symbol,
          token1: stats.pair.token1.symbol,
          reserve0,
          reserve1,
          calculatedPrice: calculatedPrice.toFixed(8)
        });
      }

      setPrice(calculatedPrice);

      // Price change is now handled by the shared context from TradingChart
      // No need to calculate it here anymore
      setVolume24h(real24hrVolume); // Use real 24hr volume instead of subgraph volume

      // Calculate liquidity manually since reserveUSD might be 0
      let calculatedLiquidity = 0;

      // Find which reserve corresponds to stablecoins
      // For KalyChain: USDT, USDC, DAI
      // For other chains: dynamically detect any stablecoin (USDT, USDC, DAI, BUSD, etc.)
      const stablecoins = chainId === 3888
        ? ['USDT', 'USDC', 'DAI']
        : ['USDT', 'USDC', 'DAI', 'BUSD', 'USDC.e', 'USDbC'];
      let stablecoinReserve = 0;

      if (stablecoins.includes(stats.pair.token0.symbol)) {
        // token0 is the stablecoin
        stablecoinReserve = reserve0;
        calculatedLiquidity = stablecoinReserve * 2;
      } else if (stablecoins.includes(stats.pair.token1.symbol)) {
        // token1 is the stablecoin
        stablecoinReserve = reserve1;
        calculatedLiquidity = stablecoinReserve * 2;
      } else {
        // No stablecoin found, use reserveUSD or try to calculate based on known prices
        calculatedLiquidity = parseFloat(stats.pair.reserveUSD || '0');

        // If reserveUSD is 0 or not available, try to calculate using known token prices
        if (calculatedLiquidity === 0) {
          // For now, we'll show 'N/A' for non-stablecoin pairs without proper USD pricing
          // TODO: Implement price calculation using token price feeds or routing through stablecoin pairs
          calculatedLiquidity = 0;
        }
      }
      
      setLiquidity(calculatedLiquidity);

      console.log(`✅ Pair stats updated (normalized):`, {
        displayPair: tokenA && tokenB ? `${tokenA.symbol}/${tokenB.symbol}` : 'unknown',
        normalizedPair: `${normalizedTokenA.symbol}/${normalizedTokenB.symbol}`,
        price: calculatedPrice,
        volume24h: real24hrVolume,
        liquidity: calculatedLiquidity
      });

    } catch (err) {
      console.error('❌ Error fetching pair stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pair stats');

      // Reset to default values
      setPrice(0);
      setVolume24h(0);
      setLiquidity(0);
    } finally {
      setIsLoading(false);
    }
  }, [normalizedTokenA, normalizedTokenB, findPairAddress, getTokenAddress]); // Only normalized tokens

  // Fetch stats when tokens change
  useEffect(() => {
    fetchPairStats();
  }, [fetchPairStats]);

  return {
    price,
    priceChange24h,
    volume24h,
    liquidity,
    pairAddress,
    isLoading,
    error
  };
}
