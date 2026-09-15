'use client'

import React from 'react'
import { AlertCircle, CheckCircle, Clock, Target, TrendingUp, type LucideIcon } from 'lucide-react'
import { Panel } from '@/components/primitives/Panel'
import { Button } from '@/components/ui/button'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useParticipation } from '@/hooks/launchpad/useParticipation'
import { useWallet } from '@/hooks/useWallet'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'

interface ProjectProgressProps {
	projectData: ProjectData
	onRefresh: () => void
	isRefreshing?: boolean
}

function scaleTokenAmount(value: string | number | undefined): number {
	if (value === undefined || value === null || value === '') return 0
	const num = typeof value === 'string' ? parseFloat(value) : value
	if (!Number.isFinite(num)) return 0
	return num > 1_000_000_000_000_000 ? num / 1_000_000_000_000_000_000 : num
}

export default function ProjectProgress({
	projectData,
	onRefresh,
	isRefreshing = false
}: ProjectProgressProps) {
	const dict = useDict()
	const fmt = useFormat()
	const p = dict.launchpadProject.progress
	const l = dict.launchpad
	// The status button used to have an empty onClick behind a TODO, so 'Claim Tokens'
	// and 'Claim Refund' looked live and did nothing at all.
	const { claimTokens, claimRefund, isLoading: isClaiming, error: claimError } = useParticipation()

	const handleStatusAction = async () => {
		if (!projectData.contractAddress) return
		// `type` is optional on ProjectData; presale is the default the launchpad creates.
		const projectType = projectData.type ?? 'presale'

		switch (projectData.status) {
			case 'Successful':
				await claimTokens(projectData.contractAddress, projectType)
				onRefresh()
				break
			case 'Failed':
				await claimRefund(projectData.contractAddress, projectType)
				onRefresh()
				break
			default:
				// 'Pending' (Notify Me) has no contract action; the rest just re-read chain state.
				onRefresh()
		}
	}
	const { isConnected } = useWallet()

	const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'Token'
	const amount = (value: string | number | undefined) => `${fmt.number(scaleTokenAmount(value), { maximumFractionDigits: 2 })} ${baseTokenSymbol}`

	const typeLabel = projectData.type === 'fairlaunch' ? l.typeFairlaunch : l.typePresale

	interface StatusInfo { title: string; body: string; icon: LucideIcon; tone: string; buttonText: string | null }
	const STATUS_INFO: Record<string, StatusInfo> = {
		Active: { title: p.liveTitle, body: interpolate(p.liveBody, { type: typeLabel }), icon: TrendingUp, tone: 'text-success', buttonText: null },
		Successful: { title: p.successfulTitle, body: p.successfulBody, icon: CheckCircle, tone: 'text-info', buttonText: p.claimTokens },
		Failed: { title: p.failedTitle, body: p.failedBody, icon: AlertCircle, tone: 'text-danger', buttonText: p.claimRefund },
		Pending: { title: p.pendingTitle, body: p.pendingBody, icon: Clock, tone: 'text-gold-light', buttonText: p.notifyMe },
	}
	const statusInfo = STATUS_INFO[projectData.status ?? ''] ?? { title: p.unknownTitle, body: p.unknownBody, icon: Target, tone: 'text-muted-foreground', buttonText: null }

	const StatusIcon = statusInfo.icon

	return (
		<Panel
			title={p.title}
			action={
				<Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
					{dict.launchpadProject.refresh}
				</Button>
			}
		>
			{projectData.progress !== undefined && projectData.isActive && (
				<div className="mb-6">
					<div className="mb-2 flex justify-between text-sm text-muted-foreground">
						<span>{p.fundingProgress}</span>
						<span>{(() => {
							const progress = projectData.progress || 0
							if (progress < 0.1 && progress > 0) return fmt.pct(progress, 3)
							return fmt.pct(progress, 1)
						})()}</span>
					</div>
					<div className="h-3 overflow-hidden rounded-full bg-surface-hi">
						<div
							className="h-full rounded-full bg-gold transition-all duration-500 ease-out"
							style={{ width: `${Math.min(projectData.progress, 100)}%` }}
						/>
					</div>
					<div className="mt-2 flex justify-between text-xs text-muted-deep">
						<span>{interpolate(p.raised, { amount: amount(projectData.totalRaised || '0') })}</span>
						<span>{interpolate(p.goal, { amount: `${projectData.hardCap} ${baseTokenSymbol}` })}</span>
					</div>
				</div>
			)}

			<div className="py-6 text-center">
				<StatusIcon className={`mx-auto mb-4 size-12 ${statusInfo.tone}`} />
				<h3 className="mb-2 text-lg font-medium text-cream">{statusInfo.title}</h3>
				<p className="mx-auto mb-6 max-w-md text-muted-foreground">{statusInfo.body}</p>

				{!projectData.canParticipate && projectData.status !== 'Pending' && statusInfo.buttonText && (
					<div className="flex flex-col items-center gap-2">
						<Button className="min-w-[160px]" disabled={!isConnected || isClaiming} onClick={handleStatusAction}>
							{!isConnected ? p.connectWallet : isClaiming ? p.confirming : statusInfo.buttonText}
						</Button>
						{claimError && <span className="max-w-xs text-center text-sm text-danger">{claimError}</span>}
					</div>
				)}

				{projectData.isActive && (
					<div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
						<div className="rounded-xl bg-surface-alt p-3">
							<div className="mb-1 text-muted-foreground">{dict.launchpadProject.config.softCap}</div>
							<div className="font-medium text-cream">{projectData.softCap} {baseTokenSymbol}</div>
						</div>
						<div className="rounded-xl bg-surface-alt p-3">
							<div className="mb-1 text-muted-foreground">{dict.launchpadProject.config.hardCap}</div>
							<div className="font-medium text-cream">{projectData.hardCap} {baseTokenSymbol}</div>
						</div>
						<div className="rounded-xl bg-surface-alt p-3">
							<div className="mb-1 text-muted-foreground">{dict.launchpadProject.stats.tokenRate}</div>
							<div className="font-medium text-cream">{projectData.tokenRate} / {baseTokenSymbol}</div>
						</div>
					</div>
				)}

				{(projectData.status === 'Successful' || projectData.status === 'Failed') && (
					<div className="mt-6 rounded-xl bg-surface-alt p-4">
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<div className="mb-1 text-muted-foreground">{p.finalAmount}</div>
								<div className="font-medium text-cream">{amount(projectData.totalRaised || '0')}</div>
							</div>
							<div>
								<div className="mb-1 text-muted-foreground">{p.totalParticipants}</div>
								<div className="font-medium text-cream">{fmt.number(projectData.totalParticipants || 0)}</div>
							</div>
						</div>
						{projectData.status === 'Successful' && (
							<div className="mt-3 text-xs text-success">
								{interpolate(p.softCapMet, { amount: `${projectData.softCap} ${baseTokenSymbol}` })}
							</div>
						)}
						{projectData.status === 'Failed' && (
							<div className="mt-3 text-xs text-danger">
								{interpolate(p.softCapMissed, { amount: `${projectData.softCap} ${baseTokenSymbol}` })}
							</div>
						)}
					</div>
				)}
			</div>

			<div className="mt-6 space-y-1 border-t border-line pt-6 text-center text-xs text-muted-deep">
				<div>{p.contract}: <span className="font-mono">{projectData.contractAddress}</span></div>
				{projectData.isFinalized !== undefined && (
					<div>{projectData.isFinalized ? p.finalized : p.notFinalized}</div>
				)}
			</div>
		</Panel>
	)
}
