/**
 * EN is the source of truth; FR must mirror it exactly. A missing key would render
 * `undefined` in the UI, an empty string would render nothing, and a placeholder that
 * exists in one language but not the other would leak `{name}` into the page.
 */
import { describe, it, expect } from 'vitest';
import en from '../dictionaries/en';
import fr from '../dictionaries/fr';

type Tree = { [k: string]: string | Tree };

function leaves(node: Tree, prefix = ''): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const [k, v] of Object.entries(node)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (typeof v === 'string') out.push([key, v]);
		else out.push(...leaves(v, key));
	}
	return out;
}

const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();

describe('dictionaries', () => {
	const enLeaves = leaves(en as unknown as Tree);
	const frLeaves = leaves(fr as unknown as Tree);
	const frMap = new Map(frLeaves);

	it('FR exposes exactly the EN key set', () => {
		expect(frLeaves.map(([k]) => k).sort()).toEqual(enLeaves.map(([k]) => k).sort());
	});

	it('no string is empty in either locale', () => {
		const empty = [...enLeaves, ...frLeaves].filter(([, v]) => v.trim() === '').map(([k]) => k);
		expect(empty).toEqual([]);
	});

	it('every key uses the same placeholders in both locales', () => {
		const mismatched = enLeaves
			.filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(frMap.get(k) ?? '')))
			.map(([k]) => k);
		expect(mismatched).toEqual([]);
	});

	it('never mentions the dropped V4 label', () => {
		const hits = [...enLeaves, ...frLeaves].filter(([, v]) => /\bV4\b/.test(v)).map(([k]) => k);
		expect(hits).toEqual([]);
	});

	it('has the namespaces the shell depends on', () => {
		for (const ns of ['meta', 'nav', 'pages', 'shell', 'common', 'dashboard', 'comingSoon', 'footer'] as const) {
			expect(en[ns], ns).toBeDefined();
		}
		for (const key of ['dashboard', 'swap', 'bridge', 'vaults', 'kusd', 'pools', 'farm', 'stake', 'launchpad', 'lend', 'card'] as const) {
			expect(en.nav[key], `nav.${key}`).toBeTruthy();
			expect(en.pages[key].title, `pages.${key}`).toBeTruthy();
		}
	});
});
