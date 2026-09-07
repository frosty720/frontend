/**
 * V3StakingService - Wraps all Uniswap V3 Staker contract interactions
 * Handles incentive creation, NFT deposit/stake, unstake/withdraw, and reward claims
 */

import { CHAIN_IDS, getChainTransport, getChainById, kalychain } from '@/config/chains';
import { getV3Config, V3DexConfig } from '@/config/dex/v3-config';
import { V3StakerABI, V3NonfungiblePositionManagerABI, ERC20ABI } from '@/config/abis';
import { dexLogger as logger } from '@/lib/logger';
import type { PublicClient, WalletClient } from 'viem';
import { createPublicClient, http, parseUnits, encodeAbiParameters, keccak256 } from 'viem';
import type {
    IncentiveKey,
    V3Deposit,
    CreateIncentiveParams,
} from './v3-staking-types';
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';

/**
 * V3 Staking Service for managing liquidity mining incentives
 */
export class V3StakingService {
    private config: V3DexConfig;
    private publicClient: PublicClient;
    private stakerAddress: string;
    private positionManagerAddress: string;
    private stakerABI: any[];
    private positionManagerABI: any[];

    constructor(chainId: number = CHAIN_IDS.KALYCHAIN) {
        const config = getV3Config(chainId);
        if (!config) throw new Error('V3 not available on this chain');
        this.config = config;
        this.stakerAddress = this.config.staker;
        this.positionManagerAddress = this.config.positionManager;
        this.stakerABI = V3StakerABI;
        this.positionManagerABI = V3NonfungiblePositionManagerABI;

        // Resolve the real chain definition. This used to be a two-way ternary that sent
        // every non-testnet chain to the 3888 mainnet def, so on KMT (3890) the public
        // client carried the wrong chain id while talking to the 3890 transport.
        const chain = getChainById(chainId) ?? kalychain;

        this.publicClient = createPublicClient({
            chain,
            transport: getChainTransport(chainId),
        }) as PublicClient;
    }

    // ========== Read Methods ==========

    /**
     * Get information about an incentive by its key
     */
    async getIncentiveInfo(key: IncentiveKey): Promise<{
        totalRewardUnclaimed: bigint;
        totalSecondsClaimedX128: bigint;
        numberOfStakes: number;
    }> {
        const incentiveId = this.encodeIncentiveKey(key);

        const result = await this.publicClient.readContract({
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'incentives',
            args: [incentiveId],
        });

        const [totalRewardUnclaimed, totalSecondsClaimedX128, numberOfStakes] = result as [bigint, bigint, bigint];

        return {
            totalRewardUnclaimed,
            totalSecondsClaimedX128,
            numberOfStakes: Number(numberOfStakes),
        };
    }

    /**
     * Get deposit info for a staked NFT position
     */
    async getDepositInfo(tokenId: bigint): Promise<V3Deposit> {
        const result = await this.publicClient.readContract({
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'deposits',
            args: [tokenId],
        });

        const [owner, numberOfStakes, tickLower, tickUpper] = result as [string, bigint, number, number];

        return {
            tokenId,
            owner,
            numberOfStakes: Number(numberOfStakes),
            tickLower,
            tickUpper,
        };
    }

    /**
     * Get accumulated reward info for a staked position in an incentive
     */
    async getRewardInfo(
        key: IncentiveKey,
        tokenId: bigint
    ): Promise<{ reward: bigint; secondsInsideX128: bigint }> {
        const keyTuple = this.buildKeyTuple(key);

        const result = await this.publicClient.readContract({
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'getRewardInfo',
            args: [keyTuple, tokenId],
        });

        const [reward, secondsInsideX128] = result as [bigint, bigint];

        return { reward, secondsInsideX128 };
    }

    /**
     * Get total accumulated (claimable) rewards for an owner for a given reward token
     */
    async getAccumulatedRewards(rewardToken: string, owner: string): Promise<bigint> {
        const result = await this.publicClient.readContract({
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'rewards',
            args: [rewardToken as `0x${string}`, owner as `0x${string}`],
        });

        return result as unknown as bigint;
    }

    // ========== Write Methods ==========

