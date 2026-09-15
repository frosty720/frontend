'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { AlertCircle, CheckCircle, DollarSign, Info, Loader2, Wallet } from 'lucide-react'
import { Panel } from '@/components/primitives/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useParticipation } from '@/hooks/launchpad/useParticipation'
import { useWallet } from '@/hooks/useWallet'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'
import { describeError } from '@/i18n/errorText'
import { launchpadLogger } from '@/lib/logger'
import { parseEther, formatEther } from 'viem'
import { isNativeToken } from '@/config/contracts'
import { CHAIN_IDS, getExplorerTxUrl } from '@/config/chains'

interface ParticipationFormProps {
	projectData: ProjectData
	onSuccess?: () => void
	onError?: (error: string) => void
}

export default function ParticipationForm({
	projectData,
	onSuccess,
	onError
}: ParticipationFormProps) {
	const dict = useDict()
	const fmt = useFormat()
	const p = dict.launchpadProject.participation
	const l = dict.launchpad

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

	// Form validation schema — built from the dictionary so the messages translate.
	const participationSchema = useMemo(() => z.object({
		amount: z.string()
			.min(1, p.errorAmountRequired)
			.refine((val) => !isNaN(Number(val)) && Number(val) > 0, p.errorAmountInvalid)
	}), [p.errorAmountRequired, p.errorAmountInvalid])

	type ParticipationFormValues = z.infer<typeof participationSchema>

	const formatNumber = (value: string | number, decimals: number = 6) =>
		fmt.number(typeof value === 'string' ? parseFloat(value) || 0 : value, { maximumFractionDigits: decimals })

	// Form setup
	const form = useForm<ParticipationFormValues>({
		resolver: zodResolver(participationSchema),
		defaultValues: {
			amount: ''
		},
		mode: 'onChange'
	})

	const watchedAmount = form.watch('amount')

	// Check if project uses native token (KMT) or ERC20
	const isNativeContribution = isNativeToken(projectData.baseToken)
	const baseTokenSymbol = isNativeContribution ? 'KMT' : 'USDT' // Default to USDT for ERC20

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
				parseEther(watchedAmount)
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
	const getMinContribution = () => contributionLimits.min
	const getMaxContribution = () => contributionLimits.max

	const validateAmount = (amount: string) => {
		const numAmount = parseFloat(amount)
		const balance = parseFloat(userBalance)
		const minContrib = parseFloat(getMinContribution())
		const maxContrib = parseFloat(getMaxContribution())

		if (numAmount < minContrib) {
			return interpolate(p.errorMin, { amount: minContrib, symbol: baseTokenSymbol })
		}
		if (numAmount > maxContrib) {
			return interpolate(p.errorMax, { amount: maxContrib, symbol: baseTokenSymbol })
		}
		if (numAmount > balance) {
			return interpolate(p.errorBalance, { amount: formatNumber(balance), symbol: baseTokenSymbol })
		}
		return null
	}

	// Form submission
	const onSubmit = async (data: ParticipationFormValues) => {
		if (!isConnected || !address) {
			onError?.(p.errorConnectWallet)
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
			onError?.(describeError(error, dict))
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
			<Panel>
				<div className="p-2 text-center">
					<AlertCircle className="mx-auto mb-4 size-12 text-gold-light" />
					<h3 className="mb-2 text-lg font-medium text-cream">{p.unavailableTitle}</h3>
					<p className="text-muted-foreground">{p.unavailableBody}</p>
				</div>
			</Panel>
		)
	}

	return (
		<Panel title={interpolate(p.title, { type: projectData.type === 'fairlaunch' ? l.typeFairlaunch : l.typePresale })}>
			<div className="space-y-5">
				{/* User Info */}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="rounded-xl bg-surface-alt p-4">
						<div className="mb-2 flex items-center gap-2">
							<Wallet className="size-4 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">{p.yourBalance}</span>
						</div>
						<p className="text-lg font-semibold text-cream">
							{formatNumber(userBalance)} {baseTokenSymbol}
						</p>
					</div>
					<div className="rounded-xl bg-surface-alt p-4">
						<div className="mb-2 flex items-center gap-2">
							<DollarSign className="size-4 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">{p.yourContribution}</span>
						</div>
						<p className="text-lg font-semibold text-cream">
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
									<FormLabel>{interpolate(p.amountLabel, { symbol: baseTokenSymbol })}</FormLabel>
									<FormControl>
										<div className="relative">
											<Input
												{...field}
												type="number"
												step="0.000001"
												placeholder={interpolate(p.amountPlaceholder, { min: getMinContribution(), max: getMaxContribution() })}
												className="rounded-xl border-line bg-surface-alt pr-16 text-cream placeholder:text-muted-deep"
												disabled={isSubmitting}
											/>
											<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-deep">
												{baseTokenSymbol}
											</span>
										</div>
									</FormControl>
									<FormMessage />
									{watchedAmount && (
										<div className="text-sm text-muted-foreground">
											{interpolate(p.willReceive, { amount: calculateExpectedTokens(watchedAmount) })}
										</div>
									)}
								</FormItem>
							)}
						/>

						{/* Transaction Info */}
						{watchedAmount && (
							<div className="space-y-2 rounded-xl bg-surface-alt p-4">
								<div className="flex items-center gap-2 text-sm">
									<Info className="size-4 text-info" />
									<span className="text-muted-foreground">{p.txDetails}</span>
								</div>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">{p.estGas}:</span>
										<span className="ml-2 text-cream">{gasEstimate} KMT</span>
									</div>
									<div>
										<span className="text-muted-foreground">{p.rateLabel}:</span>
										<span className="ml-2 text-cream">{interpolate(p.rate, { symbol: baseTokenSymbol, rate: projectData.tokenRate })}</span>
									</div>
								</div>
							</div>
						)}

						{/* Submit Button */}
						<Button type="submit" disabled={!isConnected || isSubmitting || !watchedAmount} className="w-full">
							{isSubmitting ? (
								<>
									<Loader2 className="animate-spin" />
									{p.submitting}
								</>
							) : !isConnected ? (
								p.connectWallet
							) : (
								interpolate(p.submit, { amount: watchedAmount || '0', symbol: baseTokenSymbol })
							)}
						</Button>
					</form>
				</Form>

				{/* Success Message */}
				{transactionHash && (
					<div className="rounded-xl border border-success/25 bg-success/10 p-4">
						<div className="mb-2 flex items-center gap-2">
							<CheckCircle className="size-5 text-success" />
							<span className="font-medium text-success">{p.success}</span>
						</div>
						<p className="text-sm text-muted-foreground">
							{p.txHash}:{' '}
							<a
								href={getExplorerTxUrl(CHAIN_IDS.KALYCHAIN, transactionHash)}
								target="_blank"
								rel="noopener noreferrer"
								className="break-all text-info hover:underline"
							>
								{transactionHash}
							</a>
						</p>
					</div>
				)}
			</div>
		</Panel>
	)
}
