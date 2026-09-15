'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALES, LOCALE_LABEL } from '@/i18n/config';
import { splitLocale, withLocale } from '@/i18n/locale-path';
import { useDict, useLocale } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

export function LangSwitcher() {
	const dict = useDict();
	const current = useLocale();
	const { path } = splitLocale(usePathname() ?? '/');

	return (
		<div
			role="group"
			aria-label={dict.shell.language}
			className="inline-flex rounded-[10px] border border-line bg-surface-hi p-[3px]"
		>
			{LOCALES.map((locale) => (
				<Link
					key={locale}
					href={withLocale(locale, path)}
					hrefLang={locale}
					aria-current={locale === current ? 'true' : undefined}
					title={LOCALE_LABEL[locale]}
					className={cn(
						'rounded-lg px-3 py-1.5 text-[13px] font-bold uppercase transition-colors',
						locale === current ? 'bg-gold text-on-gold' : 'text-muted-foreground hover:text-cream',
					)}
				>
					{locale}
				</Link>
			))}
		</div>
	);
}
