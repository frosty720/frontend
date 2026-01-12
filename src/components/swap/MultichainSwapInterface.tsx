'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowUpDown, Settings, Info, Wallet, AlertTriangle, CheckCircle, ChevronDown, X, ExternalLink } from 'lucide-react';
import TokenSelectorModal from './TokenSelectorModal';
import SwapConfirmationModal from './SwapConfirmationModal';
import ErrorDisplay from './ErrorDisplay';
import { useSwapErrorHandler } from '@/hooks/useSwapErrorHandler';
import { useSwapTransactions } from '@/hooks/useSwapTransactions';

// Wagmi imports for wallet interaction
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

// New multichain DEX service imports
import { Token, QuoteResult, SwapParams } from '@/services/dex';
import { getDefaultTokenPair, isChainSupported } from '@/config/dex';

// Custom hooks
import { useMultichainTokenBalance } from '@/hooks/useMultichainTokenBalance';
import { useTokenLists } from '@/hooks/useTokenLists';
import { useDexSwap } from '@/hooks/useDexSwap';

// Price impact utilities
import { formatPriceImpact, getPriceImpactColor } from '@/utils/multichainPriceImpact';

// TokenIcon component with gradient fallback
function TokenIcon({ token }: { token: Token }) {
  const [imageError, setImageError] = React.useState(false);

  if (imageError) {
    return (
      <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
        {token.symbol.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={token.logoURI}
      alt={token.symbol}
      className="w-6 h-6 rounded-full"
      onError={() => setImageError(true)}
    />
  );
}

// Props interface for MultichainSwapInterface
interface MultichainSwapInterfaceProps {
  fromToken?: Token | null;
  toToken?: Token | null;
  onTokenChange?: (fromToken: Token | null, toToken: Token | null) => void;
}

// Swap state interface
interface SwapState {
  fromToken: Token | null;
  toToken: Token | null;
  fromAmount: string;
  toAmount: string;
  slippage: string;
  deadline: string;
}

export default function MultichainSwapInterface({ 
  fromToken: propFromToken, 
  toToken: propToToken, 
  onTokenChange 
}: MultichainSwapInterfaceProps = {}) {
  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Debug: Log chain ID changes
  useEffect(() => {
    console.log('🔗 MultichainSwapInterface chainId changed:', {
      chainId,
      isConnected,
      address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'none'
    });
  }, [chainId, isConnected, address]);

  // Use dynamic token lists instead of hardcoded tokens
  const { tokens: supportedTokens, loading: tokensLoading, error: tokensError } = useTokenLists({ chainId });

  // Debug logging for token loading
  useEffect(() => {
    console.log('🔍 MultichainSwapInterface token loading status:', {
      chainId,
      tokensLoading,
      tokensError,
      supportedTokensCount: supportedTokens?.length || 0,
      supportedTokens: supportedTokens?.map(t => ({ symbol: t.symbol, address: t.address, chainId: t.chainId })) || []
    });
  }, [chainId, tokensLoading, tokensError, supportedTokens]);

  // Get default token pair for current chain using dynamic tokens
  const defaultTokenPair = useMemo(() => {
    if (!chainId || !isChainSupported(chainId) || supportedTokens.length < 2) {
      return null;
    }

    console.log('🔍 MultichainSwapInterface supportedTokens:', supportedTokens.map(t => ({ symbol: t.symbol, isNative: t.isNative })));

    // Find native token
    const nativeToken = supportedTokens.find(token => token.isNative);

    // Find stablecoin based on chain preference
    let stablecoin;
    if (chainId === 56) {
      // BSC: Prefer BUSD, fallback to USDT
      stablecoin = supportedTokens.find(token => token.symbol === 'BUSD') ||
                   supportedTokens.find(token => token.symbol === 'USDT');
    } else {
      // Other chains: Prefer USDT
      stablecoin = supportedTokens.find(token => token.symbol === 'USDT' || token.symbol === 'USDt');
    }

    console.log('🔍 MultichainSwapInterface defaultTokenPair:', {
      chainId,
      nativeToken: nativeToken?.symbol,
      stablecoin: stablecoin?.symbol
    });

    if (nativeToken && stablecoin) {
      return { tokenA: nativeToken, tokenB: stablecoin };
    }

    // Fallback to first two tokens if no native/stablecoin pair found
    return { tokenA: supportedTokens[0], tokenB: supportedTokens[1] };
  }, [chainId, supportedTokens]);

  // Component state - use props if provided, otherwise use defaults
  const [swapState, setSwapState] = useState<SwapState>(() => {
    if (propFromToken && propToToken) {
      return {
        fromToken: propFromToken,
        toToken: propToToken,
        fromAmount: '',
        toAmount: '',
        slippage: '0.5',
        deadline: '20'
      };
    }

    // Use default pair for current chain
    const defaultPair = defaultTokenPair;
    return {
      fromToken: defaultPair?.tokenA || null,
      toToken: defaultPair?.tokenB || null,
      fromAmount: '',
      toAmount: '',
      slippage: '0.5',
      deadline: '20'
    };
  });

  // Update internal state when props change
  useEffect(() => {
    if (propFromToken !== undefined || propToToken !== undefined) {
      setSwapState(prev => ({
        ...prev,
        fromToken: propFromToken !== undefined ? propFromToken : prev.fromToken,
        toToken: propToToken !== undefined ? propToToken : prev.toToken,
      }));
    }
  }, [propFromToken, propToToken]);

  // Update tokens when chain changes or when dynamic tokens load
  useEffect(() => {
    if (!chainId || !isChainSupported(chainId) || tokensLoading) {
      return;
    }

    // Use dynamic default token pair
    if (defaultTokenPair) {
      setSwapState(prev => ({
        ...prev,
        fromToken: defaultTokenPair.tokenA,
        toToken: defaultTokenPair.tokenB,
        fromAmount: '',
        toAmount: ''
      }));

      // Notify parent component of token change
      if (onTokenChange) {
        onTokenChange(defaultTokenPair.tokenA, defaultTokenPair.tokenB);
      }
    }
  }, [chainId, defaultTokenPair, tokensLoading, onTokenChange]);

  // Token balances
  const { balances, getFormattedBalance, isLoading: balancesLoading, refreshBalances } = useMultichainTokenBalance(supportedTokens);

  // DEX swap hook with proper client injection
  const { getQuote: dexGetQuote, executeSwap: dexExecuteSwap, isInternalWallet } = useDexSwap(chainId || 3888);

  const [isSwapping, setIsSwapping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'swapping' | 'complete'>('idle');
  const [currentTransactionHash, setCurrentTransactionHash] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Token selector modal state
  const [showFromTokenSelector, setShowFromTokenSelector] = useState(false);
  const [showToTokenSelector, setShowToTokenSelector] = useState(false);

  // Enhanced error handling
  const {
    error,
    isRetrying,
    hasError,
    handleError,
    clearError,
    reset,
    retry,
    validateSwap,
    executeWithErrorHandling,
    setRetryOperation
  } = useSwapErrorHandler({
    maxRetries: 3,
    onRetrySuccess: () => {
      console.log('✅ Retry successful');
    },
    onRetryFailed: (error) => {
      console.error('❌ Retry failed after max attempts:', error);
    }
  });

  // Transaction tracking
  const {
    addTransaction,
    updateTransactionStatus
  } = useSwapTransactions({
    userAddress: address,
    autoRefresh: true
  });

  // Check if current chain is supported
  const isChainSupportedForSwap = chainId && isChainSupported(chainId);

  // Get DEX name for current chain
  const dexName = useMemo(() => {
    if (!chainId || !isChainSupported(chainId)) return '';
    switch (chainId) {
      case 3888: return 'KalySwap';
      case 56: return 'PancakeSwap';
      case 42161: return 'Camelot';
      default: return '';
    }
  }, [chainId]);

  // Get block explorer URL for current chain
  const getExplorerUrl = (txHash: string) => {
    if (!chainId) return '';
    switch (chainId) {
      case 3888: return `https://kalyscan.io/tx/${txHash}`;
      case 56: return `https://bscscan.com/tx/${txHash}`;
      case 42161: return `https://arbiscan.io/tx/${txHash}`;
      default: return '';
    }
  };

  // Auto-dismiss transaction success message after 8 seconds
  useEffect(() => {
    if (currentTransactionHash) {
      const timer = setTimeout(() => {
        setCurrentTransactionHash(null);
      }, 8000); // 8 seconds

      return () => clearTimeout(timer);
    }
  }, [currentTransactionHash]);

  // Get quote when swap parameters change
  useEffect(() => {
    const getQuote = async () => {
      if (!chainId || !isChainSupported(chainId) || !swapState.fromToken || !swapState.toToken || !swapState.fromAmount) {
        setQuote(null);
        return;
      }

      if (parseFloat(swapState.fromAmount) <= 0) {
        setQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      try {
        const quoteResult = await dexGetQuote(
          swapState.fromToken,
          swapState.toToken,
          swapState.fromAmount
        );
        setQuote(quoteResult);
        setSwapState(prev => ({ ...prev, toAmount: quoteResult.amountOut }));
      } catch (error) {
        console.error('Quote error:', error);
        setQuote(null);
        setSwapState(prev => ({ ...prev, toAmount: '' }));
      } finally {
        setIsLoadingQuote(false);
      }
    };

    // Debounce quote requests
    const timeoutId = setTimeout(getQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [chainId, swapState.fromToken, swapState.toToken, swapState.fromAmount]);

  // Helper function to check if tokens are valid for current chain
  const areTokensValidForChain = (fromToken: Token | null, toToken: Token | null): boolean => {
    if (!chainId || !fromToken || !toToken) return false;
    return fromToken.chainId === chainId && toToken.chainId === chainId;
  };

  // Handle token swap (flip from/to tokens)
  const handleSwapTokens = () => {
    setSwapState(prev => ({
      ...prev,
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      fromAmount: prev.toAmount,
      toAmount: prev.fromAmount
    }));

    // Notify parent component
    if (onTokenChange) {
      onTokenChange(swapState.toToken, swapState.fromToken);
    }
  };

  // Handle amount input change
  const handleFromAmountChange = (value: string) => {
    setSwapState(prev => ({ ...prev, fromAmount: value }));
  };

  // Handle token selection from modal
  const handleFromTokenSelect = (token: Token) => {
    setSwapState(prev => ({
      ...prev,
      fromToken: token,
      fromAmount: '',
      toAmount: ''
    }));
    setQuote(null);
    setShowFromTokenSelector(false);

    if (onTokenChange) {
      onTokenChange(token, swapState.toToken);
    }
  };

  const handleToTokenSelect = (token: Token) => {
    setSwapState(prev => ({
      ...prev,
      toToken: token,
      fromAmount: '',
      toAmount: ''
    }));
    setQuote(null);
    setShowToTokenSelector(false);

    if (onTokenChange) {
      onTokenChange(swapState.fromToken, token);
    }
  };

  // Execute swap
  const handleSwap = async () => {
    if (!chainId || !isChainSupported(chainId)) {
      handleError(new Error('Chain not supported for swapping'));
      return;
    }

    if (!isConnected || !address) {
      handleError(new Error('Wallet not connected'));
      return;
    }

    if (!swapState.fromToken || !swapState.toToken || !swapState.fromAmount || !quote) {
      handleError(new Error('Please fill in all required fields'));
      return;
    }

    if (!areTokensValidForChain(swapState.fromToken, swapState.toToken)) {
      handleError(new Error('Tokens not valid for current chain'));
      return;
    }

    // Clear previous transaction hash when starting new swap
    setCurrentTransactionHash(null);

    setIsSwapping(true);
    setCurrentStep('swapping');

    try {
      // Calculate minimum amount out with slippage
      const slippageMultiplier = (100 - parseFloat(swapState.slippage)) / 100;
      const amountOutMin = (parseFloat(quote.amountOut) * slippageMultiplier).toString();

      const swapParams: SwapParams = {
        tokenIn: swapState.fromToken,
        tokenOut: swapState.toToken,
        amountIn: swapState.fromAmount,
        amountOutMin,
        to: address,
        deadline: parseInt(swapState.deadline),
        slippageTolerance: parseFloat(swapState.slippage),
        route: quote.route // Include pre-calculated route from quote
      };

      // Execute swap using DEX service with proper client injection
      const txHash = await dexExecuteSwap(swapParams);
      setCurrentTransactionHash(txHash);

      // Add transaction to tracking
      addTransaction({
        hash: txHash,
        type: 'SWAP',
        fromToken: swapState.fromToken,
        toToken: swapState.toToken,
        fromAmount: swapState.fromAmount,
        toAmount: quote.amountOut,
        fromAmountFormatted: swapState.fromAmount,
        toAmountFormatted: quote.amountOut,
        slippage: swapState.slippage,
        priceImpact: quote.priceImpact.toString(),
        userAddress: address,
        status: 'pending'
      });

      setCurrentStep('complete');

      // Reset form
      setSwapState(prev => ({
        ...prev,
        fromAmount: '',
        toAmount: ''
      }));

      // Refresh balances
      refreshBalances();

    } catch (error) {
      console.error('Swap error:', error);
      handleError(error as Error);
      setCurrentStep('idle');
    } finally {
      setIsSwapping(false);
    }
  };

  // Handle chain switch
  const handleChainSwitch = async (targetChainId: number) => {
    if (!switchChain) return;

    try {
      await switchChain({ chainId: targetChainId });
    } catch (error) {
      console.error('Chain switch error:', error);
      handleError(error as Error);
    }
  };

  // Get formatted balance for a token
  const getTokenBalance = (token: Token | null): string => {
    if (!token) return '0';
    return getFormattedBalance(token.address) || '0';
  };

  // Check if swap is possible
  const canSwap = useMemo(() => {
    return (
      isConnected &&
      isChainSupportedForSwap &&
      swapState.fromToken &&
      swapState.toToken &&
      swapState.fromAmount &&
      parseFloat(swapState.fromAmount) > 0 &&
      quote &&
      !isSwapping &&
      !isLoadingQuote &&
      areTokensValidForChain(swapState.fromToken, swapState.toToken)
    );
  }, [
    isConnected,
    isChainSupportedForSwap,
    swapState.fromToken,
    swapState.toToken,
    swapState.fromAmount,
    quote,
    isSwapping,
    isLoadingQuote
  ]);

  // Get swap button text
  const getSwapButtonText = (): string => {
    if (!isConnected) return 'Connect Wallet';
    if (!isChainSupportedForSwap) return 'Unsupported Chain';
    if (!swapState.fromToken || !swapState.toToken) return 'Select Tokens';
    if (!swapState.fromAmount || parseFloat(swapState.fromAmount) <= 0) return 'Enter Amount';
    if (isLoadingQuote) return 'Getting Quote...';
    if (!quote) return 'No Quote Available';
    if (isSwapping) return 'Swapping...';
    return `Swap on ${dexName}`;
  };

  return (
    <>
      <Card className="w-full max-w-md mx-auto bg-stone-900/95 border-amber-500/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">
            Swap {dexName && `on ${dexName}`}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="text-gray-400 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Chain indicator */}
        {chainId && (
          <div className="text-xs text-gray-400">
            Chain: {chainId} {!isChainSupportedForSwap && '(Unsupported)'}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Token Loading State */}
        {tokensLoading && (
          <div className="p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-blue-400 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
              <span>Loading tokens...</span>
            </div>
          </div>
        )}

        {/* Token Loading Error */}
        {tokensError && (
          <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Failed to load tokens: {tokensError}</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {hasError && error && (
          <ErrorDisplay
            error={error}
            onRetry={retry}
            onReset={clearError}
            isRetrying={isRetrying}
          />
        )}

        {/* Chain not supported warning */}
        {!isChainSupportedForSwap && (
          <div className="p-3 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Chain not supported for swapping</span>
            </div>
            <div className="text-xs text-yellow-300 mt-1">
              Please switch to KalyChain, BSC, or Arbitrum
            </div>
          </div>
        )}

        {/* From Token */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-300">From</Label>
          <div className="relative">
            <div className="flex items-center justify-between p-3 bg-stone-800 border border-stone-700 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 p-2 h-auto text-white hover:bg-stone-700"
                  onClick={() => setShowFromTokenSelector(true)}
                  disabled={!isChainSupportedForSwap}
                >
                  {swapState.fromToken ? (
                    <>
                      <TokenIcon token={swapState.fromToken} />
                      <span className="font-medium">{swapState.fromToken.symbol}</span>
                    </>
                  ) : (
                    <span className="text-gray-400">Select token</span>
                  )}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col items-end flex-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={swapState.fromAmount}
                  onChange={(e) => {
                    // Only allow numbers and decimal point
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    handleFromAmountChange(value);
                  }}
                  className="text-right bg-transparent border-none text-lg font-medium text-white placeholder-gray-500 p-0 h-auto w-full"
                  disabled={!isChainSupportedForSwap}
                />
                {swapState.fromToken && (
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <span>Balance: {getTokenBalance(swapState.fromToken)}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Percentage buttons */}
            {swapState.fromToken && (
              <div className="flex gap-1 mt-2">
                {[25, 50, 75].map((percentage) => (
                  <Button
                    key={percentage}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const balance = getTokenBalance(swapState.fromToken!);
                      const numBalance = parseFloat(balance);
                      if (!isNaN(numBalance)) {
                        const amount = (numBalance * percentage / 100).toString();
                        handleFromAmountChange(amount);
                      }
                    }}
                    className="flex-1 text-xs h-7 bg-stone-800 border-stone-600 hover:bg-stone-700 text-gray-300"
                    disabled={!isChainSupportedForSwap}
                  >
                    {percentage}%
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const balance = getTokenBalance(swapState.fromToken!);
                    handleFromAmountChange(balance);
                  }}
                  className="flex-1 text-xs h-7 bg-stone-800 border-stone-600 hover:bg-stone-700 text-gray-300 font-semibold"
                  disabled={!isChainSupportedForSwap}
                >
                  MAX
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSwapTokens}
            className="rounded-full p-2 bg-stone-800 hover:bg-stone-700 border border-stone-600"
            disabled={!isChainSupportedForSwap}
          >
            <ArrowUpDown className="h-4 w-4 text-white" />
          </Button>
        </div>

        {/* To Token */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-300">To</Label>
          <div className="relative">
            <div className="flex items-center justify-between p-3 bg-stone-800 border border-stone-700 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 p-2 h-auto text-white hover:bg-stone-700"
                  onClick={() => setShowToTokenSelector(true)}
                  disabled={!isChainSupportedForSwap}
                >
                  {swapState.toToken ? (
                    <>
                      <TokenIcon token={swapState.toToken} />
                      <span className="font-medium">{swapState.toToken.symbol}</span>
                    </>
                  ) : (
                    <span className="text-gray-400">Select token</span>
                  )}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col items-end flex-1 min-w-0">
                <div className="text-lg font-medium text-white truncate w-full text-right">
                  {isLoadingQuote ? (
                    <div className="animate-pulse">...</div>
                  ) : (
                    (() => {
                      // Format toAmount to prevent overflow
                      if (!swapState.toAmount || swapState.toAmount === '0.0') return '0.0';
                      const num = parseFloat(swapState.toAmount);
                      if (isNaN(num)) return '0.0';

                      // Format based on magnitude - always human readable, no scientific notation
                      if (num >= 1000000) {
                        return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
                      } else if (num >= 1) {
                        return num.toLocaleString('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 2 });
                      } else if (num >= 0.0001) {
                        return num.toFixed(6);
                      } else if (num > 0) {
                        // For very small numbers, show up to 10 decimal places
                        return num.toFixed(10).replace(/\.?0+$/, '');
                      }
                      return '0.0';
                    })()
                  )}
                </div>
                {swapState.toToken && (
                  <div className="text-xs text-gray-400 mt-1">
                    Balance: {getTokenBalance(swapState.toToken)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quote Information */}
        {quote && swapState.fromToken && swapState.toToken && (
          <div className="p-3 bg-stone-800/50 border border-stone-700 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Price Impact</span>
              <span className={`font-medium ${getPriceImpactColor(quote.priceImpact)}`}>
                {formatPriceImpact(quote.priceImpact)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Route</span>
              <span className="text-white text-xs">
                {quote.route.length > 2 ? 'Multi-hop' : 'Direct'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Slippage</span>
              <span className="text-white">{swapState.slippage}%</span>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-3 bg-stone-800/50 border border-stone-700 rounded-lg space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">Slippage Tolerance</Label>
              <div className="flex gap-2">
                {['0.1', '0.5', '1.0'].map((value) => (
                  <Button
                    key={value}
                    variant={swapState.slippage === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSwapState(prev => ({ ...prev, slippage: value }))}
                    className="text-xs"
                  >
                    {value}%
                  </Button>
                ))}
                <Input
                  type="number"
                  placeholder="Custom"
                  value={swapState.slippage}
                  onChange={(e) => setSwapState(prev => ({ ...prev, slippage: e.target.value }))}
                  className="w-20 text-xs"
                  step="0.1"
                  min="0.1"
                  max="50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-300">Transaction Deadline</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={swapState.deadline}
                  onChange={(e) => setSwapState(prev => ({ ...prev, deadline: e.target.value }))}
                  className="w-20 text-xs"
                  min="1"
                  max="180"
                />
                <span className="text-xs text-gray-400">minutes</span>
              </div>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <Button
          onClick={handleSwap}
          disabled={!canSwap}
          className="w-full h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-2 border-amber-400/50 hover:border-amber-300 disabled:from-stone-800 disabled:to-stone-800 disabled:text-gray-400 disabled:border-stone-600 disabled:cursor-not-allowed transition-all duration-200 shadow-xl hover:shadow-2xl hover:shadow-amber-500/50 disabled:shadow-none active:scale-[0.98]"
        >
          {isSwapping && (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          )}
          {getSwapButtonText()}
        </Button>

        {/* Transaction Status */}
        {currentTransactionHash && (
          <div className="relative p-3 bg-green-900/30 border border-green-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="h-4 w-4" />
                <span>Transaction Submitted</span>
              </div>
              <button
                onClick={() => setCurrentTransactionHash(null)}
                className="text-green-400 hover:text-green-300 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="text-xs text-green-300 break-all flex-1">
                {currentTransactionHash.slice(0, 10)}...{currentTransactionHash.slice(-8)}
              </div>
              <a
                href={getExplorerUrl(currentTransactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors whitespace-nowrap"
              >
                <span>View</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="text-xs text-green-400/60 mt-1">
              Auto-dismissing in 8s
            </div>
          </div>
        )}
        </CardContent>
      </Card>

      {/* Token Selector Modals */}
      <TokenSelectorModal
        isOpen={showFromTokenSelector}
        onClose={() => setShowFromTokenSelector(false)}
        onTokenSelect={handleFromTokenSelect}
        selectedToken={swapState.fromToken}
        tokens={supportedTokens}
        title="Select From Token"
        getFormattedBalance={getFormattedBalance}
      />

      <TokenSelectorModal
        isOpen={showToTokenSelector}
        onClose={() => setShowToTokenSelector(false)}
        onTokenSelect={handleToTokenSelect}
        selectedToken={swapState.toToken}
        tokens={supportedTokens}
        title="Select To Token"
        getFormattedBalance={getFormattedBalance}
      />
    </>
  );
}
