'use client';

import { poolLogger } from '@/lib/logger';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChevronDown, Search } from 'lucide-react';
import { useTokenLists } from '@/hooks/useTokenLists';
import { getContract, isAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { ERC20_ABI } from '@/config/abis';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';
import { useDict } from '@/i18n/hooks';

interface Token {
  chainId: number;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  balance?: string;
}

interface TokenSelectorProps {
  selectedToken: Token | null;
  onTokenSelect: (token: Token) => void;
  excludeToken?: Token | null;
  placeholder?: string;
}

// Internal component that uses wagmi hooks - only rendered after hydration
function TokenSelectorContent({
  selectedToken,
  onTokenSelect,
  excludeToken,
  placeholder,
}: TokenSelectorProps) {
  const dict = useDict();
  const t = dict.liquidity.tokenSelector;
  const effectivePlaceholder = placeholder || t.defaultPlaceholder;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customTokens, setCustomTokens] = useState<Token[]>([]);
  const [isLoadingCustomToken, setIsLoadingCustomToken] = useState(false);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);

  const chainId = useResolvedChainId();

  // Use useTokenLists hook (same as swaps page) for consistent token list
  const { tokens, loading } = useTokenLists({ chainId });

  // Get public client for the current chain
  const publicClient = usePublicClient({ chainId });

  // Reset search when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setCustomTokenError(null);
    }
  }, [isOpen]);

  // Custom token fetching (following TokenSelectorModal pattern)
  useEffect(() => {
    const fetchCustomToken = async () => {
      if (!searchQuery || !isAddress(searchQuery) || !publicClient) {
        setCustomTokens([]);
        setCustomTokenError(null);
        return;
      }

      // Check if token already exists in the list
      const existingToken = tokens.find(token =>
        token.address.toLowerCase() === searchQuery.toLowerCase()
      );
      if (existingToken) {
        setCustomTokens([]);
        setCustomTokenError(null);
        return;
      }

      setIsLoadingCustomToken(true);
      setCustomTokenError(null);

      try {
        const tokenContract = getContract({
          address: searchQuery as `0x${string}`,
          abi: ERC20_ABI,
          client: publicClient,
        });

        const [symbol, name, decimals] = await Promise.all([
          tokenContract.read.symbol([]),
          tokenContract.read.name([]),
          tokenContract.read.decimals([])
        ]);

        const customToken: Token = {
          chainId: chainId, // Use dynamic chainId from wagmi
          address: searchQuery,
          decimals: Number(decimals),
          name: name as string,
          symbol: symbol as string,
          logoURI: `https://raw.githubusercontent.com/KalyCoinProject/tokens/main/assets/${searchQuery}/logo.png`
        };

        setCustomTokens([customToken]);
      } catch (error) {
        poolLogger.error('Error fetching custom token:', error);
        setCustomTokenError(t.customTokenError);
        setCustomTokens([]);
      } finally {
        setIsLoadingCustomToken(false);
      }
    };

    const timeoutId = setTimeout(fetchCustomToken, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, tokens, publicClient, chainId, t.customTokenError]);

  const filteredTokens = tokens.filter(token => {
    // Exclude the other selected token
    if (excludeToken && token.address.toLowerCase() === excludeToken.address.toLowerCase()) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Combine filtered tokens with custom tokens
  const allTokens = [...filteredTokens, ...customTokens];

  const handleTokenSelect = (token: Token) => {
    onTokenSelect(token);
    setIsOpen(false);
    setSearchQuery('');
    setCustomTokens([]);
    setCustomTokenError(null);
  };

  const TokenIcon = ({ token }: { token: Token }) => {
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
        <div className="w-6 h-6 rounded-full bg-surface-hi flex items-center justify-center text-xs font-bold text-cream">
          {token.symbol.charAt(0)}
        </div>
      );
    }

    return (
      <img
        src={getTokenIconPath(token.symbol)}
        alt={token.symbol}
        className="w-6 h-6 rounded-full"
        onError={() => setImageError(true)}
      />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-12 px-4 bg-surface-alt border-line text-cream hover:bg-gold-soft hover:border-gold/40 transition-all duration-200"
        >
          {selectedToken ? (
            <div className="flex items-center space-x-3">
              <div className="flex items-center">
                <TokenIcon token={selectedToken} />
              </div>
              <span className="font-medium text-cream">{selectedToken.symbol}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{effectivePlaceholder}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md border-line bg-surface">
        <DialogHeader>
          <DialogTitle>{t.dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-surface-alt text-cream border-line placeholder:text-muted-foreground rounded-xl"
            />
          </div>

          {customTokenError && <p className="text-xs text-danger">{customTokenError}</p>}

          {/* Popular Tokens */}
          {!searchQuery && (
            <div>
              <h4 className="text-sm font-medium text-cream mb-2">{t.popular}</h4>
              <div className="flex flex-wrap gap-2">
                {tokens.slice(0, 4).map((token) => (
                  <Button
                    key={token.address}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTokenSelect(token)}
                    className="h-8 px-3 text-xs flex items-center gap-1 bg-surface-alt text-cream border-line hover:bg-gold-soft hover:border-gold/40 transition-all duration-200"
                    disabled={excludeToken?.address.toLowerCase() === token.address.toLowerCase()}
                  >
                    <div className="flex items-center">
                      <TokenIcon token={token} />
                    </div>
                    <span>{token.symbol}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Token List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            ) : allTokens.length > 0 ? (
              <div className="space-y-1">
                {allTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => handleTokenSelect(token)}
                    className="w-full flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 text-left hover:bg-gold-soft border border-transparent hover:border-gold/25"
                    disabled={excludeToken?.address.toLowerCase() === token.address.toLowerCase()}
                  >
                    <div className="flex items-center">
                      <TokenIcon token={token} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-cream">{token.symbol}</div>
                      <div className="text-sm truncate text-gold-light">{token.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : !searchQuery || !isAddress(searchQuery) ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t.empty}</p>
                {searchQuery && <p className="text-sm mt-1">{t.emptyHint}</p>}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hydration-safe wrapper component
export default function TokenSelector(props: TokenSelectorProps) {
  const dict = useDict();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show placeholder button during SSR
  if (!mounted) {
    return (
      <Button
        variant="outline"
        disabled
        className="w-full justify-between h-12 px-4 bg-surface-alt border-line text-cream"
      >
        <span className="text-muted-foreground">{props.placeholder || dict.liquidity.tokenSelector.defaultPlaceholder}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Button>
    );
  }

  return <TokenSelectorContent {...props} />;
}
