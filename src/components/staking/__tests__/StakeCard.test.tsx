/**
 * @vitest-environment jsdom
 *
 * The rebuilt staking card must drive the SAME staking actions as before: stake the typed amount,
 * withdraw from the staked side, MAX fills the right balance, and a failed validation never sends.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';

const stakeKLC = vi.fn(async () => undefined);
const withdrawKLC = vi.fn(async () => undefined);
const toast = { success: vi.fn(), error: vi.fn() };
let connected = true;
let validStake: { isValid: boolean; error?: string; errorCode?: 'amountRequired' | 'invalidAmount' | 'insufficientBalance' } = { isValid: true, error: '' };
let hasStaked = true;

vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ address: connected ? '0xabc' : undefined, isConnected: connected }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({ ClientOnlyConnectWallet: () => <button>connect-stub</button> }));
vi.mock('@/hooks/staking', () => ({
	useStakingBalances: () => ({
		klcBalanceFormatted: '320',
		stakedBalanceFormatted: '9000',
		validateStake: () => validStake,
		validateWithdraw: () => ({ isValid: true, error: '' }),
		hasStakedBalance: hasStaked,
		isPaused: false,
		isLoading: false,
	}),
	useStakingActions: () => ({ stakeKLC, withdrawKLC }),
}));

import StakeCard from '../StakeCard';

function renderCard() {
	render(
		<DictionaryProvider dict={en} locale="en">
			<StakeCard />
		</DictionaryProvider>,
	);
}

describe('StakeCard', () => {
	beforeEach(() => {
		connected = true;
		validStake = { isValid: true, error: '' };
		hasStaked = true;
		stakeKLC.mockClear();
		withdrawKLC.mockClear();
		toast.success.mockClear();
		toast.error.mockClear();
	});
	afterEach(cleanup);

	it('stakes the typed amount through the existing staking action', async () => {
		renderCard();
		fireEvent.change(screen.getByLabelText(en.stake.amountStake), { target: { value: '12.5' } });
		fireEvent.click(screen.getByRole('button', { name: en.stake.btnStake }));
		await waitFor(() => expect(stakeKLC).toHaveBeenCalledWith('12.5'));
		expect(withdrawKLC).not.toHaveBeenCalled();
	});

	it('MAX fills the wallet balance when staking and the staked balance when withdrawing', () => {
		renderCard();
		fireEvent.click(screen.getByRole('button', { name: en.stake.max }));
		expect((screen.getByLabelText(en.stake.amountStake) as HTMLInputElement).value).toBe('320');
		fireEvent.click(screen.getByRole('tab', { name: en.stake.tabWithdraw }));
		fireEvent.click(screen.getByRole('button', { name: en.stake.max }));
		expect((screen.getByLabelText(en.stake.amountWithdraw) as HTMLInputElement).value).toBe('9000');
	});

	it('withdraws from the withdraw tab', async () => {
		renderCard();
		fireEvent.click(screen.getByRole('tab', { name: en.stake.tabWithdraw }));
		fireEvent.change(screen.getByLabelText(en.stake.amountWithdraw), { target: { value: '100' } });
		fireEvent.click(screen.getByRole('button', { name: en.stake.btnWithdraw }));
		await waitFor(() => expect(withdrawKLC).toHaveBeenCalledWith('100'));
	});

	it('never sends a transaction when validation fails', () => {
		validStake = { isValid: false, error: 'Insufficient balance', errorCode: 'insufficientBalance' };
		renderCard();
		fireEvent.change(screen.getByLabelText(en.stake.amountStake), { target: { value: '99999' } });
		fireEvent.click(screen.getByRole('button', { name: en.stake.btnStake }));
		expect(stakeKLC).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(en.stake.toastInvalid, en.errors.insufficientBalance);
	});

	it('disables Withdraw with nothing staked, and offers Connect when no wallet is connected', () => {
		hasStaked = false;
		renderCard();
		expect((screen.getByRole('tab', { name: en.stake.tabWithdraw }) as HTMLButtonElement).disabled).toBe(true);
		cleanup();
		connected = false;
		renderCard();
		expect(screen.getByText('connect-stub')).toBeTruthy();
		expect(screen.queryByRole('button', { name: en.stake.btnStake })).toBeNull();
	});
});
