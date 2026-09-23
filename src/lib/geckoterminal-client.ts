import { subgraphLogger } from '@/lib/logger';
/**
 * GeckoTerminal API Client
 * Free DEX data API by CoinGecko for OHLC chart data
 * Documentation: https://www.geckoterminal.com/dex-api
 */

import { Token } from '@/config/dex/types';

const GECKOTERMINAL_API_BASE = 'https://api.geckoterminal.com/api/v2';

// Rate limiting: 30 calls/minute for free tier
const RATE_LIMIT_DELAY = 2100; // 2.1 seconds between calls (safe margin)
let lastApiCall = 0;

// Cache for API responses
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Network IDs for GeckoTerminal API
 */
const NETWORK_IDS: Record<number, string> = {
  56: 'bsc', // Binance Smart Chain
  42161: 'arbitrum', // Arbitrum One
  137: 'polygon_pos', // Polygon PoS
};

/**
 * Rate-limited fetch with caching
 */
async function rateLimitedFetch(url: string): Promise<any> {
  // Check cache first
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    subgraphLogger.debug(`📦 GeckoTerminal: Using cached data for ${url}`);
    return cached.data;
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;

  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    const waitTime = RATE_LIMIT_DELAY - timeSinceLastCall;
    subgraphLogger.debug(`⏳ GeckoTerminal: Rate limiting, waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastApiCall = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // 404 means pool not found - this is expected for many token pairs
      if (response.status === 404) {
        subgraphLogger.debug(`⚠️ GeckoTerminal: Pool not found (404) - this pair may not have liquidity on this DEX`);
        return null; // Return null instead of throwing
      }
      throw new Error(`GeckoTerminal API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cache the result
    cache.set(url, {
      data,
      timestamp: Date.now()
    });

    return data;
  } catch (error) {
    // Only log unexpected errors — network errors and 404s are expected
    if (error instanceof Error) {
      const msg = error.message;
      if (!msg.includes('404') && !msg.includes('NetworkError') && !msg.includes('abort')) {
        subgraphLogger.error('❌ GeckoTerminal API error:', error);
      } else {
        subgraphLogger.debug('⚠️ GeckoTerminal request failed:', msg);
      }
    }
    throw error;
  }
}

/**
 * The address in a GeckoTerminal id ("<network>_<address>"). Network ids can contain underscores
 * ("polygon_pos"), so the address is what follows the LAST one — split('_')[1] returned "pos".
 */
export function geckoIdAddress(id: string | undefined): string | undefined {
  return id ? id.slice(id.lastIndexOf('_') + 1) : undefined;
}

/**
 * Get network ID for GeckoTerminal API
 */
function getNetworkId(chainId: number): string | null {
  return NETWORK_IDS[chainId] || null;
}

/**
 * Search for a pool address given two token addresses
 * Tries searching both tokens to maximize chances of finding the pool
 * Returns the pool address - chart will always show the same data regardless of token order
 */
