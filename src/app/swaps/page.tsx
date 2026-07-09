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
  ShoppingCart,
  Send
} from 'lucide-react';
import TradingChart from '@/components/charts/TradingChart';
import TransactionData from '@/components/swaps/TransactionData';
import SwapInterfaceWrapper from '@/components/swap/SwapInterfaceWrapper';
import { AlchemyPayWidget } from '@/components/onramp';
import { formatTokenPrice, formatPriceChange, usePairMarketStats } from '@/hooks';
import { useWallet } from '@/hooks/useWallet';
import { PriceDataProvider } from '@/contexts/PriceDataContext';
import { useChainId } from 'wagmi';
import { useActiveAccount } from 'thirdweb/react';
import { useHydration } from '@/hooks/useHydration';
import { Token } from '@/config/dex/types';
import { logger } from '@/lib/logger';
import { ProtocolVersionProvider, useProtocolVersion } from '@/contexts/ProtocolVersionContext';
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

  // Send state (for Send tab)
  const [sendState, setSendState] = useState({
    token: null as any,
    amount: '',
    recipient: ''
  });
  const [sendError, setSendError] = useState<string | null>(null);
  const [userTokens, setUserTokens] = useState<any[]>([]);

  // Wallet connection is now handled by useWallet hook

  // GraphQL queries
  const ME_QUERY = `
    query Me {
      me {
        id
        username
        wallets {
          id
          address
          chainId
          balance {
            klc
            tokens {
              symbol
              balance
              address
            }
          }
        }
      }
    }
  `;

  const SEND_TRANSACTION_MUTATION = `
    mutation SendTransaction($input: SendTransactionInput!) {
      sendTransaction(input: $input) {
        id
        hash
        status
      }
    }
  `;

  // User data state
  const [user, setUser] = useState<any>(null);
  const [activeWallet, setActiveWallet] = useState<any>(null);

  // Fetch user data and wallets
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: ME_QUERY,
          }),
        });

        const result = await response.json();
        if (!result.errors && result.data.me) {
          setUser(result.data.me);
          // Set first wallet as active
          if (result.data.me.wallets.length > 0) {
            const wallet = result.data.me.wallets[0];
            setActiveWallet(wallet);

            // Build user tokens list (KLC + ERC20 tokens)
            const tokens = [
              {
                symbol: 'KLC',
                address: 'KLC',
                balance: wallet.balance?.klc || '0',
                isNative: true
              },
              ...(wallet.balance?.tokens || []).map((token: any) => ({
                symbol: token.symbol,
                address: token.address,
                balance: token.balance,
                isNative: false
              }))
            ];
            setUserTokens(tokens);

            // Set default token to KLC
            setSendState(prev => ({ ...prev, token: tokens[0] }));
          }
        }
      } catch (error) {
        logger.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, []);

  // Helper function to prompt for password
  const promptForPassword = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-lg font-semibold mb-4">Enter Wallet Password</h3>
          <p class="text-sm text-gray-600 mb-4">Enter your internal wallet password to authorize this transaction.</p>
          <input
            type="password"
            placeholder="Enter your wallet password"
            class="w-full p-3 border rounded-lg mb-4 password-input"
            autofocus
          />
          <div class="flex gap-2">
            <button class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg confirm-btn">Confirm</button>
            <button class="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg cancel-btn">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const passwordInput = modal.querySelector('.password-input') as HTMLInputElement;
      const confirmBtn = modal.querySelector('.confirm-btn') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('.cancel-btn') as HTMLButtonElement;

      const cleanup = () => {
        document.body.removeChild(modal);
      };

      confirmBtn.onclick = () => {
        const password = passwordInput.value;
        cleanup();
        resolve(password || null);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      passwordInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          confirmBtn.click();
        } else if (e.key === 'Escape') {
          cancelBtn.click();
        }
      };
    });
  };

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

  // Handle swap execution
  const handleSwap = async () => {
    if (!isConnected) {
      router.push('/login');
      return;
    }

    if (!swapState.fromToken || !swapState.toToken || !swapState.fromAmount) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      // In a real implementation, this would interact with the KalySwap DEX smart contracts
      logger.debug('Executing swap:', swapState);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      alert('Swap executed successfully!');

      // Reset form
      setSwapState(prev => ({
        ...prev,
        fromAmount: '',
        toAmount: ''
      }));

    } catch (error) {
      logger.error('Swap error:', error);
      alert('Swap failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle send transaction
  const handleSend = async () => {
    try {
      setSendError(null);
      setLoading(true);

      // Check if user is logged in
      const token = localStorage.getItem('auth_token');
      if (!token) {
        router.push('/login');
        return;
      }

      // Validate inputs
      if (!activeWallet) {
        setSendError('No wallet available');
        return;
      }

      if (!sendState.recipient) {
        setSendError('Recipient address is required');
        return;
      }

      if (!sendState.recipient.match(/^0x[a-fA-F0-9]{40}$/)) {
        setSendError('Invalid recipient address format');
        return;
      }

      if (!sendState.amount || parseFloat(sendState.amount) <= 0) {
        setSendError('Amount must be greater than 0');
        return;
      }

      if (!sendState.token) {
        setSendError('Please select a token');
        return;
      }

      // Check balance
      const selectedToken = userTokens.find(t =>
        t.symbol === sendState.token.symbol && t.address === sendState.token.address
      );

      if (!selectedToken) {
        setSendError('Selected token not found');
        return;
      }

      const balance = parseFloat(selectedToken.balance);
      const amount = parseFloat(sendState.amount);

      if (amount > balance) {
        setSendError(`Insufficient ${selectedToken.symbol} balance`);
        return;
      }

      // Get password from user
      const password = await promptForPassword();
      if (!password) {
        setSendError('Password is required to sign the transaction');
        return;
      }

      // Determine asset (KLC or token address)
      const asset = sendState.token.isNative ? 'KLC' : sendState.token.address;

      // Send transaction
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: SEND_TRANSACTION_MUTATION,
          variables: {
            input: {
              walletId: activeWallet.id,
              toAddress: sendState.recipient,
              amount: sendState.amount,
              asset: asset,
              password: password,
              chainId: activeWallet.chainId
            },
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Reset form
      setSendState(prev => ({
        ...prev,
        amount: '',
        recipient: ''
      }));

      // Refresh user data to show updated balances
      const userResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: ME_QUERY,
        }),
      });

      const userResult = await userResponse.json();
      if (!userResult.errors && userResult.data.me) {
        setUser(userResult.data.me);
        // Update active wallet and tokens
        const wallet = userResult.data.me.wallets.find((w: any) => w.id === activeWallet.id);
        if (wallet) {
          setActiveWallet(wallet);
          const tokens = [
            {
              symbol: 'KLC',
              address: 'KLC',
              balance: wallet.balance?.native?.formattedBalance || '0',
              isNative: true
            },
            ...(wallet.balance?.tokens || []).map((token: any) => ({
              symbol: token.symbol,
              address: token.address,
              balance: token.balance,
              isNative: false
            }))
          ];
          setUserTokens(tokens);
        }
      }

      alert('Transaction sent successfully!');

    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send transaction');
      logger.error('Send error:', error);
    } finally {
      setLoading(false);
    }
  };

  // TokenIcon component for Send tab (matches dashboard pattern)
  const SendTokenIcon = ({ symbol, size = 20 }: { symbol: string; size?: number }) => {
    const [imageError, setImageError] = useState(false);

    // Use KLC logo for wKLC tokens
    const getTokenIconPath = (symbol: string) => {
      const lowerSymbol = symbol.toLowerCase();
      if (lowerSymbol === 'wklc') {
        return '/tokens/klc.png';
      }
      return `/tokens/${lowerSymbol}.png`;
    };

    if (imageError) {
      return (
        <div
          className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {symbol.charAt(0)}
        </div>
      );
    }

    return (
      <img
        src={getTokenIconPath(symbol)}
        alt={symbol}
        width={size}
        height={size}
        className="rounded-full"
        onError={() => setImageError(true)}
      />
    );
  };

  // Token selector component for Send tab (uses user's actual holdings)
  const SendTokenSelector = ({
    selectedToken,
    onTokenSelect,
    label
  }: {
    selectedToken: any;
    onTokenSelect: (token: any) => void;
    label: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <Select
        value={selectedToken ? `${selectedToken.symbol}-${selectedToken.address}` : ''}
        onValueChange={(value) => {
          const token = userTokens.find(t => `${t.symbol}-${t.address}` === value);
          if (token) onTokenSelect(token);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select token">
            {selectedToken && (
              <div className="flex items-center gap-2">
                <SendTokenIcon symbol={selectedToken.symbol} size={24} />
                <span className="font-medium">{selectedToken.symbol}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {userTokens.map((token) => (
            <SelectItem key={`${token.symbol}-${token.address}`} value={`${token.symbol}-${token.address}`}>
              <div className="flex items-center gap-2">
                <SendTokenIcon symbol={token.symbol} size={20} />
                <span className="font-medium">{token.symbol}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

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
    <ProtocolVersionProvider>
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
          // Pass all the other state and functions
          user={user}
          activeWallet={activeWallet}
          sendState={sendState}
          setSendState={setSendState}
          sendError={sendError}
          setSendError={setSendError}
          userTokens={userTokens}
          handleSwap={handleSwap}
          handleSend={handleSend}
          handleSwapTokens={handleSwapTokens}
          handleFromAmountChange={handleFromAmountChange}
          TokenSelector={TokenSelector}
          SendTokenSelector={SendTokenSelector}
          SendTokenIcon={SendTokenIcon}
        />
      </PriceDataProvider>
    </ProtocolVersionProvider>
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
  user,
  activeWallet,
  sendState,
  setSendState,
  sendError,
  setSendError,
  userTokens,
  handleSwap,
  handleSend,
  handleSwapTokens,
  handleFromAmountChange,
  TokenSelector,
  SendTokenSelector,
  SendTokenIcon
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
  user: any;
  activeWallet: any;
  sendState: any;
  setSendState: any;
  sendError: string | null;
  setSendError: any;
  userTokens: any[];
  handleSwap: () => Promise<void>;
  handleSend: () => Promise<void>;
  handleSwapTokens: () => void;
  handleFromAmountChange: (value: string) => void;
  TokenSelector: any;
  SendTokenSelector: any;
  SendTokenIcon: any;
}) {
  // Check if client is hydrated
  const isHydrated = useHydration();

  // Get protocol version
  const { protocolVersion } = useProtocolVersion();

  // Thirdweb in-app wallet (used to distinguish "connected via in-app" from
  // "no wallet at all" so the Send tab can show an accurate empty state).
  const thirdwebAccount = useActiveAccount();

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
  } = usePairMarketStats(swapState.fromToken || undefined, swapState.toToken || undefined, protocolVersion);

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
      // KalyChain: KLC/USDT
      tokenA = dynamicTokens.find(token => token.symbol === 'KLC');
      tokenB = dynamicTokens.find(token => token.symbol === 'USDT' || token.symbol === 'USDt');
    } else if (chainId === CHAIN_IDS.KALYCHAIN_TESTNET) {
      // KalyChain Testnet: tKLS/BUSD
      tokenA = dynamicTokens.find(token => token.symbol === 'tKLS' || token.symbol === 'KLC');
      tokenB = dynamicTokens.find(token => token.symbol === 'BUSD');
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
                  protocolVersion={protocolVersion}
                />
              </div>

              {/* Transaction Data Component */}
              <div className="transaction-data-container">
                <TransactionData
                  selectedPair={{
                    token0Symbol: swapState.fromToken?.symbol || 'KLC',
                    token1Symbol: swapState.toToken?.symbol || 'USDT',
                    pairAddress: pairAddress || undefined
                  }}
                  userAddress={userAddress}
                  protocolVersion={protocolVersion}
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
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="swap" className="flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" />
                        Swap
                      </TabsTrigger>
                      <TabsTrigger value="limit" disabled className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Limit
                      </TabsTrigger>
                      <TabsTrigger value="send" className="flex items-center gap-1">
                        <Send className="h-3 w-3" />
                        Send
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

                <TabsContent value="send" className="mt-1">
                  <Card>
                    <CardContent className="pt-6 space-y-4">
                      {!activeWallet ? (
                        <div className="text-center py-8 text-gray-500">
                          <Send className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          {thirdwebAccount ? (
                            <>
                              <p className="font-medium">Send from In-App Wallet</p>
                              <p className="text-sm">
                                Use your wallet icon in the top right to send tokens from your
                                in-app wallet. This tab is for users with the legacy internal
                                wallet only.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium">No Wallet Connected</p>
                              <p className="text-sm">Please log in to send tokens</p>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          <SendTokenSelector
                            selectedToken={sendState.token}
                            onTokenSelect={(token: any) => setSendState((prev: any) => ({ ...prev, token }))}
                            label="Asset"
                          />

                          <div className="space-y-2">
                            <Label>Amount</Label>
                            <Input
                              type="number"
                              placeholder="0.0"
                              value={sendState.amount}
                              onChange={(e) => setSendState((prev: any) => ({ ...prev, amount: e.target.value }))}
                              className="text-lg h-12"
                            />
                            {sendState.token && (
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>
                                  Available: {parseFloat(sendState.token.balance).toFixed(6)} {sendState.token.symbol}
                                </span>
                                <button
                                  type="button"
                                  className="text-blue-600 hover:underline"
                                  onClick={() => setSendState((prev: any) => ({ ...prev, amount: sendState.token.balance }))}
                                >
                                  Max
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Recipient Address</Label>
                            <Input
                              placeholder="0x..."
                              value={sendState.recipient}
                              onChange={(e) => setSendState((prev: any) => ({ ...prev, recipient: e.target.value }))}
                              className="font-mono"
                            />
                          </div>

                          {sendError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                              <p className="text-sm text-red-600">{sendError}</p>
                            </div>
                          )}

                          <Button
                            onClick={handleSend}
                            disabled={loading || !sendState.amount || !sendState.recipient || !sendState.token}
                            className="w-full h-12 text-lg"
                          >
                            {loading ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Sending...
                              </div>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Send
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="buy" className="mt-1">
                  <Card>
                    <CardContent className="pt-6">
                      <AlchemyPayWidget
                        defaultFiat="USD"
                        defaultCrypto="KLC"
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
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Price</span>
                    <div className="flex items-center gap-2">
                      {pairStatsLoading ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                      ) : pairStatsError ? (
                        <span className="text-xs text-red-600">Error loading price</span>
                      ) : (
                        <>
                          <span className="font-medium">
                            {pairPrice > 0
                              ? `1 ${swapState.fromToken?.symbol} = ${formatTokenPrice(pairPrice, baseTokenForFormatting?.symbol || '')} ${swapState.toToken?.symbol}`
                              : '—'}
                          </span>
                          {priceChange24h !== 0 && (
                            <span
                              className={`text-xs px-1 py-0.5 rounded ${priceChange24h >= 0
                                ? 'text-green-300 bg-green-900/30'
                                : 'text-red-300 bg-red-900/30'
                                }`}
                            >
                              {formatPriceChange(priceChange24h)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">24h Volume</span>
                    {pairStatsLoading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    ) : (
                      <span className="font-medium">
                        ${volume24h > 0 ? volume24h.toLocaleString() : '0'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Liquidity</span>
                    {pairStatsLoading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    ) : (
                      <span className="font-medium">
                        ${liquidity > 0 ? liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
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