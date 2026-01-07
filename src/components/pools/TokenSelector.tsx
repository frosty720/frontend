'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChevronDown, Search, Plus } from 'lucide-react';
import { useTokenLists } from '@/hooks/useTokenLists';
import { getContract, isAddress } from 'viem';
import { usePublicClient, useChainId } from 'wagmi';
import { ERC20_ABI } from '@/config/abis';

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

export default function TokenSelector({
  selectedToken,
  onTokenSelect,
  excludeToken,
  placeholder = "Select token"
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customTokens, setCustomTokens] = useState<Token[]>([]);
  const [isLoadingCustomToken, setIsLoadingCustomToken] = useState(false);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);

  // Get current chain ID from wagmi, fallback to KalyChain (3888)
  let chainId = 3888;
  try {
    const wagmiChainId = useChainId();
    if (wagmiChainId) chainId = wagmiChainId;
  } catch (error) {
    // Wagmi not available, use default
  }

  // Use useTokenLists hook (same as swaps page) for consistent token list
  const { tokens, loading } = useTokenLists({ chainId });

  let publicClient = null;
  try {
    publicClient = usePublicClient();
  } catch (error) {
    // Wagmi not available
  }





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
          chainId: 3888,
          address: searchQuery,
          decimals: Number(decimals),
          name: name as string,
          symbol: symbol as string,
          logoURI: `https://raw.githubusercontent.com/KalyCoinProject/tokens/main/assets/${searchQuery}/logo.png`
        };

        setCustomTokens([customToken]);
      } catch (error) {
        console.error('Error fetching custom token:', error);
        setCustomTokenError('Invalid token address or network error');
        setCustomTokens([]);
      } finally {
        setIsLoadingCustomToken(false);
      }
    };

    const timeoutId = setTimeout(fetchCustomToken, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, tokens, publicClient]);

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
        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-white">
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
          className="w-full justify-between h-12 px-4 bg-slate-800 border-slate-600 text-white hover:bg-amber-500/20 hover:border-amber-500/40 transition-all duration-200"
        >
          {selectedToken ? (
            <div className="flex items-center space-x-3">
              <div className="flex items-center">
                <TokenIcon token={selectedToken} />
              </div>
              <span className="font-medium text-white">{selectedToken.symbol}</span>
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md" style={{ background: '#1c1917', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
        <DialogHeader>
          <DialogTitle className="text-white">Select a token</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search name or paste address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-slate-800 text-white border-slate-600 placeholder:text-slate-400 rounded-xl"
            />
          </div>

          {/* Popular Tokens */}
          {!searchQuery && (
            <div>
              <h4 className="text-sm font-medium text-white mb-2">Popular tokens</h4>
              <div className="flex flex-wrap gap-2">
                {tokens.slice(0, 4).map((token) => (
                  <Button
                    key={token.address}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTokenSelect(token)}
                    className="h-8 px-3 text-xs flex items-center gap-1 bg-slate-800 text-white border-slate-600 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all duration-200"
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
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
              </div>
            ) : allTokens.length > 0 ? (
              <div className="space-y-1">
                {allTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => handleTokenSelect(token)}
                    className="w-full flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 text-left hover:bg-amber-500/10 hover:border-amber-500/20 border border-transparent"
                    disabled={excludeToken?.address.toLowerCase() === token.address.toLowerCase()}
                  >
                    <div className="flex items-center">
                      <TokenIcon token={token} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white">{token.symbol}</div>
                      <div className="text-sm truncate" style={{ color: '#fef3c7' }}>{token.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : !searchQuery || !isAddress(searchQuery) ? (
              <div className="text-center py-8 text-slate-400">
                <p>No tokens found</p>
                {searchQuery && (
                  <p className="text-sm mt-1">Try a different search term or paste a token address</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
