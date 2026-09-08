import { stakingLogger } from '@/lib/logger';
/**
 * Staking Action Hooks
 * 
 * Write hooks for executing staking contract transactions
 * Integrated with KalySwap v3 wallet system and toast notifications
 */

import { useState, useCallback } from 'react'
import { parseEther } from 'viem'
import { useWallet } from '@/hooks/useWallet'
import { STAKING_CONTRACT, STAKING_FUNCTIONS } from '@/config/contracts/staking'
import { parseKLCAmount, validateStakeAmount } from '@/utils/staking/mathHelpers'
import {
  encodeStakeCall,
  encodeWithdrawCall,
  encodeClaimRewardCall,
  encodeExitCall,
  createStakingTransaction
} from '@/utils/staking/contractHelpers'
import { useToast } from '@/components/ui/toast'

/**
 * Hook for staking KMT tokens
 */
export function useStakeKLC() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const stakeKLC = useCallback(async (amount: string) => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Validate amount
      const amountWei = parseKLCAmount(amount)
      if (amountWei === BigInt(0)) {
        throw new Error('Invalid stake amount')
      }

      stakingLogger.debug('🥩 Staking KMT:', {
        amount,
        amountWei: amountWei.toString(),
        contractAddress: STAKING_CONTRACT.address
      })

      const functionData = encodeStakeCall()
      const transaction = createStakingTransaction(functionData, amountWei)
      const txHash = await signTransaction(transaction)

      toast.success('Stake Transaction Sent', `Staking ${amount} KMT tokens...`)

      stakingLogger.debug('✅ Stake transaction sent:', txHash)
      return txHash

    } catch (err) {
      stakingLogger.error('❌ Stake failed - Full error:', err)
      stakingLogger.error('❌ Error type:', typeof err)
      stakingLogger.error('❌ Error message:', err instanceof Error ? err.message : 'Unknown error')
      stakingLogger.error('❌ Error stack:', err instanceof Error ? err.stack : 'No stack trace')

      const errorMessage = err instanceof Error ? err.message : 'Failed to stake KMT'
      setError(errorMessage)

      // More specific error messages based on common issues
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient balance')) {
        toast.error('Insufficient Funds', 'You do not have enough KMT for this transaction')
      } else if (errorMessage.includes('user rejected') || errorMessage.includes('denied')) {
        toast.error('Transaction Cancelled', 'You cancelled the transaction')
      } else if (errorMessage.includes('Wallet not connected')) {
        toast.error('Wallet Error', 'Please reconnect your wallet and try again')
      } else if (errorMessage.includes('gas')) {
        toast.error('Gas Error', 'Transaction failed due to gas issues. Please try again.')
      } else {
        toast.error('Stake Failed', errorMessage)
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    stakeKLC,
    isLoading,
    error,
  }
}

/**
 * Hook for withdrawing staked KMT tokens
 */
export function useWithdrawKLC() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const withdrawKLC = useCallback(async (amount: string) => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Validate amount
      const amountWei = parseKLCAmount(amount)
      if (amountWei === BigInt(0)) {
        throw new Error('Invalid withdrawal amount')
      }

      // Create withdraw transaction
      const functionData = encodeWithdrawCall(amountWei)
      const transaction = createStakingTransaction(functionData)

      stakingLogger.debug('💰 Withdrawing KMT:', { amount, amountWei: amountWei.toString() })

      // Sign and send transaction
      const txHash = await signTransaction(transaction)

      toast.success('Withdrawal Transaction Sent', `Withdrawing ${amount} KMT tokens...`)

      stakingLogger.debug('✅ Withdrawal transaction sent:', txHash)
      return txHash

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to withdraw KMT'
      setError(errorMessage)
      
      toast.error('Withdrawal Failed', errorMessage)
      
      stakingLogger.error('❌ Withdrawal failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    withdrawKLC,
    isLoading,
    error,
  }
}

/**
 * Hook for claiming earned rewards
 */
export function useClaimRewards() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const claimRewards = useCallback(async () => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Create claim rewards transaction
      const functionData = encodeClaimRewardCall()
      const transaction = createStakingTransaction(functionData)

      stakingLogger.debug('🎁 Claiming rewards...')

      // Sign and send transaction
      const txHash = await signTransaction(transaction)

      toast.success('Claim Transaction Sent', 'Claiming your staking rewards...')

      stakingLogger.debug('✅ Claim transaction sent:', txHash)
      return txHash

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim rewards'
      setError(errorMessage)
      
      toast.error('Claim Failed', errorMessage)
      
      stakingLogger.error('❌ Claim failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    claimRewards,
    isLoading,
    error,
  }
}

/**
 * Hook for emergency exit (withdraw all + claim rewards)
 */
export function useExitStaking() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signTransaction, address } = useWallet()
  const toast = useToast()

  const exitStaking = useCallback(async () => {
    if (!signTransaction || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Create exit transaction
      const functionData = encodeExitCall()
      const transaction = createStakingTransaction(functionData)

      stakingLogger.debug('🚪 Exiting staking (withdraw all + claim)...')

      // Sign and send transaction
      const txHash = await signTransaction(transaction)

      toast.success('Exit Transaction Sent', 'Withdrawing all staked KMT and claiming rewards...')

      stakingLogger.debug('✅ Exit transaction sent:', txHash)
      return txHash

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exit staking'
      setError(errorMessage)
      
      toast.error('Exit Failed', errorMessage)
      
      stakingLogger.error('❌ Exit failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [signTransaction, address])

  return {
    exitStaking,
    isLoading,
    error,
  }
}

/**
 * Comprehensive staking actions hook
 * Combines all staking actions with validation
 */
export function useStakingActions() {
  const { stakeKLC, isLoading: stakeLoading, error: stakeError } = useStakeKLC()
  const { withdrawKLC, isLoading: withdrawLoading, error: withdrawError } = useWithdrawKLC()
  const { claimRewards, isLoading: claimLoading, error: claimError } = useClaimRewards()
  const { exitStaking, isLoading: exitLoading, error: exitError } = useExitStaking()

  const isLoading = stakeLoading || withdrawLoading || claimLoading || exitLoading
  const error = stakeError || withdrawError || claimError || exitError

  return {
    // Actions
    stakeKLC,
    withdrawKLC,
    claimRewards,
    exitStaking,
    
    // States
    isLoading,
    error,
    
    // Individual loading states
    stakeLoading,
    withdrawLoading,
    claimLoading,
    exitLoading,
  }
}
