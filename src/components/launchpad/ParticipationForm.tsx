'use client'

import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  DollarSign,
  Wallet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Info
} from 'lucide-react'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useParticipation } from '@/hooks/launchpad/useParticipation'
import { useWallet } from '@/hooks/useWallet'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { launchpadLogger } from '@/lib/logger'
import { parseEther, formatEther, formatUnits } from 'viem'
import { isNativeToken } from '@/config/contracts'
import { KALYCHAIN_EXPLORER_URL } from '@/config/chains'

interface ParticipationFormProps {
  projectData: ProjectData
  onSuccess?: () => void
  onError?: (error: string) => void
}

// Form validation schema
const participationSchema = z.object({
  amount: z.string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, 'Must be a valid positive number')
})

type ParticipationFormValues = z.infer<typeof participationSchema>

// Utility function to format numbers with proper decimals
function formatNumber(value: string | number, decimals: number = 6): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  })
}

export default function ParticipationForm({
  projectData,
  onSuccess,
  onError
}: ParticipationFormProps) {
  const [userBalance, setUserBalance] = useState<string>('0')
  const [gasEstimate, setGasEstimate] = useState<string>('0')
  const [contributionLimits, setContributionLimits] = useState({ min: '0.1', max: '10' })

  const { isConnected } = useWallet()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Use participation hook
  const {
    isLoading: isSubmitting,
    error: participationError,
    transactionHash,
    userContribution,
    participate,
    fetchUserContribution,
    getContributionLimits
  } = useParticipation()

  // Form setup
  const form = useForm<ParticipationFormValues>({
    resolver: zodResolver(participationSchema),
    defaultValues: {
      amount: ''
    },
    mode: 'onChange'
  })

  const watchedAmount = form.watch('amount')

  // Check if project uses native token (KLC) or ERC20
  const isNativeContribution = isNativeToken(projectData.baseToken)
  const baseTokenSymbol = isNativeContribution ? 'KLC' : 'USDT' // Default to USDT for ERC20

  // Fetch user balance, contribution, and limits
  useEffect(() => {
    if (!address || !publicClient || !projectData.type) return

    const fetchUserData = async () => {
      try {
        // Fetch user balance
        if (isNativeContribution) {
          const balance = await publicClient.getBalance({ address })
          setUserBalance(formatEther(balance))
        } else {
          // TODO: Fetch ERC20 balance using contract read
          setUserBalance('0')
        }

        // Fetch user's existing contribution
        await fetchUserContribution(projectData.contractAddress, projectData.type || 'presale')

        // Fetch contribution limits
        const limits = await getContributionLimits(projectData.contractAddress, projectData.type || 'presale')
        setContributionLimits(limits)
      } catch (error) {
        launchpadLogger.error('Error fetching user data:', error)
      }
    }

    fetchUserData()
  }, [address, publicClient, isNativeContribution, projectData.contractAddress, projectData.type, fetchUserContribution, getContributionLimits])

  // Gas estimation
  useEffect(() => {
    if (!watchedAmount || !address || !publicClient) return

    const estimateGas = async () => {
      try {
        const amount = parseEther(watchedAmount)
        
        // TODO: Estimate gas for participate function
        // This is a placeholder - actual implementation will call contract
        setGasEstimate('0.001')
      } catch (error) {
        launchpadLogger.error('Gas estimation failed:', error)
        setGasEstimate('0.002') // Fallback estimate
      }
    }

    const timeoutId = setTimeout(estimateGas, 500) // Debounce
    return () => clearTimeout(timeoutId)
  }, [watchedAmount, address, publicClient])

  // Validation helpers
  const getMinContribution = () => {
    return contributionLimits.min
  }

  const getMaxContribution = () => {
    return contributionLimits.max
  }

  const validateAmount = (amount: string) => {
    const numAmount = parseFloat(amount)
    const balance = parseFloat(userBalance)
    const minContrib = parseFloat(getMinContribution())
    const maxContrib = parseFloat(getMaxContribution())

    if (numAmount < minContrib) {
      return `Minimum contribution is ${minContrib} ${baseTokenSymbol}`
    }
    if (numAmount > maxContrib) {
      return `Maximum contribution is ${maxContrib} ${baseTokenSymbol}`
    }
    if (numAmount > balance) {
      return `Insufficient balance. You have ${formatNumber(balance)} ${baseTokenSymbol}`
    }
    return null
  }

  // Form submission
  const onSubmit = async (data: ParticipationFormValues) => {
    if (!isConnected || !address) {
      onError?.('Please connect your wallet')
      return
    }

    const validationError = validateAmount(data.amount)
    if (validationError) {
      onError?.(validationError)
      return
    }

    try {
      await participate({
        contractAddress: projectData.contractAddress,
        projectType: projectData.type || 'presale',
        amount: data.amount,
        baseToken: projectData.baseToken
      })

      form.reset()
      onSuccess?.()

    } catch (error) {
      launchpadLogger.error('Participation failed:', error)
      onError?.(error instanceof Error ? error.message : 'Transaction failed')
    }
  }

  // Handle participation errors
  useEffect(() => {
    if (participationError) {
      onError?.(participationError)
    }
  }, [participationError, onError])

  // Calculate expected tokens
  const calculateExpectedTokens = (amount: string) => {
    if (!amount || !projectData.tokenRate) return '0'
    const contribution = parseFloat(amount)
    const rate = parseFloat(projectData.tokenRate)
    return formatNumber(contribution * rate)
  }

  if (!projectData.canParticipate) {
    return (
      <Card className="bg-stone-900/50 border-amber-500/30">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            Participation Not Available
          </h3>
          <p className="text-gray-400">
            This project is not currently accepting contributions.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-stone-900/50 border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <DollarSign className="h-5 w-5 text-amber-400" />
          Participate in {projectData.type === 'presale' ? 'Presale' : 'Fairlaunch'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Your Balance</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatNumber(userBalance)} {baseTokenSymbol}
            </p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Your Contribution</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatNumber(userContribution?.amount || '0')} {baseTokenSymbol}
            </p>
          </div>
        </div>

        {/* Participation Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">
                    Contribution Amount ({baseTokenSymbol})
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type="number"
                        step="0.000001"
                        placeholder={`Enter amount (min: ${getMinContribution()}, max: ${getMaxContribution()})`}
                        className="bg-gray-800/50 border-gray-600 text-white pr-20"
                        disabled={isSubmitting}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Badge variant="outline" className="text-xs">
                          {baseTokenSymbol}
                        </Badge>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                  {watchedAmount && (
                    <div className="text-sm text-gray-400">
                      You will receive approximately{' '}
                      <span className="text-amber-400 font-medium">
                        {calculateExpectedTokens(watchedAmount)}
                      </span>{' '}
                      tokens
                    </div>
                  )}
                </FormItem>
              )}
            />

            {/* Transaction Info */}
            {watchedAmount && (
              <div className="bg-gray-800/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 text-blue-400" />
                  <span className="text-gray-400">Transaction Details</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Estimated Gas:</span>
                    <span className="text-white ml-2">{gasEstimate} KLC</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Token Rate:</span>
                    <span className="text-white ml-2">1 {baseTokenSymbol} = {projectData.tokenRate} tokens</span>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!isConnected || isSubmitting || !watchedAmount}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : !isConnected ? (
                'Connect Wallet'
              ) : (
                `Contribute ${watchedAmount || '0'} ${baseTokenSymbol}`
              )}
            </Button>
          </form>
        </Form>

        {/* Success Message */}
        {transactionHash && (
          <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <span className="text-green-400 font-medium">Transaction Successful!</span>
            </div>
            <p className="text-sm text-gray-300">
              Transaction Hash:{' '}
              <a
                href={`${KALYCHAIN_EXPLORER_URL}/tx/${transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline break-all"
              >
                {transactionHash}
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
