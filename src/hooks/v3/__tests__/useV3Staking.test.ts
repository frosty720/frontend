/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock wagmi
const mockAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const mockWriteContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });

vi.mock('wagmi', () => ({
    useAccount: () => ({ address: mockAddress, chainId: 3889 }),
    usePublicClient: () => ({
        waitForTransactionReceipt: mockWaitForTransactionReceipt,
    }),
    useWalletClient: () => ({
        data: {
            account: { address: mockAddress },
            writeContract: mockWriteContract,
            chain: { id: 3889 },
        },
    }),
}));

// Mock the staking service
const mockGetIncentiveInfo = vi.fn();
const mockEncodeIncentiveKey = vi.fn().mockReturnValue('0xincentive_id');
const mockGetAccumulatedRewards = vi.fn();
const mockGetDepositInfo = vi.fn();
const mockGetRewardInfo = vi.fn();
const mockDepositToken = vi.fn();
const mockStakeToken = vi.fn();
const mockUnstakeToken = vi.fn();
const mockWithdrawToken = vi.fn();
const mockClaimReward = vi.fn();

vi.mock('@/services/dex/V3StakingService', () => ({
    getV3StakingService: () => ({
        getIncentiveInfo: mockGetIncentiveInfo,
        encodeIncentiveKey: mockEncodeIncentiveKey,
        getAccumulatedRewards: mockGetAccumulatedRewards,
        getDepositInfo: mockGetDepositInfo,
        getRewardInfo: mockGetRewardInfo,
        depositToken: mockDepositToken,
        stakeToken: mockStakeToken,
        unstakeToken: mockUnstakeToken,
        withdrawToken: mockWithdrawToken,
        claimReward: mockClaimReward,
    }),
}));

// Mock the staking subgraph hook — incentive list now comes from here.
// Empty by default to avoid background fetches interfering with assertions.
vi.mock('@/hooks/v3/useV3StakingSubgraph', () => ({
    useV3StakingSubgraph: () => ({
        incentives: [],
        userStakes: [],
        rewardClaims: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
    }),
}));

vi.mock('@/lib/logger', () => ({
    dexLogger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

// Import after mocks
import { useV3Staking } from '../useV3Staking';
import type { IncentiveKey } from '@/services/dex/v3-staking-types';

const sampleKey: IncentiveKey = {
    rewardToken: '0x7659567Bc5057e7284856aAF331C4dea22AEd73E',
    pool: '0x1234567890123456789012345678901234567890',
    startTime: BigInt(1700000000),
    endTime: BigInt(1700604800),
    refundee: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useV3Staking', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with empty state', () => {
        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        expect(result.current.incentives).toEqual([]);
        expect(result.current.pendingRewards).toEqual({});
        expect(result.current.error).toBeNull();
    });

    it('should expose all expected action functions', () => {
        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        expect(typeof result.current.depositAndStake).toBe('function');
        expect(typeof result.current.unstakeAndWithdraw).toBe('function');
        expect(typeof result.current.claimReward).toBe('function');
        expect(typeof result.current.refreshDeposit).toBe('function');
        expect(typeof result.current.getPositionReward).toBe('function');
        expect(typeof result.current.refetch).toBe('function');
    });

    it('should expose the service instance', () => {
        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        expect(result.current.service).toBeDefined();
        expect(typeof result.current.service.depositToken).toBe('function');
    });

    it('should handle depositAndStake flow', async () => {
        const depositHash = '0xdeposit_hash';
        const stakeHash = '0xstake_hash';

        mockDepositToken.mockResolvedValue(depositHash);
        mockStakeToken.mockResolvedValue(stakeHash);

        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        let hashes: { depositHash: string; stakeHash: string } | undefined;
        await act(async () => {
            hashes = await result.current.depositAndStake(sampleKey, BigInt(42));
        });

        expect(hashes!.depositHash).toBe(depositHash);
        expect(hashes!.stakeHash).toBe(stakeHash);

        // Verify deposit was called first, then stake
        expect(mockDepositToken).toHaveBeenCalledWith(BigInt(42), expect.anything());
        expect(mockStakeToken).toHaveBeenCalledWith(sampleKey, BigInt(42), expect.anything());

        // Both transaction receipts waited on
        expect(mockWaitForTransactionReceipt).toHaveBeenCalledTimes(2);
    });

    it('should handle unstakeAndWithdraw flow', async () => {
        const unstakeHash = '0xunstake_hash';
        const withdrawHash = '0xwithdraw_hash';

        mockUnstakeToken.mockResolvedValue(unstakeHash);
        mockWithdrawToken.mockResolvedValue(withdrawHash);

        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        let hashes: { unstakeHash: string; withdrawHash: string } | undefined;
        await act(async () => {
            hashes = await result.current.unstakeAndWithdraw(sampleKey, BigInt(42));
        });

        expect(hashes!.unstakeHash).toBe(unstakeHash);
        expect(hashes!.withdrawHash).toBe(withdrawHash);

        expect(mockUnstakeToken).toHaveBeenCalledWith(sampleKey, BigInt(42), expect.anything());
        expect(mockWithdrawToken).toHaveBeenCalledWith(BigInt(42), mockAddress, expect.anything());
    });

    it('should handle claimReward', async () => {
        const claimHash = '0xclaim_hash';
        mockClaimReward.mockResolvedValue(claimHash);

        const rewardToken = '0x7659567Bc5057e7284856aAF331C4dea22AEd73E';
        const amount = BigInt('1000000000000000000');

        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        let hash: string | undefined;
        await act(async () => {
            hash = await result.current.claimReward(rewardToken, amount);
        });

        expect(hash).toBe(claimHash);
        expect(mockClaimReward).toHaveBeenCalledWith(
            rewardToken,
            mockAddress,
            amount,
            expect.anything()
        );
    });

    it('should handle refreshDeposit', async () => {
        const mockDeposit = {
            tokenId: BigInt(42),
            owner: mockAddress,
            numberOfStakes: 1,
            tickLower: -887220,
            tickUpper: 887220,
        };
        mockGetDepositInfo.mockResolvedValue(mockDeposit);

        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        let deposit: any;
        await act(async () => {
            deposit = await result.current.refreshDeposit(BigInt(42));
        });

        expect(deposit).toEqual(mockDeposit);
        expect(mockGetDepositInfo).toHaveBeenCalledWith(BigInt(42));
    });

    it('should handle getPositionReward', async () => {
        const mockRewardInfo = {
            reward: BigInt('500000000000000000'),
            secondsInsideX128: BigInt('123456789'),
        };
        mockGetRewardInfo.mockResolvedValue(mockRewardInfo);

        const { result } = renderHook(() => useV3Staking(3889), {
            wrapper: createWrapper(),
        });

        let rewardInfo: any;
        await act(async () => {
            rewardInfo = await result.current.getPositionReward(sampleKey, BigInt(42));
        });

        expect(rewardInfo).toEqual(mockRewardInfo);
        expect(mockGetRewardInfo).toHaveBeenCalledWith(sampleKey, BigInt(42));
    });
});
