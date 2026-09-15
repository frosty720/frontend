'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDict, useLocaleHref } from '@/i18n/hooks';
import { Pill } from './Pill';

export type ComingSoonKey = 'kusd' | 'lend' | 'card';

export function ComingSoon({ pageKey }: { pageKey: ComingSoonKey }) {
	const dict = useDict();
	const href = useLocaleHref();
	const copy = dict.comingSoon[pageKey];

	return (
		<section className="mx-auto max-w-2xl rounded-2xl border border-line bg-gradient-to-br from-surface-alt to-surface p-8 text-center sm:p-12">
			<span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-gold-soft text-gold">
				<Sparkles className="size-7" />
			</span>
			<Pill tone="gold">{dict.common.comingSoon}</Pill>
			<h2 className="mt-4 font-display text-3xl font-bold">{copy.title}</h2>
			<p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
			<Button asChild variant="secondary" className="mt-7">
				<Link href={href('/')}>
					<ArrowLeft />
					{dict.common.backToDashboard}
				</Link>
			</Button>
		</section>
	);
}
