import { launchpadLogger } from '@/lib/logger';
import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEther, parseUnits, formatEther } from 'viem'
import { PRESALE_ABI, FAIRLAUNCH_ABI, PRESALE_V3_ABI, FAIRLAUNCH_V3_ABI, ERC20_ABI } from '@/config/abis'
import { isNativeToken } from '@/config/contracts'
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';

/**
 * Mirrors `enum PresaleStatus` / `enum FairlaunchStatus` in the launchpad contracts:
 * { PENDING, ACTIVE, SUCCESS, FAILED, CANCELLED, FINALIZED }
 */
const SaleStatus = {
  PENDING: 0,
  ACTIVE: 1,
  SUCCESS: 2,
  FAILED: 3,
  CANCELLED: 4,
  FINALIZED: 5,
} as const

interface ParticipationParams {
  contractAddress: string
  projectType: 'presale' | 'fairlaunch'
  amount: string
  baseToken: string
}

interface UserContribution {
  amount: string
  claimableTokens: string
  hasContributed: boolean
  canClaim: boolean
  canRefund: boolean
  hasClaimed: boolean
}

interface UseParticipationReturn {
  // State
  isLoading: boolean
  error: string | null
  transactionHash: string | null
  userContribution: UserContribution | null
  
  // Actions
  participate: (params: ParticipationParams) => Promise<void>
  claimTokens: (contractAddress: string, projectType: string) => Promise<void>
  claimRefund: (contractAddress: string, projectType: string) => Promise<void>
  fetchUserContribution: (contractAddress: string, projectType: string, isProjectFinalized?: boolean) => Promise<void>
  
  // Validation
  canParticipate: (amount: string, contractAddress: string) => Promise<{ canParticipate: boolean; reason?: string }>
  getContributionLimits: (contractAddress: string, projectType: string) => Promise<{ min: string; max: string }>
}

