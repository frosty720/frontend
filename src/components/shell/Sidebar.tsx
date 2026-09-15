'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/primitives/Pill';
import { useDict, useLocaleHref } from '@/i18n/hooks';
import { splitLocale } from '@/i18n/locale-path';
import { NAV, DOCS_URL, activeNavKey } from './nav';

interface SidebarProps {
	open: boolean;
	onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
	const dict = useDict();
	const href = useLocaleHref();
	const active = activeNavKey(splitLocale(usePathname() ?? '/').path);

	return (
		<aside
			className={cn(
				'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-line bg-surface px-4 py-5 transition-transform duration-200 desk:translate-x-0',
				open ? 'translate-x-0' : '-translate-x-full',
			)}
		>
			<div className="flex items-center gap-2.5 px-2 pb-5">
				<Image src="/icons/KalySwapLogo.png" alt="" width={38} height={38} className="rounded-xl" priority />
				<span className="font-display text-xl font-bold tracking-tight">{dict.shell.brand}</span>
				<button
					type="button"
					aria-label={dict.shell.closeMenu}
					onClick={onClose}
					className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-cream desk:hidden"
				>
					<X className="size-5" />
				</button>
			</div>

			<nav className="flex flex-col gap-0.5">
				{NAV.map((item) => {
					const isActive = item.key === active;
					const Icon = item.icon;
					return (
						<Link
							key={item.key}
							href={href(item.href)}
							aria-current={isActive ? 'page' : undefined}
							onClick={onClose}
							className={cn(
								'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[14.5px] transition-colors',
								isActive
									? 'border-gold/35 bg-gold-soft font-bold text-gold-light'
									: 'border-transparent font-medium text-muted-foreground hover:bg-surface-alt hover:text-cream',
							)}
						>
							<Icon className="size-[18px] shrink-0" />
							<span className="flex-1">{dict.nav[item.key]}</span>
							{item.soon && <Pill tone="muted">{dict.shell.soon}</Pill>}
						</Link>
					);
				})}
			</nav>

			<div className="mt-5 rounded-2xl border border-line bg-surface-alt p-4">
				<div className="text-[13.5px] font-bold">{dict.shell.newTitle}</div>
				<div className="mb-2 mt-1 text-[12.5px] text-muted-foreground">{dict.shell.newBody}</div>
				<a
					href={DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="text-[13px] font-bold text-gold hover:text-gold-light"
				>
					{dict.shell.newCta}
				</a>
			</div>
		</aside>
	);
}
