/**
 * Vault affiliate program maths (ported from kaly-vault lib/chain/affiliate.ts + subgraph.ts).
 * Commissions are on-chain (FeesRouted); ranks, loyalty and activity are off-chain standings derived
 * from the same events.
 */
import { DEFAULT_FEE_SPLIT, type FeeSplit } from '@/utils/vaults';

const lc = (s: string) => s.toLowerCase();
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface SponsorEdge {
	buyer: string;
	sponsor: string;
}

/** A commission leg attributed to an affiliate from one purchase. */
export interface FeeLeg {
	affiliate: string;
	level: 1 | 2 | 3;
	usd: number;
	buyer: string;
	block: bigint;
}

const BLOCKS_PER_DAY = 43200n; // KalyChain 2s blocks
const BLOCKS_PER_MONTH = BLOCKS_PER_DAY * 30n;

/**
 * Which of the three affiliate legs a `FeesRouted` event actually paid.
 *
 * The event emits n1/n2/n3 and their amounts unconditionally. A level that failed the
 * skin-in-the-game gate (the recipient must hold a vault) still appears with its real address and
 * full amount while the money went to the DAO. Only `daoAmt` reflects what happened:
 * `daoAmt = daoBase + Σ(unpaid legs)`, with `daoBase` reconstructed from `devAmt`. The legs use
 * distinct bps, so the subset summing to the excess is unique.
 *
 * Returns `null` when no subset or more than one matches (e.g. the split changed after the event),
 * so callers fall back instead of mis-stating someone's earnings.
 */
export function paidLegs(
	amounts: readonly [bigint, bigint, bigint],
	devAmt: bigint,
	daoAmt: bigint,
	split: FeeSplit = DEFAULT_FEE_SPLIT,
): [boolean, boolean, boolean] | null {
	if (split.devBps === 0) return null;
	const daoBase = (devAmt * BigInt(split.daoBps)) / BigInt(split.devBps);
	const excess = daoAmt - daoBase;
	if (excess < 0n) return null;

	const positive = amounts.filter((a) => a > 0n);
	if (positive.length === 0) return [true, true, true];

	// Distinct subset sums are at least the smallest leg apart, so half of it absorbs the drift from
	// reconstructing daoBase through two floor divisions.
	const tolerance = positive.reduce((min, a) => (a < min ? a : min)) / 2n;

	let match: number | null = null;
	for (let mask = 0; mask < 8; mask++) {
		let sum = 0n;
		for (let i = 0; i < 3; i++) if ((mask >> i) & 1) sum += amounts[i];
		const diff = sum > excess ? sum - excess : excess - sum;
		if (diff <= tolerance) {
			if (match !== null) return null;
			match = mask;
		}
	}
	if (match === null) return null;
	// A set bit means that leg rolled to the DAO.
	return [(match & 1) === 0, ((match >> 1) & 1) === 0, ((match >> 2) & 1) === 0];
}

/** Loyalty multiplier ×1.0 → ×1.5: +0.1 per full month of tenure. */
export function loyaltyMultiplier(tenureBlocks: bigint): number {
	const months = Number(tenureBlocks / BLOCKS_PER_MONTH);
	return Math.min(1.5, 1.0 + 0.1 * months);
}

export type ActivityStatus = 'active' | 'reduced' | 'suspended' | 'none';

/** A direct sale within 90 days = active; 90–180 days = reduced; older = suspended. */
export function activityStatus(head: bigint, lastSaleBlock: bigint | null): ActivityStatus {
	if (lastSaleBlock === null) return 'none';
	const days = Number((head - lastSaleBlock) / BLOCKS_PER_DAY);
	if (days <= 90) return 'active';
	if (days <= 180) return 'reduced';
	return 'suspended';
}

/** Performance ranks by direct sales; `bonusPct` is the extra N1 bonus, paid quarterly off-chain. */
export interface Rank {
	key: string;
	name: string;
	minSales: number;
	bonusPct: number;
}

export const RANKS: Rank[] = [
	{ key: 'bronze', name: 'Bronze', minSales: 15, bonusPct: 5 },
	{ key: 'silver', name: 'Silver', minSales: 45, bonusPct: 12 },
	{ key: 'gold', name: 'Gold', minSales: 90, bonusPct: 20 },
	{ key: 'diamond', name: 'Diamond', minSales: 150, bonusPct: 35 },
];

export function rankFor(sales: number): { current: Rank | null; next: Rank | null; toNext: number } {
	let current: Rank | null = null;
	for (const rank of RANKS) if (sales >= rank.minSales) current = rank;
	const next = RANKS.find((rank) => sales < rank.minSales) ?? null;
	return { current, next, toNext: next ? next.minSales - sales : 0 };
}

export interface AffiliateStats {
	address: string;
	/** N1: addresses that set this one as sponsor. */
	directReferrals: string[];
	sales: number;
	/** Distinct N1 + N2 + N3 addresses. */
	downlineCount: number;
	commissionUsd: number;
	byLevel: { l1: number; l2: number; l3: number };
	rank: ReturnType<typeof rankFor>;
	loyalty: number;
	activity: ActivityStatus;
}

export function childrenMap(edges: SponsorEdge[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const edge of edges) {
		const children = map.get(edge.sponsor) ?? [];
		if (!children.includes(edge.buyer)) children.push(edge.buyer);
		map.set(edge.sponsor, children);
	}
	return map;
}