export async function findPoolAddress(
  chainId: number,
  tokenA: Token,
  tokenB: Token
): Promise<string | null> {
  try {
    const networkId = getNetworkId(chainId);
    if (!networkId) {
      subgraphLogger.warn(`⚠️ GeckoTerminal: Unsupported chain ${chainId}`);
      return null;
    }

    // Convert native tokens to wrapped versions for GeckoTerminal
    const getWrappedAddress = (token: Token): string => {
      if (token.isNative || token.address === '0x0000000000000000000000000000000000000000') {
        // Map native tokens to their wrapped versions
        if (chainId === 56) {
          return '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'; // WBNB
        } else if (chainId === 42161) {
          return '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'; // WETH
        } else if (chainId === 137) {
          return '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'; // WPOL
        }
      }
      return token.address;
    };

    const tokenAAddr = getWrappedAddress(tokenA).toLowerCase();
    const tokenBAddr = getWrappedAddress(tokenB).toLowerCase();

    subgraphLogger.debug(`🔍 GeckoTerminal: Searching for ${tokenA.symbol}/${tokenB.symbol} pair`, {
      tokenA: { symbol: tokenA.symbol, address: tokenAAddr },
      tokenB: { symbol: tokenB.symbol, address: tokenBAddr }
    });

    // Helper function to search pools for a specific token address
    const searchTokenPools = async (tokenAddr: string, otherTokenAddr: string, tokenSymbol: string): Promise<string | null> => {
      const url = `${GECKOTERMINAL_API_BASE}/networks/${networkId}/tokens/${tokenAddr}/pools`;
      subgraphLogger.debug(`🔍 GeckoTerminal: Fetching pools from ${url}`);
      const response = await rateLimitedFetch(url);

      if (!response?.data || !Array.isArray(response.data)) {
        subgraphLogger.debug(`⚠️ GeckoTerminal: No pools data returned for ${tokenSymbol}`);
        return null;
      }

      subgraphLogger.debug(`📋 GeckoTerminal: Found ${response.data.length} pools for ${tokenSymbol}`);

      // Find a pool that contains both tokens
      for (const pool of response.data) {
        const baseToken = geckoIdAddress(pool.relationships?.base_token?.data?.id)?.toLowerCase();
        const quoteToken = geckoIdAddress(pool.relationships?.quote_token?.data?.id)?.toLowerCase();

        if (
          (baseToken === tokenAddr && quoteToken === otherTokenAddr) ||
          (baseToken === otherTokenAddr && quoteToken === tokenAddr)
        ) {
          const poolAddress = geckoIdAddress(pool.id);
          if (poolAddress) {
            subgraphLogger.debug(`✅ GeckoTerminal: Found pool ${poolAddress} for ${tokenA.symbol}/${tokenB.symbol}`);
            return poolAddress;
          }
        }
      }

      return null;
    };

    // Try searching tokenA's pools first
    subgraphLogger.debug(`🔍 GeckoTerminal: Searching ${tokenA.symbol} pools for ${tokenA.symbol}/${tokenB.symbol} pair...`);
    let poolAddress = await searchTokenPools(tokenAAddr, tokenBAddr, tokenA.symbol);

    if (poolAddress) {
      return poolAddress;
    }

    // If not found, try searching tokenB's pools
    subgraphLogger.debug(`🔍 GeckoTerminal: Searching ${tokenB.symbol} pools for ${tokenA.symbol}/${tokenB.symbol} pair...`);
    poolAddress = await searchTokenPools(tokenBAddr, tokenAAddr, tokenB.symbol);

    if (poolAddress) {
      return poolAddress;
    }

    subgraphLogger.warn(`⚠️ GeckoTerminal: No pool found for ${tokenA.symbol}/${tokenB.symbol} after searching both tokens`);
    return null;
  } catch (error) {
    subgraphLogger.error(`❌ GeckoTerminal: Error finding pool for ${tokenA.symbol}/${tokenB.symbol}:`, error);
    return null;
  }
}

/**
 * Fetch OHLC data from GeckoTerminal
 * @param chainId - Chain ID (56 for BSC, 42161 for Arbitrum)
 * @param poolAddress - Pool/pair address
 * @param timeframe - Timeframe: 'day' (default), 'hour', 'minute'
 * @param aggregate - Aggregate: 1 (default), 5, 15, etc.
 * @param limit - Number of candles to return (default: 100, max: 1000)
 */
export async function getGeckoTerminalOHLC(
  chainId: number,
  poolAddress: string,
  timeframe: 'day' | 'hour' | 'minute' = 'hour',
  aggregate: number = 1,
  limit: number = 168 // 7 days of hourly data
): Promise<any[]> {
  try {
    const networkId = getNetworkId(chainId);
    if (!networkId) {
      subgraphLogger.warn(`⚠️ GeckoTerminal: Unsupported chain ${chainId}`);
      return [];
    }

    const url = `${GECKOTERMINAL_API_BASE}/networks/${networkId}/pools/${poolAddress.toLowerCase()}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`;
    
    subgraphLogger.debug(`🦎 GeckoTerminal: Fetching OHLC data from ${url}`);
    
    const response = await rateLimitedFetch(url);

    if (!response?.data?.attributes?.ohlcv_list || !Array.isArray(response.data.attributes.ohlcv_list)) {
      subgraphLogger.warn('⚠️ GeckoTerminal: Invalid OHLC response format');
      return [];
    }

    const ohlcvList = response.data.attributes.ohlcv_list;
    subgraphLogger.debug(`✅ GeckoTerminal: Fetched ${ohlcvList.length} OHLC candles`);

    return ohlcvList;
  } catch (error) {
    subgraphLogger.error('❌ GeckoTerminal: Error fetching OHLC data:', error);
    return [];
  }
}

/**
 * Get pool information including base and quote tokens
 * @param chainId - Chain ID
 * @param poolAddress - Pool address
 * @returns Full pool data from GeckoTerminal API, or null if not found
 */
