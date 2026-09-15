'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Locale } from './config';
import type { Dictionary } from './dictionaries/en';

export interface DictionaryContextValue {
	dict: Dictionary;
	locale: Locale;
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

export function DictionaryProvider({ dict, locale, children }: DictionaryContextValue & { children: ReactNode }) {
	return <DictionaryContext.Provider value={{ dict, locale }}>{children}</DictionaryContext.Provider>;
}

export function useDictionaryContext(): DictionaryContextValue {
	const value = useContext(DictionaryContext);
	if (!value) throw new Error('useDict/useLocale must be used inside <DictionaryProvider>');
	return value;
}
