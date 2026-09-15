import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'gold' | 'success' | 'info' | 'violet' | 'muted' | 'danger';

const TONES: Record<PillTone, string> = {
	gold: 'bg-gold-soft text-gold-light',
	success: 'bg-success/15 text-success',
	info: 'bg-info/15 text-info',
	violet: 'bg-violet/15 text-violet',
	muted: 'bg-surface-hi text-muted-foreground',
	danger: 'bg-danger/15 text-danger',
};

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]',
				TONES[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
