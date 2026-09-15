'use client';

import dynamic from 'next/dynamic';
import { AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useDict } from '@/i18n/hooks';
import type { MultichainSwapInterfaceProps } from './MultichainSwapInterface';

function SwapLoadError() {
	const dict = useDict();
	return (
		<div className="flex min-h-[420px] items-center justify-center gap-2 rounded-2xl border border-danger/25 bg-danger/10 p-6 text-sm text-danger">
			<AlertTriangle className="size-4 shrink-0" />
			<span>{dict.common.error}</span>
		</div>
	);
}

// Client-only: the swap card reads wallet state that does not exist during SSR.
const MultichainSwapInterface = dynamic(
	() => import('./MultichainSwapInterface').catch(() => ({ default: SwapLoadError })),
	{
		ssr: false,
		loading: () => (
			<div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-line bg-surface">
				<LoadingSpinner size="lg" />
			</div>
		),
	},
);

export default function SwapInterfaceWrapper(props: MultichainSwapInterfaceProps) {
	return <MultichainSwapInterface {...props} />;
}
