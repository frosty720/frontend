/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useV3AddLiquidity } from '../useV3AddLiquidity';
import { getKalySwapV3Service } from '@/services/dex/KalySwapV3Service';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Token } from '@/config/dex/types';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

// Mock dependencies
vi.mock('@/services/dex/KalySwapV3Service');
const waitForTransactionReceipt = vi.fn(async () => ({ status: 'success' }));
vi.mock('wagmi', () => ({
    useAccount: () => ({ address: '0x123', chainId: 1 }),
    usePublicClient: () => ({ waitForTransactionReceipt }),
    useWalletClient: () => ({ data: { writeContract: vi.fn() } }),
}));
vi.mock('@/lib/logger', () => ({
    poolLogger: {
        error: vi.fn(),
        info: vi.fn(),
    }
}));

/** The hook translates errors via useDict(), so every render needs a DictionaryProvider ancestor. */
function withDict(dict: typeof en, locale: 'en' | 'fr' = 'en') {
    return function Wrapper({ children }: { children: ReactNode }) {
        return createElement(DictionaryProvider, { dict, locale, children });
    };
}

const mockMintV3Position = vi.fn();
const mockIncreaseLiquidity = vi.fn();

describe('useV3AddLiquidity', () => {
    const token0: Token = { address: '0x111', decimals: 18, symbol: 'T0', name: 'Token 0', chainId: 1, logoURI: '' };
    const token1: Token = { address: '0x222', decimals: 18, symbol: 'T1', name: 'Token 1', chainId: 1, logoURI: '' };
    const fee = 3000;

    beforeEach(() => {
        vi.clearAllMocks();
        waitForTransactionReceipt.mockImplementation(async () => ({ status: 'success' }));
        (getKalySwapV3Service as any).mockReturnValue({
            mintV3Position: mockMintV3Position,
            increaseLiquidity: mockIncreaseLiquidity,
        });
    });

    it('should call mintV3Position when no tokenId is provided', async () => {
        mockMintV3Position.mockResolvedValue({ txHash: '0xmint_hash', tokenId: 1n });

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee
        }), { wrapper: withDict(en) });

        await act(async () => {
            await result.current.addLiquidity('100', '200', -100, 100);
        });

        expect(mockMintV3Position).toHaveBeenCalledWith(
            expect.objectContaining({
                token0,
                token1,
                fee,
                tickLower: -100,
                tickUpper: 100,
                amount0Desired: '100',
                amount1Desired: '200',
            }),
            expect.anything(),
            expect.anything()
        );
        expect(result.current.error).toBeNull();
    });

    it('computes minimums in integer maths and passes the starting price for a new pool', async () => {
        mockMintV3Position.mockResolvedValue({ txHash: '0xmint_hash', tokenId: 0n });
        const usdt: Token = { ...token1, decimals: 6 };

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1: usdt,
            fee,
            sqrtPriceX96: 2n ** 96n,
        }), { wrapper: withDict(en) });

        let hash: string | null = null;
        await act(async () => {
            hash = await result.current.addLiquidity('0.123456789012345678', '20.000001', -60, 60);
        });

        expect(hash).toBe('0xmint_hash');
        expect(mockMintV3Position).toHaveBeenCalledWith(
            expect.objectContaining({
                sqrtPriceX96: 2n ** 96n,
                // 0.5% off, rounded down in base units
                amount0Min: '0.122839505067283949',
                amount1Min: '19.9',
            }),
            expect.anything(),
            expect.anything()
        );
    });

    it('reports a mined-but-reverted mint as a failure, not a success', async () => {
        mockMintV3Position.mockResolvedValue({ txHash: '0xmint_hash', tokenId: 0n });
        waitForTransactionReceipt.mockImplementation(async () => ({ status: 'reverted' }));

        const { result } = renderHook(() => useV3AddLiquidity({ token0, token1, fee }), { wrapper: withDict(en) });

        let hash: string | null = '0xnot-set';
        await act(async () => {
            hash = await result.current.addLiquidity('10', '10', -60, 60);
        });

        expect(hash).toBeNull();
        expect(result.current.error).toBe('Add liquidity failed: the transaction was reverted on-chain.');
    });

    it('should call increaseLiquidity when tokenId is provided', async () => {
        mockIncreaseLiquidity.mockResolvedValue('0xincrease_hash');
        const tokenId = 12345n;

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee,
            tokenId
        }), { wrapper: withDict(en) });

        await act(async () => {
            // increase liquidity might not need ticks, or ignores them if provided
            await result.current.addLiquidity('50', '50');
        });

        expect(mockIncreaseLiquidity).toHaveBeenCalledWith(
            expect.objectContaining({
                tokenId,
                amount0Desired: '50',
                amount1Desired: '50',
            }),
            expect.anything(),
            expect.anything()
        );
        expect(result.current.error).toBeNull();
    });

    it('should handle errors gracefully, translated to the reader language', async () => {
        mockMintV3Position.mockRejectedValue(new Error('Mint failed'));

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee
        }), { wrapper: withDict(en) });

        await act(async () => {
            await result.current.addLiquidity('10', '10', -100, 100);
        });

        // Unrecognised errors keep the wallet's own words after the translated lead-in, so a
        // failure can be reported; the message itself is never shown bare.
        expect(result.current.error).toBe('Something went wrong. Mint failed');
        expect(result.current.isLoading).toBe(false);
    });

    it('shows the French wallet-rejection message when the mint call is rejected (code 4001)', async () => {
        mockMintV3Position.mockRejectedValue({ code: 4001, message: 'user rejected the request' });

        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee
        }), { wrapper: withDict(fr, 'fr') });

        await act(async () => {
            await result.current.addLiquidity('10', '10', -100, 100);
        });

        expect(result.current.error).toBe(fr.errors.userRejected);
    });

    it('translates the missing-tick-range guard to French', async () => {
        const { result } = renderHook(() => useV3AddLiquidity({
            token0,
            token1,
            fee
        }), { wrapper: withDict(fr, 'fr') });

        await act(async () => {
            // No tickLower/tickUpper and no tokenId -> UserError('tickRangeRequired')
            await result.current.addLiquidity('10', '10');
        });

        expect(result.current.error).toBe(fr.errors.tickRangeRequired);
        expect(mockMintV3Position).not.toHaveBeenCalled();
    });
});
