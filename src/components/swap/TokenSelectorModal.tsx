'use client';

import { CHAIN_IDS } from '@/config/chains';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { getContract } from 'viem';
import { usePublicClient } from 'wagmi';
import { ERC20_ABI } from '@/config/abis';
import { tokenLogger } from '@/lib/logger';

interface Token {
  chainId: number;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  isNative?: boolean;
}

interface TokenSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenSelect: (token: Token) => void;
  selectedToken: Token | null;
  tokens: Token[];
  title?: string;
  balances?: { [symbol: string]: string };
  getFormattedBalance?: (symbol: string) => string;
}

export default function TokenSelectorModal({
  isOpen,
  onClose,
  onTokenSelect,
  selectedToken,
  tokens,
  title = "Select a token",
  balances,
  getFormattedBalance
}: TokenSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customTokens, setCustomTokens] = useState<Token[]>([]);
  const [isLoadingCustomToken, setIsLoadingCustomToken] = useState(false);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);
  
  const publicClient = usePublicClient();

  // Reset search when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setCustomTokenError(null);
    }
  }, [isOpen]);

  // Validate Ethereum address format
  const isValidAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Fetch custom token metadata
  const fetchCustomToken = async (tokenAddress: string): Promise<Token | null> => {
    if (!publicClient || !isValidAddress(tokenAddress)) {
      throw new Error('Invalid token address format');
    }

    try {
      // Check if token already exists
      const allTokens = [...tokens, ...customTokens];
      const existingToken = allTokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
      if (existingToken) {
        throw new Error('Token already exists in the list');
      }

      // Fetch token metadata using ERC20 contract calls
      const tokenContract = getContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        client: publicClient,
      });

      // Fetch token details
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.read.name([]),
        tokenContract.read.symbol([]),
        tokenContract.read.decimals([]),
      ]);

      // Create token object
      const customToken: Token = {
        chainId: CHAIN_IDS.KALYCHAIN,
        address: tokenAddress,
        decimals: Number(decimals),
        name: name as string,
        symbol: symbol as string,
        logoURI: `/tokens/${tokenAddress}/logo_24.png`
      };

      return customToken;
    } catch (error) {
      tokenLogger.error('Error fetching custom token:', error);
      throw error;
    }
  };

  // Handle search input change
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    setCustomTokenError(null);

    // If it looks like an address, try to fetch token metadata
    if (isValidAddress(value.trim())) {
      setIsLoadingCustomToken(true);
      try {
        const customToken = await fetchCustomToken(value.trim());
        if (customToken) {
          setCustomTokens(prev => {
            // Remove any existing token with same address and add new one
            const filtered = prev.filter(t => t.address.toLowerCase() !== customToken.address.toLowerCase());
            return [...filtered, customToken];
          });
        }
      } catch (error) {
        setCustomTokenError(error instanceof Error ? error.message : 'Failed to fetch token metadata');
      } finally {
        setIsLoadingCustomToken(false);
      }
    }
  };

  // Combined token list
  const allTokens = [...tokens, ...customTokens];

  // Filter tokens based on search query
  const filteredTokens = allTokens.filter(token => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.address.toLowerCase().includes(query)
    );
  });

  const handleTokenSelect = (token: Token) => {
    onTokenSelect(token);
    onClose();
  };

  const TokenIcon = ({ token }: { token: Token }) => {
    const [imageError, setImageError] = useState(false);

    return imageError ? (
      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
        {token.symbol.charAt(0)}
      </div>
    ) : (
      <img
        src={token.logoURI}
        alt={token.symbol}
        className="w-8 h-8 rounded-full"
        onError={() => setImageError(true)}
      />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md max-h-[80vh] p-0 border-white/20 text-white"
        style={{
          backgroundColor: '#0c0a09',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'none'
        }}
      >
        {/* Header */}
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-lg font-semibold text-white">{title}</DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search name or paste address"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 rounded-xl"
            />
          </div>
          
          {/* Custom token error */}
          {customTokenError && (
            <div className="mt-2 text-sm text-red-300 bg-red-900/20 border border-red-500/30 p-2 rounded">
              {customTokenError}
            </div>
          )}
          
          {/* Loading indicator for custom token */}
          {isLoadingCustomToken && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading token metadata...
            </div>
          )}
        </div>

        {/* Token Name Header */}
        <div className="px-6 pb-2">
          <div className="flex items-center justify-between text-sm font-medium text-gray-600">
            <span>Token Name</span>
            <span>Balance</span>
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto max-h-80 px-6 pb-6">
          <div className="space-y-1">
            {filteredTokens.map((token) => {
              const isSelected = selectedToken?.address.toLowerCase() === token.address.toLowerCase();
              const balance = getFormattedBalance ? getFormattedBalance(token.address) : '0';
              
              return (
                <button
                  key={`${token.address}-${token.symbol}`}
                  onClick={() => handleTokenSelect(token)}
                  disabled={isSelected}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${
                    isSelected
                      ? 'bg-blue-500/20 border border-blue-500/30 cursor-not-allowed'
                      : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <TokenIcon token={token} />
                    <div>
                      <div className="font-medium text-white">{token.symbol}</div>
                      <div className="text-sm text-slate-400">{token.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-white">{balance}</div>
                  </div>
                </button>
              );
            })}
            
            {filteredTokens.length === 0 && searchQuery && !isLoadingCustomToken && (
              <div className="text-center py-8 text-slate-400">
                <p>No tokens found</p>
                {isValidAddress(searchQuery) && (
                  <p className="text-sm mt-1">Invalid token address or network error</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <span>📋</span>
            <span>KalySwap Tokenlist</span>
            <a
              href="https://github.com/KalyCoinProject/tokenlists"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              Change
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
