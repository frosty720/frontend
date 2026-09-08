'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits, getContract } from 'viem';
import { ERC20_ABI } from '@/config/abis';
import { Token } from '@/config/dex/types';
import { tokenLogger } from '@/lib/logger';

interface TokenWithBalance extends Token {
  formattedBalance: string;
  balanceUSD?: string; // Calculated from balance * priceUSD
}

export function useTokenBalance(token: Token | null) {
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get wagmi hooks (must be called at top level)
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Calculate USD value if price is available
  const calculateBalanceUSD = (balance: string, priceUSD?: string): string => {
    if (!priceUSD || !balance || balance === '0') return '0';
    const balanceNum = parseFloat(balance);
    const priceNum = parseFloat(priceUSD);
    return (balanceNum * priceNum).toFixed(2);
  };

  useEffect(() => {
    if (!token || !address || !isConnected || !publicClient) {
      setBalance('0');
      return;
    }

    const fetchBalance = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (token.isNative) {
          // Get native KMT balance with timeout
          const nativeBalance = await Promise.race([
            publicClient.getBalance({ address }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Balance fetch timeout')), 5000)
            )
          ]) as bigint;
          setBalance(formatUnits(nativeBalance, 18));
        } else {
          // Get ERC20 token balance with timeout and error handling
          try {
            const tokenContract = getContract({
              address: token.address as `0x${string}`,
              abi: ERC20_ABI,
              client: publicClient,
            });

            const tokenBalance = await Promise.race([
              tokenContract.read.balanceOf([address]),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Balance fetch timeout')), 5000)
              )
            ]) as bigint;
            setBalance(formatUnits(tokenBalance, token.decimals));
          } catch (contractError) {
            // Handle tokens that don't implement proper ERC20 interface (like bridge tokens)
            tokenLogger.warn(`Token ${token.symbol} (${token.address}) doesn't implement balanceOf properly:`, contractError);
            setBalance('0');
          }
        }
      } catch (err) {
        tokenLogger.error('Error fetching token balance:', err);
        // Don't show error for timeouts, just keep previous balance
        if (err instanceof Error && err.message.includes('timeout')) {
          tokenLogger.warn('Balance fetch timed out, keeping previous balance');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch balance');
          setBalance('0');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();

    // Set up polling for balance updates (reduced frequency to avoid RPC overload)
    const interval = setInterval(fetchBalance, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [token, address, isConnected, publicClient]);

  return {
    balance,
    isLoading,
    error,
    formattedBalance: parseFloat(balance).toFixed(6),
    balanceUSD: calculateBalanceUSD(balance, token?.priceUSD),
    // Include token metadata for enhanced display
    tokenMetadata: token ? {
      tradeVolumeUSD: token.tradeVolumeUSD,
      totalLiquidity: token.totalLiquidity,
      derivedKLC: token.derivedKLC,
      txCount: token.txCount,
      priceUSD: token.priceUSD
    } : undefined
  };
}

export function useTokenBalances(tokens: (Token | null)[]) {
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true); // Start with loading state
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track if this is the first load
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Get wagmi hooks (must be called at top level)
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Cache duration: 5 seconds
  const CACHE_DURATION = 5000;

  // Create a ref to store the fetch function to avoid dependency issues
  const fetchBalancesRef = React.useRef<((force?: boolean) => Promise<void>) | null>(null);
  const tokensRef = React.useRef(tokens);

  // Update tokens ref when tokens change
  React.useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  // useEffect to define and manage the fetchBalances function
  useEffect(() => {
    if (!address || !isConnected || !publicClient || tokensRef.current.length === 0) {
      setBalances({});
      setIsLoading(false);
      return;
    }

    const fetchBalances = async (force = false, isInitial = false) => {
      // Check cache unless forced
      const now = Date.now();
      if (!force && now - lastFetchTime < CACHE_DURATION && Object.keys(balances).length > 0) {
        return;
      }

      try {
        // Only show loading spinner on initial load or forced refresh, not during background polling
        if (isInitial || force) {
          setIsLoading(true);
        }
        setError(null);

        const balancePromises = tokensRef.current.map(async (token) => {
          if (!token) return null;

          try {
            // Check if token is native KMT (zero address or isNative flag)
            const isNativeToken = token.isNative ||
                                 token.address === '0x0000000000000000000000000000000000000000' ||
                                 token.address.toLowerCase() === '0x0000000000000000000000000000000000000000';

            if (isNativeToken) {
              const nativeBalance = await Promise.race([
                publicClient.getBalance({ address }),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Balance fetch timeout')), 5000)
                )
              ]) as bigint;
              return {
                symbol: token.symbol,
                balance: formatUnits(nativeBalance, 18)
              };
            } else {
              try {
                const tokenContract = getContract({
                  address: token.address as `0x${string}`,
                  abi: ERC20_ABI,
                  client: publicClient,
                });

                const tokenBalance = await Promise.race([
                  tokenContract.read.balanceOf([address]),
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Balance fetch timeout')), 15000)
                  )
                ]) as bigint;
                return {
                  symbol: token.symbol,
                  balance: formatUnits(tokenBalance, token.decimals)
                };
              } catch (contractError) {
                // Handle tokens that don't implement proper ERC20 interface (like bridge tokens)
                tokenLogger.warn(`Token ${token.symbol} (${token.address}) doesn't implement balanceOf properly:`, contractError);
                // Signal failure — caller will preserve any previously-loaded
                // balance instead of overwriting the UI with a fake 0.
                return { symbol: token.symbol, failed: true } as const;
              }
            }
          } catch (err) {
            // Don't log timeout errors as they're expected with slow RPC
            if (!(err instanceof Error && err.message.includes('timeout'))) {
              tokenLogger.error(`Error fetching balance for ${token.symbol}:`, err);
            }
            // Signal failure — do not overwrite previously-loaded balance.
            return { symbol: token.symbol, failed: true } as const;
          }
        });

        const results = await Promise.all(balancePromises);
        const balanceMap: Record<string, string> = {};

        results.forEach((result) => {
          // Only accept results that actually fetched a balance. Failed/null
          // entries are skipped so the previous good value survives a
          // transient RPC timeout and the UI does not flicker to 0.
          if (result && !('failed' in result)) {
            balanceMap[result.symbol] = result.balance;
          }
        });

        // Merge with prior state so a partial failure only updates the
        // successful tokens and leaves the rest untouched.
        setBalances((prev) => ({ ...prev, ...balanceMap }));
        setLastFetchTime(Date.now());

        // Mark initial load as complete
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      } catch (err) {
        tokenLogger.error('Error fetching token balances:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch balances');
      } finally {
        // Only set loading to false if we were showing loading (initial load or forced refresh)
        if (isInitial || force) {
          setIsLoading(false);
        }
      }
    };

    // Store the function in ref so it can be called by refreshBalances
    fetchBalancesRef.current = (force = false) => fetchBalances(force, false);

    // Initial fetch (mark as initial load)
    fetchBalances(true, true);

    // Set up polling (background updates, no loading spinner) - reduced frequency
    const interval = setInterval(() => fetchBalances(false, false), 30000);

    return () => clearInterval(interval);
    // Gate on publicClient?.chain?.id (a stable primitive) rather than the
    // publicClient object reference: the ref changes on every wagmi store
    // mutation (connector connect, bridge sync), which caused the balance
    // spinner to flicker every time the Thirdweb→wagmi bridge re-synced.
    // The primitive only changes when the *chain* actually changes, which is
    // the only case that requires re-fetching.
  }, [address, isConnected, publicClient?.chain?.id]);

  // Helper function to get token by symbol
  const getTokenBySymbol = (symbol: string): Token | null => {
    return tokensRef.current.find(token => token?.symbol === symbol) || null;
  };

  // Helper function to calculate USD value
  const calculateBalanceUSD = (balance: string, priceUSD?: string): string => {
    if (!priceUSD || !balance || balance === '0') return '0';
    const balanceNum = parseFloat(balance);
    const priceNum = parseFloat(priceUSD);
    return (balanceNum * priceNum).toFixed(2);
  };

  return {
    balances,
    isLoading: isLoading && isInitialLoad, // Only show loading during initial load
    error,
    getBalance: (symbol: string) => balances[symbol] || '0',
    getFormattedBalance: (symbol: string) => parseFloat(balances[symbol] || '0').toFixed(6),
    getBalanceUSD: (symbol: string) => {
      const token = getTokenBySymbol(symbol);
      const balance = balances[symbol] || '0';
      return calculateBalanceUSD(balance, token?.priceUSD);
    },
    getTokenWithBalance: (symbol: string): TokenWithBalance | null => {
      const token = getTokenBySymbol(symbol);
      if (!token) return null;

      const balance = balances[symbol] || '0';
      const formattedBalance = parseFloat(balance).toFixed(6);
      const balanceUSD = calculateBalanceUSD(balance, token.priceUSD);

      return {
        ...token,
        balance,
        formattedBalance,
        balanceUSD
      };
    },
    getAllTokensWithBalances: (): TokenWithBalance[] => {
      return tokensRef.current
        .filter((token): token is Token => token !== null)
        .map(token => {
          const balance = balances[token.symbol] || '0';
          const formattedBalance = parseFloat(balance).toFixed(6);
          const balanceUSD = calculateBalanceUSD(balance, token.priceUSD);

          return {
            ...token,
            balance,
            formattedBalance,
            balanceUSD
          };
        });
    },
    refreshBalances: () => fetchBalancesRef.current?.(true)
  };
}
