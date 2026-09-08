'use client';

import { CHAIN_IDS } from '@/config/chains';
import { getV3Config } from '@/config/dex/v3-config';

import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineData,
} from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, BarChart3, Maximize2, RefreshCw } from 'lucide-react';
import { useChartData, usePairMarketStats } from '@/hooks';
import { formatTokenPrice, formatPriceChange } from '@/utils/priceFormat';
import { usePriceDataContext } from '@/contexts/PriceDataContext';
import { useChainId } from 'wagmi';
import { Token } from '@/config/dex/types';
import { chartLogger as logger } from '@/lib/logger';



interface ChartProps {
  tokenA?: Token | null;
  tokenB?: Token | null;
  // Legacy props for backward compatibility
  symbol?: string;
  baseSymbol?: string;
  height?: number;
  showChartTypes?: boolean;
  className?: string;
}



// Chart type options - Line first since it works better with low volume data
const CHART_TYPES = [
  { label: 'Line', value: 'line', icon: TrendingUp },
  { label: 'Candlestick', value: 'candlestick', icon: BarChart3 },
];



export default function TradingChart({
  tokenA,
  tokenB,
  // Legacy props for backward compatibility
  symbol = 'KMT',
  baseSymbol = 'USDT',
  height = 400,
  showChartTypes = true,
  className = '',
}: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);

  const [selectedChartType, setSelectedChartType] = useState('line');

  // Get current chainId from wagmi for multichain support
  const currentChainId = useChainId();

  // Use Token objects if provided, otherwise fall back to legacy string props
  // This ensures backward compatibility while supporting multichain tokens
  const currentTokenA = tokenA || (symbol ? { symbol, chainId: currentChainId || CHAIN_IDS.KALYCHAIN, address: '', decimals: 18, name: symbol, logoURI: '' } as Token : null);
  const currentTokenB = tokenB || (baseSymbol ? { symbol: baseSymbol, chainId: currentChainId || CHAIN_IDS.KALYCHAIN, address: '', decimals: 18, name: baseSymbol, logoURI: '' } as Token : null);

  // Check if we have valid tokens to display chart
  const hasValidTokens = Boolean(currentTokenA && currentTokenB);

  // Normalize token order for consistent display formatting
  // Always use the base token (non-stablecoin) for price formatting
  const normalizedBaseToken = React.useMemo(() => {
    if (!currentTokenA || !currentTokenB) return currentTokenA;

    // Stablecoins should never be the base token for formatting
    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'KUSD'];

    if (stablecoins.includes(currentTokenA.symbol)) {
      return currentTokenB; // Use tokenB as base
    } else if (stablecoins.includes(currentTokenB.symbol)) {
      return currentTokenA; // Use tokenA as base
    }

    // If neither is a stablecoin, use alphabetically first by address
    const addrA = currentTokenA.address.toLowerCase();
    const addrB = currentTokenB.address.toLowerCase();
    return addrA < addrB ? currentTokenA : currentTokenB;
  }, [currentTokenA?.address, currentTokenA?.symbol, currentTokenB?.address, currentTokenB?.symbol]);

  // Fetch real historical price data using TanStack Query
  const {
    priceData: historicalData,
    isLoading: dataLoading,
    error: dataError,
    refetch: refetchData
  } = useChartData({
    tokenA: hasValidTokens ? currentTokenA : null,
    tokenB: hasValidTokens ? currentTokenB : null,
    enabled: hasValidTokens,
    refetchInterval: 30000, // 30 seconds
  });

  // Get real-time pair-specific market stats for accurate 24hr volume
  const {
    volume24h: realVolume24h,
    isLoading: volumeLoading
  } = usePairMarketStats(currentTokenA || undefined, currentTokenB || undefined);

  logger.debug('🎯 TradingChart Debug:', {
    tokenA: currentTokenA?.symbol,
    tokenB: currentTokenB?.symbol,
    tokenAAddress: currentTokenA?.address,
    tokenBAddress: currentTokenB?.address,
    dataLoading,
    dataError,
    historicalDataLength: historicalData.length,
    historicalData: historicalData.slice(0, 2), // Show first 2 items
    realVolume24h,
    volumeLoading,
    timestamp: new Date().toISOString()
  });



  // Use real historical data from subgraph
  const chartData = React.useMemo(() => {
    return historicalData;
  }, [historicalData]);

  // Calculate current price and stats from latest data point
  const currentPrice = React.useMemo(() => {
    if (historicalData.length > 0) {
      return historicalData[historicalData.length - 1].close;
    }
    return 0;
  }, [historicalData]);

  const { setPriceChange24h: setSharedPriceChange } = usePriceDataContext();

  const priceChange24h = React.useMemo(() => {
    if (historicalData.length >= 25) { // Need at least 25 hours of data
      const latest = historicalData[historicalData.length - 1];
      // Get price from 24 hours ago (24 data points back since we have hourly data)
      const price24hAgo = historicalData[historicalData.length - 25];
      const change = ((latest.close - price24hAgo.close) / price24hAgo.close) * 100;

      logger.debug('📊 24h Price Change Calculation:', {
        currentPrice: latest.close,
        price24hAgo: price24hAgo.close,
        change: change.toFixed(2) + '%',
        dataPoints: historicalData.length
      });

      return change;
    }
    return 0;
  }, [historicalData]);

  // Update shared context in useEffect to avoid render phase setState
  React.useEffect(() => {
    setSharedPriceChange(priceChange24h);
  }, [priceChange24h, setSharedPriceChange]);

  // Use real 24hr volume from market stats instead of incorrect calculation
  const volume24h = realVolume24h || 0;

  // Initialize chart only when we have data and container will be rendered
  useEffect(() => {
    // Only initialize if we're not loading, have no errors, and have data
    const shouldInitialize = !dataLoading && !dataError && historicalData.length > 0;

    logger.debug('🎯 Chart initialization effect:', {
      hasContainer: !!chartContainerRef.current,
      hasTokens: !!(currentTokenA && currentTokenB),
      hasExistingChart: !!chartRef.current,
      shouldInitialize,
      dataLoading,
      dataError: !!dataError,
      dataLength: historicalData.length
    });

    if (!shouldInitialize) {
      logger.debug('⚠️ Chart initialization skipped: conditions not met');
      return;
    }

    if (!chartContainerRef.current) {
      logger.debug('⚠️ Chart initialization skipped: no container');
      return;
    }

    try {

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#ffffff', // Changed to white for better visibility
          fontSize: 12,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        grid: {
          vertLines: {
            color: '#374151', // Darker grid lines
            style: LineStyle.Solid,
          },
          horzLines: {
            color: '#374151', // Darker grid lines
            style: LineStyle.Solid,
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: '#9ca3af',
            width: 1,
            style: LineStyle.Dashed,
          },
          horzLine: {
            color: '#9ca3af',
            width: 1,
            style: LineStyle.Dashed,
          },
        },
        rightPriceScale: {
          borderColor: '#6b7280', // Lighter border for visibility
          scaleMargins: {
            top: 0.05,
            bottom: 0.1,
          },
          mode: PriceScaleMode.Normal,
        },
        leftPriceScale: {
          visible: false,
        },
        timeScale: {
          borderColor: '#6b7280', // Lighter border for visibility
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      chartRef.current = chart;

      // Create series based on chart type
      let series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;

      if (selectedChartType === 'candlestick') {
        series = chart.addSeries(CandlestickSeries, {
          upColor: '#10b981',
          downColor: '#ef4444',
          borderDownColor: '#ef4444',
          borderUpColor: '#10b981',
          wickDownColor: '#ef4444',
          wickUpColor: '#10b981',
        });
      } else {
        series = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 2,
        });
      }

      seriesRef.current = series;

      return () => {
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        if (seriesRef.current) {
          seriesRef.current = null;
        }
      };
    } catch (error) {
      logger.error('Failed to initialize chart:', error);
    }
  }, [dataLoading, dataError, historicalData.length, selectedChartType]);

  // Update chart data when data changes
  useEffect(() => {
    logger.debug('📊 Chart data update effect:', {
      hasChartRef: !!chartRef.current,
      hasTokens: !!(currentTokenA && currentTokenB),
      chartDataLength: chartData.length,
      chartData: chartData.slice(0, 2)
    });

    if (!chartRef.current || chartData.length === 0) {
      logger.debug('⚠️ Chart update skipped:', {
        hasChartRef: !!chartRef.current,
        chartDataLength: chartData.length
      });
      return;
    }

    // Remove existing series
    if (seriesRef.current && chartRef.current) {
      try {
        chartRef.current.removeSeries(seriesRef.current);
      } catch (error) {
        logger.warn('Error removing chart series:', error);
      }
      seriesRef.current = null;
    }

    // Use the historical data from subgraph (already in correct format)
    const formattedChartData = chartData.map(item => ({
      time: item.time as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }));

    // Create new series based on chart type
    // Use normalizedBaseToken for consistent precision/minMove regardless of pair order
    const isKLC = normalizedBaseToken?.symbol === 'KLC' || normalizedBaseToken?.symbol === 'wKLC';
    const precision = isKLC ? 8 : 4;
    const minMove = isKLC ? 0.00000001 : 0.0001;

    if (selectedChartType === 'candlestick') {
      const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#10b981',
        wickDownColor: '#ef4444',
        wickUpColor: '#10b981',
        priceFormat: {
          type: 'price',
          precision: precision,
          minMove: minMove,
        },
      });

      candlestickSeries.setData(formattedChartData);
      seriesRef.current = candlestickSeries;

      // Add volume series for candlestick charts
      const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
        color: '#e5e7eb',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });

      const volumeData = formattedChartData.map(item => ({
        time: item.time,
        value: item.volume || 0,
        color: item.close >= item.open ? '#10b981' : '#ef4444',
      }));

      volumeSeries.setData(volumeData);

      // Configure volume price scale after series is created
      chartRef.current.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
        mode: PriceScaleMode.Normal,
        visible: false,
        borderVisible: false,
      });

    } else {
      const lineSeries = chartRef.current.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: precision,
          minMove: minMove,
        },
      });

      const lineData: LineData[] = formattedChartData.map(item => ({
        time: item.time,
        value: item.close,
      }));

      // Remove duplicate timestamps - keep only the last value for each timestamp
      const deduplicatedData = lineData.reduce((acc: LineData[], current) => {
        const existingIndex = acc.findIndex(item => item.time === current.time);
        if (existingIndex >= 0) {
          // Replace existing entry with current (keep last value)
          acc[existingIndex] = current;
        } else {
          acc.push(current);
        }
        return acc;
      }, []);

      // Ensure data is sorted by time in ascending order
      const sortedData = deduplicatedData.sort((a, b) => {
        const getTimestamp = (time: Time): number => {
          if (typeof time === 'number') {
            return time;
          } else if (typeof time === 'object' && 'year' in time) {
            // BusinessDay object: { year, month, day }
            return new Date(time.year, time.month - 1, time.day).getTime() / 1000;
          } else {
            // String timestamp
            return new Date(time as string).getTime() / 1000;
          }
        };

        const timeA = getTimestamp(a.time);
        const timeB = getTimestamp(b.time);
        return timeA - timeB;
      });

      lineSeries.setData(sortedData);
      seriesRef.current = lineSeries;
    }

    // Fit content after data is loaded
    setTimeout(() => {
      chartRef.current?.timeScale().fitContent();
    }, 100);

  }, [selectedChartType, currentTokenA, currentTokenB, chartData]);

  logger.debug('TradingChart props:', {
    tokenA: currentTokenA?.symbol,
    tokenB: currentTokenB?.symbol,
    dataLoading,
    historicalDataLength: historicalData.length
  });

  // Show loading state while fetching data
  if (dataLoading) {
    return (
      <div className={`bg-white rounded-lg border ${className}`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {currentTokenA?.symbol || 'TOKEN1'}/{currentTokenB?.symbol || 'TOKEN2'}
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading chart data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Native <-> wrapped-native is a 1:1 wrap handled by the WKMT contract, never a pool. There is
  // no chart to draw and there never will be, so this must short-circuit BEFORE the dataError
  // branch — otherwise the (expected) "no liquidity pool" throw renders as "Failed to Load Chart
  // Data", which reads as a broken app for a swap that actually works fine.
  const wrappedNative = getV3Config(currentTokenA?.chainId ?? currentTokenB?.chainId ?? 0)?.wethAddress?.toLowerCase();
  const isWrapPair = !!wrappedNative && !!currentTokenA && !!currentTokenB && (
    (currentTokenA.isNative === true && currentTokenB.address?.toLowerCase() === wrappedNative) ||
    (currentTokenB.isNative === true && currentTokenA.address?.toLowerCase() === wrappedNative)
  );

  if (isWrapPair) {
    return (
      <div className={`bg-white rounded-lg border ${className}`}>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {currentTokenA?.symbol}/{currentTokenB?.symbol}
          </h3>
        </div>
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <TrendingUp className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Always 1:1</h3>
            <p className="text-gray-500 max-w-sm">
              {currentTokenA?.symbol} and {currentTokenB?.symbol} are the same asset — wrapping and
              unwrapping is always 1:1, so there is no price chart. You can still make the swap.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if data fetch failed
  if (dataError) {
    return (
      <div className={`bg-white rounded-lg border ${className}`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {currentTokenA?.symbol || 'TOKEN1'}/{currentTokenB?.symbol || 'TOKEN2'}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={refetchData}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Chart Data</h3>
            <p className="text-gray-500 max-w-sm">
              {dataError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show fallback when no valid tokens are provided
  if (!hasValidTokens) {
    return (
      <div className={`bg-white rounded-lg border ${className}`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Select Tokens for Chart
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Tokens Selected
            </h3>
            <p className="text-gray-500 max-w-sm">
              Please select tokens in the swap interface to view price charts and trading data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show "No data" message if no chart data and no loading
  if (!dataLoading && historicalData.length === 0) {
    const isLiquidityError = dataError?.includes('No liquidity pool exists');
    const isAuthError = dataError?.includes('auth error') || dataError?.includes('authorization');
    const isSubgraphError = dataError?.includes('subgraph') || dataError?.includes('indexed');

    // Helper to get chain name
    const getChainName = (chainId?: number) => {
      switch (chainId) {
        case CHAIN_IDS.KALYCHAIN: return 'KalyChain';
        case 56: return 'BSC';
        case 42161: return 'Arbitrum';
        default: return 'Unknown';
      }
    };

    return (
      <div className={`bg-white rounded-lg border ${className}`}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {currentTokenA?.symbol || 'TOKEN1'}/{currentTokenB?.symbol || 'TOKEN2'}
              <span className="text-sm text-gray-500 ml-2">
                (Chain: {currentTokenA?.chainId || currentTokenB?.chainId || 'Unknown'})
              </span>
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {isLiquidityError ? 'No Liquidity Pool' : 'No Chart Data Available'}
            </h3>
            <p className="text-gray-500 max-w-sm">
              {isLiquidityError
                ? `No liquidity pool exists for ${currentTokenA?.symbol}/${currentTokenB?.symbol}. This pair is not available for trading.`
                  : isAuthError
                    ? `Subgraph authorization error. The ${getChainName(currentTokenA?.chainId || currentTokenB?.chainId)} subgraph requires API authentication.`
                    : isSubgraphError
                      ? `Pair not indexed in subgraph yet. The ${currentTokenA?.symbol}/${currentTokenB?.symbol} pair may be new or not available on this DEX.`
                      : `Chart data for ${currentTokenA?.symbol || 'TOKEN1'}/${currentTokenB?.symbol || 'TOKEN2'} is not available. Error: ${dataError || 'Unknown error'}`
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border min-w-0 ${className}`}>
      {/* Chart Header */}
      <div className="p-4 border-b">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
              {currentTokenA?.symbol || 'TOKEN1'}/{currentTokenB?.symbol || 'TOKEN2'}
            </h3>
            {currentPrice && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                  ${formatTokenPrice(currentPrice, normalizedBaseToken?.symbol || 'TOKEN1')}
                </span>
                {priceChange24h !== null && (
                  <span
                    className={`text-xs sm:text-sm font-medium px-2 py-1 rounded whitespace-nowrap ${priceChange24h >= 0
                        ? 'text-green-700 bg-green-100'
                        : 'text-red-700 bg-red-100'
                      }`}
                  >
                    {formatPriceChange(priceChange24h)}
                  </span>
                )}
              </div>
            )}
            <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              24h Vol: {volumeLoading ? (
                <span className="inline-flex items-center gap-1">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ...
                </span>
              ) : volume24h > 0 ? (
                `$${volume24h.toLocaleString()}`
              ) : (
                '$0'
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={refetchData} variant="ghost" size="sm" disabled={dataLoading}>
              <RefreshCw className={`h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chart Controls */}
        <div className="flex items-center gap-4">
          {showChartTypes && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Type:</span>
              <Select value={selectedChartType} onValueChange={setSelectedChartType}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-3 w-3" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative">
        {dataLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
            <div className="flex items-center gap-2 text-gray-600">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading chart...</span>
            </div>
          </div>
        )}
        <div
          ref={chartContainerRef}
          style={{ height: `${height}px` }}
          className="w-full"
        />
      </div>
    </div>
  );
}
