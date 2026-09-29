'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Info, Loader2 } from 'lucide-react';
import { Panel } from '@/components/primitives/Panel';
import { Pill } from '@/components/primitives/Pill';
import { TokenAvatar } from '@/components/primitives/TokenAvatar';
import { Button } from '@/components/ui/button';
import { KUSD_ILKS, type IlkKey, type KusdIlk } from '@/config/kusd';
import type { IlkInfo } from '@/hooks/kusd/useVaults';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { cn } from '@/lib/utils';
import { BUNDLED_LOGOS } from '@/utils/tokenLogos';

/** The collateral type named by ?ilk= (dashboard links), else the first one. */
export function useIlkParam(): IlkKey {
	const param = useSearchParams().get('ilk');
	return KUSD_ILKS.find((i) => i.key === param)?.key ?? KUSD_ILKS[0].key;
}

/** A collateral token's mark: the bundled logo for its symbol, initials otherwise. */
export function CollateralIcon({ ilk, size = 32 }: { ilk: KusdIlk; size?: number }) {
	return <TokenAvatar symbol={ilk.symbol} logoURI={BUNDLED_LOGOS[ilk.symbol.toLowerCase()]} size={size} />;
}

/** kusd-ui's "Select Collateral" grid: logo, symbol and name — the ilk key ("WBTC-A") is a protocol ID, never a label. */
export function CollateralPicker({
	ilks,
	value,
	onChange,
	disabled,
}: {
	ilks: IlkInfo[] | undefined;
	value: IlkKey;
	onChange: (key: IlkKey) => void;
	disabled?: boolean;
}) {
	const dict = useDict();
	const b = dict.lend.borrow;
	return (
		<div role="radiogroup" aria-label={b.collateral} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			{KUSD_ILKS.map((cfg) => {
				const info = ilks?.find((i) => i.cfg.key === cfg.key);
				return (
					<button
						key={cfg.key}
						type="button"
						role="radio"
						aria-checked={value === cfg.key}
						disabled={disabled}
						onClick={() => onChange(cfg.key)}
						className={cn(
							'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3.5 text-center transition-colors disabled:opacity-50',
							value === cfg.key ? 'border-gold bg-gold-soft/40' : 'border-line bg-surface-alt hover:border-line-strong',
						)}
					>
						<CollateralIcon ilk={cfg} />
						<span className="font-display text-base font-bold">{cfg.symbol}</span>
						<span className="text-[11.5px] text-muted-foreground">{cfg.name}</span>
						{info && <Pill tone={info.open ? 'success' : 'muted'}>{info.open ? b.open : b.notOpen}</Pill>}
					</button>
				);
			})}
		</div>
	);
}

/** Shown while a collateral type has no debt ceiling or oracle price (every type, at the 3890 launch). */
export function ClosedNotice({ symbol }: { symbol: string }) {
	const dict = useDict();
	const l = dict.lend;
	return (
		<Panel>
			<div className="flex items-start gap-3">
				<Info className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
				<div>
					<h3 className="font-display font-semibold">{interpolate(l.closed.titleFor, { symbol })}</h3>
					<p className="mt-1 text-sm text-muted-foreground">{l.closed.body}</p>
				</div>
			</div>
		</Panel>
	);
}

/** A leftover that one click fixes (unlocked collateral, KUSD inside the protocol). */
export function Notice({
	title,
	body,
	actions,
}: {
	title: string;
	body: string;
	actions: { label: string; pending: boolean; disabled: boolean; onClick: () => void; variant?: 'default' | 'secondary' }[];
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-soft/30 px-4 py-3">
			<div className="min-w-0">
				<p className="font-semibold">{title}</p>
				<p className="text-[13px] text-muted-foreground">{body}</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{actions.map((a) => (
					<Button key={a.label} size="sm" variant={a.variant ?? 'default'} disabled={a.disabled} onClick={a.onClick}>
						{a.pending && <Loader2 className="animate-spin" aria-hidden />}
						{a.label}
					</Button>
				))}
			</div>
		</div>
	);
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'success' | 'danger' | 'warning' }) {
	return (
		<div className="rounded-xl border border-line bg-surface-alt p-3.5">
			<dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{label}</dt>
			<dd
				className={cn(
					'mt-1 font-semibold tabular-nums',
					tone === 'success' && 'text-success',
					tone === 'danger' && 'text-danger',
					tone === 'warning' && 'text-gold',
				)}
			>
				{value}
			</dd>
		</div>
	);
}

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'success' | 'danger' }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className={cn('font-semibold tabular-nums', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger')}>{value}</dd>
		</div>
	);
}

/** "Step 2 of 3: confirm in your wallet…" while a multi-transaction plan runs. */
export function StepHint({ step }: { step: { step: number; total: number } | null }) {
	const dict = useDict();
	if (!step) return null;
	return <p className="mt-3 text-[12.5px] text-muted-foreground">{interpolate(dict.lend.borrow.step, { step: step.step, total: step.total })}</p>;
}

/** Health label for a collateral ratio, against the ilk's liquidation ratio (the kusd-ui bands). */
export function ratioTone(ratio: number | null, liquidationPct: number): 'success' | 'warning' | 'danger' {
	if (ratio === null || ratio >= liquidationPct * 2) return 'success';
	return ratio >= liquidationPct ? 'warning' : 'danger';
}
