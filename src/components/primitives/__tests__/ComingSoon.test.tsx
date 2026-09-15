/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

vi.mock('next/link', () => ({
	default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { ComingSoon } from '../ComingSoon';

const KEYS = ['kusd', 'lend', 'card'] as const;

describe('ComingSoon', () => {
	afterEach(cleanup);

	it.each(KEYS)('renders EN copy and a back link for %s', (key) => {
		render(
			<DictionaryProvider dict={en} locale="en">
				<ComingSoon pageKey={key} />
			</DictionaryProvider>,
		);
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(en.comingSoon[key].title);
		expect(screen.getByText(en.comingSoon[key].body)).toBeTruthy();
		expect(screen.getByText(en.common.comingSoon)).toBeTruthy();
		expect(screen.getByText(en.common.backToDashboard).closest('a')?.getAttribute('href')).toBe('/');
	});

	it.each(KEYS)('renders FR copy with a prefixed back link for %s', (key) => {
		render(
			<DictionaryProvider dict={fr} locale="fr">
				<ComingSoon pageKey={key} />
			</DictionaryProvider>,
		);
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(fr.comingSoon[key].title);
		expect(screen.getByText(fr.common.backToDashboard).closest('a')?.getAttribute('href')).toBe('/fr');
	});
});