export function useParticipation(): UseParticipationReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactionHash, setTransactionHash] = useState<string | null>(null)
  const [userContribution, setUserContribution] = useState<UserContribution | null>(null)

  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Get appropriate ABI based on project type and dex version
  // Only the V3 launchpad was deployed to KalyChain; the V2 presale/fairlaunch
  // contracts belong to the pre-relaunch chain and no longer exist.
  const getContractABI = (projectType: string) =>
    projectType === 'presale' ? PRESALE_V3_ABI : FAIRLAUNCH_V3_ABI

  // Execute contract call via standard Wagmi writeContract
  const executeContractCall = useCallback(async (
    contractAddress: string,
    abi: any,
    functionName: string,
    args: any[],
    value: string = '0'
  ): Promise<string> => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected')
    }

    if (!walletClient) {
      throw new Error('Wallet client not available')
    }

    const hash = await walletClient.writeContract({
      // KalyChain advertises a ~0 priority fee; without this the wallet builds
      // the tx below the 21 gwei inclusion floor. No-op on other chains.
      ...kalyFeeOverrides(walletClient.chain?.id),
      address: contractAddress as `0x${string}`,
      abi,
      functionName,
      args,
      value: value ? BigInt(value) : undefined,
      gas: BigInt(300000),
    })

    return hash
  }, [isConnected, address, walletClient])

  // Participate in presale/fairlaunch
  const participate = useCallback(async (params: ParticipationParams) => {
    setIsLoading(true)
    setError(null)
    setTransactionHash(null)

    try {
      const { contractAddress, projectType, amount, baseToken } = params
      const abi = getContractABI(projectType)
      const isNative = isNativeToken(baseToken)
      
      let value = '0'
      let args: any[] = []

      if (isNative) {
        // Native contribution: the contract reads msg.value and ignores the argument.
        value = parseEther(amount).toString()
        args = [parseEther(amount)]
      } else {
        // ERC20 contribution. participate() pulls the funds with safeTransferFrom, so the
        // presale needs an allowance first — without it every ERC20 contribution reverts.
        // The amount is denominated in the BASE TOKEN's own decimals; parseEther() assumed
        // 18 and was off by 1e12 for a 6-decimal stablecoin.
        if (!publicClient) throw new Error('Public client not available')

        const decimals = await publicClient.readContract({
          address: baseToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'decimals',
          args: [],
        }) as number

        const contribution = parseUnits(amount, Number(decimals))

        const allowance = await publicClient.readContract({
          address: baseToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address as `0x${string}`, contractAddress as `0x${string}`],
        }) as bigint

        if (allowance < contribution) {
          const approveHash = await executeContractCall(
            baseToken,
            ERC20_ABI,
            'approve',
            [contractAddress as `0x${string}`, contribution]
          )
          await assertTxSucceeded(publicClient, approveHash, 'Approval')
        }

        args = [contribution]
      }

      const hash = await executeContractCall(
        contractAddress,
        abi,
        'participate',
        args,
        value
      )

      setTransactionHash(hash)
      
      // Refresh user contribution data
      await fetchUserContribution(contractAddress, projectType)
      
    } catch (err) {
      launchpadLogger.error('Participation failed:', err)
      setError(err instanceof Error ? err.message : 'Participation failed')
    } finally {
      setIsLoading(false)
    }
  }, [executeContractCall, publicClient, address])

  // Claim tokens after successful presale
  const claimTokens = useCallback(async (contractAddress: string, projectType: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const abi = getContractABI(projectType)
      
      const hash = await executeContractCall(
        contractAddress,
        abi,
        'claimTokens',
        []
      )

      setTransactionHash(hash)
      await fetchUserContribution(contractAddress, projectType)
      
    } catch (err) {
      launchpadLogger.error('Claim failed:', err)
      setError(err instanceof Error ? err.message : 'Claim failed')
    } finally {
      setIsLoading(false)
    }
  }, [executeContractCall])

  // Claim refund for failed presale
  const claimRefund = useCallback(async (contractAddress: string, projectType: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const abi = getContractABI(projectType)
      
      const hash = await executeContractCall(
        contractAddress,
        abi,
        'claimRefund',
        []
      )

      setTransactionHash(hash)
      await fetchUserContribution(contractAddress, projectType)
      
    } catch (err) {
      launchpadLogger.error('Refund failed:', err)
      setError(err instanceof Error ? err.message : 'Refund failed')
    } finally {
      setIsLoading(false)
    }
  }, [executeContractCall])

  // Fetch user's contribution data
  const fetchUserContribution = useCallback(async (contractAddress: string, projectType: string, isProjectFinalized: boolean = false) => {
    if (!address || !publicClient) return

    try {
      const abi = getContractABI(projectType)

      // Read user's contribution amount using the correct function name
      let contributionAmount: bigint = 0n
      let tokenAllocation: bigint = 0n
      let hasClaimed: boolean = false

      if (projectType === 'presale') {
        // Presale contract returns struct: [baseContribution, tokenAllocation, claimed]
        const buyerInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'buyers',
          args: [address]
        }) as [bigint, bigint, boolean]

        contributionAmount = buyerInfo[0]
        tokenAllocation = buyerInfo[1]
        hasClaimed = buyerInfo[2]
      } else {
        // Fairlaunch contract returns struct: [baseContribution, tokenAllocation, claimed]
        const participantInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'participants',
          args: [address]
        }) as [bigint, bigint, boolean]

        contributionAmount = participantInfo[0]
        hasClaimed = participantInfo[2]

        // For fairlaunch, calculate token allocation using the contract's calculateTokenAmount function
        if (contributionAmount > 0n) {
          tokenAllocation = await publicClient.readContract({
            address: contractAddress as `0x${string}`,
            abi,
            functionName: 'calculateTokenAmount',
            args: [contributionAmount]
          }) as bigint
        } else {
          tokenAllocation = 0n
        }
      }

      // Use the token allocation we already retrieved as claimable tokens
      const claimableTokens = tokenAllocation > 0n ? formatEther(tokenAllocation) : '0'

      // claimRefund() requires getStatus() to be FAILED or CANCELLED, a non-zero
      // contribution, and nothing claimed yet. This was hardcoded false, so the refund
      // button in UserContributions could never appear on a failed sale.
      let saleStatus: number | null = null
      try {
        saleStatus = Number(await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'getStatus',
          args: [],
        }))
      } catch (statusError) {
        launchpadLogger.warn('Could not read sale status for refund eligibility', statusError)
      }
      const isRefundable = saleStatus === SaleStatus.FAILED || saleStatus === SaleStatus.CANCELLED

      setUserContribution({
        amount: formatEther(contributionAmount),
        claimableTokens,
        hasContributed: contributionAmount > 0n,
        canClaim: parseFloat(claimableTokens) > 0 && !hasClaimed && isProjectFinalized,
        canRefund: isRefundable && contributionAmount > 0n && !hasClaimed,
        hasClaimed: hasClaimed
      })

    } catch (err) {
      launchpadLogger.error('Failed to fetch user contribution:', err)
    }
  }, [address, publicClient])

  // Validate if user can participate with given amount
  const canParticipate = useCallback(async (amount: string, contractAddress: string): Promise<{ canParticipate: boolean; reason?: string }> => {
    if (!address || !publicClient) {
      return { canParticipate: false, reason: 'Wallet not connected' }
    }

    try {
      // This would call the contract's canParticipate function if it exists
      // For now, return basic validation
      const numAmount = parseFloat(amount)
      if (numAmount <= 0) {
        return { canParticipate: false, reason: 'Amount must be greater than 0' }
      }

      return { canParticipate: true }
    } catch (err) {
      return { canParticipate: false, reason: 'Validation failed' }
    }
  }, [address, publicClient])

  // Get contribution limits from contract
  const getContributionLimits = useCallback(async (contractAddress: string, projectType: string): Promise<{ min: string; max: string }> => {
    if (!publicClient) {
      return { min: '0.1', max: '10' } // Default limits
    }

    try {
      const abi = getContractABI(projectType)

      if (projectType === 'presale') {
        // For presale contracts, use presaleInfo() function which returns a struct
        // Index 4 = raiseMin (minContribution), Index 5 = raiseMax (maxContribution)
        const presaleInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'presaleInfo',
          args: []
        }) as any[]

        const minContribution = presaleInfo[4] as bigint // raiseMin
        const maxContribution = presaleInfo[5] as bigint // raiseMax

        return {
          min: formatEther(minContribution),
          max: formatEther(maxContribution)
        }
      } else {
        // For fairlaunch contracts, use fairlaunchInfo() function
        const fairlaunchInfo = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi,
          functionName: 'fairlaunchInfo',
          args: []
        }) as any[]

        // Fairlaunch might not have explicit min/max limits, use reasonable defaults
        return { min: '0.1', max: '1000' }
      }
    } catch (err) {
      launchpadLogger.error('Failed to get contribution limits:', err)
      return { min: '0.1', max: '10' } // Fallback limits
    }
  }, [publicClient])

  return {
    isLoading,
    error,
    transactionHash,
    userContribution,
    participate,
    claimTokens,
    claimRefund,
    fetchUserContribution,
    canParticipate,
    getContributionLimits
  }
}
