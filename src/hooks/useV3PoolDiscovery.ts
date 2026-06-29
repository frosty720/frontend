'use client';

import { useState, useCallback } from 'react';
import { useV3Pools, V3Pool } from './v3/useV3Subgraph';
import { useV3Positions } from './useV3Positions';
import { V3Position } from '@/services/dex/IV3DexService';

/**
 * V3 pool discovery — the V3 counterpart of `usePoolDiscovery` (V2).
 *
 * Mirrors the V2 flow: fetch ALL pools from the subgraph, then flag the ones
 * the connected wallet holds a position in (so the UI can show Manage/Collect),
 * with the same search / sort / toggle surface so `PoolList` can render V3
 * exactly like V2.
 *
 * Ownership is determined from on-chain NFT positions (`useV3Positions`), which
 * is authoritative and independent of subgraph health. A pool is "owned" when
 * the wallet has any position whose (token0, token1, fee) matches the pool.
 */
export interface V3PoolData extends V3Pool {
  // Alias so the shape matches V2's PoolData (`address` === subgraph pool id).
  address: string;
  userHasPosition: boolean;
  userPositions: V3Position[];
}

export interface V3PoolDiscoveryState {
  searchTerm: string;
  sortBy: 'liquidity' | 'name';
  sortOrder: 'asc' | 'desc';
}

export function useV3PoolDiscovery() {
  const [uiState, setUiState] = useState<V3PoolDiscoveryState>({
    searchTerm: '',
    sortBy: 'liquidity',
    sortOrder: 'desc',
  });

  const { pools: rawPools, loading: poolsLoading, error: poolsError, refetch: refetchPools } = useV3Pools();
  const { positions, loading: positionsLoading, refetch: refetchPositions } = useV3Positions();

  // Attach ownership info to every pool (matches V2's `userHasPosition` flag).
  const allPools: V3PoolData[] = rawPools.map((pool) => {
    const userPositions = positions.filter(
      (p) =>
        p.token0.toLowerCase() === pool.token0.id.toLowerCase() &&
        p.token1.toLowerCase() === pool.token1.id.toLowerCase() &&
        p.fee === parseInt(pool.feeTier, 10)
    );
    return {
      ...pool,
      address: pool.id,
      userHasPosition: userPositions.length > 0,
      userPositions,
    };
  });

  const userPoolsCount = allPools.filter((p) => p.userHasPosition).length;

  // Filter + sort, prioritising pools the user has a position in (as V2 does).
  const filteredAndSortedPools = useCallback((): V3PoolData[] => {
    let filtered = [...allPools];

    if (uiState.searchTerm) {
      const searchLower = uiState.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (pool) =>
          pool.token0.symbol.toLowerCase().includes(searchLower) ||
          pool.token1.symbol.toLowerCase().includes(searchLower) ||
          (pool.token0.name || '').toLowerCase().includes(searchLower) ||
          (pool.token1.name || '').toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => {
      // Prioritise pools where the user has a position.
      if (a.userHasPosition && !b.userHasPosition) return -1;
      if (!a.userHasPosition && b.userHasPosition) return 1;

      if (uiState.sortBy === 'name') {
        const aName = `${a.token0.symbol}/${a.token1.symbol}`;
        const bName = `${b.token0.symbol}/${b.token1.symbol}`;
        return uiState.sortOrder === 'asc'
          ? aName.localeCompare(bName)
          : bName.localeCompare(aName);
      }

      // 'liquidity' — sort by transaction count as a proxy until the subgraph's
      // USD/liquidity derivation is healthy (those fields are currently 0).
      const aValue = parseFloat(a.txCount || '0');
      const bValue = parseFloat(b.txCount || '0');
      return uiState.sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return filtered;
  }, [allPools, uiState.searchTerm, uiState.sortBy, uiState.sortOrder]);

  const setSearchTerm = useCallback((term: string) => {
    setUiState((prev) => ({ ...prev, searchTerm: term }));
  }, []);

  const setSorting = useCallback((sortBy: 'liquidity' | 'name', sortOrder: 'asc' | 'desc') => {
    setUiState((prev) => ({ ...prev, sortBy, sortOrder }));
  }, []);

  const refetch = useCallback(() => {
    refetchPools();
    refetchPositions();
  }, [refetchPools, refetchPositions]);

  return {
    pools: filteredAndSortedPools(),
    allPools,
    userPoolsCount,
    loading: poolsLoading || positionsLoading,
    error: poolsError,
    searchTerm: uiState.searchTerm,
    sortBy: uiState.sortBy,
    sortOrder: uiState.sortOrder,
    setSearchTerm,
    setSorting,
    refetch,
  };
}
