import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { withLocale } from '@/i18n/locale-path';

/** /pools/browse was the old list URL; the list now lives at /pools. */
export default async function PoolsBrowseRedirect({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	redirect(withLocale(isLocale(locale) ? locale : DEFAULT_LOCALE, '/pools'));
}
