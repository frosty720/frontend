import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { V3Position } from '@/services/dex/IV3DexService';
import { poolLogger as logger } from '@/lib/logger';
import { useResolvedChainId } from '@/hooks/useResolvedChainId';

export function useV3Positions() {
    const { address, isConnected } = useAccount();
    // Must match useV3Pools, or the page lists one chain's pools and another's positions.
    const chainId = useResolvedChainId();
    const publicClient = usePublicClient();

    const [positions, setPositions] = useState<V3Position[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPositions = useCallback(async () => {
        if (!isConnected || !address || !publicClient || !chainId) {
            setPositions([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const v3Service = getKalySwapV3Service(chainId);
            if (!v3Service) return;
            const userPositions = await v3Service.getV3Positions(address, publicClient);

            // Filter out invalid positions if any
            const positionsWithRealFees = await Promise.all(userPositions.map(async (p) => {
                if (p.liquidity >= 0n) {
                    // Enrich with real-time pending fees simulation
                    try {
                        const { amount0, amount1 } = await v3Service.getClaimableFees(p.tokenId, address, publicClient);
                        // Overwrite the static tokensOwed with the simulated real-time collectible values
                        return {
                            ...p,
                            tokensOwed0: amount0,
                            tokensOwed1: amount1
                        };
                    } catch (e) {
                        logger.warn(`Failed to fetch real-time fees for token ${p.tokenId}`, e);
                        return p; // Fallback to static data
                    }
                }
                return p;
            }));

            const validPositions = positionsWithRealFees.filter(p => p.liquidity >= 0n);

            setPositions(validPositions);
            logger.debug(`Fetched ${validPositions.length} V3 positions with real-time fees`);
        } catch (err) {
            logger.error('Error fetching V3 positions:', err);
            setError('Failed to load positions');
        } finally {
            setLoading(false);
        }
    }, [address, isConnected, chainId, publicClient]);

    // Fetch on mount and when dependencies change
    useEffect(() => {
        fetchPositions();
    }, [fetchPositions]);

    return {
        positions,
        loading,
        error,
        refetch: fetchPositions
    };
}
