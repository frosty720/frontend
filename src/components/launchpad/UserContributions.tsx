'use client'

import React, { useEffect } from 'react'
import { Clock, DollarSign, ExternalLink, Gift, RefreshCw } from 'lucide-react'
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt'
import { Panel } from '@/components/primitives/Panel'
import { Pill } from '@/components/primitives/Pill'
import { Button } from '@/components/ui/button'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useParticipation } from '@/hooks/launchpad/useParticipation'
import { useWallet } from '@/hooks/useWallet'
import { useDict, useFormat } from '@/i18n/hooks'
import { launchpadLogger } from '@/lib/logger'
import { CHAIN_IDS, getExplorerTxUrl } from '@/config/chains'

interface UserContributionsProps {
	projectData: ProjectData
	onRefresh?: () => void
}

export default function UserContributions({
	projectData,
	onRefresh
}: UserContributionsProps) {
	const dict = useDict()
	const fmt = useFormat()
	const c = dict.launchpadProject.contributions
	const { isConnected } = useWallet()

	const {
		userContribution,
		isLoading,
		error,
		transactionHash,
		claimTokens,
		claimRefund,
		fetchUserContribution
	} = useParticipation()

	const formatNumber = (value: string | number, decimals: number = 6) =>
		fmt.number(typeof value === 'string' ? parseFloat(value) || 0 : value, { maximumFractionDigits: decimals })

	// Fetch user contribution data on mount
	useEffect(() => {
		if (isConnected && projectData.contractAddress && projectData.type) {
			fetchUserContribution(projectData.contractAddress, projectData.type, projectData.isFinalized)
		}
	}, [isConnected, projectData.contractAddress, projectData.type, projectData.isFinalized, fetchUserContribution])

	// Handle claim tokens
	const handleClaimTokens = async () => {
		try {
			await claimTokens(projectData.contractAddress, projectData.type || 'presale')
			onRefresh?.()
		} catch (error) {
			launchpadLogger.error('Claim failed:', error)
		}
	}

	// Handle claim refund
	const handleClaimRefund = async () => {
		try {
			await claimRefund(projectData.contractAddress, projectData.type || 'presale')
			onRefresh?.()
		} catch (error) {
			launchpadLogger.error('Refund failed:', error)
		}
	}

	if (!isConnected) {
		return <ConnectPrompt body={c.connectBody} />
	}

	if (!userContribution?.hasContributed) {
		return (
			<Panel>
				<div className="p-2 text-center">
					<DollarSign className="mx-auto mb-4 size-12 text-muted-foreground" />
					<h3 className="mb-2 text-lg font-medium text-cream">{c.emptyTitle}</h3>
					<p className="text-muted-foreground">{c.emptyBody}</p>
				</div>
			</Panel>
		)
	}

	const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'USDT'

	return (
		<div className="space-y-5">
			{/* Contribution Summary */}
			<Panel
				title={c.title}
				action={
					<Button
						variant="outline"
						size="sm"
						onClick={() => fetchUserContribution(projectData.contractAddress, projectData.type || 'presale', projectData.isFinalized)}
						disabled={isLoading}
					>
						<RefreshCw className={isLoading ? 'animate-spin' : ''} />
						{c.refresh}
					</Button>
				}
			>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					{/* Total Contributed */}
					<div className="rounded-xl bg-surface-alt p-4">
						<div className="mb-2 flex items-center gap-2">
							<DollarSign className="size-4 text-success" />
							<span className="text-sm text-muted-foreground">{c.totalContributed}</span>
						</div>
						<p className="text-xl font-bold text-cream">
							{formatNumber(userContribution.amount)} {baseTokenSymbol}
						</p>
					</div>

					{/* Claimable Tokens */}
					<div className="rounded-xl bg-surface-alt p-4">
						<div className="mb-2 flex items-center gap-2">
							<Gift className="size-4 text-gold-light" />
							<span className="text-sm text-muted-foreground">{c.claimableTokens}</span>
						</div>
						<p className="text-xl font-bold text-cream">
							{formatNumber(userContribution.claimableTokens)}
						</p>
						<p className="mt-1 text-xs text-muted-deep">
							{projectData.name}
						</p>
					</div>

					{/* Status */}
					<div className="rounded-xl bg-surface-alt p-4">
						<div className="mb-2 flex items-center gap-2">
							<Clock className="size-4 text-info" />
							<span className="text-sm text-muted-foreground">{c.status}</span>
						</div>
						<div className="space-y-2">
							{userContribution.canClaim && <Pill tone="success">{c.readyToClaim}</Pill>}
							{userContribution.canRefund && <Pill tone="danger">{c.refundAvailable}</Pill>}
							{userContribution.hasClaimed && <Pill tone="info">{c.claimed}</Pill>}
							{!userContribution.canClaim && !userContribution.canRefund && !userContribution.hasClaimed && (
								<Pill tone="muted">{c.waiting}</Pill>
							)}
						</div>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="mt-6 flex gap-4">
					{userContribution.canClaim && (
						<Button onClick={handleClaimTokens} disabled={isLoading} className="flex-1">
							{isLoading ? <RefreshCw className="animate-spin" /> : <Gift />}
							{c.claimTokens}
						</Button>
					)}

					{userContribution.canRefund && (
						<Button onClick={handleClaimRefund} disabled={isLoading} variant="destructive" className="flex-1">
							{isLoading ? <RefreshCw className="animate-spin" /> : null}
							{c.claimRefund}
						</Button>
					)}
				</div>

				{/* Error Display */}
				{error && (
					<div className="mt-4 rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
						{error}
					</div>
				)}

				{/* Success Message */}
				{transactionHash && (
					<div className="mt-4 rounded-xl border border-success/25 bg-success/10 p-4">
						<p className="text-sm text-muted-foreground">
							{c.success} — {c.txHash}:{' '}
							<a
								href={getExplorerTxUrl(CHAIN_IDS.KALYCHAIN, transactionHash)}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 break-all text-info hover:underline"
							>
								{transactionHash.slice(0, 10)}...{transactionHash.slice(-8)}
								<ExternalLink className="size-3" />
							</a>
						</p>
					</div>
				)}
			</Panel>

			{/* Transaction History */}
			<Panel title={c.historyTitle}>
				<div className="py-6 text-center">
					<Clock className="mx-auto mb-4 size-10 text-muted-foreground" />
					<h3 className="mb-2 text-base font-medium text-cream">{c.historyComingSoonTitle}</h3>
					<p className="text-muted-foreground">{c.historyComingSoonBody}</p>
				</div>
			</Panel>
		</div>
	)
}
