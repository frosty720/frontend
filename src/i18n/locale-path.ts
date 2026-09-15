import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

/** Split `/fr/pools/add` into `{ locale: 'fr', path: '/pools/add' }`; unprefixed paths are EN. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
	const [, first = '', ...rest] = pathname.split('/');
	if (isLocale(first)) {
		const joined = `/${rest.join('/')}`;
		return { locale: first, path: joined === '/' ? '/' : joined.replace(/\/$/, '') };
	}
	return { locale: DEFAULT_LOCALE, path: pathname === '' ? '/' : pathname };
}

/** Prefix an internal path for a locale. EN stays unprefixed. */
export function withLocale(locale: Locale, path: string): string {
	const clean = path.startsWith('/') ? path : `/${path}`;
	if (locale === DEFAULT_LOCALE) return clean;
	return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

export type LocaleRoute =
	| { kind: 'next' }
	| { kind: 'redirect'; pathname: string }
	| { kind: 'rewrite'; pathname: string };

/**
 * Middleware decision: EN is served at the site root; other locales are prefixed.
 * `/en/*` redirects to the unprefixed canonical URL; unprefixed paths are rewritten
 * (invisibly) into the `/en` tree that `app/[locale]` renders.
 */
export function resolveLocalePath(pathname: string): LocaleRoute {
	const { locale, path } = splitLocale(pathname);
	const prefixed = pathname === `/${locale}` || pathname.startsWith(`/${locale}/`);
	if (locale !== DEFAULT_LOCALE) return { kind: 'next' };
	if (prefixed) return { kind: 'redirect', pathname: path };
	return { kind: 'rewrite', pathname: path === '/' ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${path}` };
}
