
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseV3Service } from '../BaseV3Service';
import { Token } from '@/config/dex/types';
import { PublicClient, WalletClient } from 'viem';

// Mock specific V3 config interactions
vi.mock('@/config/dex/v3-config', () => ({
    getV3Config: vi.fn(() => ({
        factoryAddress: '0xFactory',
        positionManagerAddress: '0xPosMgr',
        swapRouterAddress: '0xRouter',
        quoterAddress: '0xQuoter',
        factoryABI: [],
        positionManagerABI: [],
        swapRouterABI: [],
        quoterABI: []
    }))
}));

// Concrete implementation of abstract class for testing
class TestV3Service extends BaseV3Service {
    getName(): string { return 'TestService'; }
    getChainId(): number { return 3890; }
    executeSwap(): Promise<string> { return Promise.resolve('0x'); }
    createAndInitializePool(): Promise<string> { return Promise.resolve('0x'); }
}

describe('BaseV3Service Unit Tests', () => {
    let service: TestV3Service;
    let mockPublicClient: any;
    let mockWalletClient: any;

    const MOCK_TOKEN_A: Token = {
        chainId: 3890, address: '0xTokenA', decimals: 18, symbol: 'TKA', name: 'Token A', logoURI: ''
    };
    const MOCK_TOKEN_B: Token = {
        chainId: 3890, address: '0xTokenB', decimals: 18, symbol: 'TKB', name: 'Token B', logoURI: ''
    };

    beforeEach(() => {
        service = new TestV3Service({} as any);
        mockPublicClient = {
            readContract: vi.fn(),
            simulateContract: vi.fn(),
            waitForTransactionReceipt: vi.fn(),
            estimateContractGas: vi.fn()
        };
        mockWalletClient = {
            writeContract: vi.fn(),
            account: { address: '0xUser' }
        };
    });

    it('should interact with Quoter for getV3Quote', async () => {
        // Mock successful quote return
        mockPublicClient.readContract.mockResolvedValue([
            1000000000000000000n, // amountOut
            0n, // sqrtPriceX96After
            0,  // initializedTicksCrossed
            100000n // gasEstimate
        ]);

        const quote = await service.getV3Quote(
            MOCK_TOKEN_A,
            MOCK_TOKEN_B,
            '1',
            3000,
            mockPublicClient as PublicClient
        );

        expect(quote.amountOut).toBe('1');
        expect(mockPublicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
            functionName: 'quoteExactInputSingle'
        }));
    });

    it('should apply cleanup/handling for identical tokens in getV3Quote (Mock check)', async () => {
        // BaseV3Service doesn't have the "identical token" check in the class itself (it relies on UI or standard reverts)
        // But we can verify it propagates errors correctly
        mockPublicClient.readContract.mockRejectedValue(new Error('Reverted'));

        await expect(service.getV3Quote(
            MOCK_TOKEN_A,
            MOCK_TOKEN_A, // Same token
            '1',
            3000,
            mockPublicClient as PublicClient
        )).rejects.toThrow('Failed to get V3 quote');
    });
});
