/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import type { VaultTier } from '@/hooks/vaults/useVaultStats';
import VaultTierCard from '../VaultTierCard';

const WHALE: VaultTier = { index: 7, name: 'Whale 100K', priceUsd: 100_000, aprPct: 140, capBps: 70_000, active: true };

const onMint = vi.fn();

function renderCard(paused: boolean, locale: 'en' | 'fr' = 'en', tier: VaultTier = WHALE, minted: number | null = 12) {
	render(
		<DictionaryProvider dict={locale === 'fr' ? fr : en} locale={locale}>
			<VaultTierCard tier={tier} paused={paused} minted={minted} onMint={onMint} />
		</DictionaryProvider>,
	);
}

describe('VaultTierCard', () => {
	afterEach(() => {
		cleanup();
		onMint.mockClear();
	});

	it('shows the on-chain tier name, APR and price', () => {
		renderCard(false);
		expect(screen.getByText('Whale 100K')).toBeTruthy();
		expect(screen.getByText('140%')).toBeTruthy();
		expect(screen.getByText('Price $100,000')).toBeTruthy();
	});

	it('shows how many are minted and the ROI cap from tierCapBps (bps → % of price)', () => {
		renderCard(false);
		expect(screen.getByText('Minted: 12')).toBeTruthy();
		expect(screen.getByText('Earns up to 700% of price')).toBeTruthy();
		cleanup();
		renderCard(false, 'en', { ...WHALE, capBps: 25_000 }, 0);
		expect(screen.getByText('Minted: 0')).toBeTruthy();
		expect(screen.getByText('Earns up to 250% of price')).toBeTruthy();
	});

	it('skips the ROI cap when it is unset and the minted count while it is unknown', () => {
		renderCard(false, 'en', { ...WHALE, capBps: 0 }, null);
		expect(screen.queryByText(/Earns up to/)).toBeNull();
		expect(screen.queryByText(/Minted/)).toBeNull();
		expect(screen.getByText(en.vaults.mint)).toBeTruthy();
	});

	it('mints in-app: the button hands its own tier to the buy dialog, with no external link', () => {
		const { container } = render(
			<DictionaryProvider dict={en} locale="en">
				<VaultTierCard tier={WHALE} paused={false} minted={12} onMint={onMint} />
			</DictionaryProvider>,
		);
		expect(container.querySelector('a')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: en.vaults.mint }));
		expect(onMint).toHaveBeenCalledWith(WHALE);
	});

	it('offers no mint while sales are paused', () => {
		renderCard(true);
		expect(screen.queryByText(en.vaults.mint)).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: en.vaults.paused }));
		expect(onMint).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: en.vaults.paused }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('uses the French copy and number format', () => {
		renderCard(false, 'fr', WHALE, 1_234);
		expect(screen.getByText(fr.vaults.mint)).toBeTruthy();
		expect(screen.getByText(/^Prix 100\s000\s\$US$/)).toBeTruthy();
		expect(screen.getByText(/^Frappés : 1\s234$/)).toBeTruthy();
		expect(screen.getByText('Rapporte jusqu’à 700% du prix')).toBeTruthy();
	});
});
