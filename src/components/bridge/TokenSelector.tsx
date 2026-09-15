// Token Selector Component - Token selection for bridge transfers
// Adapted from Hyperlane TokenSelectField with shadcn/ui Select

'use client';

import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBridgeContext } from '@/hooks/bridge/useBridgeContext';
import { bridgeHelpers } from '@/utils/bridge/bridgeHelpers';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';

// TokenIcon component for bridge tokens
function TokenIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div
        className="rounded-full bg-gradient-to-r from-success to-info flex items-center justify-center text-white font-bold text-xs"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={`/tokens/${symbol.toLowerCase()}.png`}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setImageError(true)}
    />
  );
}

interface TokenSelectorProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  originChain: string;
  destinationChain: string;
  disabled?: boolean;
  placeholder?: string;
}

export function TokenSelector({
  value,
  onValueChange,
  originChain,
  destinationChain,
  disabled = false,
  placeholder
}: TokenSelectorProps) {
  const dict = useDict();
  const effectivePlaceholder = placeholder ?? dict.bridge.tokenSelector.placeholder;
  const { warpCore } = useBridgeContext();

  // Get tokens that have routes between origin and destination chains
  // This matches the original hyperlane-warp-ui implementation
  const filteredTokens = warpCore?.getTokensForRoute(originChain, destinationChain) || [];

  // Get the currently selected token by finding it in the warp core tokens
  const allTokens = warpCore?.tokens || [];
  const selectedToken = value !== null && value < allTokens.length ? allTokens[value] : null;

  return (
    <Select
      value={value?.toString() || ''}
      onValueChange={(val) => onValueChange(val ? parseInt(val) : null)}
      disabled={disabled || !originChain || !destinationChain}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={effectivePlaceholder}>
          {selectedToken ? (
            <div className="flex items-center gap-2">
              <TokenIcon symbol={selectedToken.symbol} size={20} />
              <span>{selectedToken.symbol}</span>
              <span className="text-xs text-muted-foreground">
                {selectedToken.name}
              </span>
            </div>
          ) : (
            effectivePlaceholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {filteredTokens.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {!originChain || !destinationChain
              ? dict.bridge.tokenSelector.selectChainsFirst
              : dict.bridge.tokenSelector.noTokens
            }
          </div>
        ) : (
          filteredTokens.map((token) => {
            // Find the original index in the full tokens array
            const originalIndex = allTokens.findIndex(t =>
              t.chainName === token.chainName &&
              t.addressOrDenom === token.addressOrDenom
            );

            return (
              <SelectItem key={originalIndex} value={originalIndex.toString()}>
                <div className="flex items-center gap-2">
                  <TokenIcon symbol={token.symbol} size={16} />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{token.symbol}</span>
                      <span className="text-xs text-muted-foreground">
                        {token.name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {interpolate(dict.bridge.tokenSelector.standardDecimals, { standard: token.standard, decimals: token.decimals })}
                    </span>
                  </div>
                </div>
              </SelectItem>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
