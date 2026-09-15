'use client'

import React from 'react'
import { Panel } from '@/components/primitives/Panel'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useDict, useFormat } from '@/i18n/hooks'
import { interpolate } from '@/i18n/interpolate'

interface ProjectStatsProps {
	projectData: ProjectData
}

/** Large launchpad amounts sometimes arrive in wei straight from a contract read (totalRaised);
 * human-entered amounts from the database (hardCap, softCap) never reach this magnitude, so
 * anything past the threshold is treated as wei and scaled down. */
function scaleTokenAmount(value: string | number | undefined): number {
	if (value === undefined || value === null || value === '') return 0
	const num = typeof value === 'string' ? parseFloat(value) : value
	if (!Number.isFinite(num)) return 0
	return num > 1_000_000_000_000_000 ? num / 1_000_000_000_000_000_000 : num
}

export default function ProjectStats({ projectData }: ProjectStatsProps) {
	const dict = useDict()
	const fmt = useFormat()
	const p = dict.launchpadProject.stats

	const baseTokenSymbol = projectData.baseToken === '0x0000000000000000000000000000000000000000' ? 'KMT' : 'Token'
	const amount = (value: string | number | undefined) => `${fmt.number(scaleTokenAmount(value), { maximumFractionDigits: 2 })} ${baseTokenSymbol}`

	const seconds = projectData.timeRemaining || 0
	let timeRemainingText: string
	if (seconds <= 0) {
		timeRemainingText = p.ended
	} else {
		const days = Math.floor(seconds / 86400)
		const hours = Math.floor((seconds % 86400) / 3600)
		const minutes = Math.floor((seconds % 3600) / 60)
		if (days > 0) timeRemainingText = interpolate(p.timeDays, { days: String(days), hours: String(hours) })
		else if (hours > 0) timeRemainingText = interpolate(p.timeHours, { hours: String(hours), minutes: String(minutes) })
		else timeRemainingText = interpolate(p.timeMinutes, { minutes: String(minutes) })
	}

	const endDate = projectData.presaleEnd || projectData.fairlaunchEnd
	const rows: Array<[string, string]> = [
		[p.saleToken, `${projectData.saleToken.slice(0, 6)}...${projectData.saleToken.slice(-4)}`],
		[p.baseToken, baseTokenSymbol],
		[p.tokenRate, interpolate(p.perToken, { rate: fmt.number(scaleTokenAmount(projectData.tokenRate)), symbol: baseTokenSymbol })],
	]
	const saleRows: Array<[string, string]> = [
		[p.softCap, amount(projectData.softCap)],
		[p.hardCap, amount(projectData.hardCap)],
		[p.raisedSoFar, amount(projectData.totalRaised || '0')],
	]

	return (
		<div className="space-y-5">
			{projectData.isActive && (
				<Panel title={p.liveTitle}>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.totalRaised}</div>
							<div className="mt-1 font-display text-xl font-bold text-cream">{amount(projectData.totalRaised || '0')}</div>
							<div className="mt-1 text-[12px] text-muted-foreground">{interpolate(p.ofGoal, { amount: amount(projectData.hardCap) })}</div>
						</div>
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.participants}</div>
							<div className="mt-1 font-display text-xl font-bold text-cream">{fmt.number(projectData.totalParticipants || 0)}</div>
							<div className="mt-1 text-[12px] text-muted-foreground">{p.contributors}</div>
						</div>
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.timeRemaining}</div>
							<div className="mt-1 font-display text-xl font-bold text-cream">{timeRemainingText}</div>
							{endDate && <div className="mt-1 text-[12px] text-muted-foreground">{interpolate(p.until, { date: fmt.date(new Date(endDate)) })}</div>}
						</div>
					</div>
				</Panel>
			)}

			<Panel title={p.detailsTitle}>
				<div className="space-y-5">
					<div>
						<h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.infoTitle}</h4>
						<p className="mt-2 font-display text-base font-semibold text-cream">{projectData.name}</p>
						<p className="mt-1 text-sm text-muted-foreground">{projectData.description || p.noDescription}</p>
					</div>

					<div>
						<h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.tokenTitle}</h4>
						<dl className="mt-2 divide-y divide-line">
							{rows.map(([label, value]) => (
								<div key={label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
									<dt className="text-muted-foreground">{label}</dt>
									<dd className="font-medium text-cream">{value}</dd>
								</div>
							))}
						</dl>
					</div>

					<div>
						<h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.saleTitle}</h4>
						<dl className="mt-2 divide-y divide-line">
							{saleRows.map(([label, value]) => (
								<div key={label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
									<dt className="text-muted-foreground">{label}</dt>
									<dd className="font-medium text-cream">{value}</dd>
								</div>
							))}
						</dl>
					</div>

					<div>
						<h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{p.timelineTitle}</h4>
						<dl className="mt-2 divide-y divide-line">
							<div className="flex items-center justify-between gap-3 py-2.5 text-sm">
								<dt className="text-muted-foreground">{p.start}</dt>
								<dd className="font-medium text-cream">{fmt.date(new Date(projectData.presaleStart), { dateStyle: 'medium', timeStyle: 'short' })}</dd>
							</div>
							<div className="flex items-center justify-between gap-3 py-2.5 text-sm">
								<dt className="text-muted-foreground">{p.end}</dt>
								<dd className="font-medium text-cream">{fmt.date(new Date(projectData.presaleEnd), { dateStyle: 'medium', timeStyle: 'short' })}</dd>
							</div>
						</dl>
					</div>
				</div>
			</Panel>
		</div>
	)
}
