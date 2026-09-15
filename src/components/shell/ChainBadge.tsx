'use client';

import { useAccount, useChainId } from 'wagmi';
import { CHAIN_IDS } from '@/config/chains';
import { cn } from '@/lib/utils';
import { useDict } from '@/i18n/hooks';

/** Display-only network indicator. Add-network flows live in CutoverNotice. */
export function ChainBadge() {
	const dict = useDict();
	const { isConnected } = useAccount();
	const chainId = useChainId();
	const ok = !isConnected || chainId === CHAIN_IDS.KALYCHAIN;

	return (
		<span
			className={cn(
				'inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold',
				ok ? 'text-cream' : 'text-gold-light',
			)}
		>
			<span className={cn('size-2 rounded-full', ok ? 'bg-success' : 'bg-gold')} aria-hidden />
			{ok ? dict.shell.chainOk : dict.shell.chainWrong}
		</span>
	);
}
