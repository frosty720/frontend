/**
 * @vitest-environment jsdom
 *
 * The Withdraw tab: it must send the exact amount (right decimals) to the destination the user picked,
 * show what Relay will deliver and what it costs, refuse what the wallet cannot pay (including the ETH
 * for gas), and only send from Robinhood Chain.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { ETH_GAS_RESERVE, WITHDRAW_DESTINATIONS } from '@/config/stocks';
import { UserError } from '@/lib/userError';

const account = { address: undefined as string | undefined, chainId: undefined as number | undefined };
const switchChain = vi.fn(async () => undefined);
const withdraw = vi.fn();
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
const quoteArgs = vi.fn();
let quoteState: { data?: unknown; isError: boolean; error?: unknown; isFetching: boolean } = { isError: false, isFetching: false };

vi.mock('wagmi', () => ({ useAccount: () => account }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ switchChain }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({ ClientOnlyConnectWallet: () => <button type="button">connect wallet</button> }));
vi.mock('@/hooks/stocks/useStocks', () => ({
	useWithdrawQuote: (...args: unknown[]) => {
		quoteArgs(...args);
		return quoteState;
	},
	useStockWithdraw: () => withdraw,
}));

import StockWithdraw from '../StockWithdraw';

const t = en.stocks.withdraw;
const QUOTE = {
	requestId: '0xabc',
	steps: [],
	fees: {
		app: { amount: '70000', amountFormatted: '0.07', amountUsd: '0.07', currency: { symbol: 'USDG', decimals: 6 } },
		relayer: { amount: '26000', amountFormatted: '0.026', amountUsd: '0.026', currency: { symbol: 'USDG', decimals: 6 } },
	},
	details: { currencyOut: { amount: '9904000', amountFormatted: '9.904', amountUsd: '9.9', currency: { symbol: 'USDT', decimals: 6 } }, timeEstimate: 2 },
};
const balances = (usdg: bigint, eth: bigint) => ({ usdg, eth, tokens: {}, wrapped: {} });

function renderTab(currency: 'USDG' | 'ETH' = 'USDG', b = balances(25_000_000n, 10n ** 15n)) {
	return render(
		<DictionaryProvider dict={en} locale="en">
			<StockWithdraw currency={currency} balances={b} />
		</DictionaryProvider>,
	);
}
const typeAmount = (value: string) => fireEvent.change(screen.getByLabelText(t.amount), { target: { value } });
const actionButton = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
	account.address = '0x1111111111111111111111111111111111111111';
	account.chainId = 4663;
	quoteState = { data: QUOTE, isError: false, isFetching: false };
	quoteArgs.mockClear();
	withdraw.mockReset();
	switchChain.mockClear();
	toast.success.mockClear();
	toast.error.mockClear();
});
afterEach(cleanup);

describe('StockWithdraw', () => {
	it('offers every USDG destination and withdraws the exact amount to the one picked', async () => {
		withdraw.mockResolvedValue({ hash: '0x1', quote: QUOTE });
		renderTab();
		for (const d of WITHDRAW_DESTINATIONS.USDG) expect(screen.getByRole('button', { name: `${d.symbol} · ${d.chain}` })).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'USDT · Polygon' }));
		typeAmount('10.5');
		fireEvent.click(actionButton('Withdraw USDG'));
		await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent 9.904 USDT to Polygon'));
		const [req] = withdraw.mock.calls[0];
		expect(req.amount).toBe(10_500_000n);
		expect(req.currency).toBe('USDG');
		expect(req.destination).toEqual(WITHDRAW_DESTINATIONS.USDG.find((d) => d.chain === 'Polygon' && d.symbol === 'USDT'));
		expect(quoteArgs).toHaveBeenCalledWith('USDG', req.destination, 10_500_000n, account.address);
	});

	it('shows what arrives, on which chain, the fees with KalySwap’s share, and the time', () => {
		renderTab();
		typeAmount('10');
		expect(screen.getByText('9.904')).toBeTruthy();
		expect(screen.getByText('on Arbitrum')).toBeTruthy();
		expect(screen.getByText('$0.096, incl. KalySwap’s 0.7%')).toBeTruthy();
		expect(screen.getByText('about 2s')).toBeTruthy();
	});

	it('withdraws ETH at 18 decimals, and Max leaves ETH for gas', () => {
		renderTab('ETH', balances(0n, 10n ** 15n));
		expect(screen.queryByRole('button', { name: 'USDC · Arbitrum' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: en.kusd.savings.max }));
		const max = (screen.getByLabelText(t.amount) as HTMLInputElement).value;
		expect(max).toBe('0.0009');
		expect(10n ** 15n - ETH_GAS_RESERVE).toBe(9n * 10n ** 14n);
	});

	it('refuses more than the balance', () => {
		renderTab();
		typeAmount('30');
		expect(screen.getByRole('alert').textContent).toBe('Not enough USDG in this wallet.');
		expect(actionButton('Withdraw USDG').disabled).toBe(true);
	});

	it('says a USDG withdrawal needs ETH for gas when the wallet has none', () => {
		renderTab('USDG', balances(25_000_000n, 0n));
		typeAmount('10');
		expect(screen.getByRole('alert').textContent).toBe(t.needGas);
		expect(actionButton('Withdraw USDG').disabled).toBe(true);
	});

	it('passes on why Relay will not quote it', () => {
		quoteState = { isError: true, error: new UserError('withdrawNoRoute', { detail: 'Amount is too low' }), isFetching: false };
		renderTab();
		typeAmount('0.01');
		expect(screen.getByRole('alert').textContent).toBe('Relay cannot send this withdrawal. Amount is too low');
	});

	it('only withdraws from Robinhood Chain: elsewhere it offers the switch', () => {
		account.chainId = 8453;
		renderTab();
		fireEvent.click(actionButton(en.stocks.trade.switchChain));
		expect(switchChain).toHaveBeenCalledWith(4663);
		expect(screen.queryByRole('button', { name: 'Withdraw USDG' })).toBeNull();
	});

	it('shows a failed withdrawal in the user’s language', async () => {
		withdraw.mockRejectedValue(new UserError('withdrawRefunded'));
		renderTab();
		typeAmount('10');
		fireEvent.click(actionButton('Withdraw USDG'));
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.failed, en.errors.withdrawRefunded));
	});
});
