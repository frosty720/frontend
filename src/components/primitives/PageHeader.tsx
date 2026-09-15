import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 className="font-display text-[26px] font-bold leading-tight sm:text-[28px]">{title}</h2>
				{subtitle && <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}
