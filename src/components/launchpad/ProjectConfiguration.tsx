'use client'

import React from 'react'
import { Coins, Lock, Settings, Users, TrendingUp, ExternalLink } from 'lucide-react'
import { Panel } from '@/components/primitives/Panel'
import { Pill } from '@/components/primitives/Pill'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'
import { CHAIN_IDS, getExplorerAddressUrl } from '@/config/chains'

interface ProjectConfigurationProps {
	projectData: ProjectData
}

export default function ProjectConfiguration({ projectData }: ProjectConfigurationProps) {
	const dict = useDict()
	const fmt = useFormat()
	const c = dict.launchpadProject.config
	const l = dict.launchpad

	const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'Token'
	const isPresale = projectData.type === 'presale'
	const isFairlaunch = projectData.type === 'fairlaunch'

	const formatAmount = (value: string | number | undefined): string => {
		if (value === undefined || value === null || value === '') return c.na
		const num = typeof value === 'string' ? parseFloat(value) : value
		if (!Number.isFinite(num)) return c.na
		return fmt.number(num, num >= 1000 ? { notation: 'compact', maximumFractionDigits: 2 } : { maximumFractionDigits: 6 })
	}

	const formatDuration = (days: string | undefined): string => {
		if (!days) return c.na
		const numDays = parseInt(days, 10)
		if (isNaN(numDays)) return c.na
		if (numDays >= 365) return interpolate(c.durationYears, { count: Math.floor(numDays / 365) })
		if (numDays >= 30) return interpolate(c.durationMonths, { count: Math.floor(numDays / 30) })
		return interpolate(c.durationDays, { count: numDays })
	}

	return (
		<Panel
			title={
				<span className="flex items-center gap-2">
					<Settings className="size-5" />
					{interpolate(c.title, { type: isPresale ? l.typePresale : l.typeFairlaunch })}
				</span>
			}
			action={<Pill tone="violet">{c.v3Badge}</Pill>}
		>
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">

				{/* Token Configuration */}
				<div className="space-y-3">
					<h4 className="flex items-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
						<Coins className="mr-2 size-4" />
						{c.tokenTitle}
					</h4>
					<div className="space-y-2.5 text-sm">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.saleToken}:</span>
							<code className="rounded-lg bg-surface-hi px-2 py-1 font-mono text-xs text-cream">
								{projectData.saleToken.slice(0, 6)}...{projectData.saleToken.slice(-4)}
							</code>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.baseToken}:</span>
							<span className="text-cream">{baseTokenSymbol}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.tokenRate}:</span>
							<span className="text-cream">{interpolate(c.perToken, { rate: formatAmount(projectData.tokenRate), symbol: baseTokenSymbol })}</span>
						</div>
						{isPresale && projectData.liquidityRate && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.liquidityRate}:</span>
								<span className="text-cream">{interpolate(c.perToken, { rate: formatAmount(projectData.liquidityRate), symbol: baseTokenSymbol })}</span>
							</div>
						)}
						{isFairlaunch && projectData.buybackRate && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.buybackRate}:</span>
								<span className="text-cream">{interpolate(c.perToken, { rate: formatAmount(projectData.buybackRate), symbol: baseTokenSymbol })}</span>
							</div>
						)}
						{isFairlaunch && projectData.sellingAmount && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.sellingAmount}:</span>
								<span className="text-cream">{interpolate(c.tokensSuffix, { amount: formatAmount(projectData.sellingAmount) })}</span>
							</div>
						)}
					</div>
				</div>

				{/* Contribution Limits */}
				<div className="space-y-3">
					<h4 className="flex items-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
						<Users className="mr-2 size-4" />
						{c.limitsTitle}
					</h4>
					<div className="space-y-2.5 text-sm">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.softCap}:</span>
							<span className="text-cream">{formatAmount(projectData.softCap)} {baseTokenSymbol}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.hardCap}:</span>
							<span className="text-cream">{formatAmount(projectData.hardCap)} {baseTokenSymbol}</span>
						</div>
						{projectData.minContribution && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.minContribution}:</span>
								<span className="text-cream">{formatAmount(projectData.minContribution)} {baseTokenSymbol}</span>
							</div>
						)}
						{projectData.maxContribution && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.maxContribution}:</span>
								<span className="text-cream">{formatAmount(projectData.maxContribution)} {baseTokenSymbol}</span>
							</div>
						)}
						{projectData.isWhitelist !== undefined && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.whitelist}:</span>
								<Pill tone={projectData.isWhitelist ? 'gold' : 'success'}>{projectData.isWhitelist ? c.enabled : c.public}</Pill>
							</div>
						)}
					</div>
				</div>

				{/* Liquidity & Lock Information */}
				<div className="space-y-3">
					<h4 className="flex items-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
						<Lock className="mr-2 size-4" />
						{c.liquidityTitle}
					</h4>
					<div className="space-y-2.5 text-sm">
						{projectData.liquidityPercent && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.liquidityPercent}:</span>
								<span className="text-cream">{projectData.liquidityPercent}%</span>
							</div>
						)}
						{projectData.lpLockDuration && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.lpLockDuration}:</span>
								<span className="text-cream">{formatDuration(projectData.lpLockDuration)}</span>
							</div>
						)}
						{projectData.lpRecipient && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.lpRecipient}:</span>
								<code className="rounded-lg bg-surface-hi px-2 py-1 font-mono text-xs text-cream">
									{projectData.lpRecipient.slice(0, 6)}...{projectData.lpRecipient.slice(-4)}
								</code>
							</div>
						)}
						{projectData.referrer && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{c.referrer}:</span>
								<code className="rounded-lg bg-surface-hi px-2 py-1 font-mono text-xs text-cream">
									{projectData.referrer.slice(0, 6)}...{projectData.referrer.slice(-4)}
								</code>
							</div>
						)}
					</div>
				</div>

			</div>

			{/* V3 Liquidity Information */}
			<div className="mt-6 border-t border-line pt-6">
				<h4 className="mb-3 flex items-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">
					<TrendingUp className="mr-2 size-4" />
					{c.v3Title}
				</h4>
				<div className="space-y-2.5 text-sm">
					{projectData.v3PoolAddress && projectData.v3PoolAddress !== '0x0000000000000000000000000000000000000000' && (
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.v3Pool}:</span>
							<a
								href={getExplorerAddressUrl(CHAIN_IDS.KALYCHAIN, projectData.v3PoolAddress)}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 rounded-lg bg-surface-hi px-2 py-1 font-mono text-xs text-info hover:underline"
							>
								{projectData.v3PoolAddress.slice(0, 6)}...{projectData.v3PoolAddress.slice(-4)}
								<ExternalLink className="size-3" />
							</a>
						</div>
					)}
					{projectData.v3PositionTokenId !== undefined && projectData.v3PositionTokenId > 0 && (
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.v3PositionId}:</span>
							<span className="rounded-lg bg-surface-hi px-2 py-1 font-mono text-xs text-cream">
								#{projectData.v3PositionTokenId}
							</span>
						</div>
					)}
					{projectData.v3PoolFee !== undefined && (
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground">{c.v3FeeTier}:</span>
							<Pill tone="violet">{fmt.pct(projectData.v3PoolFee / 10000, 2)}</Pill>
						</div>
					)}
				</div>
			</div>
		</Panel>
	)
}
