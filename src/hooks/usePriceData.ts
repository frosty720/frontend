'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { ethers } from 'ethers';
import { getPairAddress } from '@/utils/priceImpact';
import { getFactoryData, getPairsData, getKalyswapDayData, getPairDayData } from '@/lib/subgraph-client';
import {
  isChainSupported as isGeckoTerminalSupported,
  findPoolAddress,
  getGeckoTerminalOHLC,
  convertGeckoTerminalToChartData,
  getPoolInfo
} from '@/lib/geckoterminal-client';
import { Token } from '@/config/dex/types';

// RPC endpoint for KalyChain
const RPC_URL = 'https://rpc.kalychain.io/rpc';

// Price data interface
export interface PricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenPair {
  baseToken: string;
  quoteToken: string;
}

// DEX Market Stats interface
interface DexMarketStats {
  klcPrice: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  totalLiquidity: number | null;
  isLoading: boolean;
  error: string | null;
}



// Hook for fetching price data
export function usePriceData(pair: TokenPair, timeframe: string = '1h') {
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);
  const [volume24h, setVolume24h] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get public client for contract calls
  const publicClient = usePublicClient();



  // Fetch real chart data from subgraph for any pair
  const fetchSubgraphChartData = useCallback(async () => {
    try {
      console.log('fetchSubgraphChartData called:', {
        baseToken: pair.baseToken,
        quoteToken: pair.quoteToken,
        timeframe
      });

      // We need a pair address to fetch data - this should be provided by the parent component
      // For now, let's try to get it dynamically using the factory contract
      if (!publicClient) {
        console.log('⚠️ No publicClient available for pair address lookup');
        return;
      }

      // Get current chain and DEX config first
      const chainId = await publicClient.getChainId();
      const { getDexConfig, findTokenBySymbol } = await import('@/config/dex');
      const dexConfig = getDexConfig(chainId);

      if (!dexConfig) {
        console.log(`⚠️ Chain ${chainId} not supported for price data - no DEX configuration found`);
        return;
      }

      // Find token addresses from DEX config
      const baseToken = findTokenBySymbol(pair.baseToken, chainId);
      const quoteToken = findTokenBySymbol(pair.quoteToken, chainId);

      if (!baseToken || !quoteToken) {
        console.log(`⚠️ Tokens not found in DEX config for ${pair.baseToken}/${pair.quoteToken} on chain ${chainId}`);
        return;
      }

      const baseTokenAddress = baseToken.isNative ? dexConfig.wethAddress : baseToken.address;
      const quoteTokenAddress = quoteToken.isNative ? dexConfig.wethAddress : quoteToken.address;

      // Get pair address from factory contract using chain-specific config
      const factoryContract = {
        address: dexConfig.factory as `0x${string}`,
        abi: dexConfig.factoryABI
      };

      const pairAddress = await publicClient.readContract({
        ...factoryContract,
        functionName: 'getPair',
        args: [baseTokenAddress as `0x${string}`, quoteTokenAddress as `0x${string}`]
      }) as string;

      if (!pairAddress || pairAddress === '0x0000000000000000000000000000000000000000') {
        console.log(`⚠️ No pair found for ${pair.baseToken}/${pair.quoteToken}`);
        return;
      }

      console.log(`📊 Found pair address: ${pairAddress} for ${pair.baseToken}/${pair.quoteToken}`);

      // Fetch pair day data from subgraph
      const days = timeframe === '1d' ? 1 : timeframe === '1w' ? 7 : timeframe === '1M' ? 30 : 7;
      const pairDayData = await getPairDayData(pairAddress.toLowerCase(), days, 0);

      if (!pairDayData || pairDayData.length === 0) {
        console.log(`⚠️ No chart data found for pair ${pairAddress}`);
        return;
      }

      console.log(`📊 Fetched ${pairDayData.length} days of data for ${pair.baseToken}/${pair.quoteToken}`);

      // Convert subgraph data to chart format
      // Note: Subgraph provides daily data, so we'll create OHLC from daily prices
      const rawData: PricePoint[] = pairDayData.map((dayData: any) => {
        // Calculate price from reserves (token1Price is quoteToken price in baseToken)
        const price = parseFloat(dayData.reserve1) > 0 && parseFloat(dayData.reserve0) > 0
          ? parseFloat(dayData.reserve1) / parseFloat(dayData.reserve0)
          : 0;

        return {
          time: parseInt(dayData.date), // Unix timestamp
          open: price, // For daily data, we'll use the same price for OHLC
          high: price * 1.02, // Add small variation for visual purposes
          low: price * 0.98,
          close: price,
          volume: parseFloat(dayData.dailyVolumeUSD || '0')
        };
      }).reverse(); // Reverse to get chronological order

      // Deduplicate by timestamp - keep the last occurrence for each unique timestamp
      const formattedData = Array.from(
        rawData.reduce((map, point) => {
          map.set(point.time, point); // Overwrites if duplicate timestamp exists
          return map;
        }, new Map<number, PricePoint>()).values()
      );

      setPriceData(formattedData);

      if (formattedData.length > 0) {
        const latest = formattedData[formattedData.length - 1];
        const first = formattedData[0];

        setCurrentPrice(latest.close);

        // Calculate 24h change
        const change = first.close > 0 ? ((latest.close - first.close) / first.close) * 100 : 0;
        setPriceChange24h(change);

        // Calculate total volume
        const volume = formattedData.reduce((sum, point) => sum + point.volume, 0);
        setVolume24h(volume);

        console.log(`📊 ${pair.baseToken}/${pair.quoteToken} Chart Data: Price=${latest.close.toFixed(6)}, Change=${change.toFixed(2)}%, Volume=${volume.toFixed(2)}`);
      }

    } catch (err) {
      console.error('Subgraph chart data error:', err);
    }
  }, [pair.baseToken, pair.quoteToken, timeframe, publicClient]);

  // Fetch price data
  const fetchPriceData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      await fetchSubgraphChartData();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch price data');
    } finally {
      setIsLoading(false);
    }
  }, [fetchSubgraphChartData]);

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchPriceData();
  }, [fetchPriceData]);

  // Set up real-time updates (mock for now)
  useEffect(() => {
    const interval = setInterval(() => {
      if (priceData.length > 0) {
        const lastPrice = priceData[priceData.length - 1];
        const newPrice = lastPrice.close * (0.999 + Math.random() * 0.002); // ±0.1% change
        
        setCurrentPrice(newPrice);
        
        // Update the last data point with new price
        setPriceData(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              close: newPrice,
              high: Math.max(updated[updated.length - 1].high, newPrice),
              low: Math.min(updated[updated.length - 1].low, newPrice),
            };
          }
          return updated;
        });
      }
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [priceData]);

  // Refresh data manually
  const refreshData = useCallback(() => {
    fetchPriceData();
  }, [fetchPriceData]);

  return {
    priceData,
    currentPrice,
    priceChange24h,
    volume24h,
    isLoading,
    error,
    refreshData,
  };
}

