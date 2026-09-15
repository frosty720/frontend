'use client'

import React from 'react'
import { Globe, FileText, Github, MessageCircle, Send, Twitter, ExternalLink, Link as LinkIcon } from 'lucide-react'
import { Panel } from '@/components/primitives/Panel'
import { ProjectData } from '@/hooks/launchpad/useProjectDetails'
import { useDict } from '@/i18n/hooks'

interface ProjectSocialLinksProps {
	projectData: ProjectData
}

interface SocialLink {
	label: string
	url: string
	icon: React.ReactNode
}

export default function ProjectSocialLinks({ projectData }: ProjectSocialLinksProps) {
	const dict = useDict()
	const s = dict.launchpadProject.social

	const socialLinks: SocialLink[] = []

	if (projectData.websiteUrl) {
		socialLinks.push({ label: s.website, url: projectData.websiteUrl, icon: <Globe className="size-4" /> })
	}
	if (projectData.whitepaperUrl) {
		socialLinks.push({ label: s.whitepaper, url: projectData.whitepaperUrl, icon: <FileText className="size-4" /> })
	}
	if (projectData.githubUrl) {
		socialLinks.push({ label: s.github, url: projectData.githubUrl, icon: <Github className="size-4" /> })
	}
	if (projectData.discordUrl) {
		socialLinks.push({ label: s.discord, url: projectData.discordUrl, icon: <MessageCircle className="size-4" /> })
	}
	if (projectData.telegramUrl) {
		socialLinks.push({ label: s.telegram, url: projectData.telegramUrl, icon: <Send className="size-4" /> })
	}
	if (projectData.twitterUrl) {
		socialLinks.push({ label: s.twitter, url: projectData.twitterUrl, icon: <Twitter className="size-4" /> })
	}
	if (projectData.additionalSocialUrl) {
		socialLinks.push({ label: s.other, url: projectData.additionalSocialUrl, icon: <LinkIcon className="size-4" /> })
	}

	if (socialLinks.length === 0) {
		return null
	}

	return (
		<Panel title={s.title}>
			<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
				{socialLinks.map((link) => (
					<a
						key={link.label}
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-2 rounded-xl border border-line bg-surface-alt px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:border-line-strong hover:text-cream"
					>
						{link.icon}
						<span className="truncate">{link.label}</span>
						<ExternalLink className="ml-auto size-3 opacity-60" />
					</a>
				))}
			</div>
		</Panel>
	)
}
