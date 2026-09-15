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
