'use client';

import { CHAIN_IDS } from '@/config/chains';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTokenLists } from '@/hooks/useTokenLists';
import MainLayout from '@/components/layout/MainLayout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowUpDown,
  Clock,
  ShoppingCart
} from 'lucide-react';
import TradingChart from '@/components/charts/TradingChart';
import TransactionData from '@/components/swaps/TransactionData';
import SwapInterfaceWrapper from '@/components/swap/SwapInterfaceWrapper';
import { AlchemyPayWidget } from '@/components/onramp';
import { usePairMarketStats } from '@/hooks';
import { formatTokenPrice, formatPriceChange } from '@/utils/priceFormat';
import { formatUsdStat } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import { PriceDataProvider } from '@/contexts/PriceDataContext';
import { useChainId } from 'wagmi';
import { useHydration } from '@/hooks/useHydration';
import { Token } from '@/config/dex/types';
import { logger } from '@/lib/logger';
import './swaps.css';

// Swap interface
interface SwapState {
  fromToken: Token | null;
  toToken: Token | null;
  fromAmount: string;
  toAmount: string;
  slippage: string;
  deadline: string;
}

export default function SwapsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('swap');
  const [loading, setLoading] = useState(false);

  // Use wallet hook to get connection status and address
  const { isConnected, address: userAddress } = useWallet();

  // Get dynamic token list for the TokenSelector
  const { tokens: pageTokens } = useTokenLists({ chainId: CHAIN_IDS.KALYCHAIN });

  // Swap state - tokens will be set dynamically by useTokenLists
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: null, // Will be set by dynamic token loading
    toToken: null,   // Will be set by dynamic token loading
    fromAmount: '',
    toAmount: '',
    slippage: '0.5',
    deadline: '20'
  });

  // Market stats will be handled inside the PriceDataProvider wrapper

  // Settings state
  const [showSettings, setShowSettings] = useState(false);

  // Handle token swap in the swap interface
  const handleSwapTokens = () => {
    setSwapState(prev => ({
      ...prev,
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      fromAmount: prev.toAmount,
      toAmount: prev.fromAmount
    }));
  };

  // Handle amount input change
  const handleFromAmountChange = (value: string) => {
    setSwapState(prev => ({ ...prev, fromAmount: value }));
    // Note: Quote calculation is handled by SwapInterface component using router contract
  };

  // Token selector component for Swap tab (uses predefined tokens)
  const TokenSelector = ({
    selectedToken,
    onTokenSelect,
    label
  }: {
    selectedToken: Token | null;
    onTokenSelect: (token: Token) => void;
    label: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <Select
        value={selectedToken?.symbol || ''}
        onValueChange={(value) => {
          const token = pageTokens.find(t => t.symbol === value);
          if (token) onTokenSelect(token);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select token">
            {selectedToken && (
              <div className="flex items-center gap-2">
                <img
                  src={selectedToken.logoURI}
                  alt={selectedToken.symbol}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    // Fallback to text if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling!.classList.remove('hidden');
                  }}
                />
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold hidden">
                  {selectedToken.symbol.charAt(0)}
                </div>
                <span>{selectedToken.symbol}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {pageTokens.map((token) => (
            <SelectItem key={token.symbol} value={token.symbol}>
              <div className="flex items-center gap-2">
                <img
                  src={token.logoURI}
                  alt={token.symbol}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.nextElementSibling!.classList.remove('hidden');
                  }}
                />
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold hidden">
                  {token.symbol.charAt(0)}
                </div>
                <div>
                  <div className="font-medium">{token.symbol}</div>
                  <div className="text-xs text-gray-500">{token.name}</div>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
      <PriceDataProvider>
        <SwapsPageContent
          swapState={swapState}
          setSwapState={setSwapState}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          loading={loading}
          setLoading={setLoading}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          isConnected={isConnected}
          userAddress={userAddress}
          router={router}
          handleSwapTokens={handleSwapTokens}
          handleFromAmountChange={handleFromAmountChange}
          TokenSelector={TokenSelector}
        />
      </PriceDataProvider>
  );
}

// Separate component that uses the market stats hook inside the provider
function SwapsPageContent({
  swapState,
  setSwapState,
  activeTab,
  setActiveTab,
  loading,
  setLoading,
  showSettings,
  setShowSettings,
  isConnected,
  userAddress,
  router,
  handleSwapTokens,
  handleFromAmountChange,
  TokenSelector
}: {
  swapState: SwapState;
  setSwapState: React.Dispatch<React.SetStateAction<SwapState>>;
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  isConnected: boolean;
  userAddress: string | null | undefined;
  router: any;
  handleSwapTokens: () => void;
  handleFromAmountChange: (value: string) => void;
  TokenSelector: any;
}) {
  // Check if client is hydrated
  const isHydrated = useHydration();

  // Get protocol version

  // Get current chain ID from wallet with error handling
  let wagmiChainId: number | undefined;
  try {
    wagmiChainId = useChainId();
  } catch (error) {
    logger.warn('Wagmi not available, using fallback chain ID:', error);
    wagmiChainId = undefined;
  }

  // Use wagmi chain ID if available and hydrated, otherwise fallback to KalyChain
  const chainId = isHydrated && wagmiChainId ? wagmiChainId : CHAIN_IDS.KALYCHAIN;

  // Load dynamic tokens for current chain
  const { tokens: dynamicTokens, loading: tokensLoading, error: tokensError } = useTokenLists({ chainId });

  // Debug: Log token loading status
  logger.debug('🪙 Swaps page token status:', {
    chainId,
    tokensLoading,
    tokensError,
    tokenCount: dynamicTokens?.length || 0,
    tokens: dynamicTokens?.map(t => t.symbol).join(', ') || 'none'
  });

  // Get real-time pair-specific market stats (now inside the provider)
  const {
    price: pairPrice,
    priceChange24h,
    volume24h,
    liquidity,
    isLoading: pairStatsLoading,
    error: pairStatsError,
    pairAddress
  } = usePairMarketStats(swapState.fromToken || undefined, swapState.toToken || undefined);

  // Determine the base token for consistent price formatting
  // Always use the non-stablecoin token for formatting
  const baseTokenForFormatting = useMemo(() => {
    if (!swapState.fromToken || !swapState.toToken) return null;

    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD'];

    // If fromToken is a stablecoin, use toToken as base
    if (stablecoins.includes(swapState.fromToken.symbol)) {
      return swapState.toToken;
    }
    // If toToken is a stablecoin, use fromToken as base
    else if (stablecoins.includes(swapState.toToken.symbol)) {
      return swapState.fromToken;
    }
    // If neither is a stablecoin, use alphabetically first by address
    else {
      const addrFrom = swapState.fromToken.address.toLowerCase();
      const addrTo = swapState.toToken.address.toLowerCase();
      return addrFrom < addrTo ? swapState.fromToken : swapState.toToken;
    }
  }, [swapState.fromToken?.address, swapState.fromToken?.symbol, swapState.toToken?.address, swapState.toToken?.symbol]);

  // Create default token pair from dynamic tokens based on chain
  const defaultTokenPair = useMemo(() => {
    if (!dynamicTokens || dynamicTokens.length === 0 || !chainId) return null;

    let tokenA, tokenB;

    if (chainId === CHAIN_IDS.KALYCHAIN) {
      // KalyChain: KMT/USDT
      tokenA = dynamicTokens.find(token => token.symbol === 'KMT');
      tokenB = dynamicTokens.find(token => token.symbol === 'USDT' || token.symbol === 'USDt');
    } else if (chainId === 56) {
      // BSC: BNB/BUSD (BUSD is the preferred stablecoin on BSC with better liquidity)
      // Using BUSD ensures the pair is structured correctly (BNB as base, BUSD as quote)

      // Debug: Log all available stablecoins
      const stablecoins = dynamicTokens.filter(t =>
        ['BUSD', 'USDT', 'USDC', 'DAI'].includes(t.symbol)
      );
      logger.debug('🔍 BSC available stablecoins:', stablecoins.map(t => ({
        symbol: t.symbol,
        address: t.address
      })));

      tokenA = dynamicTokens.find(token => token.symbol === 'BNB' || token.symbol === 'WBNB');
      tokenB = dynamicTokens.find(token => token.symbol === 'BUSD');

      // Fallback to USDT if BUSD not found
      if (!tokenB) {
        logger.warn('⚠️ BUSD not found in token list, falling back to USDT');
        tokenB = dynamicTokens.find(token => token.symbol === 'USDT');
      }

      logger.debug('🔍 BSC default pair:', {
        tokenA: tokenA ? { symbol: tokenA.symbol, address: tokenA.address } : null,
        tokenB: tokenB ? { symbol: tokenB.symbol, address: tokenB.address } : null
      });
    } else if (chainId === 42161) {
      // Arbitrum: ETH/USDC
      tokenA = dynamicTokens.find(token => token.symbol === 'ETH' || token.symbol === 'WETH');
      tokenB = dynamicTokens.find(token => token.symbol === 'USDC');
    }

    if (tokenA && tokenB) {
      return { tokenA, tokenB };
    }

    // Fallback to first two tokens
    if (dynamicTokens.length >= 2) {
      return { tokenA: dynamicTokens[0], tokenB: dynamicTokens[1] };
    }

    return null;
  }, [dynamicTokens, chainId]);

  // Debug: Log default token pair
  useEffect(() => {
    logger.debug('🎯 Default token pair for chain', chainId, ':',
      defaultTokenPair ? `${defaultTokenPair.tokenA.symbol}/${defaultTokenPair.tokenB.symbol}` : 'none'
    );
  }, [defaultTokenPair, chainId]);

  // Update swapState when chain changes or when tokens first load
  useEffect(() => {
    if (defaultTokenPair) {
      // Check if current tokens are from a different chain
      const currentTokensFromDifferentChain =
        swapState.fromToken && swapState.fromToken.chainId !== chainId;

      // Update tokens if:
      // 1. No tokens are set yet, OR
      // 2. Chain has changed (current tokens are from different chain)
      if (!swapState.fromToken || !swapState.toToken || currentTokensFromDifferentChain) {
        logger.debug('🔄 Setting default tokens for chain', chainId, ':',
          `${defaultTokenPair.tokenA.symbol}/${defaultTokenPair.tokenB.symbol}`);
        setSwapState(prev => ({
          ...prev,
          fromToken: defaultTokenPair.tokenA,
          toToken: defaultTokenPair.tokenB
        }));
      }
    }
  }, [defaultTokenPair, chainId, swapState.fromToken, swapState.toToken, setSwapState]);

  // Memoize token change handler to prevent infinite re-renders
  const handleTokenChange = useMemo(() => (fromToken: Token | null, toToken: Token | null) => {
    logger.debug(`🔄 Token change: ${fromToken?.symbol}/${toToken?.symbol}`);
    setSwapState(prev => ({
      ...prev,
      fromToken,
      toToken
    }));
  }, [setSwapState]);

  // Show loading state while tokens are loading
  if (tokensLoading) {
    return (
      <MainLayout>
        <div className="swaps-layout min-h-screen bg-gradient-to-b from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading tokens...</p>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Show error state if tokens failed to load
  if (tokensError) {
    return (
      <MainLayout>
        <div className="swaps-layout min-h-screen bg-gradient-to-b from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <p className="text-red-600 mb-4">Failed to load tokens: {tokensError}</p>
                <Button onClick={() => window.location.reload()}>Retry</Button>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="swaps-layout min-h-screen bg-gradient-to-b from-slate-50 to-white overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="swaps-grid grid grid-cols-1 xl:grid-cols-4 gap-6">

            {/* Left side - Trading Chart and Transaction Data */}
            <div className="xl:col-span-3 space-y-8 min-w-0">
              {/* Trading Chart */}
              <div className="chart-container trading-chart-wrapper">
                <TradingChart
                  tokenA={swapState.fromToken}
                  tokenB={swapState.toToken}
                  height={600}
                  showChartTypes={true}
                  className="w-full h-[500px] lg:h-[600px]"
                />
              </div>

              {/* Transaction Data Component */}
              <div className="transaction-data-container">
                <TransactionData
                  selectedPair={{
                    token0Symbol: swapState.fromToken?.symbol || 'KMT',
                    token1Symbol: swapState.toToken?.symbol || 'USDT',
                    pairAddress: pairAddress || undefined
                  }}
                  userAddress={userAddress}
                />
              </div>
            </div>

            {/* Right side - Trading controls */}
            <div className="trading-controls-container xl:col-span-1 space-y-6 min-w-0">



              {/* Trading interface */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <Card>
                  <CardHeader>
                    <CardTitle>Trade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="swap" className="flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" />
                        Swap
                      </TabsTrigger>
                      <TabsTrigger value="limit" disabled className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Limit
                      </TabsTrigger>
                      <TabsTrigger value="buy" className="flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3" />
                        Buy
                      </TabsTrigger>
                    </TabsList>
                  </CardContent>
                </Card>

                <TabsContent value="swap" className="mt-1">
                  <SwapInterfaceWrapper
                    fromToken={swapState.fromToken}
                    toToken={swapState.toToken}
                    onTokenChange={handleTokenChange}
                  />
                </TabsContent>

                <TabsContent value="limit" className="mt-1">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8 text-gray-500">
                        <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">Limit Orders Coming Soon</p>
                        <p className="text-sm">Set price targets for automatic execution</p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="buy" className="mt-1">
                  <Card>
                    <CardContent className="pt-6">
                      <AlchemyPayWidget
                        defaultFiat="USD"
                        defaultCrypto="KMT"
                        defaultNetwork="KALYCHAIN"
                        height={625}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Quick stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {swapState.fromToken?.symbol}/{swapState.toToken?.symbol} Market Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* items-start + matched leading keeps "Price" on the first line when the
                      value wraps; the value group wraps right-aligned instead of colliding
                      with the label or squashing the % badge. */}
                  <div className="flex justify-between items-start gap-3">
                    <span className="text-sm text-gray-600 shrink-0 leading-6">Price</span>
                    {pairStatsLoading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mt-1" />
                    ) : pairStatsError ? (
                      <span className="text-xs text-red-600 leading-6">Error loading price</span>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 min-w-0 text-right">
                        <span className="font-medium leading-6 tabular-nums">
                          {pairPrice > 0
                            ? `1 ${swapState.fromToken?.symbol} = ${formatTokenPrice(pairPrice, baseTokenForFormatting?.symbol || '')} ${swapState.toToken?.symbol}`
                            : '—'}
                        </span>
                        {priceChange24h !== 0 && (
                          <span
                            className={`text-xs px-1 py-0.5 rounded whitespace-nowrap ${priceChange24h >= 0
                              ? 'text-green-300 bg-green-900/30'
                              : 'text-red-300 bg-red-900/30'
                              }`}
                          >
                            {formatPriceChange(priceChange24h)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">24h Volume</span>
                    {pairStatsLoading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    ) : (
                      <span className="font-medium tabular-nums">
                        {pairStatsError ? '—' : formatUsdStat(volume24h)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Liquidity</span>
                    {pairStatsLoading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    ) : (
                      <span className="font-medium tabular-nums">
                        {pairStatsError ? '—' : formatUsdStat(liquidity)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}