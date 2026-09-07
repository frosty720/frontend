
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseV3Service } from '../BaseV3Service';
import { V3DexConfig } from '@/config/dex/v3-config';
import { PublicClient, WalletClient } from 'viem';

// Mock chains config
vi.mock('@/config/chains', () => ({
    CHAIN_IDS: { KALYCHAIN: 3890 }
}));

// Concrete implementation
class TestV3Service extends BaseV3Service {
    getName(): string { return 'TestService'; }
    getChainId(): number { return 3890; }
    executeSwap(): Promise<string> { return Promise.resolve('0x'); }
    createAndInitializePool(): Promise<string> { return Promise.resolve('0x'); }
}

describe('V3 Collect Fees Logic', () => {
    let service: TestV3Service;
    let mockPublicClient: any;
    let mockWalletClient: any;

    const mockConfig = {
        positionManagerABI: ['collectABI'],
        positionManager: '0xPosMgr',
        chain: { id: 3890 }
    } as unknown as V3DexConfig;

    beforeEach(() => {
        service = new TestV3Service(mockConfig);

        mockPublicClient = {
            estimateContractGas: vi.fn(),
        };

        mockWalletClient = {
            writeContract: vi.fn(),
            account: { address: '0xUser' }
        };
    });

    it('should estimate gas and apply 20% buffer before collecting', async () => {
        // Setup
        const params = {
            tokenId: 1n,
            recipient: '0xUser',
            amount0Max: 100n,
            amount1Max: 200n
        };

        // Mock estimation returning 100,000 gas
        mockPublicClient.estimateContractGas.mockResolvedValue(100000n);
        mockWalletClient.writeContract.mockResolvedValue('0xTxHash');

        // Execute
        await service.collectFees(params, mockPublicClient as PublicClient, mockWalletClient as WalletClient);

        // Verify 1: Estimate was called with correct structure
        expect(mockPublicClient.estimateContractGas).toHaveBeenCalledWith(expect.objectContaining({
            address: '0xPosMgr',
            functionName: 'collect',
            args: [{
                tokenId: 1n,
                recipient: '0xUser',
                amount0Max: 100n,
                amount1Max: 200n
            }], // Struct tuple!
            account: { address: '0xUser' }
        }));

        // Verify 2: Write was called with Buffer (100,000 * 1.2 = 120,000)
        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            functionName: 'collect',
            args: [{
                tokenId: 1n,
                recipient: '0xUser',
                amount0Max: 100n,
                amount1Max: 200n
            }], // Struct tuple!
            gas: 120000n // 120% of 100,000
        }));
    });
});
