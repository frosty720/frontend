/**
 * @vitest-environment jsdom
 *
 * The trade ticket: it must send the exact trade the user typed (right token, right side, right
 * decimals, right currency), refuse what the wallet cannot pay for, say why a trade cannot be priced,
 * and only trade from Robinhood Chain — on any other network it offers the switch instead.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryProvider } from '@/i18n/DictionaryProvider';
import en from '@/i18n/dictionaries/en';
import { ETH_GAS_RESERVE, NATIVE_TOKEN_SENTINEL, USDG } from '@/config/stocks';
import type { StockAsset } from '@/lib/stocks';

const account = { address: undefined as string | undefined, chainId: undefined as number | undefined };
const switchChain = vi.fn(async () => undefined);
const trade = vi.fn();
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
let estimate: { venue: string; sellAmount: string; buyAmount: string; fees?: object[] } | null = null;
let problem: 'belowMinimum' | 'noQuote' | null = null;
const priceCurrency = vi.fn();

vi.mock('wagmi', () => ({ useAccount: () => account }));
vi.mock('@/hooks/useWallet', () => ({ useWallet: () => ({ switchChain }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
vi.mock('@/components/wallet/ClientOnlyConnectWallet', () => ({ ClientOnlyConnectWallet: () => <button type="button">connect wallet</button> }));
vi.mock('@/hooks/stocks/useStocks', () => ({
	useStockPrice: (_side: string, _asset: unknown, _amount: unknown, currency: string) => {
		priceCurrency(currency);
		return { data: { price: estimate, problem }, isSuccess: true, isFetching: false };
	},
	useStockTrade: () => trade,
}));

vi.mock('../StockDeposit', () => ({ default: ({ currency }: { currency: string }) => <div>deposit widget for {currency}</div> }));
vi.mock('../StockWithdraw', () => ({ default: ({ currency }: { currency: string }) => <div>withdraw form for {currency}</div> }));

import StockTradePanel from '../StockTradePanel';

const t = en.stocks.trade;
const TSLA: StockAsset = {
	address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
	symbol: 'TSLA',
	name: 'Tesla',
	decimals: 18,
	group: 'stock',
	verified: true,
};
const ONE = 10n ** 18n;
const balances = (usdg: bigint, tsla: bigint, eth = 0n) => ({ usdg, eth, tokens: { [TSLA.address.toLowerCase()]: tsla }, wrapped: {} });

function renderPanel(b = balances(250_000_000n, 2n * ONE)) {
	return render(
		<DictionaryProvider dict={en} locale="en">
			<StockTradePanel asset={TSLA} quote={{ bid: 374.7, ask: 374.9, halted: false }} balances={b} />
		</DictionaryProvider>,
	);
}

const typeAmount = (value: string) => fireEvent.change(screen.getByLabelText(t.youPay), { target: { value } });
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
	account.address = '0x1111111111111111111111111111111111111111';
	account.chainId = 4663;
	estimate = {
		venue: 'arcus',
		sellAmount: '100000000',
		buyAmount: '266000000000000000',
		fees: [
			{ amount: '50000', token: USDG.address, type: 'protocol', amountUsd: 0.05 },
			{ amount: '27207', token: USDG.address, type: 'gas', amountUsd: 0.027207 },
		],
	};
	problem = null;
	priceCurrency.mockClear();
	trade.mockReset();
	switchChain.mockClear();
	toast.success.mockClear();
	toast.error.mockClear();
});
afterEach(cleanup);

describe('StockTradePanel', () => {
	it('asks to connect a wallet first', () => {
		account.address = undefined;
		renderPanel();
		expect(screen.getByRole('button', { name: 'connect wallet' })).toBeTruthy();
	});

	it('offers the switch to Robinhood Chain instead of trading on another network', () => {
		account.chainId = 3890;
		renderPanel();
		fireEvent.click(button(t.switchChain));
		expect(switchChain).toHaveBeenCalledWith(4663);
		expect(screen.queryByRole('button', { name: 'Buy TSLA' })).toBeNull();
	});

	it('buys with USDG at 6 decimals and reports what was traded', async () => {
		trade.mockResolvedValueOnce({ hash: '0xabc', wrapped: false, quote: { sellAmount: '100000000', buyAmount: '266000000000000000' } });
		renderPanel();
		typeAmount('100');
		fireEvent.click(button('Buy TSLA'));
		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		expect(trade).toHaveBeenCalledWith({ sellToken: USDG.address, buyToken: TSLA.address, sellAmount: 100_000_000n }, expect.any(Function));
		expect(toast.success.mock.calls[0][0]).toBe('Traded 100 USDG for 0.266 TSLA');
		expect(toast.success.mock.calls[0][1]).toBeUndefined();
	});

	it('tells the user when the buy was delivered as the wrapped placeholder', async () => {
		trade.mockResolvedValueOnce({ hash: '0xabc', wrapped: true, quote: { sellAmount: '100000000', buyAmount: '266000000000000000' } });
		renderPanel();
		typeAmount('100');
		fireEvent.click(button('Buy TSLA'));
		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		expect(toast.success.mock.calls[0][1]).toContain('wTSLA');
	});

	it('sells the token at 18 decimals; Max fills the exact balance', async () => {
		trade.mockResolvedValueOnce({ hash: '0xabc', wrapped: false, quote: { sellAmount: String(2n * ONE), buyAmount: '749000000' } });
		renderPanel();
		fireEvent.click(screen.getByRole('tab', { name: t.sell }));
		fireEvent.click(button(t.max));
		fireEvent.click(button('Sell TSLA'));
		await waitFor(() => expect(trade).toHaveBeenCalled());
		expect(trade.mock.calls[0][0]).toEqual({ sellToken: TSLA.address, buyToken: USDG.address, sellAmount: 2n * ONE });
	});

	it('shows the estimate, the per-token price and the fees Arcus takes out of it', () => {
		renderPanel();
		typeAmount('100');
		expect(screen.getByText('0.266')).toBeTruthy();
		expect(screen.getByText('375.9398 USDG per TSLA')).toBeTruthy();
		expect(screen.getByText('$0.077, included in the estimate')).toBeTruthy();
	});

	it('refuses an amount above the wallet balance', () => {
		renderPanel(balances(50_000_000n, 0n));
		typeAmount('100');
		expect(screen.getByRole('alert').textContent).toBe('Not enough USDG in this wallet.');
		expect(button(t.enterAmount).disabled).toBe(true);
	});

	it('refuses more decimals than the token has', () => {
		renderPanel();
		typeAmount('1.1234567');
		expect(screen.getByRole('alert').textContent).toBe(en.errors.invalidAmount);
	});

	it('says when no venue will price the amount', () => {
		estimate = null;
		problem = 'noQuote';
		renderPanel();
		typeAmount('100');
		expect(screen.getByRole('alert').textContent).toBe(t.noPrice);
	});

	it('names Arcus’ $5 minimum for a too-small USDG trade, instead of "try a smaller amount"', () => {
		estimate = null;
		problem = 'belowMinimum';
		renderPanel();
		typeAmount('1');
		expect(screen.getByRole('alert').textContent).toBe('Below the minimum trade size: trades in USDG start at 5 USDG.');
		expect(button(t.enterAmount).disabled).toBe(true);
	});
});

describe('StockTradePanel — paying or receiving ETH', () => {
	const pickEth = () => fireEvent.click(screen.getByRole('button', { name: 'ETH' }));

	it('buys with native ETH at 18 decimals and prices it in ETH', async () => {
		estimate = { venue: 'arcus', sellAmount: '1000000000000000', buyAmount: '11000000000000000', fees: [] };
		trade.mockResolvedValueOnce({ hash: '0xabc', wrapped: false, quote: { sellAmount: '1000000000000000', buyAmount: '11000000000000000' } });
		renderPanel(balances(0n, 0n, 2n * 10n ** 15n));
		pickEth();
		expect(priceCurrency).toHaveBeenLastCalledWith('ETH');
		typeAmount('0.001');
		expect(screen.getByText('0.09090909 ETH per TSLA')).toBeTruthy();
		expect(screen.getByText(t.ethGas)).toBeTruthy();
		fireEvent.click(button('Buy TSLA'));
		await waitFor(() => expect(trade).toHaveBeenCalled());
		expect(trade.mock.calls[0][0]).toEqual({ sellToken: NATIVE_TOKEN_SENTINEL, buyToken: TSLA.address, sellAmount: 10n ** 15n });
	});

	it('Max leaves ETH for gas when paying with ETH', () => {
		renderPanel(balances(0n, 0n, 2n * 10n ** 15n));
		pickEth();
		fireEvent.click(button(t.max));
		expect((screen.getByLabelText(t.youPay) as HTMLInputElement).value).toBe('0.0019');
		expect(2n * 10n ** 15n - ETH_GAS_RESERVE).toBe(19n * 10n ** 14n);
	});

	it('sells for native ETH — the case a balance under the USDG minimum needs', async () => {
		trade.mockResolvedValueOnce({ hash: '0xabc', wrapped: false, quote: { sellAmount: '3229832423265640', buyAmount: '290551579183877' } });
		renderPanel(balances(0n, 3229832423265640n));
		fireEvent.click(screen.getByRole('tab', { name: t.sell }));
		pickEth();
		fireEvent.click(button(t.max));
		fireEvent.click(button('Sell TSLA'));
		await waitFor(() => expect(trade).toHaveBeenCalled());
		expect(trade.mock.calls[0][0]).toEqual({ sellToken: TSLA.address, buyToken: NATIVE_TOKEN_SENTINEL, sellAmount: 3229832423265640n });
	});

	it('shows ETH-buy fees in the token Arcus takes them in when it does not price them', () => {
		estimate = {
			venue: 'arcus',
			sellAmount: '1000000000000000',
			buyAmount: '11000000000000000',
			fees: [{ amount: '5547758268186', token: TSLA.address, type: 'protocol' }],
		};
		renderPanel(balances(0n, 0n, 2n * 10n ** 15n));
		pickEth();
		typeAmount('0.001');
		expect(screen.getByText('0.00000555 TSLA, included in the estimate')).toBeTruthy();
	});

	it('only offers the "pay with ETH" hint when paying with ETH, and the USDG hint only for USDG', () => {
		renderPanel(balances(0n, 0n, 10n ** 15n));
		expect(screen.getByText(t.usdgNeeded)).toBeTruthy();
		pickEth();
		expect(screen.queryByText(t.usdgNeeded)).toBeNull();
		expect(screen.getByText(t.ethGas)).toBeTruthy();
	});

	it('shows a failed trade in the user’s language', async () => {
		trade.mockRejectedValueOnce(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
		renderPanel();
		typeAmount('100');
		fireEvent.click(button('Buy TSLA'));
		await waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.failed, en.errors.userRejected));
	});

	it('explains that buying needs USDG when the wallet holds none', () => {
		renderPanel(balances(0n, 0n));
		expect(screen.getByText(t.usdgNeeded)).toBeTruthy();
	});
});

describe('StockTradePanel — Deposit tab', () => {
	it('swaps the trade form for the deposit widget, in the chosen currency', () => {
		renderPanel();
		fireEvent.click(screen.getByRole('tab', { name: t.deposit }));
		expect(screen.getByText('deposit widget for USDG')).toBeTruthy();
		expect(screen.queryByLabelText(t.youPay)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Buy TSLA' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
		expect(screen.getByText('deposit widget for ETH')).toBeTruthy();
	});

	it('brings the trade form back on Buy', () => {
		renderPanel();
		fireEvent.click(screen.getByRole('tab', { name: t.deposit }));
		fireEvent.click(screen.getByRole('tab', { name: t.buy }));
		expect(screen.queryByText(/deposit widget/)).toBeNull();
		expect(screen.getByLabelText(t.youPay)).toBeTruthy();
	});
});

describe('StockTradePanel — Withdraw tab', () => {
	it('swaps the trade form for the withdraw form, labels the currency as what is sent, and follows the chips', () => {
		renderPanel();
		fireEvent.click(screen.getByRole('tab', { name: t.withdraw }));
		expect(screen.getByText('withdraw form for USDG')).toBeTruthy();
		expect(screen.getByText(t.send)).toBeTruthy();
		expect(screen.queryByLabelText(t.youPay)).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
		expect(screen.getByText('withdraw form for ETH')).toBeTruthy();
	});
});
