
import { describe, it, expect } from 'vitest';
import { BaseV3Service } from '../BaseV3Service';
import { V3DexConfig } from '@/config/dex/v3-config';

// Concrete implementation for testing abstract class
class TestV3Service extends BaseV3Service {
    getName(): string { return 'Test'; }
    getChainId(): number { return 1; }
    async executeSwap(): Promise<string> { return '0x'; }
    async createAndInitializePool(): Promise<string> { return '0x'; }
}

describe('V3 Service Math Utilities', () => {
    // Mock config not strictly needed for math
    const service = new TestV3Service({} as V3DexConfig);
    const DECIMALS_18 = 18;
    const DECIMALS_6 = 6; // USDC-like

    describe('sqrtPriceX96ToPrice', () => {
        it('should calculate correct price for 1:1 ratio (sqrtPrice = 2^96)', () => {
            const Q96 = 2n ** 96n;
            const price = service.sqrtPriceX96ToPrice(Q96, DECIMALS_18, DECIMALS_18);

            // 1.0 * (10^0) = 1.0
            expect(price.token0Price).toBe('1');
            expect(price.token1Price).toBe('1');
        });

        it('should calculate correct price for price 4 (sqrtPrice = 2 * 2^96)', () => {
            const Q96 = 2n ** 96n;
            const sqrtPrice = Q96 * 2n; // Price should be 2^2 = 4
            const price = service.sqrtPriceX96ToPrice(sqrtPrice, DECIMALS_18, DECIMALS_18);

            expect(price.token0Price).toBe('4');
            expect(price.token1Price).toBe('0.25');
        });

        it('should handle decimal differences correctly (18 vs 6)', () => {
            const Q96 = 2n ** 96n;
            // Native (18) vs USDC (6)
            // If raw price is 1 (Math), adjusted price should be 1 * 10^(18-6) = 1e12? 
            // wait, sqrtPriceX96ToPrice logic:
            // rawPrice = (sqrt/Q96)^2
            // adjustment = 10^(d0 - d1)
            // token0Price = raw * adjustment

            const price = service.sqrtPriceX96ToPrice(Q96, DECIMALS_18, DECIMALS_6);

            // If 1 Token0 = 1 Token1 physically (raw=1)
            // Then 1e18 Wei = 1e6 USDC units
            // So 1 whole T0 = 1e12 whole T1? No.
            // Let's verify standard behavior.

            // Expected: 1e12
            expect(price.token0Price).toBe('1000000000000');
        });
    });

    describe('tickToPrice', () => {
        it('should return 1.0 for tick 0', () => {
            const price = service.tickToPrice(0, DECIMALS_18, DECIMALS_18);
            expect(price).toBe(1);
        });

        it('should return ~2.718 for tick 10000 (basis of e roughly? no 1.0001^10000)', () => {
            const price = service.tickToPrice(10000, DECIMALS_18, DECIMALS_18);
            // 1.0001^10000 ≈ 2.718
            expect(price).toBeCloseTo(2.718, 2);
        });
    });

    describe('priceToTick', () => {
        it('should return 0 for price 1.0', () => {
            const tick = service.priceToTick(1.0, DECIMALS_18, DECIMALS_18);
            expect(tick).toBe(0);
        });

        it('should be inverse of tickToPrice', () => {
            const tick = 10000;
            const price = service.tickToPrice(tick, DECIMALS_18, DECIMALS_18);
            const calculatedTick = service.priceToTick(price, DECIMALS_18, DECIMALS_18);

            // Due to flooring/math precision, might be off by 1
            expect(Math.abs(calculatedTick - tick)).toBeLessThanOrEqual(1);
        });
    });

    describe('getAmountOutMin', () => {
        it('should calculate slippage correctly', () => {
            const amountOut = '100';
            const slippage = 5; // 5%
            const min = service.getAmountOutMin(amountOut, slippage);
            expect(min).toBe('95');
        });

        it('should handle string decimals', () => {
            const amountOut = '100.0';
            const slippage = 0.5; // 0.5%
            const min = service.getAmountOutMin(amountOut, slippage);
            expect(min).toBe('99.5');
        });
    });
});
