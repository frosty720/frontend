/**
 * @vitest-environment jsdom
 *
 * While a cash-out runs, the Buy/Sell tabs and the Receive choices are locked: switching away would
 * unmount the cash-out panel mid-flow and lose its status (and any stranded-USDT resume offer) while
 * the wallet transactions carry on out of sight.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';

vi.mock('@/hooks/kusd/useKusdOverview', () => ({ useKusdProtocol: () => ({ data: undefined }) }));
vi.mock('@/hooks/kusd/useRampChannels', () => ({ useRampChannels: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/components/shell/BuyCryptoButton', () => ({ CardOnrampDialog: () => null }));
vi.mock('../BuyKusdPanel', () => ({ default: () => null }));
vi.mock('../PsmSwapPanel', () => ({ default: () => null }));
vi.mock('../CashoutPanel', () => ({
	default: ({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) => (
		<>
			<button type="button" onClick={() => onBusyChange?.(true)}>
				start cash-out
			</button>
			<button type="button" onClick={() => onBusyChange?.(false)}>
				finish cash-out
			</button>
		</>
	),
}));

import BuySellKusd from '../BuySellKusd';

const t = en.kusd.buySell;
const isDisabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
const tabDisabled = (name: string) => (screen.getByRole('tab', { name }) as HTMLButtonElement).disabled;

afterEach(cleanup);

describe('BuySellKusd', () => {
	it('locks the Buy/Sell tabs and the Receive choices while a cash-out runs, and unlocks after', () => {
		render(
			<DictionaryProvider dict={en} locale="en">
				<BuySellKusd />
			</DictionaryProvider>,
		);
		fireEvent.click(screen.getByRole('tab', { name: t.sell }));
		fireEvent.click(screen.getByRole('button', { name: t.sellMethods.yellowCard }));
		fireEvent.click(screen.getByRole('button', { name: 'start cash-out' }));
		expect(tabDisabled(t.buy)).toBe(true);
		expect(isDisabled(t.sellMethods.usdt)).toBe(true);

		fireEvent.click(screen.getByRole('button', { name: 'finish cash-out' }));
		expect(tabDisabled(t.buy)).toBe(false);
		expect(isDisabled(t.sellMethods.usdt)).toBe(false);
	});
});
