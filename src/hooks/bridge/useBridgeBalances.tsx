// Bridge Balances Hook - Balance fetching for bridge operations
// This hook handles balance fetching for origin and destination chains

import { useState, useEffect } from 'react';
import { TokenAmount } from '@hyperlane-xyz/sdk';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import { bridgeLogger } from '@/lib/logger';
import { UserError } from '@/lib/userError';
import { describeError } from '@/i18n/errorText';
import { useDict } from '@/i18n/hooks';

export interface BridgeBalancesParams {
  originChain: string;
  destinationChain: string;
  tokenIndex: number | null;
}

export function useBridgeBalances(params: BridgeBalancesParams) {
  const [originBalance, setOriginBalance] = useState<TokenAmount | null>(null);
  const [destinationBalance, setDestinationBalance] = useState<TokenAmount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { warpCore, multiProvider } = useBridgeContext();
  const { address: account } = useWallet();
  const dict = useDict();

  useEffect(() => {
    const fetchBalances = async () => {
      if (!warpCore || !multiProvider || !account || params.tokenIndex === null) {
        setOriginBalance(null);
        setDestinationBalance(null);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tokens = warpCore.tokens;
        if (params.tokenIndex >= tokens.length) {
          throw new UserError('tokenNotFound');
        }

        const token = tokens[params.tokenIndex];
        if (!token) {
          throw new UserError('tokenNotFound');
        }

        // Fetch origin balance
        try {
          const originBal = await token.getBalance(multiProvider, account);
          setOriginBalance(originBal);
        } catch (err) {
          bridgeLogger.warn('Failed to fetch origin balance:', err);
          setOriginBalance(null);
        }

        // Fetch destination balance
        try {
          // Find destination token
          const destinationToken = token.getConnectionForChain(params.destinationChain)?.token;
          if (destinationToken) {
            const destBal = await destinationToken.getBalance(multiProvider, account);
            setDestinationBalance(destBal);
          } else {
            setDestinationBalance(null);
          }
        } catch (err) {
          bridgeLogger.warn('Failed to fetch destination balance:', err);
          setDestinationBalance(null);
        }
      } catch (err) {
        const errorMessage = describeError(err, dict);
        setError(errorMessage);
        bridgeLogger.error('Balance fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalances();

    // Set up auto-refresh interval (5 seconds like original hyperlane-warp-ui)
    const interval = setInterval(() => {
      fetchBalances();
    }, 5000);

    return () => clearInterval(interval);
  }, [warpCore, multiProvider, account, params.originChain, params.destinationChain, params.tokenIndex]);

  return {
    originBalance,
    destinationBalance,
    isLoading,
    error,
  };
}