export async function getPoolInfo(
  chainId: number,
  poolAddress: string
): Promise<any | null> {
  try {
    const networkId = getNetworkId(chainId);
    if (!networkId) {
      subgraphLogger.warn(`⚠️ GeckoTerminal: Unsupported chain ${chainId}`);
      return null;
    }

    const url = `${GECKOTERMINAL_API_BASE}/networks/${networkId}/pools/${poolAddress.toLowerCase()}`;
    subgraphLogger.debug(`🦎 GeckoTerminal: Fetching pool info from ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response?.data) {
      subgraphLogger.warn('⚠️ GeckoTerminal: Invalid pool info response format');
      return null;
    }

    // Extract token addresses for logging
    const baseToken = geckoIdAddress(response.data.relationships?.base_token?.data?.id)?.toLowerCase();
    const quoteToken = geckoIdAddress(response.data.relationships?.quote_token?.data?.id)?.toLowerCase();

    subgraphLogger.debug(`✅ GeckoTerminal: Pool ${poolAddress} - Base: ${baseToken}, Quote: ${quoteToken}`);

    // Return the FULL response.data object which includes:
    // - attributes: { base_token_price_usd, volume_usd, reserve_in_usd, price_change_percentage, etc. }
    // - relationships: { base_token, quote_token }
    return response.data;
  } catch (error) {
    subgraphLogger.error('❌ GeckoTerminal: Error fetching pool info:', error);
    return null;
  }
}

/**
 * Convert GeckoTerminal OHLC data to our chart format
 * GeckoTerminal format: [timestamp, open, high, low, close, volume]
 * Our format: { time, open, high, low, close, value }
 *
 * @param ohlcvList - Array of OHLC candles from GeckoTerminal
 * @param invert - If true, inverts all prices (1/price) to flip the pair
 */
export function convertGeckoTerminalToChartData(ohlcvList: any[], invert: boolean = false): any[] {
  if (!Array.isArray(ohlcvList)) {
    return [];
  }

  const chartData = ohlcvList.map((candle, index) => {
    if (!Array.isArray(candle) || candle.length < 6) {
      return null;
    }

    const [timestamp, open, high, low, close, volume] = candle;

    // Parse values
    let openPrice = parseFloat(open);
    let highPrice = parseFloat(high);
    let lowPrice = parseFloat(low);
    let closePrice = parseFloat(close);

    // Debug first candle
    if (index === 0) {
      subgraphLogger.debug('🔍 First OHLC candle (BEFORE inversion):', {
        close: closePrice,
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        invert
      });
    }

    // Invert prices if needed (swap base/quote)
    if (invert) {
      // When inverting, high becomes low and vice versa
      openPrice = 1 / openPrice;
      const invertedHigh = 1 / lowPrice;  // Original low becomes new high
      const invertedLow = 1 / highPrice;  // Original high becomes new low
      highPrice = invertedHigh;
      lowPrice = invertedLow;
      closePrice = 1 / closePrice;
    }

    // Debug first candle after inversion
    if (index === 0) {
      subgraphLogger.debug('🔍 First OHLC candle (AFTER inversion):', {
        close: closePrice,
        open: openPrice,
        high: highPrice,
        low: lowPrice
      });
    }

    return {
      time: Math.floor(timestamp / 1000), // Convert ms to seconds
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: closePrice,
      value: closePrice // For line charts
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null); // Remove null entries

  // Sort by time in ascending order (required by chart library)
  chartData.sort((a, b) => a.time - b.time);

  return chartData;
}

/**
 * Get recent trades for a pool
 * @param chainId - Chain ID (56 for BSC, 42161 for Arbitrum)
 * @param poolAddress - Pool/pair address
 * @param limit - Number of trades to return (default: 20, max: 100)
 * @returns Array of recent trades
 */
export async function getPoolTrades(
  chainId: number,
  poolAddress: string,
  limit: number = 20
): Promise<any[]> {
  try {
    const networkId = getNetworkId(chainId);
    if (!networkId) {
      subgraphLogger.warn(`⚠️ GeckoTerminal: Unsupported chain ${chainId}`);
      return [];
    }

    const url = `${GECKOTERMINAL_API_BASE}/networks/${networkId}/pools/${poolAddress.toLowerCase()}/trades?trade_volume_in_usd_greater_than=0`;

    subgraphLogger.debug(`🦎 GeckoTerminal: Fetching recent trades from ${url}`);

    const response = await rateLimitedFetch(url);

    if (!response?.data || !Array.isArray(response.data)) {
      subgraphLogger.warn('⚠️ GeckoTerminal: Invalid trades response format');
      return [];
    }

    const trades = response.data.slice(0, limit);
    subgraphLogger.debug(`✅ GeckoTerminal: Fetched ${trades.length} recent trades`);

    return trades;
  } catch (error) {
    subgraphLogger.error('❌ GeckoTerminal: Error fetching trades:', error);
    return [];
  }
}

/**
 * Check if a chain is supported by GeckoTerminal
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in NETWORK_IDS;
}

/**
 * Get supported chain IDs
 */
export function getSupportedChains(): number[] {
  return Object.keys(NETWORK_IDS).map(Number);
}

