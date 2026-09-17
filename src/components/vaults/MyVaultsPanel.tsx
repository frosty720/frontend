'use client';

import { useState } from 'react';
import { Gift, Loader2, Vault } from 'lucide-react';
import { ConnectPrompt } from '@/components/primitives/ConnectPrompt';
import { Panel } from '@/components/primitives/Panel';
import { Pill } from '@/components/primitives/Pill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useClaimVaults } from '@/hooks/vaults/useClaimVaults';
import { useMyVaults } from '@/hooks/vaults/useMyVaults';
import { describeError } from '@/i18n/errorText';
import { useDict, useFormat } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';

const CLAIM_ALL = 'all';

/** "My vaults": the wallet's vaults with claimable KMT and maturity, claimed in-app with RewardsPool.claimMany. */
export default function MyVaultsPanel({ address, kmtPrice }: { address: string | undefined; kmtPrice: number | null }) {
	const dict = useDict();
	const fmt = useFormat();
	const toast = useToast();
	const v = dict.vaults;
	const vd = dict.vaultDetails;
	const va = dict.vaultApp;
	const { data: vaults = [], isLoading } = useMyVaults(address);
	const claimVaults = useClaimVaults();
	/** Vault id being claimed, CLAIM_ALL, or null when idle. */
	const [claiming, setClaiming] = useState<string | null>(null);

	if (!address) return <ConnectPrompt />;

	const claimableIds = vaults.filter((vault) => vault.earnedWei > 0n).map((vault) => vault.id);

	const claim = async (ids: bigint[], key: string) => {
		setClaiming(key);
		try {
			await claimVaults(ids);
			toast.success(vd.claimDone);
		} catch (error) {
			toast.error(vd.claimFailed, describeError(error, dict));
		} finally {
			setClaiming(null);
		}
	};

	let body;
	if (isLoading) {
		body = <Skeleton height={72} className="w-full" />;
	} else if (vaults.length === 0) {
		body = <p className="text-sm text-muted-foreground">{v.myEmpty}</p>;
	} else {
		body = (
			<ul className="space-y-3">
				{vaults.map((vault) => {
					const key = vault.id.toString();
					return (
						<li key={key} className="rounded-xl border border-line bg-surface-alt px-4 py-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<span className="flex min-w-0 items-center gap-3">
									<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-violet/40 text-cream">
										<Vault className="size-5" aria-hidden />
									</span>
									<span className="min-w-0">
										<span className="flex items-center gap-2 font-semibold text-cream">
											<span className="truncate">{interpolate(v.vaultName, { tier: vault.tierName, id: key })}</span>
											{vault.matured && <Pill tone="muted">{va.matured}</Pill>}
										</span>
										<span className="block truncate text-[12.5px] text-muted-foreground">
											{interpolate(v.invested, { amount: fmt.usd(vault.priceUsd, { decimals: 0 }), apr: fmt.pct(vault.aprPct, 0) })}
										</span>
									</span>
								</span>
								<span className="flex items-center gap-3">
									<span className="text-right">
										<span className="block font-semibold tabular-nums text-success">
											{interpolate(v.claimable, { amount: `${fmt.number(vault.claimableKmt, { maximumFractionDigits: 2 })} KMT` })}
										</span>
										{kmtPrice !== null && <span className="block text-[12px] text-muted-deep">≈ {fmt.usd(vault.claimableKmt * kmtPrice)}</span>}
									</span>
									<Button
										size="sm"
										variant="secondary"
										disabled={claiming !== null || vault.earnedWei === 0n}
										onClick={() => claim([vault.id], key)}
									>
										{claiming === key ? <Loader2 className="animate-spin" aria-hidden /> : <Gift aria-hidden />}
										{claiming === key ? vd.claiming : v.claim}
									</Button>
								</span>
							</div>
							<div className="mt-3">
								<div className="flex items-center justify-between text-[12px] text-muted-foreground">
									<span>{va.maturity}</span>
									<span className="tabular-nums">{fmt.pct(vault.maturityPct, 2)}</span>
								</div>
								<div
									role="progressbar"
									aria-label={va.maturity}
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={Math.min(vault.maturityPct, 100)}
									className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hi"
								>
									<div
										className={cn('h-full rounded-full', vault.matured ? 'bg-muted-deep' : 'bg-gold')}
										style={{ width: `${Math.min(vault.maturityPct, 100)}%` }}
									/>
								</div>
								{vault.matured && <p className="mt-2 text-[12px] text-muted-deep">{va.buyAgain}</p>}
							</div>
						</li>
					);
				})}
			</ul>
		);
	}

	const action =
		claimableIds.length > 1 ? (
			<Button size="sm" disabled={claiming !== null} onClick={() => claim(claimableIds, CLAIM_ALL)}>
				{claiming === CLAIM_ALL ? <Loader2 className="animate-spin" aria-hidden /> : <Gift aria-hidden />}
				{claiming === CLAIM_ALL ? vd.claiming : vd.claimAll}
			</Button>
		) : undefined;

	return (
		<Panel title={v.myTitle} action={action}>
			{body}
		</Panel>
	);
}
