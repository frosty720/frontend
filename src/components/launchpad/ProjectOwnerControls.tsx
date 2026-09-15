'use client'

import React, { useCallback, useState } from 'react'
import { AlertTriangle, CheckCircle, DollarSign, Loader2, Lock, Shield, XCircle } from 'lucide-react'
import { Panel } from '@/components/primitives/Panel'
import { Pill } from '@/components/primitives/Pill'
import { Button } from '@/components/ui/button'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useWallet } from '@/hooks/useWallet'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { PRESALE_ABI, FAIRLAUNCH_ABI, PRESALE_V3_ABI, FAIRLAUNCH_V3_ABI } from '@/config/abis'
import { useDict } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'
import { describeError } from '@/i18n/errorText'
import { UserError } from '@/lib/userError'
import { launchpadLogger } from '@/lib/logger'
import { kalyFeeOverrides } from '@/config/gas';
import { assertTxSucceeded } from '@/utils/transactions';

interface ProjectOwnerControlsProps {
	projectData: ProjectData
	onRefresh: () => void
}

export default function ProjectOwnerControls({
	projectData,
	onRefresh
}: ProjectOwnerControlsProps) {
	const dict = useDict()
	const o = dict.launchpadProject.owner
	const [isLoading, setIsLoading] = useState(false)
	const [loadingAction, setLoadingAction] = useState<string | null>(null)
	const { isConnected, address } = useWallet()
	const { address: wagmiAddress } = useAccount()
	const { data: walletClient } = useWalletClient()
	const publicClient = usePublicClient()

	// Get appropriate ABI based on project type and dex version
	const getABI = () => {
		if (true) {
			return projectData.type === 'presale' ? PRESALE_V3_ABI : FAIRLAUNCH_V3_ABI
		}
		return projectData.type === 'presale' ? PRESALE_ABI : FAIRLAUNCH_ABI
	}

	// Check if connected wallet is the project owner
	const isOwner = isConnected && address && projectData.owner &&
		address.toLowerCase() === projectData.owner.toLowerCase()

	// Don't render if user is not the owner
	if (!isOwner) {
		return null
	}

	// Execute contract call via standard Wagmi writeContract
	const executeContractCall = useCallback(async (
		contractAddress: string,
		abi: any,
		functionName: string,
		args: any[] = []
	): Promise<string> => {
		if (!isConnected || !wagmiAddress) {
			throw new UserError('walletNotConnected')
		}

		if (!walletClient) {
			throw new UserError('walletUnavailable')
		}

		const hash = await walletClient.writeContract({
			// Was a hardcoded 3 gwei tip — below KalyChain's 21 gwei inclusion floor, which
			// is the difference between landing in seconds and sitting for tens of minutes.
			...kalyFeeOverrides(walletClient.chain?.id),
			address: contractAddress as `0x${string}`,
			abi,
			functionName,
			args,
			gas: BigInt(5000000), // 5M gas limit like the working test script
		})

		return hash
	}, [isConnected, wagmiAddress, walletClient])

	const handleFinalize = async () => {
		setIsLoading(true)
		setLoadingAction('finalize')
		try {
			if (!projectData.contractAddress) {
				throw new Error('Contract address not available')
			}

			const abi = getABI()

			const hash = await executeContractCall(
				projectData.contractAddress,
				abi,
				'finalize',
				[]
			)

			launchpadLogger.debug('Finalize transaction hash:', hash)

			// Was a blind 3-second timer, which reported success for a reverted finalize.
			if (!publicClient) throw new UserError('rpcUnavailable')
			await assertTxSucceeded(publicClient, hash, 'finalize')
			onRefresh()

		} catch (error) {
			launchpadLogger.error('Finalize failed:', error)
			alert(interpolate(o.finalizeFailedAlert, { error: describeError(error, dict) }))
		} finally {
			setIsLoading(false)
			setLoadingAction(null)
		}
	}

	const handleCancel = async () => {
		setIsLoading(true)
		setLoadingAction('cancel')
		try {
			if (!projectData.contractAddress) {
				throw new Error('Contract address not available')
			}
			if (!publicClient) {
				throw new UserError('rpcUnavailable')
			}

			// This used to be a 2-second setTimeout followed by onRefresh(): the owner saw a
			// spinner and a refresh, and believed the sale was cancelled while nothing had
			// been sent on-chain. Presale and fairlaunch name the call differently.
			// `type` is optional on ProjectData; defaulting to fairlaunch here would call the
			// wrong function on a presale.
			const functionName = (projectData.type ?? 'presale') === 'presale'
				? 'cancelPresale'
				: 'cancelFairlaunch'

			const hash = await executeContractCall(
				projectData.contractAddress,
				getABI(),
				functionName,
				[]
			)

			await assertTxSucceeded(publicClient, hash, 'cancel')
			launchpadLogger.debug('Cancel transaction hash:', hash)
			onRefresh()
		} catch (error) {
			launchpadLogger.error('Cancel failed:', error)
			alert(interpolate(o.cancelFailedAlert, { error: describeError(error, dict) }))
		} finally {
			setIsLoading(false)
			setLoadingAction(null)
		}
	}

	const handleWithdrawFunds = async () => {
		setIsLoading(true)
		setLoadingAction('withdraw')
		try {
			if (!projectData.contractAddress) {
				throw new Error('Contract address not available')
			}

			const abi = getABI()

			const functionName = projectData.type === 'presale' ? 'withdrawRemainingFunds' : 'withdrawRemainingTokens'

			const hash = await executeContractCall(
				projectData.contractAddress,
				abi,
				functionName,
				[]
			)

			launchpadLogger.debug('Withdraw funds transaction hash:', hash)

			// Wait a moment for transaction to be mined, then refresh
			setTimeout(() => {
				onRefresh()
			}, 3000)

		} catch (error) {
			launchpadLogger.error('Withdraw failed:', error)
			alert(interpolate(o.withdrawFailedAlert, { error: describeError(error, dict) }))
		} finally {
			setIsLoading(false)
			setLoadingAction(null)
		}
	}

	const handleWithdrawLP = async () => {
		setIsLoading(true)
		setLoadingAction('withdrawLP')
		try {
			if (!projectData.contractAddress) {
				throw new Error('Contract address not available')
			}

			const abi = getABI()

			const hash = await executeContractCall(
				projectData.contractAddress,
				abi,
				'withdrawLPTokens',
				[]
			)

			launchpadLogger.debug('Withdraw LP tokens transaction hash:', hash)

			// Wait a moment for transaction to be mined, then refresh
			setTimeout(() => {
				onRefresh()
			}, 3000)

		} catch (error) {
			launchpadLogger.error('Withdraw LP failed:', error)
			alert(interpolate(o.withdrawLpFailedAlert, { error: describeError(error, dict) }))
		} finally {
			setIsLoading(false)
			setLoadingAction(null)
		}
	}

	// Determine available actions based on project status
	const canFinalize = projectData.status === 'Successful' && !projectData.finalized
	const canCancel = (projectData.status === 'Active' || projectData.status === 'Pending') && !projectData.cancelled
	const canWithdrawFunds = projectData.finalized && projectData.status === 'Successful'
	const canWithdrawLP = projectData.type === 'presale' && projectData.finalized && !projectData.lpTokensWithdrawn

	return (
		<Panel
			title={
				<span className="flex items-center gap-2">
					<Shield className="size-5" />
					{o.title}
				</span>
			}
			action={<Pill tone="danger">{o.badge}</Pill>}
		>
			<div className="space-y-4">

				{/* Project Status Info */}
				<div className="rounded-xl bg-surface-alt p-4">
					<h4 className="mb-3 font-medium text-cream">{o.statusTitle}</h4>
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">{o.status}:</span>
							<Pill tone={
								projectData.status === 'Active' ? 'success' :
								projectData.status === 'Successful' ? 'info' :
								projectData.status === 'Failed' ? 'danger' :
								'gold'
							}>
								{projectData.status}
							</Pill>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">{o.finalized}:</span>
							<span className={projectData.finalized ? 'text-success' : 'text-danger'}>
								{projectData.finalized ? o.yes : o.no}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">{o.cancelled}:</span>
							<span className={projectData.cancelled ? 'text-danger' : 'text-success'}>
								{projectData.cancelled ? o.yes : o.no}
							</span>
						</div>
						{projectData.type === 'presale' && (
							<div className="flex justify-between">
								<span className="text-muted-foreground">{o.lpWithdrawn}:</span>
								<span className={projectData.lpTokensWithdrawn ? 'text-success' : 'text-danger'}>
									{projectData.lpTokensWithdrawn ? o.yes : o.no}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Action Buttons */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

					{canFinalize && (
						<Button onClick={handleFinalize} disabled={isLoading}>
							{loadingAction === 'finalize' ? (
								<>
									<Loader2 className="animate-spin" />
									{o.finalizing}
								</>
							) : (
								<>
									<CheckCircle />
									{o.finalize}
								</>
							)}
						</Button>
					)}

					{canCancel && (
						<Button onClick={handleCancel} disabled={isLoading} variant="destructive">
							{loadingAction === 'cancel' ? (
								<>
									<Loader2 className="animate-spin" />
									{o.cancelling}
								</>
							) : (
								<>
									<XCircle />
									{o.cancel}
								</>
							)}
						</Button>
					)}

					{canWithdrawFunds && (
						<Button onClick={handleWithdrawFunds} disabled={isLoading} variant="secondary">
							{loadingAction === 'withdraw' ? (
								<>
									<Loader2 className="animate-spin" />
									{o.withdrawing}
								</>
							) : (
								<>
									<DollarSign />
									{o.withdrawFunds}
								</>
							)}
						</Button>
					)}

					{canWithdrawLP && (
						<Button onClick={handleWithdrawLP} disabled={isLoading} variant="secondary">
							{loadingAction === 'withdrawLP' ? (
								<>
									<Loader2 className="animate-spin" />
									{o.withdrawingLp}
								</>
							) : (
								<>
									<Lock />
									{o.withdrawLp}
								</>
							)}
						</Button>
					)}
				</div>

				{/* Warning Messages */}
				{!canFinalize && !canCancel && !canWithdrawFunds && !canWithdrawLP && (
					<div className="rounded-xl border border-gold/25 bg-gold-soft p-4">
						<div className="flex items-center text-gold-light">
							<AlertTriangle className="mr-2 size-4" />
							<span className="text-sm">{o.noActions}</span>
						</div>
					</div>
				)}
			</div>
		</Panel>
	)
}
