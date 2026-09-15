'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { Pill, type PillTone } from '@/components/primitives/Pill'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { CHAIN_IDS, getExplorerAddressUrl } from '@/config/chains'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useDict, useLocaleHref } from '@/i18n/hooks'

interface ProjectHeaderProps {
	projectData: ProjectData
	contractAddress: string
	onRefresh: () => void
	isRefreshing?: boolean
}

const STATUS_TONE: Record<string, PillTone> = {
	Active: 'success',
	Successful: 'info',
	Failed: 'danger',
	Cancelled: 'muted',
	Pending: 'gold',
}

export default function ProjectHeader({
	projectData,
	contractAddress,
	onRefresh,
	isRefreshing = false
}: ProjectHeaderProps) {
	const dict = useDict()
	const href = useLocaleHref()
	const toast = useToast()
	const p = dict.launchpadProject
	const l = dict.launchpad

	const status = projectData.status ?? 'Pending'
	const statusLabel = {
		Active: p.statusActive,
		Successful: p.statusSuccessful,
		Failed: p.statusFailed,
		Cancelled: p.statusCancelled,
		Pending: p.statusPending,
	}[status] ?? p.statusPending
	const typeLabel = projectData.type === 'fairlaunch' ? l.typeFairlaunch : l.typePresale

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(contractAddress)
			toast.success(p.copiedTitle, p.copiedBody)
		} catch {
			toast.error(p.copyFailedTitle, p.copyFailedBody)
		}
	}

	return (
		<div className="mb-5 space-y-4">
			<Link href={href('/launchpad')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-cream">
				<ArrowLeft className="size-4" />
				{p.back}
			</Link>

			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2.5">
					<h1 className="font-display text-[26px] font-bold leading-tight sm:text-[28px]">{projectData.name}</h1>
					<Pill tone={STATUS_TONE[status] ?? 'muted'}>{statusLabel}</Pill>
					<Pill tone="violet">{typeLabel}</Pill>
				</div>
				<Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
					<RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
					{p.refresh}
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
				<span>{p.contract}</span>
				<code className="rounded-lg bg-surface-hi px-2 py-1 font-mono text-[12px] text-muted-foreground">
					{contractAddress}
				</code>
				<button
					type="button"
					onClick={handleCopy}
					className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-cream"
				>
					<Copy className="size-3.5" />
					{p.copy}
				</button>
				<a
					href={getExplorerAddressUrl(CHAIN_IDS.KALYCHAIN, contractAddress)}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={dict.common.external}
					title={dict.common.external}
					className="inline-flex items-center text-muted-foreground transition-colors hover:text-cream"
				>
					<ExternalLink className="size-3.5" />
				</a>
			</div>
		</div>
	)
}