    /**
     * Create a new incentive program
     * The caller must first approve the staker to spend the reward token amount
     */
    async createIncentive(
        params: CreateIncentiveParams,
        walletClient: WalletClient
    ): Promise<string> {
        const account = walletClient.account;
        if (!account) throw new Error('Wallet not connected');

        const rewardAmount = parseUnits(params.rewardAmount, params.rewardTokenDecimals);

        logger.debug('V3StakingService: Approving reward token spend', {
            rewardToken: params.rewardToken,
            amount: rewardAmount.toString(),
        });

        // Step 1: Approve the staker contract to spend reward tokens
        const approveHash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: params.rewardToken as `0x${string}`,
            abi: ERC20ABI,
            functionName: 'approve',
            args: [this.stakerAddress as `0x${string}`, rewardAmount],
        } as any);

        // Wait for approval to be mined
        await assertTxSucceeded(this.publicClient, approveHash);

        logger.debug('V3StakingService: Creating incentive', {
            pool: params.pool,
            startTime: params.startTime,
            endTime: params.endTime,
            rewardAmount: params.rewardAmount,
        });

        // Step 2: Create the incentive
        const keyTuple = this.buildKeyTuple({
            rewardToken: params.rewardToken,
            pool: params.pool,
            startTime: BigInt(params.startTime),
            endTime: BigInt(params.endTime),
            refundee: params.refundee,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'createIncentive',
            args: [keyTuple, rewardAmount],
        } as any);

        return hash;
    }

    /**
     * End an expired incentive and reclaim remaining rewards
     */
    async endIncentive(key: IncentiveKey, walletClient: WalletClient): Promise<string> {
        const keyTuple = this.buildKeyTuple(key);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'endIncentive',
            args: [keyTuple],
        } as any);

        return hash;
    }

    /**
     * Deposit an NFT position into the staker contract
     * Uses safeTransferFrom on the position manager — the staker accepts via onERC721Received
     */
    async depositToken(tokenId: bigint, walletClient: WalletClient): Promise<string> {
        const account = walletClient.account;
        if (!account) throw new Error('Wallet not connected');

        logger.debug('V3StakingService: Depositing NFT position', { tokenId: tokenId.toString() });

        // safeTransferFrom(owner, stakerAddress, tokenId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.positionManagerAddress as `0x${string}`,
            abi: this.positionManagerABI,
            functionName: 'safeTransferFrom',
            args: [account.address, this.stakerAddress as `0x${string}`, tokenId],
        } as any);

        return hash;
    }

    /**
     * Stake a deposited NFT position in an incentive program
     */
    async stakeToken(
        key: IncentiveKey,
        tokenId: bigint,
        walletClient: WalletClient
    ): Promise<string> {
        const keyTuple = this.buildKeyTuple(key);

        logger.debug('V3StakingService: Staking token in incentive', {
            tokenId: tokenId.toString(),
            incentiveId: this.encodeIncentiveKey(key),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'stakeToken',
            args: [keyTuple, tokenId],
        } as any);

        return hash;
    }

    /**
     * Unstake a position from an incentive (accumulates rewards)
     */
    async unstakeToken(
        key: IncentiveKey,
        tokenId: bigint,
        walletClient: WalletClient
    ): Promise<string> {
        const keyTuple = this.buildKeyTuple(key);

        logger.debug('V3StakingService: Unstaking token from incentive', {
            tokenId: tokenId.toString(),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'unstakeToken',
            args: [keyTuple, tokenId],
        } as any);

        return hash;
    }

    /**
     * Withdraw a deposited NFT position back to the owner
     * Must unstake from all incentives first
     */
    async withdrawToken(
        tokenId: bigint,
        to: string,
        walletClient: WalletClient
    ): Promise<string> {
        logger.debug('V3StakingService: Withdrawing NFT position', {
            tokenId: tokenId.toString(),
            to,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'withdrawToken',
            args: [tokenId, to as `0x${string}`, '0x'],
        } as any);

        return hash;
    }

    /**
     * Claim accumulated rewards for a reward token
     */
    async claimReward(
        rewardToken: string,
        to: string,
        amount: bigint,
        walletClient: WalletClient
    ): Promise<string> {
        logger.debug('V3StakingService: Claiming rewards', {
            rewardToken,
            to,
            amount: amount.toString(),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic ABI from config
        const hash = await walletClient.writeContract({
            // KalyChain advertises a ~0 priority fee; without this the wallet builds
            // the tx below the 21 gwei inclusion floor. No-op on other chains.
            ...kalyFeeOverrides(walletClient.chain?.id),
            address: this.stakerAddress as `0x${string}`,
            abi: this.stakerABI,
            functionName: 'claimReward',
            args: [rewardToken as `0x${string}`, to as `0x${string}`, amount],
        } as any);

        return hash;
    }

    // ========== Helpers ==========

    /**
     * Encode an IncentiveKey into its keccak256 hash (incentive ID)
     */
    encodeIncentiveKey(key: IncentiveKey): string {
        const encoded = encodeAbiParameters(
            [
                {
                    type: 'tuple',
                    components: [
                        { name: 'rewardToken', type: 'address' },
                        { name: 'pool', type: 'address' },
                        { name: 'startTime', type: 'uint256' },
                        { name: 'endTime', type: 'uint256' },
                        { name: 'refundee', type: 'address' },
                    ],
                },
            ],
            [
                {
                    rewardToken: key.rewardToken as `0x${string}`,
                    pool: key.pool as `0x${string}`,
                    startTime: key.startTime,
                    endTime: key.endTime,
                    refundee: key.refundee as `0x${string}`,
                },
            ]
        );

        return keccak256(encoded);
    }

    /**
     * Get the staker contract address
     */
    getStakerAddress(): string {
        return this.stakerAddress;
    }

    /**
     * Build the incentive key tuple for contract calls
     */
    private buildKeyTuple(key: IncentiveKey) {
        return {
            rewardToken: key.rewardToken as `0x${string}`,
            pool: key.pool as `0x${string}`,
            startTime: key.startTime,
            endTime: key.endTime,
            refundee: key.refundee as `0x${string}`,
        };
    }
}

// Singleton factory with caching by chainId
const stakingServiceInstances: Map<number, V3StakingService> = new Map();

export function getV3StakingService(chainId: number = CHAIN_IDS.KALYCHAIN): V3StakingService {
    if (!stakingServiceInstances.has(chainId)) {
        stakingServiceInstances.set(chainId, new V3StakingService(chainId));
    }
    return stakingServiceInstances.get(chainId)!;
}
