'use client';

import { usePathname } from 'next/navigation';
import { useAccount, useChainId } from 'wagmi';
import { CHAIN_METADATA } from '@/config/chains';
import { useDict } from '@/i18n/hooks';
import { splitLocale } from '@/i18n/locale-path';
import { cn } from '@/lib/utils';
import { isChainOkForPage } from '@/utils/pageChains';
import { activeNavKey } from './nav';

/**
 * Display-only network indicator. It names the connected network and only warns when the page
 * cannot be used on it — bridging from Arbitrum, or swapping on BSC, is not a wrong network.
 * Add-network flows live in CutoverNotice.
 */
export function ChainBadge() {
	const dict = useDict();
	const { isConnected } = useAccount();
	const chainId = useChainId();
	const page = activeNavKey(splitLocale(usePathname() ?? '/').path);
	const ok = !isConnected || isChainOkForPage(page, chainId);
	const name = CHAIN_METADATA[chainId]?.name;

	return (
		<span
			className={cn(
				'inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold',
				ok ? 'text-cream' : 'text-gold-light',
			)}
		>
			<span className={cn('size-2 rounded-full', ok ? 'bg-success' : 'bg-gold')} aria-hidden />
			{ok ? (name ?? dict.shell.chainOk) : dict.shell.chainWrong}
		</span>
	);
}
