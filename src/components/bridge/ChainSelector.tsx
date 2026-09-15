// Chain Selector Component - Chain selection for bridge transfers
// Adapted from Hyperlane ChainSelectField with shadcn/ui Select

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

// ChainIcon component for bridge chains
function ChainIcon({ chainName, size = 20 }: { chainName: string; size?: number }) {
  const [imageError, setImageError] = useState(false);

  // Map chain names to icon file names
  const getChainIconName = (chain: string) => {
    switch (chain.toLowerCase()) {
      case 'kalychain':
        return 'kalychain';
      case 'arbitrum':
        return 'arbitrum';
      case 'bsc':
        return 'binance';
      default:
        return chain.toLowerCase();
    }
  };

  if (imageError) {
    return (
      <div
        className="rounded-full bg-gradient-to-r from-gold to-violet flex items-center justify-center text-white font-bold text-xs"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {chainName.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`/icons/${getChainIconName(chainName)}.png`}
      alt={chainName}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setImageError(true)}
    />
  );
}

interface ChainSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChainSelector({
  value,
  onValueChange,
  disabled = false,
  placeholder
}: ChainSelectorProps) {
  const dict = useDict();
  const effectivePlaceholder = placeholder ?? dict.bridge.chainSelector.placeholder;
  const { chains } = useBridgeContext();

  // Get available chains from bridge context
  const availableChains = Object.keys(chains);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={effectivePlaceholder}>
          {value ? (
            <div className="flex items-center gap-2">
              <ChainIcon chainName={value} size={20} />
              <span>{bridgeHelpers.getChainDisplayName(value)}</span>
            </div>
          ) : (
            effectivePlaceholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableChains.map((chainName) => {
          const chain = chains[chainName];
          return (
            <SelectItem key={chainName} value={chainName}>
              <div className="flex items-center gap-2">
                <ChainIcon chainName={chainName} size={16} />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {bridgeHelpers.getChainDisplayName(chainName)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {interpolate(dict.bridge.chainSelector.chainId, { id: chain.chainId })}
                  </span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