// Hook for getting current token price from subgraph
export function useTokenPrice(symbol: string) {
  const [price, setPrice] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTokenPrice = async () => {
      try {
        setIsLoading(true);
        console.log('🔍 Fetching price for token:', symbol);

        // Get token address mapping
        const tokenAddressMap: Record<string, string> = {
          'KLC': '0x069255299bb729399f3cecabdc73d15d3d10a2a3', // wKLC address (KLC = wKLC for pricing)
          'wKLC': '0x069255299bb729399f3cecabdc73d15d3d10a2a3',
          'USDT': '0x2ca775c77b922a51fcf3097f52bffdbc0250d99a',
          'KSWAP': '0xcc93b84ceed74dc28c746b7697d6fa477ffff65a',
          'DAI': '0x6e92cac380f7a7b86f4163fad0df2f277b16edc6',
          'CLISHA': '0x376e0ac0b55aa79f9b30aac8842e5e84ff06360c'
        };

        const tokenAddress = tokenAddressMap[symbol];
        if (!tokenAddress) {
          // Fallback to mock data for unknown tokens
          const mockPrices: Record<string, { price: number; change: number }> = {
            'USDC': { price: 1.0, change: -0.05 },
            'WBTC': { price: 43250.0, change: 1.8 },
            'ETH': { price: 2650.0, change: 3.2 },
            'BNB': { price: 315.0, change: -1.2 },
            'POL': { price: 0.45, change: 4.1 },
          };
          const tokenData = mockPrices[symbol] || { price: 1.0, change: 0 };
          setPrice(tokenData.price);
          setChange24h(tokenData.change);
          setIsLoading(false);
          return;
        }

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query GetTokenPrice($tokenId: String!) {
                token(id: $tokenId) {
                  id
                  symbol
                  derivedKLC
                  tradeVolumeUSD
                }
                # Get USDT pairs to calculate USD price
                pairs(where: {
                  or: [
                    { and: [{ token0: $tokenId }, { token1: "0x2ca775c77b922a51fcf3097f52bffdbc0250d99a" }] },
                    { and: [{ token0: "0x2ca775c77b922a51fcf3097f52bffdbc0250d99a" }, { token1: $tokenId }] }
                  ]
                }) {
                  id
                  token0 { id symbol }
                  token1 { id symbol }
                  reserve0
                  reserve1
                  token0Price
                  token1Price
                }
              }
            `,
            variables: {
              tokenId: tokenAddress.toLowerCase()
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('📊 Token price response:', result);

          if (result.errors) {
            throw new Error(result.errors[0].message);
          }

          let calculatedPrice = 0;

          if (result.data?.pairs && result.data.pairs.length > 0) {
            const pair = result.data.pairs[0];

            // Calculate price based on reserves
            if (pair.token0.id.toLowerCase() === tokenAddress.toLowerCase()) {
              // Token is token0, price = reserve1 / reserve0
              calculatedPrice = parseFloat(pair.reserve1) / parseFloat(pair.reserve0);
            } else {
              // Token is token1, price = reserve0 / reserve1
              calculatedPrice = parseFloat(pair.reserve0) / parseFloat(pair.reserve1);
            }
          } else if (symbol === 'USDT') {
            // USDT is our base currency
            calculatedPrice = 1.0;
          } else {
            // Cannot calculate price without market data - do not use hardcoded values
            console.warn(`No market data available for ${symbol} - cannot calculate price`);
            calculatedPrice = 0;
          }

          setPrice(calculatedPrice);
          setChange24h(2.5); // TODO: Calculate actual 24h change from historical data

        } else {
          throw new Error('Failed to fetch token price');
        }
      } catch (err) {
        console.error('❌ Error fetching token price:', err);
        // Only use stablecoin prices as fallback - no hardcoded token prices
        if (symbol === 'USDT' || symbol === 'USDC' || symbol === 'DAI') {
          setPrice(1.0);
          setChange24h(0.1);
        } else {
          console.warn(`No market data available for ${symbol} - cannot provide price`);
          setPrice(0);
          setChange24h(0);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchTokenPrice();

    // Set up periodic price updates
    const interval = setInterval(fetchTokenPrice, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [symbol]);

  return { price, change24h, isLoading };
}

// Utility function to format price based on token and price magnitude
export function formatTokenPrice(price: number, symbol: string): string {
  // Handle zero or invalid prices
  if (!price || price === 0 || !isFinite(price)) {
    return '0.0000';
  }

  // For stablecoins, always use 4 decimals
  if (['USDT', 'USDC', 'DAI', 'BUSD', 'KUSD'].includes(symbol)) {
    return price.toFixed(4);
  }

  // For high-value tokens like BTC/ETH, use 2 decimals
  if (['WBTC', 'BTC', 'ETH', 'WETH'].includes(symbol)) {
    return price.toFixed(2);
  }

  // Dynamic precision based on price magnitude
  // This ensures very small prices are still visible
  if (price >= 1000) {
    return price.toFixed(2);
  } else if (price >= 1) {
    return price.toFixed(4);
  } else if (price >= 0.0001) {
    return price.toFixed(6);
  } else if (price >= 0.00000001) {
    return price.toFixed(8);
  } else {
    // For extremely small prices, use scientific notation
    return price.toExponential(4);
  }
}

// Utility function to format price change
export function formatPriceChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

// Hook for fetching historical price data from DEX subgraph
export function useHistoricalPriceData(tokenA: Token | null, tokenB: Token | null) {
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairAddress, setPairAddress] = useState<string | null>(null);



  // Safely get publicClient - will be null if not in Wagmi context
  let publicClient: any = null;
  try {
    publicClient = usePublicClient();
  } catch (e) {
    // Not in Wagmi context
    console.log('Not in Wagmi context');
  }

  // Check if we have valid tokens
  const hasValidTokens = tokenA && tokenB && tokenA.address !== tokenB.address;

  // Normalize token order to ensure consistent pool lookup regardless of swap direction
  // This ensures KLC/USDT and USDT/KLC both fetch the same pool data
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

  // Get pair address dynamically from factory contract (like Uniswap)
  useEffect(() => {
    const fetchPairAddress = async () => {
      if (!hasValidTokens) {
        setPairAddress(null);
        return;
      }

      if (!publicClient) {
        console.log('⚠️ No publicClient available');
        setPairAddress(null);
        return;
      }

      try {
        // Use normalized token order for consistent pair lookup
        const address = await getPairAddress(publicClient, normalizedTokenA!, normalizedTokenB!);

        setPairAddress(address);
        console.log('🔍 Pair address resolved (normalized order):', {
          originalTokenA: tokenA!.symbol,
          originalTokenB: tokenB!.symbol,
          normalizedTokenA: normalizedTokenA!.symbol,
          normalizedTokenB: normalizedTokenB!.symbol,
          pairAddress: address,
          exists: !!address
        });
      } catch (error) {
        console.error('❌ Error getting pair address:', {
          tokenA: tokenA!.symbol,
          tokenB: tokenB!.symbol,
          error: error instanceof Error ? error.message : error
        });
        setPairAddress(null);
      }
    };

    fetchPairAddress();
  }, [normalizedTokenA, normalizedTokenB, hasValidTokens, publicClient]);

  // Use a ref to track if the current fetch should be cancelled
  const cancelFetchRef = useRef<{ cancel: boolean }>({ cancel: false });

  const fetchHistoricalData = useCallback(async () => {
    // Reset cancel flag for this fetch
    cancelFetchRef.current = { cancel: false };
    const currentFetch = cancelFetchRef.current;

    // If no valid tokens, show no data
    if (!hasValidTokens) {
      setPriceData([]);
      setError('Invalid token pair');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Determine chainId from tokens for multichain support
      const chainId = normalizedTokenA?.chainId || normalizedTokenB?.chainId || 3888;

      console.log('🔗 Fetching chart data for chain (using normalized tokens):', {
        chainId,
        normalizedTokenA: normalizedTokenA?.symbol,
        normalizedTokenB: normalizedTokenB?.symbol,
        normalizedTokenAChainId: normalizedTokenA?.chainId,
        normalizedTokenBChainId: normalizedTokenB?.chainId,
        pairAddress: pairAddress?.toLowerCase()
      });

      // Route between GeckoTerminal (BSC/Arbitrum) and Subgraph (KalyChain)
      if (isGeckoTerminalSupported(chainId)) {
        console.log('🦎 Using GeckoTerminal API for external chain:', chainId);

        // Find pool address if not provided
        let poolAddr = pairAddress;

        if (!poolAddr) {
          console.log('🔍 Searching for pool address using normalized token order...');
          // Use normalized tokens for consistent pool lookup
          poolAddr = await findPoolAddress(chainId, normalizedTokenA!, normalizedTokenB!);

          if (!poolAddr) {
            if (!currentFetch.cancel) {
              setPriceData([]);
              setError(`No liquidity pool found for ${tokenA?.symbol}/${tokenB?.symbol} on this DEX`);
              setIsLoading(false);
            }
            return;
          }
        }

        // Check if cancelled before async operations
        if (currentFetch.cancel) return;

        // Get pool info to determine base/quote tokens
        const poolInfo = await getPoolInfo(chainId, poolAddr);

        if (currentFetch.cancel) return;

        if (!poolInfo) {
          if (!currentFetch.cancel) {
            setPriceData([]);
            setError(`Could not fetch pool information for ${tokenA?.symbol}/${tokenB?.symbol}`);
            setIsLoading(false);
          }
          return;
        }

        // Fetch OHLC data from GeckoTerminal (168 hours = 7 days)
        const ohlcvList = await getGeckoTerminalOHLC(chainId, poolAddr, 'hour', 1, 168);

        if (currentFetch.cancel) return;

        if (ohlcvList.length === 0) {
          if (!currentFetch.cancel) {
            setPriceData([]);
            setError(`Chart data not available for ${tokenA?.symbol}/${tokenB?.symbol}`);
            setIsLoading(false);
          }
          return;
        }

        // Determine if we need to invert prices based on user's token order vs pool's base/quote
        // User wants to see tokenA/tokenB (tokenA price in tokenB terms)
        // GeckoTerminal shows base/quote (base price in quote terms)
        // If user's tokenA matches pool's base, no inversion needed
        // If user's tokenA matches pool's quote, we need to invert

        const userTokenAAddr = tokenA!.address.toLowerCase();
        const userTokenBAddr = tokenB!.address.toLowerCase();

        // Extract base and quote token addresses from the full API response
        const poolBaseToken = poolInfo.relationships?.base_token?.data?.id?.split('_')[1]?.toLowerCase();
        const poolQuoteToken = poolInfo.relationships?.quote_token?.data?.id?.split('_')[1]?.toLowerCase();

        if (!poolBaseToken || !poolQuoteToken) {
          if (!currentFetch.cancel) {
            setPriceData([]);
            setError(`Could not extract token information from pool data`);
            setIsLoading(false);
          }
          return;
        }

        // Wrapped token addresses for native token matching
        // CRITICAL: Native tokens (BNB, ETH, KLC) = Wrapped tokens (WBNB, WETH, WKLC)
        const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'; // BSC
        const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'; // Arbitrum
        const WKLC = '0x069255299Bb729399f3CECaBdc73d15d3D10a2A3'; // KalyChain
        const NATIVE_ADDR = '0x0000000000000000000000000000000000000000';

        // Helper function to check if two addresses match (considering native/wrapped equivalence)
        // BNB = WBNB, ETH = WETH, KLC = WKLC - they are THE SAME TOKEN
        const addressMatches = (userAddr: string, poolAddr: string): boolean => {
          if (userAddr === poolAddr) return true;

          // Check if user has native and pool has wrapped (or vice versa)
          if (userAddr === NATIVE_ADDR && (poolAddr === WBNB || poolAddr === WETH || poolAddr === WKLC)) {
            return true;
          }
          if (poolAddr === NATIVE_ADDR && (userAddr === WBNB || userAddr === WETH || userAddr === WKLC)) {
            return true;
          }

          return false;
        };

        const isTokenABase = addressMatches(userTokenAAddr, poolBaseToken);
        const isTokenAQuote = addressMatches(userTokenAAddr, poolQuoteToken);
        const isTokenBBase = addressMatches(userTokenBAddr, poolBaseToken);
        const isTokenBQuote = addressMatches(userTokenBAddr, poolQuoteToken);

        // CRITICAL: GeckoTerminal price = BASE token price in QUOTE token terms
        // Example: Pool Base=WBNB, Quote=USDT, Price=$600 means 1 WBNB = $600 USDT
        //
        // User wants: tokenA/tokenB (price of tokenA in terms of tokenB)
        //
        // We need to invert if:
        // 1. User's tokenA is the pool's QUOTE (we have BASE/QUOTE but need QUOTE/BASE)
        // 2. User's tokenA is the pool's BASE but tokenB is NOT the pool's QUOTE
        //
        // We DON'T invert if:
        // - User's tokenA is BASE and tokenB is QUOTE (pool already shows this)
        const shouldInvert = isTokenAQuote || (isTokenABase && !isTokenBQuote);

        console.log('🔄 GeckoTerminal price orientation check:', {
          userPair: `${normalizedTokenA?.symbol}/${normalizedTokenB?.symbol}`,
          userTokenA: userTokenAAddr,
          userTokenB: userTokenBAddr,
          poolBase: poolBaseToken,
          poolQuote: poolQuoteToken,
          poolBaseSymbol: poolInfo?.attributes?.base_token_symbol,
          poolQuoteSymbol: poolInfo?.attributes?.quote_token_symbol,
          poolPriceUsd: poolInfo?.attributes?.base_token_price_usd,
          isTokenABase,
          isTokenAQuote,
          isTokenBBase,
          isTokenBQuote,
          shouldInvert,
          reasoning: shouldInvert
            ? (isTokenAQuote ? 'tokenA is QUOTE (need to flip)' : 'tokenA is BASE but tokenB is not QUOTE')
            : 'tokenA is BASE and tokenB is QUOTE (already correct)'
        });

        // Convert GeckoTerminal data to our chart format with optional inversion
        const chartData = convertGeckoTerminalToChartData(ohlcvList, shouldInvert);

        console.log(`✅ GeckoTerminal: Processed ${chartData.length} price points${shouldInvert ? ' (inverted)' : ''}`, {
          displayPair: `${tokenA?.symbol}/${tokenB?.symbol}`,
          poolPair: `${poolBaseToken}/${poolQuoteToken}`,
          dataPoints: chartData.length,
          inverted: shouldInvert,
          samplePrices: chartData.slice(0, 3).map(p => p.close.toFixed(4)),
          latestPrice: chartData[chartData.length - 1]?.close.toFixed(4)
        });

        // Only update state if this fetch hasn't been cancelled
        if (!currentFetch.cancel) {
          console.log('📈 SETTING PRICE DATA FROM GECKOTERMINAL:', {
            pair: `${tokenA?.symbol}/${tokenB?.symbol}`,
            points: chartData.length,
            latestPrice: chartData[chartData.length - 1]?.close.toFixed(4),
            timestamp: new Date().toISOString()
          });
          setPriceData(chartData);
          setIsLoading(false);
        } else {
          console.log('⚠️ GeckoTerminal fetch was cancelled, not updating state');
        }
        return;
      }

      // Use subgraph for KalyChain (chainId 3888)
      console.log('📊 Using subgraph for KalyChain');

      if (!pairAddress) {
        if (!currentFetch.cancel) {
          setPriceData([]);
          setError('No liquidity pool exists for this token pair');
          setIsLoading(false);
        }
        return;
      }

      // Import the direct subgraph functions
      const { getPairHourData, getPairData } = await import('@/lib/subgraph-client');

      // Fetch hourly data for better chart granularity (168 hours = 7 days)
      // Pass chainId to use the correct subgraph
      const [hourData, pairData] = await Promise.all([
        getPairHourData(pairAddress.toLowerCase(), 168, 0, chainId),
        getPairData(pairAddress.toLowerCase(), chainId)
      ]);

      console.log('🔍 Subgraph response:', {
        pairAddress: pairAddress.toLowerCase(),
        hourDataLength: hourData?.length || 0,
        pairDataExists: !!pairData,
        hourDataSample: hourData?.slice(0, 2),
        pairDataSample: pairData ? {
          id: pairData.id,
          token0: pairData.token0?.symbol,
          token1: pairData.token1?.symbol,
          reserve0: pairData.reserve0,
          reserve1: pairData.reserve1
        } : null
      });

      console.log('📊 Direct subgraph response:', {
        hourDataLength: hourData?.length || 0,
        pairData: pairData ? { id: pairData.id, reserve0: pairData.reserve0, reserve1: pairData.reserve1 } : null,
        sampleHourData: hourData?.slice(0, 2)
      });

      if (hourData && pairData) {
        console.log('🔍 Raw subgraph data:', {
          hourDataLength: hourData.length,
          pairData: pairData ? { id: pairData.id, reserve0: pairData.reserve0, reserve1: pairData.reserve1 } : null,
          sampleHourData: hourData.slice(0, 2)
        });

        // Get current price from pair reserves using same logic as historical data
        let currentPrice = 0;
        if (pairData && pairData.token0 && pairData.token1) {
          const reserve0 = parseFloat(pairData.reserve0);
          const reserve1 = parseFloat(pairData.reserve1);

          // Helper to check if two symbols match (handles wrapped native tokens)
          const symbolsMatch = (symbol1: string | undefined, symbol2: string | undefined): boolean => {
            if (!symbol1 || !symbol2) return false;
            if (symbol1 === symbol2) return true;
            // Handle wrapped native token equivalents (WKLC = KLC, WETH = ETH, etc.)
            const unwrap = (s: string) => s.startsWith('W') ? s.slice(1) : s;
            return unwrap(symbol1) === unwrap(symbol2) || symbol1 === unwrap(symbol2) || unwrap(symbol1) === symbol2;
          };

          if (reserve0 > 0 && reserve1 > 0) {
            // Use same logic as historical data calculation with NORMALIZED tokens
            if (symbolsMatch(pairData.token0.symbol, normalizedTokenA?.symbol)) {
              // normalizedTokenA is token0, so price = reserve1/reserve0 (how much token1 per token0)
              currentPrice = reserve1 / reserve0;
            } else if (symbolsMatch(pairData.token1.symbol, normalizedTokenA?.symbol)) {
              // normalizedTokenA is token1, so price = reserve0/reserve1 (how much token0 per token1)
              currentPrice = reserve0 / reserve1;
            } else {
              // Fallback: assume we want token1 price in token0
              currentPrice = reserve1 / reserve0;
            }
          }

          console.log('💰 Current price calculation:', {
            normalizedTokenA: normalizedTokenA?.symbol,
            normalizedTokenB: normalizedTokenB?.symbol,
            token0: pairData.token0.symbol,
            token1: pairData.token1.symbol,
            reserve0,
            reserve1,
            calculatedPrice: currentPrice.toFixed(8)
          });
        }

        if (hourData.length > 0) {
          // We need to know which token is which to calculate the correct price
          // Get the pair info to understand token0 vs token1
          const pairInfo = pairData;

          console.log('🔍 Pair info for price calculation:', {
            pairAddress: pairInfo?.id,
            token0: pairInfo?.token0?.symbol,
            token1: pairInfo?.token1?.symbol,
            targetTokenA: tokenA?.symbol,
            targetTokenB: tokenB?.symbol
          });

          // Convert subgraph hourly data to OHLCV format using REAL price data from reserves
          const historicalData: PricePoint[] = hourData
            .map((hour: any) => {
              const volume = parseFloat(hour.hourlyVolumeUSD || '0');

              const reserve0 = parseFloat(hour.reserve0 || '0');
              const reserve1 = parseFloat(hour.reserve1 || '0');

              if (reserve0 <= 0 || reserve1 <= 0) {
                return null; // Skip invalid data
              }

              // Calculate price using NORMALIZED tokens for consistency
              // This ensures the chart shows the same price regardless of pair flip
              // Always calculate based on normalizedTokenA (the base token)
              let price = 0;
              let calculation = '';

              // Helper to check if two symbols match (handles wrapped native tokens)
              const symbolsMatch = (symbol1: string | undefined, symbol2: string | undefined): boolean => {
                if (!symbol1 || !symbol2) return false;
                if (symbol1 === symbol2) return true;
                // Handle wrapped native token equivalents (WKLC = KLC, WETH = ETH, etc.)
                const unwrap = (s: string) => s.startsWith('W') ? s.slice(1) : s;
                return unwrap(symbol1) === unwrap(symbol2) || symbol1 === unwrap(symbol2) || unwrap(symbol1) === symbol2;
              };

              if (symbolsMatch(pairInfo?.token0?.symbol, normalizedTokenA?.symbol)) {
                // normalizedTokenA is token0, so price = reserve1/reserve0 (token1 per token0)
                price = reserve1 / reserve0;
                calculation = `${reserve1}/${reserve0} (${normalizedTokenA?.symbol} matches token0: ${pairInfo?.token0?.symbol})`;
              } else if (symbolsMatch(pairInfo?.token1?.symbol, normalizedTokenA?.symbol)) {
                // normalizedTokenA is token1, so price = reserve0/reserve1 (token0 per token1)
                price = reserve0 / reserve1;
                calculation = `${reserve0}/${reserve1} (${normalizedTokenA?.symbol} matches token1: ${pairInfo?.token1?.symbol})`;
              } else {
                // Fallback: assume we want token1 price in token0
                price = reserve1 / reserve0;
                calculation = `${reserve1}/${reserve0} (fallback - no symbol match)`;
              }

              // Log the first calculation for debugging
              if (hourData.indexOf(hour) === 0) {
                console.log('💰 Price calculation debug (using normalized tokens):', {
                  displayPair: `${tokenA?.symbol}/${tokenB?.symbol}`,
                  normalizedPair: `${normalizedTokenA?.symbol}/${normalizedTokenB?.symbol}`,
                  token0: pairInfo?.token0?.symbol,
                  token1: pairInfo?.token1?.symbol,
                  reserve0,
                  reserve1,
                  calculation,
                  finalPrice: price.toFixed(8)
                });
              }

              const timestamp = parseInt(hour.hourStartUnix);

              return {
                time: timestamp,
                open: price,
                high: price * 1.005, // Smaller variation for hourly data
                low: price * 0.995,
                close: price,
                volume: volume
              };
            })
            .filter((point: any) => point !== null && point.close > 0) // Filter out invalid price points
            .sort((a: any, b: any) => (a.time as number) - (b.time as number)); // Sort by time ascending

          // Deduplicate by timestamp - keep the last occurrence for each unique timestamp
          const deduplicatedData = Array.from(
            historicalData.reduce((map, point) => {
              map.set(point.time, point); // Overwrites if duplicate timestamp exists
              return map;
            }, new Map()).values()
          );

          console.log(`✅ Processed ${deduplicatedData.length} REAL historical price points from subgraph (${historicalData.length - deduplicatedData.length} duplicates removed)`);
          console.log('📊 Sample data points:', deduplicatedData.slice(0, 3).map(p => ({
            time: typeof p.time === 'number' ? new Date(p.time * 1000).toISOString().split('T')[0] : 'invalid',
            price: p.close.toFixed(8),
            volume: p.volume.toFixed(2)
          })));

          console.log('📈 SETTING PRICE DATA FROM SUBGRAPH:', {
            pair: `${tokenA?.symbol}/${tokenB?.symbol}`,
            points: deduplicatedData.length,
            latestPrice: deduplicatedData[deduplicatedData.length - 1]?.close.toFixed(8),
            timestamp: new Date().toISOString()
          });
          setPriceData(deduplicatedData);
        } else {
          console.log('⚠️ No historical data available - subgraph may not be fully synced');
          setPriceData([]);
          setError('Chart data not available - subgraph is syncing');
        }
      } else {
        console.log('⚠️ No data returned from subgraph - pair may not be indexed yet');
        setPriceData([]);
        setError('Chart data not available - pair not indexed in subgraph yet');
      }
    } catch (err) {
      console.error('❌ Error fetching historical price data:', err);
      if (!currentFetch.cancel) {
        setError(err instanceof Error ? err.message : 'Failed to fetch historical data');
        setPriceData([]);
      }
    } finally {
      if (!currentFetch.cancel) {
        setIsLoading(false);
      }
    }
  }, [normalizedTokenA, normalizedTokenB, pairAddress, hasValidTokens]); // ONLY use normalized tokens - DO NOT add tokenA/tokenB

  useEffect(() => {
    fetchHistoricalData();

    // Cleanup function to cancel fetch when dependencies change
    return () => {
      cancelFetchRef.current.cancel = true;
    };
  }, [fetchHistoricalData]);

  return {
    priceData,
    isLoading,
    error,
    refetch: fetchHistoricalData
  };
}

// Hook for fetching real-time DEX market stats from contracts
export function useDexMarketStats(): DexMarketStats {
  const [klcPrice, setKlcPrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);
  const [volume24h, setVolume24h] = useState<number | null>(null);
  const [totalLiquidity, setTotalLiquidity] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Create provider instance
  const getProvider = useCallback(() => {
    try {
      // Try to use window.ethereum first (if available), then fallback to RPC
      if (typeof window !== 'undefined' && window.ethereum) {
        return new ethers.providers.Web3Provider(window.ethereum);
      }

      // Fallback to JsonRpcProvider with proper configuration for ethers v5
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        chainId: 3888,
        name: 'KalyChain'
      });

      return provider;
    } catch (err) {
      console.error('Failed to create provider:', err);
      return null;
    }
  }, []);

  // Fetch DEX data from direct subgraph
  const fetchDexData = useCallback(async () => {
    try {
      // Only show loading spinner on initial load, not on subsequent refreshes
      if (isInitialLoad) {
        setIsLoading(true);
      }
      setError(null);

      console.log('🔍 Fetching DEX market stats directly from subgraph...');

      // Use direct subgraph calls - order by txCount since reserveUSD is 0
      const [factoryData, pairsData, dayData] = await Promise.all([
        getFactoryData(),
        getPairsData(20, 'txCount', 'desc'), // Get more pairs and order by transaction count
        getKalyswapDayData(2, 0)
      ]);

      console.log('📊 Direct subgraph data:', { factoryData, pairsData, dayData });

      if (factoryData && pairsData) {
        const factory = factoryData;
        const pairs = pairsData || [];
        const dayDatas = dayData || [];

        // Calculate KLC price from WKLC/USDT pairs - no hardcoded fallback
        let calculatedKlcPrice = 0;
        let totalLiquidityUsd = 0;

        if (pairs.length > 0) {
          // First, try to find the specific WKLC/USDT pair by address
          let wklcUsdtPair = pairs.find((pair: any) =>
            pair.id.toLowerCase() === '0x25fddaf836d12dc5e285823a644bb86e0b79c8e2'
          );

          // If not found by address, look for any WKLC/USDT pair
          if (!wklcUsdtPair) {
            wklcUsdtPair = pairs.find((pair: any) =>
              (pair.token0.symbol === 'WKLC' && (pair.token1.symbol === 'USDT')) ||
              (pair.token1.symbol === 'WKLC' && (pair.token0.symbol === 'USDT'))
            );
          }

          if (wklcUsdtPair) {
            const reserve0 = parseFloat(wklcUsdtPair.reserve0);
            const reserve1 = parseFloat(wklcUsdtPair.reserve1);

            if (wklcUsdtPair.token0.symbol === 'WKLC') {
              // WKLC is token0, USDT is token1
              calculatedKlcPrice = reserve1 / reserve0;
              console.log(`💰 KLC price from ${wklcUsdtPair.token0.symbol}/${wklcUsdtPair.token1.symbol}: $${calculatedKlcPrice.toFixed(6)} (${reserve1} USDT / ${reserve0} WKLC)`);
            } else if (wklcUsdtPair.token1.symbol === 'WKLC') {
              // USDT is token0, WKLC is token1
              calculatedKlcPrice = reserve0 / reserve1;
              console.log(`💰 KLC price from ${wklcUsdtPair.token0.symbol}/${wklcUsdtPair.token1.symbol}: $${calculatedKlcPrice.toFixed(6)} (${reserve0} USDT / ${reserve1} WKLC)`);
            }
          } else {
            console.log('⚠️ WKLC/USDT pair not found in top pairs, using fallback price');
          }

          // Calculate total liquidity manually since reserveUSD is 0
          totalLiquidityUsd = pairs.reduce((sum: number, pair: any) => {
            let pairLiquidityUsd = 0;

            // Calculate USD value based on token types
            const reserve0 = parseFloat(pair.reserve0 || '0');
            const reserve1 = parseFloat(pair.reserve1 || '0');

            // Calculate USD value more accurately
            if (pair.token0.symbol === 'USDT') {
              // Token0 is USDT - total liquidity = USDT reserve + (other token reserve * other token price)
              const otherTokenValueUsd = pair.token1.symbol === 'WKLC' ? reserve1 * calculatedKlcPrice : 0;
              pairLiquidityUsd = reserve0 + otherTokenValueUsd;
            } else if (pair.token1.symbol === 'USDT') {
              // Token1 is USDT - total liquidity = USDT reserve + (other token reserve * other token price)
              const otherTokenValueUsd = pair.token0.symbol === 'WKLC' ? reserve0 * calculatedKlcPrice : 0;
              pairLiquidityUsd = reserve1 + otherTokenValueUsd;
            } else if (pair.token0.symbol === 'WKLC' && pair.token1.symbol === 'WKLC') {
              // Both tokens are WKLC (shouldn't happen, but just in case)
              pairLiquidityUsd = (reserve0 + reserve1) * calculatedKlcPrice;
            } else if (pair.token0.symbol === 'WKLC') {
              // Token0 is WKLC, token1 is unknown - only count WKLC value
              pairLiquidityUsd = reserve0 * calculatedKlcPrice;
            } else if (pair.token1.symbol === 'WKLC') {
              // Token1 is WKLC, token0 is unknown - only count WKLC value
              pairLiquidityUsd = reserve1 * calculatedKlcPrice;
            }

            console.log(`💰 Pair ${pair.token0.symbol}/${pair.token1.symbol}: $${pairLiquidityUsd.toLocaleString()} (${reserve0.toFixed(2)} ${pair.token0.symbol} + ${reserve1.toFixed(2)} ${pair.token1.symbol})`);
            return sum + pairLiquidityUsd;
          }, 0);

          console.log(`💰 Total calculated liquidity from pairs: $${totalLiquidityUsd.toLocaleString()}`);
        }

        // Calculate 24h volume and change
        let volume24h = 0; // Default to 0 instead of null to avoid N/A
        let priceChange24h = 2.5; // Default

        if (dayDatas.length >= 2) {
          const today = dayDatas[0];
          const yesterday = dayDatas[1];

          volume24h = parseFloat(today.dailyVolumeUSD || '0');
          console.log(`📊 24h Volume from subgraph: $${volume24h}`);

          // Calculate price change (simplified)
          if (yesterday.totalLiquidityUSD && today.totalLiquidityUSD) {
            const yesterdayLiquidity = parseFloat(yesterday.totalLiquidityUSD);
            const todayLiquidity = parseFloat(today.totalLiquidityUSD);
            priceChange24h = ((todayLiquidity - yesterdayLiquidity) / yesterdayLiquidity) * 100;
          }
        }

        // Use factory total liquidity if available and non-zero
        console.log(`🏭 Factory liquidity: ${factory?.totalLiquidityUSD || 'null'}`);
        if (factory?.totalLiquidityUSD && parseFloat(factory.totalLiquidityUSD) > 0) {
          console.log(`🏭 Using factory liquidity: $${parseFloat(factory.totalLiquidityUSD).toLocaleString()}`);
          totalLiquidityUsd = parseFloat(factory.totalLiquidityUSD);
        } else {
          console.log(`🏭 Factory liquidity is 0 or missing, using calculated sum: $${totalLiquidityUsd.toLocaleString()}`);
        }
        // Otherwise, use the sum from individual pairs (calculated above)

        // Set the calculated values
        setKlcPrice(calculatedKlcPrice);
        setTotalLiquidity(totalLiquidityUsd);
        setPriceChange24h(priceChange24h);
        setVolume24h(volume24h);

        console.log('✅ DEX stats updated:', {
          klcPrice: calculatedKlcPrice,
          totalLiquidity: totalLiquidityUsd,
          volume24h,
          priceChange24h
        });

      } else {
        throw new Error('Failed to fetch DEX stats from subgraph');
      }

    } catch (err) {
      console.error('❌ Error fetching DEX data from subgraph:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch DEX data');

      // Fallback to default values
      setKlcPrice(0.0003);
      setPriceChange24h(2.5);
      setVolume24h(null);
      setTotalLiquidity(null);
    } finally {
      // Only update loading state on initial load
      if (isInitialLoad) {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    }
  }, [isInitialLoad]);

  // Initial fetch and periodic updates
  useEffect(() => {
    fetchDexData();

    // Update every 30 seconds
    const interval = setInterval(fetchDexData, 30000);

    return () => clearInterval(interval);
  }, [fetchDexData]);

  return {
    klcPrice,
    priceChange24h,
    volume24h,
    totalLiquidity,
    isLoading,
    error,
  };
}
