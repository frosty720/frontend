
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KalySwapV3Service } from '../KalySwapV3Service';
import { Token } from '@/config/dex/types';

// Mocks
const MOCK_TOKEN_A: Token = { chainId: 3890, address: '0xA', decimals: 18, symbol: 'A', name: 'A', logoURI: '' };
const MOCK_TOKEN_B: Token = { chainId: 3890, address: '0xB', decimals: 18, symbol: 'B', name: 'B', logoURI: '' };

describe('KalySwapV3Service Execution Logic', () => {
    let service: KalySwapV3Service;
    let mockWalletClient: any;

    beforeEach(() => {
        service = new KalySwapV3Service(3890);
        mockWalletClient = {
            extend: vi.fn().mockReturnValue({}),
            writeContract: vi.fn(),
            account: { address: '0xUser' }
        };
    });

    it('should select the fee tier with the best output amount', async () => {
        // Mock getV3PoolAddress to return a pool for fee tiers 500, 3000, and 10000
        const getV3PoolAddressSpy = vi.spyOn(service, 'getV3PoolAddress');
        getV3PoolAddressSpy.mockImplementation(async (_tokenA, _tokenB, fee) => {
            if (fee === 500 || fee === 3000 || fee === 10000) return '0xPool';
            return null;
        });

        // Mock getV3Quote to return different amounts for different fees
        const getV3QuoteSpy = vi.spyOn(service, 'getV3Quote');
        const executeV3SwapSpy = vi.spyOn(service, 'executeV3Swap').mockResolvedValue('0xHash');

        // Multi-hop probes are not under test — without this mock they hit the real RPC
        vi.spyOn(service, 'getMultiHopQuote').mockRejectedValue(new Error('no multi-hop route'));

        getV3QuoteSpy.mockImplementation(async (t1, t2, amount, fee) => {
            if (fee === 500) return { amountOut: '100', priceImpact: 0, route: [], sqrtPriceX96After: 0n, initializedTicksCrossed: 0, gasEstimate: '0', fee };
            if (fee === 3000) return { amountOut: '150', priceImpact: 0, route: [], sqrtPriceX96After: 0n, initializedTicksCrossed: 0, gasEstimate: '0', fee }; // BEST
            if (fee === 10000) return { amountOut: '80', priceImpact: 0, route: [], sqrtPriceX96After: 0n, initializedTicksCrossed: 0, gasEstimate: '0', fee };
            throw new Error('Pool not found');
        });

        await service.executeSwap({
            tokenIn: MOCK_TOKEN_A,
            tokenOut: MOCK_TOKEN_B,
            amountIn: '10',
            amountOutMin: '0',
            slippageTolerance: 0.5,
            to: '0xUser',
            deadline: 20
        }, mockWalletClient);

        // Verify it selected fee tier 3000 (Best quote 150)
        expect(executeV3SwapSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                fee: 3000,
                amountOutMinimum: '149.25' // 150 * 0.995 (0.5% slippage)
            }),
            expect.anything(),
            expect.anything()
        );
    });

    it('should throw if all fee tiers fail', async () => {
        // Mock getV3PoolAddress to return null (no pools exist)
        const getV3PoolAddressSpy = vi.spyOn(service, 'getV3PoolAddress');
        getV3PoolAddressSpy.mockResolvedValue(null);

        // Also mock getV3Quote to fail (for completeness)
        const getV3QuoteSpy = vi.spyOn(service, 'getV3Quote');
        getV3QuoteSpy.mockRejectedValue(new Error('Pool not found'));

        await expect(service.executeSwap({
            tokenIn: MOCK_TOKEN_A,
            tokenOut: MOCK_TOKEN_B,
            amountIn: '10',
            amountOutMin: '0',
            slippageTolerance: 0.5,
            to: '0xUser',
            deadline: 20
        }, mockWalletClient)).rejects.toThrow('No V3 route found');
    });
});
