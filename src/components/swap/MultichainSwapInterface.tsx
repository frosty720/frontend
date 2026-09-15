'use client';

import { CHAIN_IDS, KALYCHAIN_EXPLORER_URL } from '@/config/chains';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, ArrowLeftRight, Settings, AlertTriangle, CheckCircle, ChevronDown, X, ExternalLink } from 'lucide-react';
import TokenSelectorModal from './TokenSelectorModal';
import ErrorDisplay from './ErrorDisplay';
import { useSwapErrorHandler } from '@/hooks/useSwapErrorHandler';
import { useSwapTransactions } from '@/hooks/useSwapTransactions';
import { swapLogger } from '@/lib/logger';

// Wagmi imports for wallet interaction
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useActiveWalletChain, useActiveWallet } from 'thirdweb/react';

// New multichain DEX service imports
import { Token, QuoteResult, SwapParams } from '@/services/dex';
import { isChainSupported } from '@/config/dex';
import { KALYCHAIN_MIN_PRIORITY_FEE_WEI, isKalyChainFamily } from '@/config/gas';

// Custom hooks
import { useMultichainTokenBalance } from '@/hooks/useMultichainTokenBalance';
import { useTokenLists } from '@/hooks/useTokenLists';
import { useV3Swap } from '@/hooks/useV3Swap';
import { useTokenUsdPrices, usdPriceOf } from '@/hooks/useTokenUsdPrices';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { describeError } from '@/i18n/errorText';

// Price impact utilities
import { formatPriceImpact, getPriceImpactColor } from '@/utils/multichainPriceImpact';

// Token logo with a monogram fallback when the image fails to load
function TokenIcon({ token }: { token: Token }) {
  const [imageError, setImageError] = React.useState(false);

  if (imageError || !token.logoURI) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-on-gold">
        {token.symbol.charAt(0)}
      </span>
    );
  }

  return (
    <img
      src={token.logoURI}
      alt={token.symbol}
      className="size-6 shrink-0 rounded-full"
      onError={() => setImageError(true)}
    />
  );
}