/** Distinct addresses up to three levels below `addr`. */
function downline(addr: string, childrenOf: Map<string, string[]>): string[] {
	const seen = new Set<string>();
	let frontier = childrenOf.get(addr) ?? [];
	for (let depth = 0; depth < 3 && frontier.length; depth++) {
		const next: string[] = [];
		for (const child of frontier) {
			if (!seen.has(child)) {
				seen.add(child);
				next.push(...(childrenOf.get(child) ?? []));
			}
		}
		frontier = next;
	}
	return [...seen];
}

export function affiliateStats(addr: string, edges: SponsorEdge[], legs: FeeLeg[], head: bigint): AffiliateStats {
	const a = lc(addr);
	const children = childrenMap(edges);
	const direct = children.get(a) ?? [];
	const mine = legs.filter((leg) => leg.affiliate === a);
	const byLevel = { l1: 0, l2: 0, l3: 0 };
	for (const leg of mine) byLevel[`l${leg.level}`] += leg.usd;

	// Tenure from the first earning; activity from the last direct (N1) sale.
	const firstBlock = mine.length ? mine.reduce((min, leg) => (leg.block < min ? leg.block : min), mine[0].block) : head;
	const l1Blocks = mine.filter((leg) => leg.level === 1).map((leg) => leg.block);
	const lastSaleBlock = l1Blocks.length ? l1Blocks.reduce((max, b) => (b > max ? b : max), l1Blocks[0]) : null;

	return {
		address: a,
		directReferrals: direct,
		sales: direct.length,
		downlineCount: downline(a, children).length,
		commissionUsd: byLevel.l1 + byLevel.l2 + byLevel.l3,
		byLevel,
		rank: rankFor(direct.length),
		loyalty: loyaltyMultiplier(head - firstBlock),
		activity: activityStatus(head, lastSaleBlock),
	};
}

export interface LeaderRow {
	address: string;
	referrals: number;
	commissionUsd: number;
}

/** Top affiliates by commission, then by direct referrals. */
export function leaderboard(edges: SponsorEdge[], legs: FeeLeg[], limit = 25): LeaderRow[] {
	const children = childrenMap(edges);
	const earned = new Map<string, number>();
	for (const leg of legs) earned.set(leg.affiliate, (earned.get(leg.affiliate) ?? 0) + leg.usd);
	const rows = [...new Set([...children.keys(), ...earned.keys()])].map((address) => ({
		address,
		referrals: (children.get(address) ?? []).length,
		commissionUsd: earned.get(address) ?? 0,
	}));
	rows.sort((x, y) => y.commissionUsd - x.commissionUsd || y.referrals - x.referrals);
	return rows.slice(0, limit);
}

/** Raw vault-subgraph shape for the affiliate graph. */
export interface AffiliateGraphData {
	_meta: { block: { number: number; timestamp: number } };
	accounts: { address: string; sponsor: { address: string } | null }[];
	commissions: {
		buyer: { address: string };
		stable: string;
		level1: { address: string } | null;
		level2: { address: string } | null;
		level3: { address: string } | null;
		amount1: string;
		amount2: string;
		amount3: string;
		devAmount: string;
		daoAmount: string;
		timestamp: string;
	}[];
}

/**
 * Account references MUST be queried with a selection set ({ address }): queried as scalars,
 * graph-node silently omits them, which nulled every commission leg in the Vaults dApp.
 */
export const AFFILIATE_GRAPH_QUERY = `{
	_meta { block { number timestamp } }
	accounts(first: 1000) { address sponsor { address } }
	commissions(first: 1000, orderBy: timestamp, orderDirection: asc) {
		buyer { address } stable
		level1 { address } level2 { address } level3 { address }
		amount1 amount2 amount3 devAmount daoAmount timestamp
	}
}`;

/**
 * Sponsor edges and PAID commission legs. The subgraph stores amounts in raw stable units, so each
 * leg is valued with its stable's decimals (18 when the stable is unknown).
 */
export function parseAffiliateGraph(
	data: AffiliateGraphData,
	decimalsOf: (stable: string) => number | undefined,
	split: FeeSplit = DEFAULT_FEE_SPLIT,
): { edges: SponsorEdge[]; legs: FeeLeg[]; head: bigint } {
	const head = BigInt(data._meta.block.number);
	const headTs = data._meta.block.timestamp;
	// Commissions carry a timestamp, not a block; at ~2s blocks that's close enough for tenure buckets.
	const tsToBlock = (ts: number) => head - BigInt(Math.max(0, Math.floor((headTs - ts) / 2)));

	const edges = data.accounts
		.filter((account) => account.sponsor)
		.map((account) => ({ buyer: lc(account.address), sponsor: lc(account.sponsor!.address) }));

	const legs: FeeLeg[] = [];
	for (const c of data.commissions) {
		const decimals = decimalsOf(lc(c.stable)) ?? 18;
		const block = tsToBlock(Number(c.timestamp));
		const amounts: [bigint, bigint, bigint] = [BigInt(c.amount1), BigInt(c.amount2), BigInt(c.amount3)];
		// A named level is not proof of payment: reconcile against the DAO amount.
		const paid = paidLegs(amounts, BigInt(c.devAmount), BigInt(c.daoAmount), split) ?? [true, true, true];
		const levels: [string | undefined, 1 | 2 | 3][] = [
			[c.level1?.address, 1],
			[c.level2?.address, 2],
			[c.level3?.address, 3],
		];
		for (const [address, level] of levels) {
			const amount = amounts[level - 1];
			if (paid[level - 1] && address && lc(address) !== ZERO_ADDRESS && amount > 0n) {
				legs.push({ affiliate: lc(address), level, usd: Number(amount) / 10 ** decimals, buyer: lc(c.buyer.address), block });
			}
		}
	}
	return { edges, legs, head };
}
