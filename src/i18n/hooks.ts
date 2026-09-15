'use client';

import { useCallback, useMemo } from 'react';
import { useDictionaryContext } from './DictionaryProvider';
import { makeFormat, type Formatter } from './format';
import { withLocale } from './locale-path';
import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';

export function useDict(): Dictionary {
	return useDictionaryContext().dict;
}

export function useLocale(): Locale {
	return useDictionaryContext().locale;
}

/** Prefix an internal href for the active locale: `href('/pools')` → `/pools` (EN) or `/fr/pools`. */
export function useLocaleHref(): (path: string) => string {
	const locale = useLocale();
	return useCallback((path: string) => withLocale(locale, path), [locale]);
}

export function useFormat(): Formatter {
	const locale = useLocale();
	return useMemo(() => makeFormat(locale), [locale]);
}
