// Fee Quotes Hook - Fee calculation for bridge transfers with automatic refresh
// This hook handles fee calculation with 15-second refresh intervals like the original

import { useState, useEffect, useRef } from 'react';
import { TokenAmount } from '@hyperlane-xyz/sdk';
import { parseUnits } from 'viem';
import { useBridgeContext } from './useBridgeContext';
import { useWallet } from '../useWallet';
import { loggerHelpers } from '@/utils/bridge/logger';
import { UserError } from '@/lib/userError';
import { describeError } from '@/i18n/errorText';
import { useDict } from '@/i18n/hooks';

export interface FeeQuotesParams {
  originChain: string;
  destinationChain: string;
  tokenIndex: number | null;
  amount: string;
  recipient: string;
}

export interface BridgeFees {
  localQuote: TokenAmount | null;
  interchainQuote: TokenAmount | null;
  totalFee: TokenAmount | null;
}

export function useFeeQuotes(params: FeeQuotesParams, enabled: boolean = true) {
  const [fees, setFees] = useState<BridgeFees | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const { warpCore } = useBridgeContext();
  const { address: account } = useWallet();
  const dict = useDict();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCalculatingRef = useRef(false);

  // Fee refresh interval (15 seconds like original Hyperlane)
  const REFRESH_INTERVAL = 15000;

  // Fee fetching function
  const fetchFeeQuotes = async () => {
      if (!enabled || !warpCore || !account || params.tokenIndex === null || !params.amount || !params.recipient) {
        setFees(null);
        // Clear interval if conditions not met
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // Prevent concurrent calculations
      if (isCalculatingRef.current) {
        return;
      }

      try {
        isCalculatingRef.current = true;
        setIsLoading(true);
        setError(null);

        loggerHelpers.feeCalculation('Fetching fee quotes...');

        const tokens = warpCore.tokens;
        if (params.tokenIndex >= tokens.length) {
          throw new UserError('tokenNotFound');
        }

        const token = tokens[params.tokenIndex];
        if (!token) {
          throw new UserError('tokenNotFound');
        }

        // Parse amount with token decimals (for validation)
        parseUnits(params.amount, token.decimals);

        // Get fee quotes from warp core (matching original API)
        const quotes = await warpCore.estimateTransferRemoteFees({
          originToken: token,
          destination: params.destinationChain,
          sender: account,
          senderPubKey: undefined, // TODO: Add public key support for Solana chains
        });

        // Extract local and interchain fees
        const localQuote = quotes.localQuote || null;
        const interchainQuote = quotes.interchainQuote || null;

        // Calculate total fee (if both quotes exist and are in the same token)
        let totalFee: TokenAmount | null = null;
        if (localQuote && interchainQuote && localQuote.token.symbol === interchainQuote.token.symbol) {
          const totalAmount = localQuote.amount + interchainQuote.amount;
          totalFee = localQuote.token.amount(totalAmount.toString());
        } else if (localQuote && !interchainQuote) {
          totalFee = localQuote;
        } else if (!localQuote && interchainQuote) {
          totalFee = interchainQuote;
        }

        setFees({
          localQuote,
          interchainQuote,
          totalFee,
        });
        setLastUpdated(Date.now());
        loggerHelpers.feeCalculation('Fee quotes updated successfully');
      } catch (err) {
        const errorMessage = describeError(err, dict);
        setError(errorMessage);
        loggerHelpers.feeError('Fee quote error', err as Error);
        setFees(null);
      } finally {
        setIsLoading(false);
        isCalculatingRef.current = false;
      }
    };

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {

    // Initial fetch
    fetchFeeQuotes();

    // Set up automatic refresh interval if enabled
    if (enabled && warpCore && account && params.tokenIndex !== null && params.amount && params.recipient) {
      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set up new interval
      intervalRef.current = setInterval(() => {
        loggerHelpers.feeCalculation('Auto-refreshing fee quotes...');
        fetchFeeQuotes();
      }, REFRESH_INTERVAL);
    }
  }, [
    enabled,
    warpCore,
    account,
    params.originChain,
    params.destinationChain,
    params.tokenIndex,
    params.amount,
    params.recipient,
  ]);

  return {
    fees,
    isLoading,
    error,
    lastUpdated,
    refreshFees: () => {
      loggerHelpers.feeCalculation('Manual fee refresh requested');
      fetchFeeQuotes();
    },
  };
}
