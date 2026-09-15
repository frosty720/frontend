/**
 * @vitest-environment jsdom
 *
 * My vaults claims in-app: each vault claims its own id, "Claim all" claims every vault that has
 * something to claim in one claimMany, and a failed claim is reported, never shown as success.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import type { MyVault } from '@/hooks/vaults/useMyVaults';
import { TransactionRevertedError } from '@/utils/transactions';

const toast = { success: vi.fn(), error: vi.fn() };
const claimVaults = vi.fn(async (_ids: bigint[]) => '0xhash');
let vaults: MyVault[] = [];

vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/components/primitives/ConnectPrompt', () => ({ ConnectPrompt: () => <div>connect-stub</div> }));
vi.mock('@/hooks/vaults/useMyVaults', () => ({ useMyVaults: () => ({ data: vaults, isLoading: false }) }));
vi.mock('@/hooks/vaults/useClaimVaults', () => ({ useClaimVaults: () => claimVaults }));

import MyVaultsPanel from '../MyVaultsPanel';

const vault = (id: bigint, earnedKmt: number): MyVault => ({
	id,
	tier: 1,
	tierName: 'Basic',
	priceUsd: 100,
	aprPct: 30,
	claimableKmt: earnedKmt,
	earnedWei: BigInt(earnedKmt) * 10n ** 18n,
	matured: false,
});

function renderPanel(connected = true, dict = en, locale: 'en' | 'fr' = 'en') {
	render(
		<DictionaryProvider dict={dict} locale={locale}>
			<MyVaultsPanel address={connected ? '0xabc' : undefined} kmtPrice={0.2} />
		</DictionaryProvider>,
	);
}

describe('MyVaultsPanel', () => {
	beforeEach(() => {
		vaults = [];
		claimVaults.mockReset();
		claimVaults.mockImplementation(async () => '0xhash');
		toast.success.mockClear();
		toast.error.mockClear();
	});
	afterEach(cleanup);

	it('claims a single vault by its own id and toasts success', async () => {
		vaults = [vault(3n, 10), vault(8n, 0)];
		renderPanel();
		const buttons = screen.getAllByRole('button', { name: en.vaults.claim }) as HTMLButtonElement[];
		expect(buttons[1].disabled).toBe(true);
		fireEvent.click(buttons[0]);
		await waitFor(() => expect(toast.success).toHaveBeenCalledWith(en.vaultDetails.claimDone));
		expect(claimVaults).toHaveBeenCalledTimes(1);
		expect(claimVaults).toHaveBeenCalledWith([3n]);
		expect(screen.queryByRole('button', { name: en.vaultDetails.claimAll })).toBeNull();
	});

	it('offers Claim all with several claimable vaults and claims only those in one call', async () => {
		vaults = [vault(3n, 10), vault(5n, 0), vault(9n, 2)];
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: en.vaultDetails.claimAll }));
		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		expect(claimVaults).toHaveBeenCalledTimes(1);
		expect(claimVaults).toHaveBeenCalledWith([3n, 9n]);
	});

	it('reports a failed claim and re-enables the buttons', async () => {
		vaults = [vault(3n, 10)];
		claimVaults.mockImplementation(async () => {
			throw new TransactionRevertedError('0xhash', 'claimVaultRewards');
		});
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: en.vaults.claim }));
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(en.vaultDetails.claimFailed, 'Claim vault rewards failed: the transaction was reverted on-chain.'),
		);
		expect(toast.success).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: en.vaults.claim }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('asks to connect when there is no wallet', () => {
		renderPanel(false);
		expect(screen.getByText('connect-stub')).toBeTruthy();
		expect(claimVaults).not.toHaveBeenCalled();
	});

	it('shows the failure toast in French when the reader is on the French dictionary', async () => {
		vaults = [vault(3n, 10)];
		claimVaults.mockImplementation(async () => {
			throw Object.assign(new Error('user rejected'), { code: 4001 });
		});
		renderPanel(true, fr, 'fr');
		fireEvent.click(screen.getByRole('button', { name: fr.vaults.claim }));
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith(fr.vaultDetails.claimFailed, fr.errors.userRejected));
		expect(toast.success).not.toHaveBeenCalled();
	});
});
