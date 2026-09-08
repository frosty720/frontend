import { stakingLogger } from '@/lib/logger';
/**
 * Staking Data Hooks
 * 
 * Read-only hooks for fetching staking contract data
 * Based on production KalyCoinStaking implementation patterns
 */

import { useContractRead, useBalance } from 'wagmi'
import { STAKING_CONTRACT, STAKING_FUNCTIONS } from '@/config/contracts/staking'
import { calculateAPR } from '@/utils/staking/mathHelpers'
import { useEffect, useState } from 'react'
import { useWallet } from '@/hooks/useWallet'

// Helper function to safely use wagmi hooks with error handling
function useContractReadSafe(config: any) {
  try {
    return useContractRead(config)
  } catch (error) {
    // Wagmi provider not available or hydration mismatch, return fallback values
    if (process.env.NODE_ENV === 'development') {
      stakingLogger.warn('Contract read hook failed, using fallback values:', error)
    }
    return {
      data: null,
      isLoading: false,
      error: null,
      refetch: () => Promise.resolve(),
    }
  }
}

/**
 * Get user's native KMT balance
 * @param address - User wallet address
 * @returns KMT balance in Wei (bigint)
 */
export function useKLCBalance(address?: string) {
  let walletBalance: any = null

  // Safely get wallet balance
  try {
    const wallet = useWallet()
    walletBalance = wallet.balance
  } catch (error) {
    // Wallet hook not available during SSR
    walletBalance = null
  }

  // Use wallet balance if available, otherwise try wagmi hook with error handling
  let wagmiBalance: any = null
  let wagmiLoading = false
  let wagmiError: any = null

  try {
    const balanceData = useBalance({
      address: address as `0x${string}`,
    })
    wagmiBalance = balanceData.data
    wagmiLoading = balanceData.isLoading
    wagmiError = balanceData.error
  } catch (error) {
    // Wagmi provider not available, use wallet balance
    wagmiBalance = null
    wagmiLoading = false
    wagmiError = null
  }

  // Prefer wallet balance over wagmi balance
  const balance = walletBalance || wagmiBalance

  return {
    balance: balance?.value || BigInt(0),
    formatted: balance?.formatted || '0',
    isLoading: wagmiLoading,
    error: wagmiError,
    refetch: () => {}, // TODO: Implement refetch for wallet balance
  }
}

/**
 * Get user's staked KMT balance
 * @param address - User wallet address
 * @returns Staked balance in Wei (bigint)
 */
export function useStakedBalance(address?: string) {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.BALANCE_OF,
    args: [address],
    watch: true,
    enabled: !!address,
  })

  // Debug logging
  if (address && process.env.NODE_ENV === 'development') {
    stakingLogger.debug('🔍 useStakedBalance:', {
      address,
      data: data?.toString(),
      isLoading,
      error,
      contractAddress: STAKING_CONTRACT.address,
      functionName: STAKING_FUNCTIONS.BALANCE_OF
    })
  }

  return {
    stakedBalance: (data as bigint) || BigInt(0),
    isLoading,
    error,
    refetch,
  }
}

/**
 * Get user's earned rewards
 * @param address - User wallet address
 * @returns Earned rewards in Wei (bigint)
 */
export function useEarnedRewards(address?: string) {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.EARNED,
    args: [address],
    watch: true,
    enabled: !!address,
  })

  return {
    earnedRewards: (data as bigint) || BigInt(0),
    isLoading,
    error,
    refetch,
  }
}

/**
 * Get total staked amount across all users
 * @returns Total staked amount in Wei (bigint)
 */
export function useTotalStaked() {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.TOTAL_SUPPLY,
    watch: true,
  })

  return {
    totalStaked: (data as bigint) || BigInt(0),
    isLoading,
    error,
    refetch,
  }
}

/**
 * Get current reward rate (rewards per second)
 * @returns Reward rate in Wei per second (bigint)
 */
export function useRewardRate() {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.REWARD_RATE,
    watch: true,
  })

  return {
    rewardRate: (data as bigint) || BigInt(0),
    isLoading,
    error,
    refetch,
  }
}

/**
 * Get reward period end timestamp
 * @returns Timestamp when reward period ends (bigint)
 */
export function useRewardPeriod() {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.PERIOD_FINISH,
    watch: true,
  })

  // Hardcoded periodFinish: January 1, 2027 00:00:00 UTC
  const hardcodedPeriodFinish = BigInt(1798761600); // January 1, 2027 timestamp

  return {
    periodFinish: hardcodedPeriodFinish,
    isLoading,
    error,
    refetch,
  }
}

/**
 * Get total rewards for the current period
 * @returns Total rewards for duration in Wei (bigint)
 */
export function useRewardForDuration() {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.GET_REWARD_FOR_DURATION,
    watch: true,
  })

  return {
    rewardForDuration: (data as bigint) || BigInt(0),
    isLoading,
    error,
    refetch,
  }
}

/**
 * Calculate current APR based on reward rate and total staked
 * @returns APR percentage as number
 */
export function useAPR() {
  const { rewardRate, isLoading: rewardRateLoading } = useRewardRate()
  const { totalStaked, isLoading: totalStakedLoading } = useTotalStaked()
  const [apr, setAPR] = useState<number>(0)

  useEffect(() => {
    if (rewardRate && totalStaked && totalStaked > BigInt(0)) {
      const calculatedAPR = calculateAPR(rewardRate, totalStaked)
      setAPR(calculatedAPR)
    } else {
      setAPR(0)
    }
  }, [rewardRate, totalStaked])

  return {
    apr,
    isLoading: rewardRateLoading || totalStakedLoading,
  }
}

/**
 * Check if staking contract is paused
 * @returns Boolean indicating if contract is paused
 */
export function useStakingPaused() {
  const { data, isLoading, error, refetch } = useContractReadSafe({
    address: STAKING_CONTRACT.address,
    abi: STAKING_CONTRACT.abi,
    functionName: STAKING_FUNCTIONS.PAUSED,
    watch: true,
  })

  return {
    isPaused: (data as boolean) || false,
    isLoading,
    error,
    refetch,
  }
}

/**
 * Comprehensive staking data hook for a user
 * Combines multiple data points for efficiency
 * @param address - User wallet address
 */
export function useStakingUserData(address?: string) {
  const klcBalance = useKLCBalance(address)
  const stakedBalance = useStakedBalance(address)
  const earnedRewards = useEarnedRewards(address)
  const { apr } = useAPR()
  const { totalStaked } = useTotalStaked()
  const { periodFinish } = useRewardPeriod()
  const { isPaused } = useStakingPaused()

  const isLoading = klcBalance.isLoading || 
                   stakedBalance.isLoading || 
                   earnedRewards.isLoading

  return {
    // User specific data
    klcBalance: klcBalance.balance,
    klcBalanceFormatted: klcBalance.formatted,
    stakedBalance: stakedBalance.stakedBalance,
    earnedRewards: earnedRewards.earnedRewards,
    
    // Global staking data
    apr,
    totalStaked,
    periodFinish,
    isPaused,
    
    // Loading states
    isLoading,
    
    // Refetch functions
    refetchUserData: () => {
      klcBalance.refetch()
      stakedBalance.refetch()
      earnedRewards.refetch()
    },
  }
}
