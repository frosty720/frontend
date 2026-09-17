'use client';

import { Plus, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VaultTier } from '@/hooks/vaults/useVaultStats';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';

/** Banner + APR colour cycle, as in the reference (blue, gold, violet, green). */
const TONES = [
	{ banner: 'from-info/80', text: 'text-info' },
	{ banner: 'from-gold', text: 'text-gold' },
	{ banner: 'from-violet', text: 'text-violet' },
	{ banner: 'from-success', text: 'text-success' },
] as const;

interface VaultTierCardProps {
	tier: VaultTier;
	paused: boolean;
	/** Live vaults in this tier (vault subgraph + on-chain tierOf); null while unknown. */
	minted?: number | null;
	/** Opens the in-app buy dialog for this tier. */
	onMint: (tier: VaultTier) => void;
}

/** One vault pack: APR, price, minted count, ROI cap, and Mint (opens the in-app buy dialog). */
export default function VaultTierCard({ tier, paused, minted = null, onMint }: VaultTierCardProps) {
	const dict = useDict();
	const fmt = useFormat();
	const v = dict.vaults;
	const vd = dict.vaultDetails;
	const tone = TONES[tier.index % TONES.length];

	return (
		<article className="overflow-hidden rounded-2xl border border-line bg-surface">
			<div className={cn('relative flex h-28 items-center justify-center bg-gradient-to-br to-surface', tone.banner)}>
				<Vault className="size-12 text-ink/80" aria-hidden />
				<span className="absolute left-3 top-3 rounded-full bg-ink/45 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-cream">
					{tier.name}
				</span>
			</div>
			<div className="p-4">
				<div className="flex items-baseline justify-between">
					<span className={cn('font-display text-2xl font-bold', tone.text)}>{fmt.pct(tier.aprPct, 0)}</span>
					<span className="text-xs text-muted-foreground">{v.apr}</span>
				</div>
				<div className="mt-1 text-[13px] text-muted-foreground">{interpolate(v.price, { amount: fmt.usd(tier.priceUsd, { decimals: 0 }) })}</div>
				{(minted !== null || tier.capBps > 0) && (
					<ul className="mt-3 space-y-1 border-t border-line pt-3 text-[12.5px] text-muted-foreground">
						{minted !== null && <li>{interpolate(vd.minted, { count: fmt.number(minted) })}</li>}
						{tier.capBps > 0 && <li>{interpolate(vd.roiCap, { pct: fmt.pct(tier.capBps / 100, 0) })}</li>}
					</ul>
				)}
				{paused ? (
					<Button variant="secondary" className="mt-4 w-full" disabled>
						{v.paused}
					</Button>
				) : (
					<Button variant="secondary" className="mt-4 w-full" onClick={() => onMint(tier)}>
						<Plus />
						{v.mint}
					</Button>
				)}
			</div>
		</article>
	);
}
