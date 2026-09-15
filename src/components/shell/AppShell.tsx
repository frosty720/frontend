'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Sidebar + sticky top bar + footer. Mounted once in app/[locale]/layout.tsx. */
export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Sidebar open={open} onClose={() => setOpen(false)} />
			{open && (
				<div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/60 desk:hidden" />
			)}
			<div className="flex min-h-screen flex-col desk:pl-64">
				<TopBar onMenu={() => setOpen(true)} />
				<main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6">{children}</main>
				<Footer />
			</div>
		</div>
	);
}
