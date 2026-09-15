import {
	ArrowLeftRight,
	Coins,
	CreditCard,
	HandCoins,
	LayoutDashboard,
	Layers,
	Rocket,
	ShoppingBag,
	Shuffle,
	Sprout,
	Vault,
	type LucideIcon,
} from 'lucide-react';

export type NavKey =
	| 'dashboard'
	| 'swap'
	| 'bridge'
	| 'vaults'
	| 'kusd'
	| 'pools'
	| 'farm'
	| 'stake'
	| 'launchpad'
	| 'lend'
	| 'card';

export interface NavItem {
	key: NavKey;
	/** Locale-less path; run through useLocaleHref() before rendering. */
	href: string;
	icon: LucideIcon;
	/** Renders a "Soon" pill; the page is a ComingSoon placeholder. */
	soon?: true;
}

/** Single source of truth for the sidebar, page titles, and the nav guard test. */
export const NAV: readonly NavItem[] = [
	{ key: 'dashboard', href: '/', icon: LayoutDashboard },
	{ key: 'swap', href: '/swaps', icon: ArrowLeftRight },
	{ key: 'bridge', href: '/bridge', icon: Shuffle },
	{ key: 'vaults', href: '/vaults', icon: Vault },
	{ key: 'kusd', href: '/kusd', icon: ShoppingBag, soon: true },
	{ key: 'pools', href: '/pools', icon: Layers },
	{ key: 'farm', href: '/farm', icon: Sprout },
	{ key: 'stake', href: '/stake', icon: Coins },
	{ key: 'launchpad', href: '/launchpad', icon: Rocket },
	{ key: 'lend', href: '/lend', icon: HandCoins, soon: true },
	{ key: 'card', href: '/card', icon: CreditCard, soon: true },
];

/** Which nav item a locale-less path belongs to (nested routes resolve to their parent). */
export function activeNavKey(path: string): NavKey | null {
	if (path === '/') return 'dashboard';
	const hit = NAV.find((item) => item.href !== '/' && (path === item.href || path.startsWith(`${item.href}/`)));
	return hit?.key ?? null;
}

export const DOCS_URL = 'https://docs.kalychain.io';
