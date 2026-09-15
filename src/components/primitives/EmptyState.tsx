import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			{Icon && (
				<span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-surface-alt text-muted-foreground">
					<Icon className="size-5" />
				</span>
			)}
			<div className="font-semibold">{title}</div>
			{body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
