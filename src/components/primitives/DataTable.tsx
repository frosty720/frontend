import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
	key: string;
	header: ReactNode;
	align?: 'left' | 'right';
	className?: string;
	cell: (row: T) => ReactNode;
}

export function DataTable<T>({
	columns,
	rows,
	rowKey,
	empty,
}: {
	columns: Column<T>[];
	rows: T[];
	rowKey: (row: T) => string;
	empty: ReactNode;
}) {
	if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">{empty}</div>;
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[640px] text-sm">
				<thead>
					<tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted-deep">
						{columns.map((c) => (
							<th key={c.key} className={cn('px-3 py-2.5 font-semibold', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
								{c.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={rowKey(row)} className="border-b border-line last:border-b-0 hover:bg-surface-alt/60">
							{columns.map((c) => (
								<td key={c.key} className={cn('px-3 py-4 align-middle', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
									{c.cell(row)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
