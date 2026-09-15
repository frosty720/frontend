export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABEL: Record<Locale, string> = {
	en: 'English',
	fr: 'Français',
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
	en: 'en',
	fr: 'fr',
};

/** BCP-47 tags for Intl formatting. */
export const NUMBER_LOCALE: Record<Locale, string> = {
	en: 'en-US',
	fr: 'fr-FR',
};
