/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import type { Locale } from '@/i18n/config';
import { CHAIN_IDS } from '@/config/chains';

let mockPathname = '/';
let mockAccount = { isConnected: false };
let mockChainId: number = CHAIN_IDS.KALYCHAIN;

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
vi.mock('wagmi', () => ({ useAccount: () => mockAccount, useChainId: () => mockChainId }));
vi.mock('next/link', () => ({
	default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
		<a href={href} {...rest}>{children}</a>
	),
}));
vi.mock('next/image', () => ({
	default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({
	ClientOnlyConnectWallet: () => <button>connect-stub</button>,
}));
vi.mock('@/components/onramp', () => ({
	AlchemyPayWidget: ({ defaultCrypto, defaultNetwork }: { defaultCrypto: string; defaultNetwork: string }) => (
		<div data-testid="onramp-widget">{`${defaultCrypto}@${defaultNetwork}`}</div>
	),
}));

import { AppShell } from '../AppShell';

function renderShell(locale: Locale = 'en', pathname = '/') {
	mockPathname = locale === 'fr' ? (pathname === '/' ? '/fr' : `/fr${pathname}`) : pathname;
	return render(
		<DictionaryProvider dict={locale === 'fr' ? fr : en} locale={locale}>
			<AppShell>
				<p>page-body</p>
			</AppShell>
		</DictionaryProvider>,
	);
}

describe('AppShell', () => {
	beforeEach(() => {
		mockAccount = { isConnected: false };
		mockChainId = CHAIN_IDS.KALYCHAIN;
	});
	afterEach(cleanup);

	it('renders the page body, every nav label, and no V4 tag', () => {
		const { container } = renderShell();
		expect(screen.getByText('page-body')).toBeTruthy();
		const nav = screen.getByRole('navigation');
		for (const label of Object.values(en.nav)) expect(within(nav).getByText(label)).toBeTruthy();
		expect(container.textContent).not.toMatch(/\bV4\b/);
	});

	it('highlights the active item, including nested routes', () => {
		renderShell('en', '/launchpad/0xabc');
		const active = screen.getByRole('navigation').querySelector('[aria-current="page"]');
		expect(active?.textContent).toContain(en.nav.launchpad);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en.pages.launchpad.title);
	});

	it('shows a Soon pill on exactly the three Coming Soon items', () => {
		renderShell();
		expect(within(screen.getByRole('navigation')).getAllByText(en.shell.soon)).toHaveLength(3);
	});

	it('opens and closes the mobile drawer', () => {
		renderShell();
		const aside = screen.getByRole('complementary');
		expect(aside.className).toContain('-translate-x-full');
		fireEvent.click(screen.getByLabelText(en.shell.menu));
		expect(aside.className).not.toContain('-translate-x-full');
		expect(aside.className).toMatch(/(^|\s)translate-x-0(\s|$)/);
		fireEvent.click(screen.getByLabelText(en.shell.closeMenu));
		expect(aside.className).toContain('-translate-x-full');
	});

	it('prefixes links and copy for FR', () => {
		renderShell('fr', '/swaps');
		const nav = screen.getByRole('navigation');
		expect(within(nav).getByText(fr.nav.pools).closest('a')?.getAttribute('href')).toBe('/fr/pools');
		expect(within(nav).getByText(fr.nav.dashboard).closest('a')?.getAttribute('href')).toBe('/fr');
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(fr.pages.swap.title);
	});

	it('names the connected network, and only warns where the page cannot be used on it', () => {
		mockAccount = { isConnected: true };

		// An unknown chain is wrong everywhere.
		mockChainId = 1;
		renderShell();
		expect(screen.getByText(en.shell.chainWrong)).toBeTruthy();
		cleanup();

		mockChainId = CHAIN_IDS.KALYCHAIN;
		renderShell();
		expect(screen.getByText('KalyChain')).toBeTruthy();
		cleanup();

		// Arbitrum is what the bridge is for, and swaps run there too — not a wrong network.
		mockChainId = CHAIN_IDS.ARBITRUM;
		renderShell('en', '/bridge');
		expect(screen.getByText('Arbitrum One')).toBeTruthy();
		expect(screen.queryByText(en.shell.chainWrong)).toBeNull();
		cleanup();

		renderShell('en', '/swaps');
		expect(screen.getByText('Arbitrum One')).toBeTruthy();
		cleanup();

		// The vaults read KalyChain contracts, so there it is wrong.
		renderShell('en', '/vaults');
		expect(screen.getByText(en.shell.chainWrong)).toBeTruthy();
	});

	it('says nothing about the network before a wallet connects', () => {
		mockAccount = { isConnected: false };
		mockChainId = CHAIN_IDS.ARBITRUM;
		renderShell('en', '/vaults');
		expect(screen.queryByText(en.shell.chainWrong)).toBeNull();
	});

	it('opens the card on-ramp for KMT on KalyChain from the top bar', () => {
		renderShell('en', '/pools');
		const header = screen.getByRole('banner');
		expect(screen.queryByTestId('onramp-widget')).toBeNull();
		fireEvent.click(within(header).getByRole('button', { name: en.shell.buyWithCard }));
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByTestId('onramp-widget').textContent).toBe('KMT@KALYCHAIN');
	});

	it('labels the on-ramp button in FR', () => {
		renderShell('fr', '/swaps');
		expect(within(screen.getByRole('banner')).getByRole('button', { name: fr.shell.buyWithCard })).toBeTruthy();
	});
});