export interface MultichainSwapInterfaceProps {
  fromToken?: Token | null;
  toToken?: Token | null;
  onTokenChange?: (fromToken: Token | null, toToken: Token | null) => void;
  /** Reports the current quote's token path (addresses), or null when there is no quote. */
  onQuoteChange?: (route: string[] | null) => void;
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
  onTokenChange,
  onQuoteChange
}: MultichainSwapInterfaceProps = {}) {
  const dict = useDict();
  const fmt = useFormat();

  // Wagmi hooks for wallet interaction
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  // The connected wallet's ACTUAL network (e.g. MetaMask), tracked by thirdweb separately from
  // the swap's network. When a user is connected via MetaMask + the in-app wallet and MetaMask is
  // on a different network, signing fails — so we warn and block, exactly like the bridge does.
  const activeWalletChain = useActiveWalletChain();
  const activeWallet = useActiveWallet();
  const networkName = (id?: number): string => {
    switch (id) {
      case CHAIN_IDS.KALYCHAIN: return 'KalyChain';
      case 56: return 'BNB Smart Chain';
      case 42161: return 'Arbitrum One';
      default: return id ? `chain ${id}` : 'an unsupported network';
    }
  };

  // Track MetaMask's (injected provider) LIVE network straight from window.ethereum, updated on
  // every chainChanged event. wagmi + thirdweb both report a stale chain here, so for an external
  // wallet this is the ground truth for what network the user will actually sign on.
  const [injectedChainId, setInjectedChainId] = useState<number | undefined>(undefined);
  useEffect(() => {
    const eth = (typeof window !== 'undefined')
      ? (window as unknown as { ethereum?: { request?: (a: { method: string }) => Promise<string>; on?: (e: string, cb: (...a: unknown[]) => void) => void; removeListener?: (e: string, cb: (...a: unknown[]) => void) => void } }).ethereum
      : undefined;
    if (!eth?.request) return;
    const read = () => {
      eth.request!({ method: 'eth_chainId' })
        .then((hex) => setInjectedChainId(parseInt(hex, 16)))
        .catch(() => {});
    };
    read();
    eth.on?.('chainChanged', read);
    return () => eth.removeListener?.('chainChanged', read);
  }, []);

  // The wallet's REAL signing network: for an external/injected wallet (MetaMask) use the live
  // injected chain; for the in-app wallet use thirdweb's tracked chain (no injected provider).
  const walletId = activeWallet?.id;
  const isInAppWallet = walletId === 'inApp' || walletId === 'embedded';
  const walletRealChainId = (!isInAppWallet && injectedChainId) ? injectedChainId : activeWalletChain?.id;
  const networkMismatch = Boolean(
    isConnected && walletRealChainId && chainId && walletRealChainId !== chainId
  );

  // Debug: surfaces every chain source so we can see exactly what's stale.
  useEffect(() => {
    console.warn('[swap-network-check]', { uiChain: chainId, thirdwebChain: activeWalletChain?.id, injectedChainId, walletId, walletRealChainId, networkMismatch });
  }, [chainId, activeWalletChain?.id, injectedChainId, walletId, walletRealChainId, networkMismatch]);

  // Debug: Log chain ID changes
  useEffect(() => {
    swapLogger.debug('🔗 MultichainSwapInterface chainId changed:', {
      chainId,
      isConnected,
      address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'none'
    });
  }, [chainId, isConnected, address]);

  // Use dynamic token lists instead of hardcoded tokens
  const { tokens: supportedTokens, loading: tokensLoading, error: tokensError } = useTokenLists({ chainId });

  // Debug logging for token loading
  useEffect(() => {
    swapLogger.debug('🔍 MultichainSwapInterface token loading status:', {
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

    swapLogger.debug('🔍 MultichainSwapInterface supportedTokens:', supportedTokens.map(t => ({ symbol: t.symbol, isNative: t.isNative })));

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

    swapLogger.debug('🔍 MultichainSwapInterface defaultTokenPair:', {
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

  // KalySwap is V3-only; the V2/V3 dispatcher and its toggle were removed with V2.
  const { getQuote: dexGetQuote, getQuoteExactOutput: dexGetQuoteExactOutput, executeSwap: dexExecuteSwap } = useV3Swap(chainId || CHAIN_IDS.KALYCHAIN);

  const [isSwapping, setIsSwapping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'swapping' | 'complete'>('idle');
  const [currentTransactionHash, setCurrentTransactionHash] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Which field the user typed in last — drives quote direction (exact-input vs exact-output)
  const [lastEdited, setLastEdited] = useState<'from' | 'to'>('from');

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
      swapLogger.debug('✅ Retry successful');
    },
    onRetryFailed: (error) => {
      swapLogger.error('❌ Retry failed after max attempts:', error);
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

  // Get block explorer URL for current chain
  const getExplorerUrl = (txHash: string) => {
    if (!chainId) return '';
    switch (chainId) {
      case CHAIN_IDS.KALYCHAIN: return `${KALYCHAIN_EXPLORER_URL}/tx/${txHash}`;
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

  // The amount the user actually typed — the other field is quote-derived.
  // Keying the effect on this (not both amounts) prevents requote loops when
  // the quote fills the opposite field.
  const drivingAmount = lastEdited === 'to' ? swapState.toAmount : swapState.fromAmount;

  // Get quote when swap parameters change (exact-input when From was edited,
  // exact-output when To was edited)
  useEffect(() => {
    const getQuote = async () => {
      if (!chainId || !isChainSupported(chainId) || !swapState.fromToken || !swapState.toToken || !drivingAmount) {
        setQuote(null);
        setQuoteError(null);
        return;
      }

      if (parseFloat(drivingAmount) <= 0) {
        setQuote(null);
        setQuoteError(null);
        return;
      }

      setIsLoadingQuote(true);
      try {
        if (lastEdited === 'to') {
          const reverseQuote = await dexGetQuoteExactOutput(
            swapState.fromToken,
            swapState.toToken,
            drivingAmount
          );
          setQuote({
            amountOut: drivingAmount,
            priceImpact: reverseQuote.priceImpact,
            route: reverseQuote.route,
            gasEstimate: reverseQuote.gasEstimate,
          });
          setQuoteError(null);
          setSwapState(prev => ({ ...prev, fromAmount: reverseQuote.amountIn }));
        } else {
          const quoteResult = await dexGetQuote(
            swapState.fromToken,
            swapState.toToken,
            drivingAmount
          );
          setQuote(quoteResult);
          setQuoteError(null);
          setSwapState(prev => ({ ...prev, toAmount: quoteResult.amountOut }));
        }
      } catch (error) {
        swapLogger.error('Quote error:', error);
        setQuote(null);
        const message = error instanceof Error ? error.message : '';
        if (message.includes('Insufficient liquidity')) {
          setQuoteError(
            lastEdited === 'to'
              ? interpolate(dict.swap.noLiquidityOut, { amount: drivingAmount, symbol: swapState.toToken.symbol })
              : dict.swap.noLiquidity
          );
        } else if (message.includes('Pair not found') || message.includes('No V3 route')) {
          setQuoteError(interpolate(dict.swap.noPool, { from: swapState.fromToken.symbol, to: swapState.toToken.symbol }));
        } else {
          // Any other quote failure (RPC down, UserError, wallet/viem error, …) — always the
          // reader's language, never the raw (often English) underlying message.
          setQuoteError(describeError(error, dict));
        }
        setSwapState(prev => lastEdited === 'to'
          ? { ...prev, fromAmount: '' }
          : { ...prev, toAmount: '' });
      } finally {
        setIsLoadingQuote(false);
      }
    };

    // Debounce quote requests
    const timeoutId = setTimeout(getQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [chainId, swapState.fromToken, swapState.toToken, drivingAmount, lastEdited]);

  // Helper function to check if tokens are valid for current chain
  const areTokensValidForChain = (fromToken: Token | null, toToken: Token | null): boolean => {
    if (!chainId || !fromToken || !toToken) return false;
    return fromToken.chainId === chainId && toToken.chainId === chainId;
  };

  // Handle token swap (flip from/to tokens)
  const handleSwapTokens = () => {
    setLastEdited('from');
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
    setLastEdited('from');
    setSwapState(prev => ({ ...prev, fromAmount: value }));
  };

  const handleToAmountChange = (value: string) => {
    setLastEdited('to');
    setSwapState(prev => ({ ...prev, toAmount: value }));
  };

  // Handle token selection from modal
  const handleFromTokenSelect = (token: Token) => {
    setLastEdited('from');
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
    setLastEdited('from');
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

    // Bridge-style guard: the wallet is on a different network than this swap — block and tell
    // the user to switch their wallet (signing on the wrong network is what caused "wrong token /
    // fee unavailable" in MetaMask).
    if (networkMismatch) {
      handleError(new Error(`Your wallet is on ${networkName(walletRealChainId)}. Please switch it to ${networkName(chainId)} to complete this swap.`));
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
        priceImpact: (quote.priceImpact || 0).toString(),
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
      swapLogger.error('Swap error:', error);
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
      swapLogger.error('Chain switch error:', error);
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
      areTokensValidForChain(swapState.fromToken, swapState.toToken) &&
      !networkMismatch
    );
  }, [
    isConnected,
    isChainSupportedForSwap,
    swapState.fromToken,
    swapState.toToken,
    swapState.fromAmount,
    quote,
    isSwapping,
    isLoadingQuote,
    networkMismatch
  ]);

  // The page's "Optimal route" panel mirrors whatever the current quote routes through.
  useEffect(() => {
    onQuoteChange?.(quote?.route ?? null);
  }, [quote, onQuoteChange]);

  // USD estimates and the network fee, priced from the V3 subgraph (derivedETH × ethPriceUSD).
  const nativeToken = useMemo(() => supportedTokens.find(t => t.isNative) ?? null, [supportedTokens]);
  const usdPrices = useTokenUsdPrices([swapState.fromToken, swapState.toToken, nativeToken], chainId || CHAIN_IDS.KALYCHAIN);
  const fromAmountNum = parseFloat(swapState.fromAmount) || 0;
  const toAmountNum = parseFloat(swapState.toAmount) || 0;
  const fromPrice = usdPriceOf(usdPrices, swapState.fromToken);
  const toPrice = usdPriceOf(usdPrices, swapState.toToken);
  const fromUsd = fromPrice !== null && fromAmountNum > 0 ? fromAmountNum * fromPrice : null;
  const toUsd = toPrice !== null && toAmountNum > 0 ? toAmountNum * toPrice : null;
  const rate = quote && fromAmountNum > 0 && toAmountNum > 0 ? toAmountNum / fromAmountNum : null;

  // Network fee ≈ (quoter gas + 21,000 intrinsic gas) × the 21 gwei tip every KalyChain write carries.
  const networkFee = useMemo(() => {
    if (!quote?.gasEstimate || !isKalyChainFamily(chainId)) return null;
    const gas = BigInt(quote.gasEstimate) + 21_000n;
    const native = Number(gas * KALYCHAIN_MIN_PRIORITY_FEE_WEI) / 1e18;
    const nativePrice = usdPriceOf(usdPrices, nativeToken);
    return { native, usd: nativePrice !== null ? native * nativePrice : null };
  }, [quote?.gasEstimate, chainId, usdPrices, nativeToken]);

  const usdText = (value: number) => (value < 0.01 ? `< ${fmt.usd(0.01)}` : fmt.usd(value));
  const feeText = (): string => {
    if (!networkFee) return '—';
    if (networkFee.usd === null) return `≈ ${fmt.number(networkFee.native, { maximumFractionDigits: 6 })} ${nativeToken?.symbol ?? ''}`;
    return networkFee.usd < 0.001 ? `< ${fmt.usd(0.001, { decimals: 3 })}` : `≈ ${fmt.usd(networkFee.usd, { decimals: 3 })}`;
  };

  // Get swap button text
  const getSwapButtonText = (): string => {
    if (!isConnected) return dict.swap.btnConnect;
    if (networkMismatch) return interpolate(dict.swap.btnSwitch, { network: networkName(chainId) });
    if (!isChainSupportedForSwap) return dict.swap.btnUnsupported;
    if (!swapState.fromToken || !swapState.toToken) return dict.swap.btnSelect;
    if (!swapState.fromAmount || parseFloat(swapState.fromAmount) <= 0) return dict.swap.btnEnter;
    if (isLoadingQuote) return dict.swap.btnQuoting;
    if (!quote) return dict.swap.btnNoQuote;
    if (isSwapping) return dict.swap.btnSwapping;
    return interpolate(dict.swap.btnSwap, { from: swapState.fromToken.symbol, to: swapState.toToken.symbol });
  };

  const disabledInputs = !isChainSupportedForSwap;
  const setPercentage = (percentage: number) => {
    const numBalance = parseFloat(getTokenBalance(swapState.fromToken));
    if (!isNaN(numBalance)) {
      handleFromAmountChange(percentage === 100 ? getTokenBalance(swapState.fromToken) : (numBalance * percentage / 100).toString());
    }
  };

  return (
    <>
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        {/* Token Loading State */}
        {tokensLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-info/25 bg-info/10 p-3 text-sm text-info">
            <span className="size-4 animate-spin rounded-full border-2 border-info/30 border-t-info" />
            <span>{dict.swap.loadingTokens}</span>
          </div>
        )}

        {/* Token Loading Error */}
        {tokensError && (
          <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{interpolate(dict.swap.tokensFailed, { error: describeError(tokensError, dict) })}</span>
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

        {/* Quote error — otherwise a failed quote silently shows 0.0 out */}
        {quoteError && !isLoadingQuote && (
          <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold-soft p-3 text-sm text-gold-light">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{quoteError}</span>
          </div>
        )}

        {/* Chain not supported warning */}
        {!isChainSupportedForSwap && (
          <div className="rounded-xl border border-gold/25 bg-gold-soft p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-gold-light">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{dict.swap.unsupportedTitle}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{dict.swap.unsupportedBody}</div>
          </div>
        )}

        {/* Wallet on the wrong network warning (mirrors the bridge page) */}
        {networkMismatch && (
          <div className="rounded-xl border border-gold/25 bg-gold-soft p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-gold-light">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{dict.swap.wrongNetworkTitle}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {interpolate(dict.swap.wrongNetworkBody, { wallet: networkName(walletRealChainId), network: networkName(chainId) })}
            </div>
            <Button size="sm" className="mt-2" onClick={() => handleChainSwitch(chainId)}>
              {interpolate(dict.swap.switchTo, { network: networkName(chainId) })}
            </Button>
          </div>
        )}

        {/* You pay */}
        <div className="rounded-xl bg-surface-alt p-4">
          <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
            <span className="shrink-0">{dict.swap.youPay}</span>
            {swapState.fromToken && (
              <span className="min-w-0 truncate">
                {interpolate(dict.swap.balance, { amount: `${getTokenBalance(swapState.fromToken)} ${swapState.fromToken.symbol}` })}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              aria-label={dict.swap.youPay}
              value={swapState.fromAmount}
              onChange={(e) => {
                // Only allow numbers and decimal point
                handleFromAmountChange(e.target.value.replace(/[^0-9.]/g, ''));
              }}
              disabled={disabledInputs}
              className="h-10 w-full min-w-0 flex-1 bg-transparent font-display text-[28px] font-semibold leading-none text-cream outline-none placeholder:text-muted-deep disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowFromTokenSelector(true)}
              disabled={disabledInputs}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-hi px-3 py-1.5 text-sm font-semibold text-cream transition-colors hover:bg-surface disabled:opacity-50"
            >
              {swapState.fromToken ? (
                <>
                  <TokenIcon token={swapState.fromToken} />
                  <span>{swapState.fromToken.symbol}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{dict.swap.selectToken}</span>
              )}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-muted-deep">{fromUsd !== null ? `≈ ${usdText(fromUsd)}` : '\u00a0'}</span>
            {swapState.fromToken && (
              <div className="flex gap-1">
                {[25, 50, 75, 100].map((percentage) => (
                  <button
                    key={percentage}
                    type="button"
                    onClick={() => setPercentage(percentage)}
                    disabled={disabledInputs}
                    className="rounded-md border border-line bg-surface-hi px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-cream disabled:opacity-50"
                  >
                    {percentage === 100 ? 'MAX' : `${percentage}%`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSwapTokens}
            disabled={disabledInputs}
            aria-label={dict.swap.flip}
            className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-alt text-gold transition-colors hover:bg-surface-hi disabled:opacity-50"
          >
            <ArrowDown className="size-4" />
          </button>
        </div>

        {/* You receive */}
        <div className="rounded-xl bg-surface-alt p-4">
          <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
            <span className="shrink-0">{dict.swap.youReceive}</span>
            {swapState.toToken && (
              <span className="min-w-0 truncate">
                {interpolate(dict.swap.balance, { amount: `${getTokenBalance(swapState.toToken)} ${swapState.toToken.symbol}` })}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            {isLoadingQuote && lastEdited === 'from' ? (
              <div className="h-10 min-w-0 flex-1 animate-pulse font-display text-[28px] font-semibold leading-10 text-gold-light">…</div>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                aria-label={dict.swap.youReceive}
                value={swapState.toAmount}
                onChange={(e) => {
                  // Only allow numbers and decimal point
                  handleToAmountChange(e.target.value.replace(/[^0-9.]/g, ''));
                }}
                disabled={disabledInputs}
                className="h-10 w-full min-w-0 flex-1 bg-transparent font-display text-[28px] font-semibold leading-none text-gold-light outline-none placeholder:text-muted-deep disabled:opacity-50"
              />
            )}
            <button
              type="button"
              onClick={() => setShowToTokenSelector(true)}
              disabled={disabledInputs}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-hi px-3 py-1.5 text-sm font-semibold text-cream transition-colors hover:bg-surface disabled:opacity-50"
            >
              {swapState.toToken ? (
                <>
                  <TokenIcon token={swapState.toToken} />
                  <span>{swapState.toToken.symbol}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{dict.swap.selectToken}</span>
              )}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </div>
          <div className="mt-2 text-[13px] text-muted-deep">{toUsd !== null ? `≈ ${usdText(toUsd)}` : '\u00a0'}</div>
        </div>

        {/* Quote details */}
        <dl className="divide-y divide-line text-sm">
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">{dict.swap.rate}</dt>
            <dd className="min-w-0 break-words text-right font-semibold tabular-nums text-cream">
              {rate !== null && swapState.fromToken && swapState.toToken
                ? `1 ${swapState.fromToken.symbol} = ${fmt.number(rate, { maximumFractionDigits: rate < 1 ? 6 : 4 })} ${swapState.toToken.symbol}`
                : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">{dict.swap.priceImpact}</dt>
            <dd className={quote ? `font-semibold ${getPriceImpactColor(quote.priceImpact || 0)}` : 'font-semibold text-cream'}>
              {quote ? formatPriceImpact(quote.priceImpact || 0) : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">{dict.swap.maxSlippage}</dt>
            <dd>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                aria-expanded={showSettings}
                aria-label={dict.swap.editSettings}
                className="inline-flex items-center gap-1.5 font-semibold text-cream transition-colors hover:text-gold"
              >
                <span>{swapState.slippage}%</span>
                <Settings className="size-3.5 text-muted-foreground" />
              </button>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">{dict.swap.networkFee}</dt>
            <dd className="font-semibold tabular-nums text-cream">{feeText()}</dd>
          </div>
        </dl>

        {/* Settings Panel */}
        {showSettings && (
          <div className="space-y-3 rounded-xl border border-line bg-surface-alt p-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">{dict.swap.slippageTolerance}</div>
              <div className="flex flex-wrap gap-2">
                {['0.1', '0.5', '1.0'].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={swapState.slippage === value ? 'default' : 'secondary'}
                    onClick={() => setSwapState(prev => ({ ...prev, slippage: value }))}
                  >
                    {value}%
                  </Button>
                ))}
                <Input
                  type="number"
                  placeholder={dict.swap.custom}
                  value={swapState.slippage}
                  onChange={(e) => setSwapState(prev => ({ ...prev, slippage: e.target.value }))}
                  className="h-8 w-24 text-xs"
                  step="0.1"
                  min="0.1"
                  max="50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">{dict.swap.deadline}</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={swapState.deadline}
                  onChange={(e) => setSwapState(prev => ({ ...prev, deadline: e.target.value }))}
                  className="h-8 w-24 text-xs"
                  min="1"
                  max="180"
                />
                <span className="text-xs text-muted-foreground">{dict.swap.minutes}</span>
              </div>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <Button onClick={handleSwap} disabled={!canSwap} size="lg" className="h-12 w-full text-[15px]">
          {isSwapping ? (
            <span className="size-4 animate-spin rounded-full border-2 border-on-gold/40 border-t-on-gold" />
          ) : (
            <ArrowLeftRight />
          )}
          {getSwapButtonText()}
        </Button>

        {/* Transaction Status */}
        {currentTransactionHash && (
          <div className="relative rounded-xl border border-success/25 bg-success/10 p-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-success">
                <CheckCircle className="size-4" />
                <span>{dict.swap.submitted}</span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTransactionHash(null)}
                className="text-success transition-colors hover:text-cream"
                aria-label={dict.swap.close}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 break-all text-xs text-cream/80">
                {currentTransactionHash.slice(0, 10)}...{currentTransactionHash.slice(-8)}
              </div>
              <a
                href={getExplorerUrl(currentTransactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-success transition-colors hover:text-cream"
              >
                <span>{dict.swap.view}</span>
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="mt-1 text-xs text-muted-deep">{dict.swap.autoDismiss}</div>
          </div>
        )}
      </section>

      {/* Token Selector Modals */}
      <TokenSelectorModal
        isOpen={showFromTokenSelector}
        onClose={() => setShowFromTokenSelector(false)}
        onTokenSelect={handleFromTokenSelect}
        selectedToken={swapState.fromToken}
        tokens={supportedTokens}
        title={dict.swap.selectFrom}
        getFormattedBalance={getFormattedBalance}
      />

      <TokenSelectorModal
        isOpen={showToTokenSelector}
        onClose={() => setShowToTokenSelector(false)}
        onTokenSelect={handleToTokenSelect}
        selectedToken={swapState.toToken}
        tokens={supportedTokens}
        title={dict.swap.selectTo}
        getFormattedBalance={getFormattedBalance}
      />
    </>
  );
}
