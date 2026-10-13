/**
 * @vitest-environment jsdom
 *
 * The Wrap card: wrap spends ETH (so Max must leave gas), unwrap spends WETH, and it only acts from
 * Robinhood Chain.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { ROBINHOOD_WETH } from '@/config/stocks';

const account = { address: undefined as string | undefined, chainId: undefined as number | undefined };
const switchChain = vi.fn(async () => undefined);
const wrap = vi.fn(async () => '0xabc');
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

vi.mock('wagmi', () => ({ useAccount: () => account }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ switchChain }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({ ClientOnlyConnectWallet: () => <button type="button">connect wallet</button> }));
vi.mock('@/hooks/stocks/useStocks', () => ({ useStockWrap: () => wrap }));

import StockWrapPanel from '../StockWrapPanel';

const w = en.stocks.wrap;
const ETH = 2n * 10n ** 15n; // 0.002
const WETH = 5n * 10n ** 14n; // 0.0005
const balances = { usdg: 0n, eth: ETH, tokens: { [ROBINHOOD_WETH.toLowerCase()]: WETH }, wrapped: {} };

const renderPanel = () =>
	render(
		<DictionaryProvider dict={en} locale="en">
			<StockWrapPanel balances={balances} />
		</DictionaryProvider>,
	);
const input = () => screen.getByLabelText(w.amount) as HTMLInputElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
	account.address = '0x1111111111111111111111111111111111111111';
	account.chainId = 4663;
	wrap.mockClear();
	switchChain.mockClear();
	toast.success.mockClear();
	toast.error.mockClear();
});
afterEach(cleanup);

describe('StockWrapPanel', () => {
	it('wraps the typed ETH and confirms it', async () => {
		renderPanel();
		fireEvent.change(input(), { target: { value: '0.001' } });
		fireEvent.click(button(w.wrapAction));
		await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Wrapped 0.001 ETH into WETH'));
		expect(wrap).toHaveBeenCalledWith('wrap', 10n ** 15n);
	});

	it('Max on wrap leaves 0.0001 ETH for gas', () => {
		renderPanel();
		fireEvent.click(button(en.kusd.savings.max));
		expect(input().value).toBe('0.0019');
	});

	it('unwrap spends the WETH balance, all of it on Max', async () => {
		renderPanel();
		fireEvent.click(screen.getByRole('tab', { name: w.unwrap }));
		fireEvent.click(button(en.kusd.savings.max));
		expect(input().value).toBe('0.0005');
		fireEvent.click(button(w.unwrapAction));
		await waitFor(() => expect(wrap).toHaveBeenCalledWith('unwrap', WETH));
	});

	it('refuses more than the balance', () => {
		renderPanel();
		fireEvent.change(input(), { target: { value: '1' } });
		expect(screen.getByText('Not enough ETH in this wallet.')).toBeTruthy();
		expect(button(w.wrapAction).disabled).toBe(true);
	});

	it('offers the switch to Robinhood Chain instead of wrapping on another network', () => {
		account.chainId = 3890;
		renderPanel();
		fireEvent.click(button(en.stocks.trade.switchChain));
		expect(switchChain).toHaveBeenCalledWith(4663);
		expect(screen.queryByRole('button', { name: w.wrapAction })).toBeNull();
	});

	it('shows a failed wrap in the user’s language', async () => {
		wrap.mockRejectedValueOnce(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
		renderPanel();
		fireEvent.change(input(), { target: { value: '0.001' } });
		fireEvent.click(button(w.wrapAction));
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith(w.failed, en.errors.userRejected));
	});
});
