import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { NAV, activeNavKey } from '../nav';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';

const APP = join(__dirname, '..', '..', '..', 'app', '[locale]');

describe('NAV', () => {
	it('lists the sidebar in the agreed order', () => {
		expect(NAV.map((i) => i.key)).toEqual([
			'dashboard', 'swap', 'bridge', 'vaults', 'kusd', 'pools', 'farm', 'stake', 'launchpad', 'lend', 'card',
		]);
	});

	it('marks exactly the three Coming Soon pages', () => {
		expect(NAV.filter((i) => i.soon).map((i) => i.key)).toEqual(['kusd', 'lend', 'card']);
	});

	it('has unique keys and hrefs', () => {
		expect(new Set(NAV.map((i) => i.key)).size).toBe(NAV.length);
		expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
	});

	it('every href has a page under app/[locale]', () => {
		const missing = NAV.filter((i) => !existsSync(join(APP, i.href === '/' ? '' : i.href, 'page.tsx'))).map((i) => i.href);
		expect(missing).toEqual([]);
	});

	it('every key has nav + page copy in both locales', () => {
		for (const { key } of NAV) {
			expect(en.nav[key]).toBeTruthy();
			expect(fr.nav[key]).toBeTruthy();
			expect(en.pages[key].title).toBeTruthy();
			expect(fr.pages[key].title).toBeTruthy();
		}
	});
});

describe('activeNavKey', () => {
	it('matches exact and nested paths', () => {
		expect(activeNavKey('/')).toBe('dashboard');
		expect(activeNavKey('/swaps')).toBe('swap');
		expect(activeNavKey('/pools/add')).toBe('pools');
		expect(activeNavKey('/launchpad/0xabc')).toBe('launchpad');
		expect(activeNavKey('/nope')).toBeNull();
	});
});
