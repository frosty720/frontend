'use client';

import Link from 'next/link';
import { Rocket, Globe, FileText, Github, MessageCircle, Send, Twitter, Link as LinkIcon } from 'lucide-react';
import { Pill, type PillTone } from '@/components/primitives/Pill';
import { Button } from '@/components/ui/button';
import { useDict, useFormat, useLocaleHref } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { projectStatus, raisedProgress, type LaunchpadCardData, type ProjectStatus } from '@/utils/launchpad';

const TONE: Record<ProjectStatus, PillTone> = { live: 'success', upcoming: 'gold', ended: 'muted' };

interface LaunchpadProjectCardProps {
	project: LaunchpadCardData;
	/** Base-token symbol (KMT, USDT…) for the raised / goal figures. */
	baseSymbol: string;
}

/** The reference's project card: gradient banner + status, name, raised / goal bar, rate, one action. */
export default function LaunchpadProjectCard({ project, baseSymbol }: LaunchpadProjectCardProps) {
	const dict = useDict();
	const fmt = useFormat();
	const href = useLocaleHref();
	const l = dict.launchpad;
	const s = dict.launchpadProject.social;
	const status = projectStatus(project.start, project.end, Date.now());
	const progress = raisedProgress(project.raised, project.hardCap);
	const statusLabel = { live: l.statusLive, upcoming: l.statusUpcoming, ended: l.statusEnded }[status];
	const amount = (value: string | number) => `${fmt.number(Number(value) || 0, { maximumFractionDigits: 2 })} ${baseSymbol}`;
	const hasDates = Number.isFinite(project.start) && Number.isFinite(project.end);

	const socialLinks: Array<{ key: string; url: string; label: string; icon: typeof Globe }> = [
		project.socials.website && { key: 'website', url: project.socials.website, label: s.website, icon: Globe },
		project.socials.whitepaper && { key: 'whitepaper', url: project.socials.whitepaper, label: s.whitepaper, icon: FileText },
		project.socials.github && { key: 'github', url: project.socials.github, label: s.github, icon: Github },
		project.socials.discord && { key: 'discord', url: project.socials.discord, label: s.discord, icon: MessageCircle },
		project.socials.telegram && { key: 'telegram', url: project.socials.telegram, label: s.telegram, icon: Send },
		project.socials.twitter && { key: 'twitter', url: project.socials.twitter, label: s.twitter, icon: Twitter },
		project.socials.other && { key: 'other', url: project.socials.other, label: s.other, icon: LinkIcon },
	].filter(Boolean) as Array<{ key: string; url: string; label: string; icon: typeof Globe }>;

	return (
		<article className="overflow-hidden rounded-2xl border border-line bg-surface">
			<div className="relative flex h-24 items-center justify-center bg-gradient-to-r from-gold-bright via-gold/70 to-violet">
				<Rocket className="size-8 text-on-gold" aria-hidden />
				<Pill tone={TONE[status]} className="absolute right-3 top-3 bg-ink/60">{statusLabel}</Pill>
			</div>
			<div className="p-5">
				<h3 className="truncate font-display text-lg font-semibold">{project.name}</h3>
				<p className="mt-1 truncate text-[13px] text-muted-foreground">
					{project.description || (project.type === 'presale' ? l.typePresale : l.typeFairlaunch)}
				</p>
				{hasDates && (
					<p className="mt-1 text-[12px] text-muted-deep">
						{fmt.date(project.start)} – {fmt.date(project.end)}
					</p>
				)}
				<div className="mt-4 flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
					<span>{interpolate(l.raised, { amount: project.raised !== null ? amount(project.raised) : '—' })}</span>
					<span>{interpolate(l.goal, { amount: amount(project.hardCap) })}</span>
				</div>
				<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hi">
					<div className="h-full rounded-full bg-gold" style={{ width: `${progress ?? 0}%` }} />
				</div>
				<div className="mt-3 flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
					<span>{project.rate ? interpolate(l.rate, { rate: `1 ${baseSymbol} = ${fmt.number(Number(project.rate) || 0)}` }) : ''}</span>
					<span>{l.chain}</span>
				</div>
				{socialLinks.length > 0 && (
					<div className="mt-3 flex flex-wrap items-center gap-2">
						{socialLinks.map(({ key, url, label, icon: Icon }) => (
							<a
								key={key}
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={label}
								title={label}
								className="flex size-7 items-center justify-center rounded-lg bg-surface-hi text-muted-foreground transition-colors hover:text-cream"
							>
								<Icon className="size-3.5" />
							</a>
						))}
					</div>
				)}
				<div className="mt-4">
					{status === 'upcoming' ? (
						<Button className="w-full" variant="secondary" disabled>
							<Rocket />
							{l.soon}
						</Button>
					) : (
						<Button asChild className="w-full" variant={status === 'live' ? 'default' : 'secondary'}>
							<Link href={href(`/launchpad/${project.address}`)}>
								<Rocket />
								{status === 'live' ? l.participate : l.view}
							</Link>
						</Button>
					)}
				</div>
			</div>
		</article>
	);
}
