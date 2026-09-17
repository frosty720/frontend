/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import type { AffiliateStats, LeaderRow } from '@/utils/vaultAffiliate';

const ME = '0xaaaa00000000000000000000000000000000bbbb';
let stats: { data: AffiliateStats | undefined; isLoading: boolean; isError: boolean };
let board: { data: LeaderRow[] | undefined; isLoading: boolean; isError: boolean };
let sponsor: string | null = null;

vi.mock('@/hooks/vaults/useVaultAffiliate', () => ({
	useAffiliateStats: () => stats,
	useAffiliateLeaderboard: () => board,
	useVaultSponsor: () => ({ data: sponsor }),
}));

import VaultAffiliatePanel from '../VaultAffiliatePanel';
import VaultLeaderboard from '../VaultLeaderboard';

const STATS: AffiliateStats = {
	address: ME,
	directReferrals: ['0x1234000000000000000000000000000000005678'],
	sales: 20,
	downlineCount: 7,
	commissionUsd: 123.45,
	byLevel: { l1: 100, l2: 20, l3: 3.45 },
	rank: { current: { key: 'bronze', name: 'Bronze', minSales: 15, bonusPct: 5 }, next: { key: 'silver', name: 'Silver', minSales: 45, bonusPct: 12 }, toNext: 25 },
	loyalty: 1.2,
	activity: 'reduced',
};

function renderWith(node: React.ReactNode, locale: 'en' | 'fr' = 'en') {
	render(
		<DictionaryProvider dict={locale === 'fr' ? fr : en} locale={locale}>
			{node}
		</DictionaryProvider>,
	);
}

describe('VaultAffiliatePanel', () => {
	beforeEach(() => {
		stats = { data: STATS, isLoading: false, isError: false };
		sponsor = null;
	});
	afterEach(cleanup);

	it('builds the referral link on KalySwap’s own vaults page, locale-aware', () => {
		renderWith(<VaultAffiliatePanel address={ME} />);
		expect((screen.getByLabelText(en.vaultApp.affiliate.linkLabel) as HTMLInputElement).value).toBe(`${window.location.origin}/vaults?ref=${ME}`);
		cleanup();
		renderWith(<VaultAffiliatePanel address={ME} />, 'fr');
		expect((screen.getByLabelText(fr.vaultApp.affiliate.linkLabel) as HTMLInputElement).value).toBe(`${window.location.origin}/fr/vaults?ref=${ME}`);
	});

	it('shows referrals, downline, commissions by level, rank progress, loyalty and activity', () => {
		sponsor = '0x9999000000000000000000000000000000001111';
		renderWith(<VaultAffiliatePanel address={ME} />);
		expect(screen.getByText('Sponsored by 0x9999...1111')).toBeTruthy();
		expect(screen.getByText('7')).toBeTruthy();
		expect(screen.getByText('$123.45')).toBeTruthy();
		expect(screen.getByText('$3.45')).toBeTruthy();
		expect(screen.getByText('Bronze (+5%)')).toBeTruthy();
		expect(screen.getByText('25 more sales to Silver')).toBeTruthy();
		expect(screen.getByText('×1.2')).toBeTruthy();
		expect(screen.getByText(en.vaultApp.affiliate.activity.reduced)).toBeTruthy();
		expect(screen.getByText('0x1234...5678')).toBeTruthy();
	});

	it('says so when the affiliate data fails to load', () => {
		stats = { data: undefined, isLoading: false, isError: true };
		renderWith(<VaultAffiliatePanel address={ME} />);
		expect(screen.getByText(en.vaultApp.affiliate.error)).toBeTruthy();
	});
});

describe('VaultLeaderboard', () => {
	afterEach(cleanup);

	it('ranks rows in order and marks the connected wallet', () => {
		board = {
			data: [
				{ address: '0x1000000000000000000000000000000000000001', referrals: 4, commissionUsd: 500 },
				{ address: ME, referrals: 9, commissionUsd: 42.5 },
			],
			isLoading: false,
			isError: false,
		};
		renderWith(<VaultLeaderboard you={ME.toUpperCase().replace('0X', '0x')} />);
		const rows = screen.getAllByRole('row').slice(1);
		expect(within(rows[0]).getByText('1')).toBeTruthy();
		expect(within(rows[0]).getByText('$500.00')).toBeTruthy();
		expect(within(rows[1]).getByText('2')).toBeTruthy();
		expect(within(rows[1]).getByText(en.vaultApp.leaderboard.you)).toBeTruthy();
		expect(within(rows[0]).queryByText(en.vaultApp.leaderboard.you)).toBeNull();
	});

	it('shows the empty and error states', () => {
		board = { data: [], isLoading: false, isError: false };
		renderWith(<VaultLeaderboard />);
		expect(screen.getByText(en.vaultApp.leaderboard.empty)).toBeTruthy();
		cleanup();
		board = { data: undefined, isLoading: false, isError: true };
		renderWith(<VaultLeaderboard />);
		expect(screen.getByText(en.vaultApp.leaderboard.error)).toBeTruthy();
	});
});
