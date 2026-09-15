import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({
	title,
	action,
	children,
	className,
	bodyClassName,
}: {
	title?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}) {
	return (
		<section className={cn('rounded-2xl border border-line bg-surface p-5 sm:p-6', className)}>
			{(title || action) && (
				<header className="mb-4 flex items-center justify-between gap-3">
					{title && <h3 className="font-display text-lg font-semibold">{title}</h3>}
					{action}
				</header>
			)}
			<div className={bodyClassName}>{children}</div>
		</section>
	);
}
