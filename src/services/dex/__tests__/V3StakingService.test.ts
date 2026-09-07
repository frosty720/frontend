import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V3StakingService } from '../V3StakingService';
import type { IncentiveKey, CreateIncentiveParams } from '../v3-staking-types';

// Mock viem's createPublicClient so the service doesn't make real RPC calls
const mockReadContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });

vi.mock('viem', async () => {
    const actual = await vi.importActual('viem');
    return {
        ...actual,
        createPublicClient: () => ({
            readContract: mockReadContract,
            waitForTransactionReceipt: mockWaitForTransactionReceipt,
        }),
    };
});

vi.mock('@/lib/logger', () => ({
    dexLogger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

// Sample incentive key used across tests
const sampleKey: IncentiveKey = {
    rewardToken: '0x7659567Bc5057e7284856aAF331C4dea22AEd73E',
    pool: '0x1234567890123456789012345678901234567890',
    startTime: BigInt(1700000000),
    endTime: BigInt(1700604800),
    refundee: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

const mockWalletClient = {
    account: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}` },
    writeContract: vi.fn(),
    chain: { id: 3890 },
} as any;

describe('V3StakingService', () => {
    let service: V3StakingService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new V3StakingService(3890);
    });

    // ========== encodeIncentiveKey ==========

    it('should encode incentive key correctly', () => {
        const result = service.encodeIncentiveKey(sampleKey);

        // Should return a valid bytes32 keccak256 hash (0x + 64 hex chars)
        expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different keys', () => {
        const altKey: IncentiveKey = {
            ...sampleKey,
            pool: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
        };

        const hash1 = service.encodeIncentiveKey(sampleKey);
        const hash2 = service.encodeIncentiveKey(altKey);

        expect(hash1).not.toBe(hash2);
    });

    it('should produce deterministic hash for same key', () => {
        const hash1 = service.encodeIncentiveKey(sampleKey);
        const hash2 = service.encodeIncentiveKey(sampleKey);

        expect(hash1).toBe(hash2);
    });

    // ========== getIncentiveInfo ==========

    it('should get incentive info from contract', async () => {
        mockReadContract.mockResolvedValueOnce([
            BigInt('1000000000000000000'), // totalRewardUnclaimed (1e18)
            BigInt('500000'),              // totalSecondsClaimedX128
            BigInt(3),                     // numberOfStakes
        ]);

        const info = await service.getIncentiveInfo(sampleKey);

        expect(info.totalRewardUnclaimed).toBe(BigInt('1000000000000000000'));
        expect(info.totalSecondsClaimedX128).toBe(BigInt('500000'));
        expect(info.numberOfStakes).toBe(3);

        expect(mockReadContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'incentives',
            })
        );
    });

    // ========== getDepositInfo ==========

    it('should get deposit info', async () => {
        const tokenId = BigInt(42);
        mockReadContract.mockResolvedValueOnce([
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // owner
            BigInt(1),  // numberOfStakes
            -887220,    // tickLower
            887220,     // tickUpper
        ]);

        const deposit = await service.getDepositInfo(tokenId);

        expect(deposit.tokenId).toBe(tokenId);
        expect(deposit.owner).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
        expect(deposit.numberOfStakes).toBe(1);
        expect(deposit.tickLower).toBe(-887220);
        expect(deposit.tickUpper).toBe(887220);

        expect(mockReadContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'deposits',
                args: [tokenId],
            })
        );
    });

    // ========== getRewardInfo ==========

    it('should get reward info', async () => {
        const tokenId = BigInt(42);
        mockReadContract.mockResolvedValueOnce([
            BigInt('500000000000000000'), // reward (0.5 tokens)
            BigInt('123456789'),          // secondsInsideX128
        ]);

        const result = await service.getRewardInfo(sampleKey, tokenId);

        expect(result.reward).toBe(BigInt('500000000000000000'));
        expect(result.secondsInsideX128).toBe(BigInt('123456789'));

        expect(mockReadContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'getRewardInfo',
                args: [
                    expect.objectContaining({
                        rewardToken: sampleKey.rewardToken,
                        pool: sampleKey.pool,
                        startTime: sampleKey.startTime,
                        endTime: sampleKey.endTime,
                        refundee: sampleKey.refundee,
                    }),
                    tokenId,
                ],
            })
        );
    });

    // ========== createIncentive ==========

    it('should create incentive (approve + create)', async () => {
        const approveHash = '0xapprove_hash';
        const createHash = '0xcreate_hash';

        mockWalletClient.writeContract
            .mockResolvedValueOnce(approveHash)  // approve call
            .mockResolvedValueOnce(createHash);  // createIncentive call

        const params: CreateIncentiveParams = {
            rewardToken: sampleKey.rewardToken,
            pool: sampleKey.pool,
            startTime: Number(sampleKey.startTime),
            endTime: Number(sampleKey.endTime),
            refundee: sampleKey.refundee,
            rewardAmount: '1000',
            rewardTokenDecimals: 18,
        };

        const hash = await service.createIncentive(params, mockWalletClient);

        expect(hash).toBe(createHash);
        expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(2);

        // First call: ERC20 approve
        expect(mockWalletClient.writeContract).toHaveBeenNthCalledWith(1,
            expect.objectContaining({
                functionName: 'approve',
                address: params.rewardToken,
            })
        );

        // Second call: createIncentive
        expect(mockWalletClient.writeContract).toHaveBeenNthCalledWith(2,
            expect.objectContaining({
                functionName: 'createIncentive',
            })
        );

        // Should have waited for approval receipt
        expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith({ hash: approveHash });
    });

    it('should throw if wallet not connected on createIncentive', async () => {
        const noAccountWallet = { ...mockWalletClient, account: undefined } as any;
        const params: CreateIncentiveParams = {
            rewardToken: sampleKey.rewardToken,
            pool: sampleKey.pool,
            startTime: Number(sampleKey.startTime),
            endTime: Number(sampleKey.endTime),
            refundee: sampleKey.refundee,
            rewardAmount: '100',
            rewardTokenDecimals: 18,
        };

        await expect(service.createIncentive(params, noAccountWallet))
            .rejects.toThrow('Wallet not connected');
    });

    // ========== stakeToken ==========

    it('should stake token', async () => {
        const stakeHash = '0xstake_hash';
        mockWalletClient.writeContract.mockResolvedValueOnce(stakeHash);

        const tokenId = BigInt(42);
        const hash = await service.stakeToken(sampleKey, tokenId, mockWalletClient);

        expect(hash).toBe(stakeHash);
        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'stakeToken',
                args: [
                    expect.objectContaining({
                        rewardToken: sampleKey.rewardToken,
                        pool: sampleKey.pool,
                    }),
                    tokenId,
                ],
            })
        );
    });

    // ========== unstakeToken ==========

    it('should unstake token', async () => {
        const unstakeHash = '0xunstake_hash';
        mockWalletClient.writeContract.mockResolvedValueOnce(unstakeHash);

        const tokenId = BigInt(42);
        const hash = await service.unstakeToken(sampleKey, tokenId, mockWalletClient);

        expect(hash).toBe(unstakeHash);
        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'unstakeToken',
                args: [
                    expect.objectContaining({
                        rewardToken: sampleKey.rewardToken,
                    }),
                    tokenId,
                ],
            })
        );
    });

    // ========== claimReward ==========

    it('should claim reward', async () => {
        const claimHash = '0xclaim_hash';
        mockWalletClient.writeContract.mockResolvedValueOnce(claimHash);

        const rewardToken = '0x7659567Bc5057e7284856aAF331C4dea22AEd73E';
        const to = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        const amount = BigInt('1000000000000000000');

        const hash = await service.claimReward(rewardToken, to, amount, mockWalletClient);

        expect(hash).toBe(claimHash);
        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'claimReward',
                args: [rewardToken, to, amount],
            })
        );
    });

    // ========== getStakerAddress ==========

    it('should get staker address from config', () => {
        const addr = service.getStakerAddress();

        // Should return the testnet staker address from v3-config
        expect(addr).toBe('0x74D0BC02C633d207C35c6a1D8fda6E7104EC47Db');
    });
});
