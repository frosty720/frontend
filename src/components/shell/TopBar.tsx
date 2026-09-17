'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { CHAIN_METADATA, CHAIN_IDS } from '@/config/chains';
import { ClientOnlyConnectWallet } from '@/components/wallet/ClientOnlyConnectWallet';
import { useDict } from '@/i18n/hooks';
import { interpolate } from '@/i18n/interpolate';
import { splitLocale } from '@/i18n/locale-path';
import { BuyCryptoButton } from './BuyCryptoButton';
import { ChainBadge } from './ChainBadge';
import { LangSwitcher } from './LangSwitcher';
import { activeNavKey } from './nav';

interface TopBarProps {
	onMenu: () => void;
}

export function TopBar({ onMenu }: TopBarProps) {
	const dict = useDict();
	const key = activeNavKey(splitLocale(usePathname() ?? '/').path);
	const page = key ? dict.pages[key] : dict.pages.notFound;
	// Name the network the wallet is actually on; the crumb used to say KalyChain everywhere.
	const { isConnected } = useAccount();
	const chainId = useChainId();
	const chainName = (isConnected && CHAIN_METADATA[chainId]?.name) || CHAIN_METADATA[CHAIN_IDS.KALYCHAIN].name;

	return (
		<header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/70 px-4 py-3.5 backdrop-blur-md sm:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<button
					type="button"
					aria-label={dict.shell.menu}
					onClick={onMenu}
					className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface text-cream desk:hidden"
				>
					<Menu className="size-5" />
				</button>
				<div className="min-w-0">
					<h1 className="truncate font-display text-[17px] font-bold leading-tight">{page.title}</h1>
					<p className="truncate text-[12.5px] text-muted-deep">{key === 'dashboard' || !key ? page.subtitle : interpolate(dict.shell.crumb, { chain: chainName })}</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2.5">
				<BuyCryptoButton />
				<LangSwitcher />
				<span className="hidden sm:inline-flex">
					<ChainBadge />
				</span>
				<ClientOnlyConnectWallet />
			</div>
		</header>
	);
}
