import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import '../globals.css';
import { WalletProviders } from '@/components/providers/WalletProviders';
import { ToastProvider } from '@/components/ui/toast';
import { CutoverNotice } from '@/components/wallet/CutoverNotice';
import { AppShell } from '@/components/shell/AppShell';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import { LOCALES, LOCALE_HTML_LANG, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';

const inter = localFont({
	src: [
		{ path: '../../fonts/Inter-Regular.ttf', weight: '400', style: 'normal' },
		{ path: '../../fonts/Inter-Medium.ttf', weight: '500', style: 'normal' },
		{ path: '../../fonts/Inter-SemiBold.ttf', weight: '600', style: 'normal' },
		{ path: '../../fonts/Inter-Bold.ttf', weight: '700', style: 'normal' },
	],
	variable: '--font-inter',
});

const display = localFont({
	src: '../../fonts/SpaceGrotesk-Variable.ttf',
	weight: '300 700',
	variable: '--font-space-grotesk',
});

interface LocaleParams {
	params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
	return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
	const { locale } = await params;
	if (!isLocale(locale)) return {};
	const dict = await getDictionary(locale);
	return {
		title: dict.meta.title,
		description: dict.meta.description,
		icons: {
			icon: [
				{ url: '/favicon.ico', sizes: '48x48' },
				{ url: '/icon.png', type: 'image/png', sizes: '512x512' },
			],
			apple: '/apple-icon.png',
		},
	};
}

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
};

export default async function LocaleLayout({ children, params }: LocaleParams & { children: React.ReactNode }) {
	const { locale } = await params;
	if (!isLocale(locale)) notFound();
	const dict = await getDictionary(locale);

	return (
		<html lang={LOCALE_HTML_LANG[locale]} className={`${inter.variable} ${display.variable}`}>
			<body suppressHydrationWarning>
				<DictionaryProvider dict={dict} locale={locale}>
					<ToastProvider>
						<WalletProviders>
							<AppShell>{children}</AppShell>
							<CutoverNotice />
						</WalletProviders>
					</ToastProvider>
				</DictionaryProvider>
			</body>
		</html>
	);
}
