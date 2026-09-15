import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
	default: 'text-cream',
	gold: 'text-gold',
	success: 'text-success',
} as const;

export function StatCard({
	label,
	value,
	hint,
	tone = 'default',
	source,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
	tone?: keyof typeof TONES;
	source?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('rounded-2xl border border-line bg-surface p-5', className)}>
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-deep">{label}</div>
			<div className={cn('mt-2 font-display text-[28px] font-bold leading-none sm:text-[32px]', TONES[tone])}>{value}</div>
			{hint && <div className="mt-2 text-[13px] text-muted-foreground">{hint}</div>}
			{source && <div className="mt-2 text-[11.5px] text-muted-deep">{source}</div>}
		</div>
	);
}
