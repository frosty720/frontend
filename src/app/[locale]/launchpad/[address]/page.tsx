'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Panel } from '@/components/primitives/Panel'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useProjectDetails } from '@/hooks/launchpad/useProjectDetails'
import { useDict } from '@/i18n/hooks'
import ProjectHeader from '@/components/launchpad/ProjectHeader'
import ProjectStats from '@/components/launchpad/ProjectStats'
import ProjectProgress from '@/components/launchpad/ProjectProgress'
import ParticipationForm from '@/components/launchpad/ParticipationForm'
import UserContributions from '@/components/launchpad/UserContributions'
import ProjectConfiguration from '@/components/launchpad/ProjectConfiguration'
import ProjectSocialLinks from '@/components/launchpad/ProjectSocialLinks'
import ProjectOwnerControls from '@/components/launchpad/ProjectOwnerControls'
import { launchpadLogger } from '@/lib/logger'

export default function ProjectDetailPage() {
	const dict = useDict()
	const p = dict.launchpadProject
	const params = useParams()
	const contractAddress = params.address as string

	const { projectData, loading, error, refetch } = useProjectDetails(contractAddress)

	if (loading) {
		return (
			<div className="flex justify-center py-16">
				<LoadingSpinner size="lg" />
			</div>
		)
	}

	if (error) {
		return (
			<Panel>
				<EmptyState
					icon={AlertCircle}
					title={p.errorTitle}
					body={error}
					action={
						<Button size="sm" variant="secondary" onClick={() => refetch()}>
							<RefreshCw />
							{p.tryAgain}
						</Button>
					}
				/>
			</Panel>
		)
	}

	if (!projectData) return null

	return (
		<>
			<ProjectHeader
				projectData={projectData}
				contractAddress={contractAddress}
				onRefresh={refetch}
			/>

			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
				<div className="space-y-5">
					<ParticipationForm
						projectData={projectData}
						onSuccess={refetch}
						onError={(err) => launchpadLogger.error('Participation error:', err)}
					/>
					<UserContributions projectData={projectData} onRefresh={refetch} />
				</div>

				<div className="space-y-5">
					<ProjectStats projectData={projectData} />
					<ProjectProgress projectData={projectData} onRefresh={refetch} />
					<ProjectConfiguration projectData={projectData} />
					<ProjectSocialLinks projectData={projectData} />
				</div>
			</div>

			<div className="mt-5">
				<ProjectOwnerControls projectData={projectData} onRefresh={refetch} />
			</div>
		</>
	)
}
