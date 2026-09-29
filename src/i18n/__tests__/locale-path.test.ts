import { describe, it, expect } from 'vitest';
import { splitLocale, withLocale, resolveLocalePath } from '../locale-path';
import { config } from '@/middleware';

describe('splitLocale', () => {
	it('treats an unprefixed path as the default locale', () => {
		expect(splitLocale('/swaps')).toEqual({ locale: 'en', path: '/swaps' });
		expect(splitLocale('/')).toEqual({ locale: 'en', path: '/' });
	});
	it('strips a known locale prefix', () => {
		expect(splitLocale('/fr/swaps')).toEqual({ locale: 'fr', path: '/swaps' });
		expect(splitLocale('/fr')).toEqual({ locale: 'fr', path: '/' });
		expect(splitLocale('/en/pools/add')).toEqual({ locale: 'en', path: '/pools/add' });
	});
	it('does not mistake a longer segment for a locale', () => {
		expect(splitLocale('/french')).toEqual({ locale: 'en', path: '/french' });
	});
});

describe('withLocale', () => {
	it('leaves EN unprefixed', () => {
		expect(withLocale('en', '/swaps')).toBe('/swaps');
		expect(withLocale('en', '/')).toBe('/');
	});
	it('prefixes FR', () => {
		expect(withLocale('fr', '/swaps')).toBe('/fr/swaps');
		expect(withLocale('fr', '/')).toBe('/fr');
		expect(withLocale('fr', 'swaps')).toBe('/fr/swaps');
	});
});

describe('resolveLocalePath (middleware)', () => {
	it('rewrites unprefixed paths to the EN tree', () => {
		expect(resolveLocalePath('/swaps')).toEqual({ kind: 'rewrite', pathname: '/en/swaps' });
		expect(resolveLocalePath('/')).toEqual({ kind: 'rewrite', pathname: '/en' });
	});
	it('redirects explicit /en to the canonical unprefixed URL', () => {
		expect(resolveLocalePath('/en/swaps')).toEqual({ kind: 'redirect', pathname: '/swaps' });
		expect(resolveLocalePath('/en')).toEqual({ kind: 'redirect', pathname: '/' });
	});
	it('passes FR through', () => {
		expect(resolveLocalePath('/fr/swaps')).toEqual({ kind: 'next' });
		expect(resolveLocalePath('/fr')).toEqual({ kind: 'next' });
	});
});

describe('middleware matcher', () => {
	// Next's matcher is path-to-regexp; the negative lookahead inside is a plain regex, so the
	// middleware's own pattern, anchored, is what actually decides which paths reach it.
	const matcher = new RegExp(`^${config.matcher[0]}$`);
	it('skips API, the fiat-ramp proxy, subgraph proxy, Next internals and files', () => {
		for (const p of [
			'/api/graphql',
			'/ramp-api/channels',
			'/ramp-api/deposits/0f1e2d3c-aaaa',
			'/subgraphs/name/v3-subgraph-kmt',
			'/_next/static/x.js',
			'/favicon.ico',
			'/icons/KalySwapLogo.png',
		]) {
			expect(matcher.test(p), p).toBe(false);
		}
	});
	it('matches page routes', () => {
		for (const p of ['/', '/swaps', '/fr/swaps', '/en', '/launchpad/0xabc', '/kusd', '/lend', '/fr/kusd']) {
			expect(matcher.test(p), p).toBe(true);
		}
	});
});
