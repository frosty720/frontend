/** How many live vaults sit in each tier. */
export function countByTier(tiers: number[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const tier of tiers) counts.set(tier, (counts.get(tier) ?? 0) + 1);
	return counts;
}

/** Total USD deposited: each tier's price times the number of live vaults in it. */
export function sumDeposited(counts: Map<number, number>, priceByTier: Map<number, number>): number {
	let total = 0;
	for (const [tier, count] of counts) total += (priceByTier.get(tier) ?? 0) * count;
	return total;
}

/**
 * The stable amount a purchase transfers: the whole-USD tier price scaled to the stable's decimals.
 * Money-critical (ported from kaly-vault lib/chain/buy.ts) — the approval and the VaultManager's
 * transferFrom both use exactly this value.
 */
export function purchaseAmount(priceUsd: number, decimals: number): bigint {
	return BigInt(priceUsd) * 10n ** BigInt(decimals);
}

/** VaultManager fee split in basis points (n1/n2/n3 affiliate legs, dev, DAO); POL is the remainder. */
export interface FeeSplit {
	n1Bps: number;
	n2Bps: number;
	n3Bps: number;
	devBps: number;
	daoBps: number;
}

/** VaultManager.initializeV3 defaults — 6% / 2.5% / 1.5% / dev 2% / DAO 8% (POL 80%). */
export const DEFAULT_FEE_SPLIT: FeeSplit = { n1Bps: 600, n2Bps: 250, n3Bps: 150, devBps: 200, daoBps: 800 };

export interface PurchaseSplit {
	pol: number;
	fees: number;
	affiliate: number;
	dev: number;
	dao: number;
	/** Whole-number percentages of the price, for the row labels. */
	polPct: number;
	feesPct: number;
}

/** Where a purchase's stables go: POL, the three affiliate legs, dev and the DAO treasury. */
export function splitPurchase(priceUsd: number, split: FeeSplit): PurchaseSplit {
	const feeBps = split.n1Bps + split.n2Bps + split.n3Bps + split.devBps + split.daoBps;
	const of = (bps: number) => (priceUsd * bps) / 10_000;
	return {
		pol: of(10_000 - feeBps),
		fees: of(feeBps),
		affiliate: of(split.n1Bps + split.n2Bps + split.n3Bps),
		dev: of(split.devBps),
		dao: of(split.daoBps),
		polPct: (10_000 - feeBps) / 100,
		feesPct: feeBps / 100,
	};
}

export interface Maturity {
	/** Earned USD toward the ROI cap, 0–100 (two decimals); 0 when the vault has no cap. */
	pct: number;
	matured: boolean;
}

/**
 * Live progress toward a vault's ROI cap (ported from kaly-vault useVaults). The checkpointed
 * `earnedUsd` only moves on claim, so the unclaimed KMT is added at the contract's own
 * `klcUsdPrice` — otherwise an unclaimed-but-capped vault would read 0%. `earned()` already caps
 * the KMT at the remaining USD; the clamp is defensive. All USD values share the contract's units.
 */
export function vaultMaturity(args: { earnedUsd: bigint; earnedKmtWei: bigint; klcUsdPrice: bigint; capUsd: bigint; maturedFlag: boolean }): Maturity {
	const { earnedUsd, earnedKmtWei, klcUsdPrice, capUsd, maturedFlag } = args;
	let live = earnedUsd + (earnedKmtWei * klcUsdPrice) / 10n ** 18n;
	if (capUsd > 0n && live > capUsd) live = capUsd;
	const pct = capUsd > 0n ? Number((live * 10_000n) / capUsd) / 100 : 0;
	return { pct, matured: maturedFlag || (capUsd > 0n && live >= capUsd) };
}
