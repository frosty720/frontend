import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';

const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
	en: () => import('./dictionaries/en'),
	fr: () => import('./dictionaries/fr'),
};

/** Server-side: load one locale's copy. Only the requested locale ships to the client. */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
	const mod = await loaders[locale]();
	return mod.default;
}
