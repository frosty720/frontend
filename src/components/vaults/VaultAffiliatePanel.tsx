'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Panel } from '@/components/primitives/Panel';
import { Pill, type PillTone } from '@/components/primitives/Pill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAddress } from '@/config/contracts';
import { useAffiliateStats, useVaultSponsor } from '@/hooks/vaults/useVaultAffiliate';
import { useDict, useFormat, useLocale } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { withLocale } from '@/i18n/locale-path';
import type { ActivityStatus } from '@/utils/vaultAffiliate';

const ACTIVITY_TONE: Record<ActivityStatus, PillTone> = {
	active: 'success',
	reduced: 'gold',
	suspended: 'danger',
	none: 'muted',
};

/** The wallet's referral link (?ref= prefills the buy dialog), sponsor, commissions and standing. */
export default function VaultAffiliatePanel({ address }: { address: `0x${string}` }) {
	const dict = useDict();
	const fmt = useFormat();
	const locale = useLocale();
	const a = dict.vaultApp.affiliate;
	const { data, isLoading, isError } = useAffiliateStats(address);
	const sponsor = useVaultSponsor(address);
	const [copied, setCopied] = useState(false);
	// window only exists after mount; the path alone renders on the server.
	const [origin, setOrigin] = useState('');
	useEffect(() => setOrigin(window.location.origin), []);
	const link = `${origin}${withLocale(locale, '/vaults')}?ref=${address}`;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard blocked: the link stays selectable.
		}
	};

	const sponsorLine = sponsor.data ? <span className="text-[12.5px] text-muted-foreground">{interpolate(a.sponsoredBy, { address: formatAddress(sponsor.data) })}</span> : undefined;

	return (
		<Panel title={a.title} action={sponsorLine} className="mb-5">
			<label htmlFor="vault-referral-link" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-deep">
				{a.linkLabel}
			</label>
			<div className="mt-1.5 flex items-stretch gap-2">
				<input
					id="vault-referral-link"
					readOnly
					value={link}
					onFocus={(event) => event.target.select()}
					className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-hi px-3 py-2 font-mono text-xs text-gold-light outline-none"
				/>
				<Button size="sm" variant="secondary" onClick={copy}>
					{copied ? <Check aria-hidden /> : <Copy aria-hidden />}
					{copied ? a.copied : a.copy}
				</Button>
			</div>

			{isLoading && (
				<div className="mt-5 grid grid-cols-3 gap-3">
					<Skeleton height={72} className="w-full" />
					<Skeleton height={72} className="w-full" />
					<Skeleton height={72} className="w-full" />
				</div>
			)}
			{isError && !isLoading && <p className="mt-5 text-sm text-danger">{a.error}</p>}

			{data && (
				<>
					<div className="mt-5 grid grid-cols-3 gap-3">
						<MiniStat label={a.referrals} value={fmt.number(data.directReferrals.length)} />
						<MiniStat label={a.downline} value={fmt.number(data.downlineCount)} />
						<MiniStat label={a.earned} value={fmt.usd(data.commissionUsd)} accent />
					</div>

					<div className="mt-3 rounded-xl border border-line bg-surface-alt p-4">
						<div className="flex items-center justify-between gap-3">
							<span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-deep">{a.rank}</span>
							<span className="text-sm font-semibold text-gold">
								{data.rank.current ? interpolate(a.rankValue, { name: data.rank.current.name, bonus: data.rank.current.bonusPct }) : a.noRank}
							</span>
						</div>
						{data.rank.next && (
							<>
								<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hi">
									<div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (data.sales / data.rank.next.minSales) * 100)}%` }} />
								</div>
								<p className="mt-1.5 text-[12px] text-muted-foreground">{interpolate(a.toNext, { n: data.rank.toNext, rank: data.rank.next.name })}</p>
							</>
						)}
						<div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-[12.5px]">
							<span className="text-muted-foreground">
								{a.loyalty} <span className="tabular-nums text-cream">×{fmt.number(data.loyalty, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
							</span>
							<span className="flex items-center gap-2 text-muted-foreground">
								{a.activityLabel}
								<Pill tone={ACTIVITY_TONE[data.activity]}>{a.activity[data.activity]}</Pill>
							</span>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
						<span>N1 <span className="tabular-nums text-cream">{fmt.usd(data.byLevel.l1)}</span></span>
						<span>N2 <span className="tabular-nums text-cream">{fmt.usd(data.byLevel.l2)}</span></span>
						<span>N3 <span className="tabular-nums text-cream">{fmt.usd(data.byLevel.l3)}</span></span>
					</div>

					{data.directReferrals.length > 0 && (
						<div className="mt-5">
							<p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-deep">{a.yourReferrals}</p>
							<div className="flex flex-wrap gap-2">
								{data.directReferrals.map((referral) => (
									<span key={referral} className="rounded-full border border-line bg-surface-alt px-2.5 py-1 font-mono text-xs text-muted-foreground">
										{formatAddress(referral)}
									</span>
								))}
							</div>
						</div>
					)}

					<p className="mt-5 text-[12px] leading-relaxed text-muted-deep">{a.footnote}</p>
				</>
			)}
		</Panel>
	);
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
	return (
		<div className="rounded-xl border border-line bg-surface-alt p-3 text-center">
			<div className={accent ? 'font-display text-xl font-bold tabular-nums text-gold' : 'font-display text-xl font-bold tabular-nums text-cream'}>{value}</div>
			<div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-deep">{label}</div>
		</div>
	);
}
