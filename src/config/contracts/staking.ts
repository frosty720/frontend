import stakingABI from '@/config/abis/staking/stakingABI.json'
import { kalychain } from '@/config/chains'
import { MAINNET_CONTRACTS } from '@/config/contracts'

/**
 * KMT Staking Contract Configuration
 *
 * This contract handles native KMT token staking with reward distribution.
 * Based on the production implementation at https://staking.kalychain.io/stake
 */

// The address book (config/contracts.ts) is the source of truth; the env var is only an override
// for pointing a local build at a different deployment.
//
// This used to read the env var ALONE and throw when it was unset. Deployments were still carrying
// the 3888 address 0xF670A2D3…, which has no code on 3890, so the stake page silently queried a
// non-existent contract and reported 0 staked / 0% APR. Falling back to the address book means a
// stale env can no longer point this at a dead contract.
const STAKING_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS ||
  MAINNET_CONTRACTS.STAKING) as `0x${string}`

if (!STAKING_CONTRACT_ADDRESS) {
  throw new Error('No staking contract address: set NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS or MAINNET_CONTRACTS.STAKING')
}

/**
 * Staking Contract Configuration
 */
export const STAKING_CONTRACT = {
  address: STAKING_CONTRACT_ADDRESS,
  abi: stakingABI,
  chainId: kalychain.id,
} as const

/**
 * Contract Function Names
 * Based on the production ABI from KalyCoinStaking
 */
export const STAKING_FUNCTIONS = {
  // Write Functions
  STAKE: 'stake',
  WITHDRAW: 'withdraw', 
  CLAIM_REWARD: 'claimReward',
  EXIT: 'exit',
  
  // Read Functions
  BALANCE_OF: 'balanceOf',
  EARNED: 'earned',
  TOTAL_SUPPLY: 'totalSupply',
  REWARD_RATE: 'rewardRate',
  PERIOD_FINISH: 'periodFinish',
  GET_REWARD_FOR_DURATION: 'getRewardForDuration',
  REWARD_PER_TOKEN: 'rewardPerToken',
  REWARDS_DURATION: 'rewardsDuration',
  PAUSED: 'paused',
} as const

/**
 * Contract Events
 */
export const STAKING_EVENTS = {
  STAKED: 'Staked',
  WITHDRAWN: 'Withdrawn', 
  REWARD_PAID: 'RewardPaid',
  REWARD_ADDED: 'RewardAdded',
} as const

/**
 * Staking Contract Type Definitions
 */
export type StakingContractConfig = typeof STAKING_CONTRACT
export type StakingFunctions = typeof STAKING_FUNCTIONS
export type StakingEvents = typeof STAKING_EVENTS

/**
 * Helper function to get staking contract configuration
 */
export const getStakingContract = () => STAKING_CONTRACT

/**
 * Validation helpers
 */
export const isValidStakingAddress = (address: string): boolean => {
  return address === STAKING_CONTRACT_ADDRESS
}

export const isKalyChainStaking = (chainId: number): boolean => {
  return chainId === kalychain.id
}
