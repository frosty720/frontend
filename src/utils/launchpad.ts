export type ProjectType = 'presale' | 'fairlaunch';
export type ProjectStatus = 'upcoming' | 'live' | 'ended';

export interface ProjectSocialLinks {
	website: string | null;
	whitepaper: string | null;
	github: string | null;
	discord: string | null;
	telegram: string | null;
	twitter: string | null;
	other: string | null;
}

export interface LaunchpadCardData {
	address: string;
	name: string;
	description: string;
	type: ProjectType;
	/** Epoch milliseconds (NaN when the backend sent nothing usable). */
	start: number;
	end: number;
	hardCap: string;
	softCap: string;
	baseToken: string;
	saleToken: string;
	rate: string | null;
	/** Amount raised in base-token units, when the launchpad subgraph reports it. */
	raised: number | null;
	createdAt: number;
	socials: ProjectSocialLinks;
}

/** Backend timestamps arrive as ISO strings or unix seconds; normalise to epoch ms. */
export function toMs(value: string | number | null | undefined): number {
	if (value === null || value === undefined || value === '') return NaN;
	if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
	if (/^\d+$/.test(value)) {
		const n = Number(value);
		return n < 1e12 ? n * 1000 : n;
	}
	return Date.parse(value);
}

export function projectStatus(start: number, end: number, now: number): ProjectStatus {
	if (Number.isFinite(start) && now < start) return 'upcoming';
	if (Number.isFinite(end) && now > end) return 'ended';
	return 'live';
}

/** Raised as a 0–100 share of the hard cap; null when either side is unknown or the cap is 0. */
export function raisedProgress(raised: number | null, hardCap: string): number | null {
	const cap = Number(hardCap);
	if (raised === null || !(cap > 0)) return null;
	return Math.min(100, Math.max(0, (raised / cap) * 100));
}

export interface LaunchpadCounts {
	total: number;
	live: number;
	ended: number;
}

/** Total / live / ended counts for the StatCards above the Explore tab. Upcoming projects count toward neither. */
export function launchpadCounts(projects: LaunchpadCardData[], now: number): LaunchpadCounts {
	let live = 0;
	let ended = 0;
	for (const project of projects) {
		const status = projectStatus(project.start, project.end, now);
		if (status === 'live') live++;
		else if (status === 'ended') ended++;
	}
	return { total: projects.length, live, ended };
}

interface SocialUrlRow {
	websiteUrl?: string | null;
	whitepaperUrl?: string | null;
	githubUrl?: string | null;
	discordUrl?: string | null;
	telegramUrl?: string | null;
	twitterUrl?: string | null;
	additionalSocialUrl?: string | null;
}

function socialsOf(row: SocialUrlRow): ProjectSocialLinks {
	return {
		website: row.websiteUrl ?? null,
		whitepaper: row.whitepaperUrl ?? null,
		github: row.githubUrl ?? null,
		discord: row.discordUrl ?? null,
		telegram: row.telegramUrl ?? null,
		twitter: row.twitterUrl ?? null,
		other: row.additionalSocialUrl ?? null,
	};
}

interface PresaleRow extends SocialUrlRow {
	name: string;
	description?: string | null;
	contractAddress: string;
	saleToken: string;
	baseToken: string;
	hardCap: string;
	softCap: string;
	tokenRate?: string | null;
	presaleStart: string;
	presaleEnd: string;
	createdAt: string;
}

interface FairlaunchRow extends SocialUrlRow {
	name: string;
	description?: string | null;
	contractAddress: string;
	saleToken: string;
	baseToken: string;
	sellingAmount: string;
	softCap: string;
	buybackRate?: string | null;
	fairlaunchStart: string;
	fairlaunchEnd: string;
	createdAt: string;
}

/** One card list from both backend project kinds, newest first, with raised amounts attached by address. */
export function normalizeProjects(
	presales: PresaleRow[],
	fairlaunches: FairlaunchRow[],
	raisedByAddress: Record<string, number>,
): LaunchpadCardData[] {
	const raisedOf = (address: string) => raisedByAddress[address.toLowerCase()] ?? null;
	const cards: LaunchpadCardData[] = [
		...presales.map((p) => ({
			address: p.contractAddress,
			name: p.name,
			description: p.description ?? '',
			type: 'presale' as const,
			start: toMs(p.presaleStart),
			end: toMs(p.presaleEnd),
			hardCap: p.hardCap,
			softCap: p.softCap,
			baseToken: p.baseToken,
			saleToken: p.saleToken,
			rate: p.tokenRate ?? null,
			raised: raisedOf(p.contractAddress),
			createdAt: toMs(p.createdAt),
			socials: socialsOf(p),
		})),
		...fairlaunches.map((f) => ({
			address: f.contractAddress,
			name: f.name,
			description: f.description ?? '',
			type: 'fairlaunch' as const,
			start: toMs(f.fairlaunchStart),
			end: toMs(f.fairlaunchEnd),
			// A fairlaunch sells a fixed amount; that is its cap equivalent.
			hardCap: f.sellingAmount,
			softCap: f.softCap,
			baseToken: f.baseToken,
			saleToken: f.saleToken,
			rate: f.buybackRate ?? null,
			raised: raisedOf(f.contractAddress),
			createdAt: toMs(f.createdAt),
			socials: socialsOf(f),
		})),
	];
	return cards.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
