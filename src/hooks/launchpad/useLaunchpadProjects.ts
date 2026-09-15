'use client';

import { useQuery } from '@tanstack/react-query';
import { normalizeProjects, type LaunchpadCardData } from '@/utils/launchpad';
import { UserError } from '@/lib/userError';

const PROJECTS_QUERY = `
	query LaunchpadProjects {
		launchpadOverview { recentProjects { id totalRaised } }
		confirmedProjects {
			name description contractAddress saleToken baseToken hardCap softCap tokenRate presaleStart presaleEnd createdAt
			websiteUrl whitepaperUrl githubUrl discordUrl telegramUrl twitterUrl additionalSocialUrl
		}
		confirmedFairlaunches {
			name description contractAddress saleToken baseToken sellingAmount softCap buybackRate fairlaunchStart fairlaunchEnd createdAt
			websiteUrl whitepaperUrl githubUrl discordUrl telegramUrl twitterUrl additionalSocialUrl
		}
	}
`;

interface ProjectsResponse {
	data?: {
		launchpadOverview?: { recentProjects?: { id: string; totalRaised: string | null }[] } | null;
		confirmedProjects?: Parameters<typeof normalizeProjects>[0];
		confirmedFairlaunches?: Parameters<typeof normalizeProjects>[1];
	};
	errors?: { message: string }[];
}

/** Launchpad projects from the backend (same GraphQL the old Overview tab used). */
export function useLaunchpadProjects() {
	return useQuery({
		queryKey: ['launchpadProjects'],
		staleTime: 60_000,
		refetchInterval: 120_000,
		queryFn: async (): Promise<LaunchpadCardData[]> => {
			const res = await fetch('/api/graphql', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: PROJECTS_QUERY }),
			});
			if (!res.ok) throw new UserError('dataUnavailable');
			const json = (await res.json()) as ProjectsResponse;
			if (json.errors?.length) throw new UserError('dataUnavailable');
			const raised: Record<string, number> = {};
			for (const project of json.data?.launchpadOverview?.recentProjects ?? []) {
				const value = Number(project.totalRaised);
				if (Number.isFinite(value)) raised[project.id.toLowerCase()] = value;
			}
			return normalizeProjects(json.data?.confirmedProjects ?? [], json.data?.confirmedFairlaunches ?? [], raised);
		},
	});
}
