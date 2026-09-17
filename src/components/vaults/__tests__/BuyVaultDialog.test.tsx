/**
 * @vitest-environment jsdom
 *
 * Buying a vault in-app: approve exactly the price first, then purchase with the referral (prefilled
 * from ?ref=), never let an invalid referral or a short balance through, and never show success for
 * a failed transaction.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import fr from '@/i18n/dictionaries/fr';
import { VAULT_STABLES } from '@/config/vaults';
import type { VaultTier } from '@/hooks/vaults/useVaultStats';
import { TransactionRevertedError } from '@/utils/transactions';

const BUYER = '0x1111111111111111111111111111111111111111';
const REFERRER = '0x2222222222222222222222222222222222222222';
const USDT = VAULT_STABLES[0];
const BASIC: VaultTier = { index: 1, name: 'Basic', priceUsd: 100, aprPct: 40, capBps: 20_000, active: true };

const toast = { success: vi.fn(), error: vi.fn() };
const approve = vi.fn(async (_stable: string, _amount: bigint) => '0xapprove');
const purchase = vi.fn(async (_args: { tier: number; stable: string; referrer?: string }) => '0xbuy');
const refetchAllowance = vi.fn(async () => undefined);
let account: string | undefined = BUYER;
let allowance: bigint | undefined = 0n;
let balance: bigint | undefined = 1_000_000_000n;

vi.mock('wagmi', () => ({ useAccount: () => ({ address: account }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/components/primitives/ConnectPrompt', () => ({ ConnectPrompt: ({ body }: { body?: string }) => <div>connect-stub {body}</div> }));
vi.mock('@/hooks/vaults/useVaultStats', () => ({ useVaultFeeSplit: () => ({ data: undefined }) }));
vi.mock('@/hooks/vaults/usePurchaseVault', () => ({
	useVaultStableState: () => ({
		allowance: { data: allowance, isLoading: false, refetch: refetchAllowance },
		balance: { data: balance },
	}),
	useApproveVaultStable: () => approve,
	usePurchaseVault: () => purchase,
}));

import BuyVaultDialog from '../BuyVaultDialog';

const onViewMyVaults = vi.fn();

function renderDialog({ tier = BASIC, referrer, dict = en, locale = 'en' }: { tier?: VaultTier | null; referrer?: string; dict?: typeof en; locale?: 'en' | 'fr' } = {}) {
	render(
		<DictionaryProvider dict={dict} locale={locale}>
			<BuyVaultDialog tier={tier} onClose={() => undefined} initialReferrer={referrer} onViewMyVaults={onViewMyVaults} />
		</DictionaryProvider>,
	);
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('BuyVaultDialog', () => {
	beforeEach(() => {
		account = BUYER;
		allowance = 0n;
		balance = 1_000_000_000n;
		approve.mockReset();
		approve.mockImplementation(async () => '0xapprove');
		purchase.mockReset();
		purchase.mockImplementation(async () => '0xbuy');
		refetchAllowance.mockClear();
		toast.error.mockClear();
		onViewMyVaults.mockClear();
	});
	afterEach(cleanup);

	it('renders nothing while no tier is selected', () => {
		renderDialog({ tier: null });
		expect(screen.queryByText(en.vaultApp.buy.title)).toBeNull();
	});

	it('shows the price, the on-chain split and the estimate', () => {
		renderDialog();
		expect(screen.getByText('$100')).toBeTruthy();
		expect(screen.getByText('Protocol-owned liquidity (80%)')).toBeTruthy();
		expect(screen.getByText('$80.00')).toBeTruthy();
		expect(screen.getByText('Growth & operations (20%)')).toBeTruthy();
		// 40% APR on $100.
		expect(screen.getByText('$40.00')).toBeTruthy();
	});

	it('approves exactly the price in the stable’s decimals, then re-reads the allowance', async () => {
		renderDialog();
		fireEvent.click(button('Approve USDT'));
		await waitFor(() => expect(refetchAllowance).toHaveBeenCalled());
		expect(approve).toHaveBeenCalledWith(USDT.address, 100_000_000n);
		expect(purchase).not.toHaveBeenCalled();
	});

	it('buys with the referral from the shared link once approved, then offers My vaults', async () => {
		allowance = 100_000_000n;
		renderDialog({ referrer: REFERRER });
		expect((screen.getByLabelText(en.vaultApp.buy.referralLabel) as HTMLInputElement).value).toBe(REFERRER);
		fireEvent.click(button('Buy Basic vault'));
		await waitFor(() => expect(screen.getByText(en.vaultApp.buy.successTitle)).toBeTruthy());
		expect(purchase).toHaveBeenCalledWith({ tier: 1, stable: USDT.address, referrer: REFERRER });
		fireEvent.click(button(en.vaultApp.buy.viewMyVaults));
		expect(onViewMyVaults).toHaveBeenCalled();
	});

	it('buys without a referrer when the field is empty, and ignores a malformed ?ref', async () => {
		allowance = 100_000_000n;
		renderDialog({ referrer: 'not-an-address' });
		expect((screen.getByLabelText(en.vaultApp.buy.referralLabel) as HTMLInputElement).value).toBe('');
		fireEvent.click(button('Buy Basic vault'));
		await waitFor(() => expect(purchase).toHaveBeenCalled());
		expect(purchase.mock.calls[0][0].referrer).toBeUndefined();
	});

	it('blocks the purchase while the typed referral is not an address', () => {
		allowance = 100_000_000n;
		renderDialog();
		fireEvent.change(screen.getByLabelText(en.vaultApp.buy.referralLabel), { target: { value: '0x123' } });
		expect(screen.getByText(en.vaultApp.buy.invalidAddress)).toBeTruthy();
		expect(button('Buy Basic vault').disabled).toBe(true);
	});

	it('blocks approve and buy when the balance is below the price', () => {
		balance = 99_999_999n;
		renderDialog();
		expect(screen.getByText('Not enough USDT: this vault costs $100.')).toBeTruthy();
		expect(button('Approve USDT').disabled).toBe(true);
		cleanup();
		allowance = 100_000_000n;
		renderDialog();
		expect(button('Buy Basic vault').disabled).toBe(true);
	});

	it('reports a reverted purchase and never shows success', async () => {
		allowance = 100_000_000n;
		purchase.mockImplementation(async () => {
			throw new TransactionRevertedError('0xbuy', 'vaultPurchase');
		});
		renderDialog();
		fireEvent.click(button('Buy Basic vault'));
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith(en.vaultApp.buy.failed, 'Vault purchase failed: the transaction was reverted on-chain.'));
		expect(screen.queryByText(en.vaultApp.buy.successTitle)).toBeNull();
		expect(button('Buy Basic vault').disabled).toBe(false);
	});

	it('asks to connect a wallet first', () => {
		account = undefined;
		renderDialog();
		expect(screen.getByText(`connect-stub ${en.vaultApp.buy.connectBody}`)).toBeTruthy();
	});

	it('uses the French copy', () => {
		renderDialog({ dict: fr, locale: 'fr' });
		expect(screen.getByText(fr.vaultApp.buy.title)).toBeTruthy();
		expect(button('Approuver USDT')).toBeTruthy();
	});
});
