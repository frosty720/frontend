'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, User, Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { V3PoolData } from '@/hooks/useV3PoolDiscovery';
import V3ManageModal from '@/components/liquidity/v3/V3ManageModal';

interface TokenIconProps {
  token: {
    symbol: string;
    address: string;
  };
  size?: 'sm' | 'md' | 'lg';
}

function TokenIcon({ token, size = 'md' }: TokenIconProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  if (imageError) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gray-100 flex items-center justify-center border border-gray-200`}>
        <span className="text-xs font-medium text-gray-600">{token.symbol.slice(0, 2)}</span>
      </div>
    );
  }

  // Use KLC logo for wKLC tokens
  const getTokenIconPath = (symbol: string) => {
    const lowerSymbol = symbol.toLowerCase();
    if (lowerSymbol === 'wklc') {
      return '/tokens/klc.png';
    }
    return `/tokens/${lowerSymbol}.png`;
  };

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-600`}>
      <img
        src={getTokenIconPath(token.symbol)}
        alt={token.symbol}
        className="w-full h-full object-cover token-icon"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

interface V3PoolCardProps {
  pool: V3PoolData;
  onUpdate?: () => void;
}

export default function V3PoolCard({ pool, onUpdate }: V3PoolCardProps) {
  const router = useRouter();
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<'add' | 'remove' | 'collect'>('remove');

  const token0 = { symbol: pool.token0.symbol, address: pool.token0.id };
  const token1 = { symbol: pool.token1.symbol, address: pool.token1.id };
  const feePercent = (parseInt(pool.feeTier, 10) / 10000).toFixed(2);

  // V3 ownership can span multiple NFT positions in the same pool; Manage/Collect
  // operate on the first one (matches the single-position model V2 uses).
  const primaryPosition = pool.userPositions[0];

  const handleAddLiquidity = () => {
    router.push(
      `/pools?tokenA=${pool.token0.id}&tokenB=${pool.token1.id}&fee=${pool.feeTier}`
    );
  };

  const handleOpenManage = (tab: 'add' | 'remove' | 'collect') => {
    setInitialTab(tab);
    setIsManageOpen(true);
  };

  const formatNumber = (value: string, decimals: number = 2) => {
    const num = parseFloat(value);
    if (!isFinite(num) || num === 0) return '0';
    if (num < 0.01) return '<0.01';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  return (
    <Card className={`pool-card ${pool.userHasPosition ? 'user-position' : ''}`}>
      <CardContent className="p-6">
        {/* Pool Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center -space-x-2">
              <TokenIcon token={token0} size="md" />
              <TokenIcon token={token1} size="md" />
            </div>

            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="font-semibold text-lg text-white">
                  {token0.symbol}/{token1.symbol}
                </h3>
                <Badge variant="default" className="text-xs bg-blue-600 text-white">
                  {feePercent}%
                </Badge>
                {pool.userHasPosition && (
                  <Badge variant="default" className="text-xs bg-blue-600 text-white">
                    <User className="h-3 w-3 mr-1" />
                    Your Pool
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-300">Liquidity Pool</p>
            </div>
          </div>
        </div>

        {/* Pool Composition (token-denominated TVL from the subgraph) */}
        <div className="pool-info-card p-3 mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Coins className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-white">Pool Composition</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2 flex-shrink-0">
                <TokenIcon token={token0} size="sm" />
                <span className="font-medium text-white">{token0.symbol}</span>
              </div>
              <span className="text-gray-300 font-mono break-all text-right min-w-0">
                {formatNumber(pool.totalValueLockedToken0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2 flex-shrink-0">
                <TokenIcon token={token1} size="sm" />
                <span className="font-medium text-white">{token1.symbol}</span>
              </div>
              <span className="text-gray-300 font-mono break-all text-right min-w-0">
                {formatNumber(pool.totalValueLockedToken1)}
              </span>
            </div>
          </div>
        </div>

        {/* Transaction count (reliable subgraph stat) */}
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <div className="text-xs">
            <span className="text-gray-400">Transactions</span>
            <div className="text-white font-medium">{formatNumber(pool.txCount, 0)}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-4 border-t border-gray-600">
          <div className="flex space-x-2">
            <Button
              onClick={handleAddLiquidity}
              className="flex-1 continue-button"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
            {pool.userHasPosition && primaryPosition && (
              <>
                <Button
                  onClick={() => handleOpenManage('collect')}
                  variant="outline"
                  className="flex-1 bg-gray-900/30 text-blue-400 hover:bg-blue-900/30 border-blue-500/30"
                  size="sm"
                >
                  Collect
                </Button>
                <Button
                  onClick={() => handleOpenManage('remove')}
                  variant="outline"
                  className="flex-1 bg-gray-900/30 text-white hover:bg-gray-800/50 border-gray-500/30"
                  size="sm"
                >
                  Manage
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Pool Address (development only, mirrors V2 PoolCard) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-3 pt-3 border-t border-gray-600">
            <a
              href={`https://kalyscan.io/address/${pool.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 font-mono hover:underline transition-colors"
              title={`View ${pool.address} on KalyScan`}
            >
              {pool.address.slice(0, 6)}...{pool.address.slice(-4)}
            </a>
          </div>
        )}
      </CardContent>

      {/* Manage / Collect modal for an owned position */}
      {pool.userHasPosition && primaryPosition && (
        <V3ManageModal
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          position={primaryPosition}
          onUpdate={() => onUpdate?.()}
          initialTab={initialTab}
        />
      )}
    </Card>
  );
}
