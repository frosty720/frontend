/**
 * @vitest-environment jsdom
 *
 * The Vaults page hosts the whole Vaults app in three tabs: Vaults (stats + tiers + POL, Mint opens
 * the in-app buy dialog), My vaults and Affiliate. ?tab= deep-links a tab, ?ref= reaches the dialog.
 */
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import type { VaultTier } from '@/hooks/vaults/useVaultStats';

const REFERRER = '0x2222222222222222222222222222222222222222';
const STARTER: VaultTier = { index: 0, name: 'Starter', priceUsd: 50, aprPct: 30, capBps: 15_000, active: true };
const RETIRED: VaultTier = { index: 1, name: 'Retired', priceUsd: 100, aprPct: 40, capBps: 0, active: false };
let search = new URLSearchParams();
let account: string | undefined;
let dialogProps: { tier: VaultTier | null; initialReferrer?: string; onViewMyVaults: () => void } | null = null;

vi.mock('next/navigation', () => ({ useSearchParams: () => search }));
vi.mock('wagmi', () => ({ useAccount: () => ({ address: account }) }));
vi.mock('@/hooks/useTokenLists', () => ({ useTokenLists: () => ({ tokens: [] }) }));
vi.mock('@/hooks/useTokenUsdPrices', () => ({ useTokenUsdPrices: () => ({}), usdPriceOf: () => 0.2 }));
vi.mock('@/hooks/vaults/useVaultStats', () => ({
	useVaultTiers: () => ({ data: { tiers: [STARTER, RETIRED], paused: false } }),
	useVaultProtocolStats: () => ({ data: { activeVaults: 3, tierCounts: new Map([[0, 3]]), claimedKmt: 1000 } }),
	usePolStats: () => ({ data: { totalUsd: 12_345, perPool: [] }, isError: false }),
}));
vi.mock('@/components/vaults/VaultPolPanel', () => ({ default: () => <div>pol-panel</div> }));
vi.mock('@/components/vaults/MyVaultsPanel', () => ({ default: () => <div>my-vaults-panel</div> }));
vi.mock('@/components/vaults/VaultPositionSummary', () => ({ default: () => <div>position-summary</div> }));
vi.mock('@/components/vaults/VaultAffiliatePanel', () => ({ default: () => <div>affiliate-panel</div> }));
vi.mock('@/components/vaults/VaultLeaderboard', () => ({ default: () => <div>leaderboard</div> }));
vi.mock('@/components/primitives/ConnectPrompt', () => ({ ConnectPrompt: () => <div>connect-stub</div> }));
vi.mock('@/components/vaults/BuyVaultDialog', () => ({
	default: (props: NonNullable<typeof dialogProps>) => {
		dialogProps = props;
		return props.tier ? <div>buying {props.tier.name}</div> : null;
	},
}));

import VaultsPage from '../page';

function renderPage() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<VaultsPage />
		</DictionaryProvider>,
	);
}

describe('Vaults page', () => {
	beforeEach(() => {
		search = new URLSearchParams();
		account = '0x1111111111111111111111111111111111111111';
		dialogProps = null;
	});
	afterEach(cleanup);

	it('opens on the Vaults tab with live stats and only active tiers', () => {
		renderPage();
		expect(screen.getByRole('tab', { name: en.vaultApp.tabs.vaults }).getAttribute('aria-selected')).toBe('true');
		expect(screen.getByText('$12,345')).toBeTruthy();
		expect(screen.getByText('$150')).toBeTruthy();
		expect(screen.getByText('$200.00')).toBeTruthy();
		expect(screen.getByText('Starter')).toBeTruthy();
		expect(screen.queryByText('Retired')).toBeNull();
		expect(screen.getByText('pol-panel')).toBeTruthy();
	});

	it('mints in-app: the tier’s button opens the buy dialog with the ?ref sponsor', () => {
		search = new URLSearchParams({ ref: REFERRER });
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: en.vaults.mint }));
		expect(screen.getByText('buying Starter')).toBeTruthy();
		expect(dialogProps?.initialReferrer).toBe(REFERRER);
	});

	it('drops a malformed ?ref instead of passing it on', () => {
		search = new URLSearchParams({ ref: '0xnope' });
		renderPage();
		expect(dialogProps?.initialReferrer).toBeUndefined();
	});

	it('deep-links My vaults and moves there after a purchase', () => {
		search = new URLSearchParams({ tab: 'my' });
		renderPage();
		expect(screen.getByText('position-summary')).toBeTruthy();
		expect(screen.getByText('my-vaults-panel')).toBeTruthy();
		cleanup();

		search = new URLSearchParams();
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: en.vaults.mint }));
		act(() => dialogProps!.onViewMyVaults());
		expect(screen.getByRole('tab', { name: en.vaultApp.tabs.my }).getAttribute('aria-selected')).toBe('true');
		expect(screen.getByText('my-vaults-panel')).toBeTruthy();
		expect(dialogProps?.tier).toBeNull();
	});

	it('asks to connect on My vaults and Affiliate without a wallet, but still shows the leaderboard', () => {
		account = undefined;
		search = new URLSearchParams({ tab: 'affiliate' });
		renderPage();
		expect(screen.getByText('connect-stub')).toBeTruthy();
		expect(screen.getByText('leaderboard')).toBeTruthy();
		expect(screen.queryByText('affiliate-panel')).toBeNull();
		cleanup();
		search = new URLSearchParams({ tab: 'my' });
		renderPage();
		expect(screen.getByText('connect-stub')).toBeTruthy();
		expect(screen.queryByText('my-vaults-panel')).toBeNull();
	});

	it('falls back to the Vaults tab for an unknown ?tab', () => {
		search = new URLSearchParams({ tab: 'admin' });
		renderPage();
		expect(screen.getByRole('tab', { name: en.vaultApp.tabs.vaults }).getAttribute('aria-selected')).toBe('true');
	});
});
