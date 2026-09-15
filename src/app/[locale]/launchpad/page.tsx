'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, Rocket } from 'lucide-react';
import FairlaunchCreator from '@/components/launchpad/FairlaunchCreator';
import LaunchpadProjectCard from '@/components/launchpad/LaunchpadProjectCard';
import PresaleCreator from '@/components/launchpad/PresaleCreator';
import RewardsTokenManager from '@/components/launchpad/RewardsTokenManager';
import TokenCreator from '@/components/launchpad/TokenCreator';
import { EmptyState } from '@/components/primitives/EmptyState';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Panel } from '@/components/primitives/Panel';
import { StatCard } from '@/components/primitives/StatCard';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { CHAIN_IDS } from '@/config/chains';
import { useLaunchpadProjects } from '@/hooks/launchpad/useLaunchpadProjects';
import { useTokenLists } from '@/hooks/useTokenLists';
import { useDict, useFormat } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { launchpadCounts } from '@/utils/launchpad';

type Tab = 'explore' | 'token' | 'rewards' | 'presale' | 'fairlaunch';

const ZERO = '0x0000000000000000000000000000000000000000';

/** Launchpad page: the reference's project grid under Explore, with the creation tools as tabs. */
export default function LaunchpadPage() {
	const dict = useDict();
	const fmt = useFormat();
	const l = dict.launchpad;
	const p = dict.launchpadProject;
	const [tab, setTab] = useState<Tab>('explore');
	const { data: projects = [], isLoading, isError, refetch } = useLaunchpadProjects();
	const { tokens } = useTokenLists({ chainId: CHAIN_IDS.KALYCHAIN });
	const counts = useMemo(() => launchpadCounts(projects, Date.now()), [projects]);
	const countsKnown = !isLoading && !isError;

	const symbolOf = (address: string) => {
		if (!address || address.toLowerCase() === ZERO) return 'KMT';
		return tokens.find((token) => token.address.toLowerCase() === address.toLowerCase())?.symbol ?? 'KMT';
	};

	const tabs: Array<{ key: Tab; label: string }> = [
		{ key: 'explore', label: l.tabExplore },
		{ key: 'token', label: l.tabToken },
		{ key: 'rewards', label: l.tabRewards },
		{ key: 'presale', label: l.tabPresale },
		{ key: 'fairlaunch', label: l.tabFairlaunch },
	];

	let explore;
	if (isError) {
		explore = (
			<Panel>
				<EmptyState
					icon={Rocket}
					title={l.error}
					action={
						<Button size="sm" variant="secondary" onClick={() => refetch()}>
							<RefreshCw />
							{l.retry}
						</Button>
					}
				/>
			</Panel>
		);
	} else if (isLoading) {
		explore = (
			<div className="flex justify-center py-12">
				<LoadingSpinner size="lg" />
			</div>
		);
	} else if (projects.length === 0) {
		explore = (
			<Panel>
				<EmptyState
					icon={Rocket}
					title={l.emptyTitle}
					body={l.emptyBody}
					action={
						<Button onClick={() => setTab('presale')}>
							<Rocket />
							{l.emptyCta}
						</Button>
					}
				/>
			</Panel>
		);
	} else {
		explore = (
			<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
				{projects.map((project) => (
					<LaunchpadProjectCard key={`${project.type}-${project.address}`} project={project} baseSymbol={symbolOf(project.baseToken)} />
				))}
			</div>
		);
	}

	return (
		<>
			<PageHeader title={dict.pages.launchpad.title} subtitle={dict.pages.launchpad.subtitle} />
			{tab === 'explore' && (
				<div className="mb-5 grid gap-4 sm:grid-cols-3">
					<StatCard label={p.overview.total} value={countsKnown ? fmt.number(counts.total) : '—'} tone="gold" />
					<StatCard label={p.overview.live} value={countsKnown ? fmt.number(counts.live) : '—'} tone="success" />
					<StatCard label={p.overview.ended} value={countsKnown ? fmt.number(counts.ended) : '—'} />
				</div>
			)}
			<div role="tablist" className="mb-5 flex flex-wrap gap-2">
				{tabs.map((item) => (
					<button
						key={item.key}
						type="button"
						role="tab"
						aria-selected={tab === item.key}
						onClick={() => setTab(item.key)}
						className={cn(
							'rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
							tab === item.key ? 'border-gold/60 bg-gold-soft text-gold-light' : 'border-line bg-surface text-muted-foreground hover:text-cream',
						)}
					>
						{item.label}
					</button>
				))}
			</div>
			{tab === 'explore' && explore}
			{tab === 'token' && <Panel><TokenCreator /></Panel>}
			{tab === 'rewards' && <Panel><RewardsTokenManager /></Panel>}
			{tab === 'presale' && <Panel><PresaleCreator /></Panel>}
			{tab === 'fairlaunch' && <Panel><FairlaunchCreator /></Panel>}
		</>
	);
}
