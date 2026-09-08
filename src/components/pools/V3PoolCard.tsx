'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, User, Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useChainId } from 'wagmi';
import { CHAIN_METADATA, KALYCHAIN_EXPLORER_URL } from '@/config/chains';
import { V3PoolData } from '@/hooks/useV3PoolDiscovery';
import type { V3Position } from '@/services/dex/IV3DexService';
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

  // KMT/KMT (and their wrapped forms) all use the KalyChain mark — the same mapping
  // the token lists declare via logoURI. Without the KMT entries WKMT fell through to
  // a missing /tokens/wkmt.png and rendered as a grey initials blob.
  const getTokenIconPath = (symbol: string) => {
    const lowerSymbol = symbol.toLowerCase();
    if (['wklc', 'klc', 'wkmt', 'kmt'].includes(lowerSymbol)) {
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
  const chainId = useChainId();
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<'add' | 'remove' | 'collect'>('remove');
  const [managedPosition, setManagedPosition] = useState<V3Position | null>(null);

  const token0 = { symbol: pool.token0.symbol, address: pool.token0.id };
  const token1 = { symbol: pool.token1.symbol, address: pool.token1.id };
  const feePercent = (parseInt(pool.feeTier, 10) / 10000).toFixed(2);

  // V3 ownership can span multiple NFT positions in the same pool — different ranges,
  // or a closed one still holding uncollected fees. Manage/Collect used to act on
  // userPositions[0] only, leaving every other position unreachable from this page.
  const positions = pool.userPositions;
  const hasMultiplePositions = positions.length > 1;

  const currentTick = pool.tick !== undefined && pool.tick !== null ? parseInt(String(pool.tick), 10) : null;

  const describePosition = (p: V3Position): { label: string; tone: string } => {
    if (p.liquidity === 0n) return { label: 'Closed', tone: 'bg-gray-600/70' };
    if (currentTick === null || Number.isNaN(currentTick)) return { label: 'Open', tone: 'bg-blue-600' };
    const inRange = currentTick >= p.tickLower && currentTick < p.tickUpper;
    return inRange
      ? { label: 'In range', tone: 'bg-emerald-600/80' }
      : { label: 'Out of range', tone: 'bg-amber-600/80' };
  };

  // A pool can exist and be priced while holding no liquidity at all (created +
  // initialised, never deposited into). Those render as an invitation to seed rather
  // than a wall of $0 / 0 / 0, which reads as a broken card.
  const isSeeded = parseFloat(pool.liquidity || '0') > 0;

  const handleAddLiquidity = () => {
    // Symbols are sent alongside the addresses so the target page can still label the
    // pair when a token is not in the chain's list; without them nothing prefilled.
    const params = new URLSearchParams({
      tokenA: pool.token0.id,
      tokenB: pool.token1.id,
      tokenASymbol: pool.token0.symbol,
      tokenBSymbol: pool.token1.symbol,
      fee: pool.feeTier,
    });
    router.push(`/pools?${params.toString()}`);
  };

  const handleOpenManage = (tab: 'add' | 'remove' | 'collect', position: V3Position) => {
    setManagedPosition(position);
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

  const formatUSD = (value: string) => {
    const num = parseFloat(value);
    if (!isFinite(num) || num === 0) return '$0';
    if (num < 0.01) return '<$0.01';
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
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

        {/* Total Value Locked (USD) */}
        {isSeeded ? (
          <div className="pool-info-card p-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Total Value Locked</span>
              <span className="text-lg font-bold text-white break-all text-right min-w-0">
                {formatUSD(pool.totalValueLockedUSD)}
              </span>
            </div>
          </div>
        ) : (
          <div className="pool-info-card p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-white">Total Value Locked</span>
              <Badge variant="default" className="text-xs bg-emerald-600/80 text-white">
                Awaiting first deposit
              </Badge>
            </div>
            <p className="text-sm text-gray-300">
              This pool is live and priced but holds no liquidity yet. Seed it to open
              trading and start earning the {feePercent}% fee.
            </p>
          </div>
        )}

        {/* Pool Composition (token-denominated TVL from the subgraph) */}
        {isSeeded && (
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
        )}

        {/* Transaction count (reliable subgraph stat) */}
        {isSeeded && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <div className="text-xs">
            <span className="text-gray-400">Transactions</span>
            <div className="text-white font-medium">{formatNumber(pool.txCount, 0)}</div>
          </div>
        </div>
        )}

        {/* Your positions — listed individually once there is more than one, so a
            second range (or a closed position still owed fees) stays reachable. */}
        {hasMultiplePositions && (
          <div className="mt-4 pt-4 border-t border-gray-600 space-y-2">
            <span className="text-sm font-medium text-white">
              Your positions ({positions.length})
            </span>
            {positions.map((p) => {
              const state = describePosition(p);
              return (
                <div
                  key={p.tokenId.toString()}
                  className="flex items-center justify-between gap-2 flex-wrap pool-info-card p-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-mono text-white">#{p.tokenId.toString()}</span>
                    <Badge variant="default" className={`text-xs text-white ${state.tone}`}>
                      {state.label}
                    </Badge>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      onClick={() => handleOpenManage('collect', p)}
                      variant="outline"
                      className="bg-gray-900/30 text-blue-400 hover:bg-blue-900/30 border-blue-500/30"
                      size="sm"
                    >
                      Collect
                    </Button>
                    <Button
                      onClick={() => handleOpenManage('remove', p)}
                      variant="outline"
                      className="bg-gray-900/30 text-white hover:bg-gray-800/50 border-gray-500/30"
                      size="sm"
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-4 pt-4 border-t border-gray-600">
          <div className="flex space-x-2">
            <Button
              onClick={handleAddLiquidity}
              className="flex-1 continue-button"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              {isSeeded ? 'Add' : 'Seed pool'}
            </Button>
            {/* With several positions the per-position rows above own these actions. */}
            {!hasMultiplePositions && positions[0] && (
              <>
                <Button
                  onClick={() => handleOpenManage('collect', positions[0])}
                  variant="outline"
                  className="flex-1 bg-gray-900/30 text-blue-400 hover:bg-blue-900/30 border-blue-500/30"
                  size="sm"
                >
                  Collect
                </Button>
                <Button
                  onClick={() => handleOpenManage('remove', positions[0])}
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
              href={`${CHAIN_METADATA[chainId]?.explorer ?? KALYCHAIN_EXPLORER_URL}/address/${pool.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 font-mono hover:underline transition-colors"
              title={`View ${pool.address} on ${CHAIN_METADATA[chainId]?.name ?? 'the explorer'}`}
            >
              {pool.address.slice(0, 6)}...{pool.address.slice(-4)}
            </a>
          </div>
        )}
      </CardContent>

      {/* Manage / Collect modal, keyed to the position the user actually picked */}
      {managedPosition && (
        <V3ManageModal
          key={managedPosition.tokenId.toString()}
          isOpen={isManageOpen}
          onClose={() => {
            setIsManageOpen(false);
            setManagedPosition(null);
          }}
          position={managedPosition}
          onUpdate={() => onUpdate?.()}
          initialTab={initialTab}
        />
      )}
    </Card>
  );
}
